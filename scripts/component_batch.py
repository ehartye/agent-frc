"""Run independent source/installed STEP diagnostics with a per-article time budget."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import NamedTemporaryFile

from component_shape import compare_components, proper_rotation
from mechanical_readiness import digest, named, number, pinned, read, require


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


def collector():
    import OCP
    # The installed helper imports other geometry methods. Bind the complete Python
    # helper set so an upgrade cannot resume an old calculation under new code.
    files = sorted(Path(__file__).resolve().parent.glob("*.py"))
    return {"scriptsSha256": sha256(encoded({p.name: digest(p) for p in files})).hexdigest(),
            "ocpVersion": OCP.__version__, "python": sys.version}


def check_plan(root, plan):
    require(plan.get("schema") == "agent-frc/component-batch@1" and named(plan.get("configuration")),
            "Register the configuration for this diagnostic")
    require(set(plan) == {"schema", "configuration", "articles"}, "Unsupported batch plan field")
    rows = plan.get("articles")
    require(isinstance(rows, list) and rows, "Register at least one article")
    names = set()
    checked = set()
    for row in rows:
        require(isinstance(row, dict) and named(row.get("id")) and row["id"] not in names,
                "Register unique article IDs")
        require(set(row) == {"id", "source", "installed", "worldTransform"}, "Unsupported article comparison option")
        names.add(row["id"])
        proper_rotation(row["worldTransform"])
        for side in ("source", "installed"):
            ref = row[side]
            require(isinstance(ref, dict) and set(ref) == {"file", "sha256", "solid"}, "Unsupported STEP selection")
            require(named(ref.get("solid")), "Register each selected STEP solid")
            key = (ref["file"], ref["sha256"])
            if key not in checked:
                require(pinned(root, ref).suffix.lower() in (".step", ".stp"), "Expected a placed STEP input")
                checked.add(key)
    return rows


def measure_one(root, row):
    src, dst = row["source"], row["installed"]
    before, after = pinned(root, src), pinned(root, dst)
    label = dst["solid"]
    raw = compare_components(after, [(label, before, src["solid"], row["worldTransform"])])
    require(digest(before) == src["sha256"] and digest(after) == dst["sha256"],
            "Input changed during measurement")
    return raw[label]


def attempt(root, row, seconds, expected_collector):
    # subprocess.run kills and waits for the one synchronous kernel worker on
    # timeout. The ordinary component comparison starts no additional processes.
    try:
        child = subprocess.run([sys.executable, "-B", str(Path(__file__).resolve()), "--article", str(root)],
                               input=encoded({"article": row, "collector": expected_collector}),
                               capture_output=True, timeout=seconds)
    except subprocess.TimeoutExpired:
        return {"execution": "timeout", "reason": "Article wall-time budget expired before a result"}
    if child.returncode:
        return {"execution": "error", "exitCode": child.returncode,
                "reason": child.stderr.decode("utf-8", errors="replace")[-2000:]}
    try:
        observation = json.loads(child.stdout)
        require(isinstance(observation, dict)
                and all(k in observation for k in ("absentMm3", "extraMm3")), "Invalid worker observation")
    except (ValueError, TypeError) as exc:
        return {"execution": "error", "reason": str(exc)}
    return {"execution": "completed", "observation": observation}


def save(folder, index, row):
    data = encoded(row)
    name = f"{index:05d}-{sha256(data).hexdigest()}.json"
    with NamedTemporaryFile(dir=folder, prefix=".pending-", delete=False) as partial:
        partial.write(data)
        partial.flush()
        os.fsync(partial.fileno())
    # Only this run writes in its newly created output directory. An interruption
    # can leave a pending file; resume considers only completed renamed receipts.
    Path(partial.name).rename(folder / name)
    return name


def prior_receipt(folder, index, binding, article):
    files = sorted(folder.glob(f"{index:05d}-*.json"))
    if not files:
        return None, None
    require(len(files) == 1, "Ambiguous prior article receipt")
    file = files[0]
    data = file.read_bytes()
    require(file.name == f"{index:05d}-{sha256(data).hexdigest()}.json", "Prior article checksum changed")
    row = json.loads(data)
    require(row["binding"] == binding and row["article"] == article, "Prior article or method differs")
    return row, file.name


def run(root, plan_path, output, seconds, previous=None):
    require(number(seconds) and seconds > 0, "Specify a positive per-article wall time")
    data = plan_path.read_bytes()
    plan = json.loads(data)
    rows = check_plan(root, plan)
    binding = {"planSha256": sha256(data).hexdigest(), "collector": collector()}
    if previous is not None:
        require(read(previous / "binding.json") == binding, "Prior plan, method or runtime differs")
    output.mkdir(parents=False, exist_ok=False)
    (output / "binding.json").write_bytes(encoded(binding))
    incomplete, unresolved, receipts = [], [], []
    for index, article in enumerate(rows, 1):
        prior, name = prior_receipt(previous, index, binding, article) if previous is not None else (None, None)
        if prior and prior["execution"] == "completed":
            row = prior
        else:
            row = {"binding": binding, "article": article, "budgetSeconds": seconds,
                   **attempt(root, article, seconds, binding["collector"])}
            if name:
                row["previousAttempt"] = name
        receipts.append(save(output, index, row))
        if row["execution"] != "completed":
            incomplete.append(article["id"])
        elif row["observation"].get("measurementStatus") == "open":
            unresolved.append(article["id"])
    report = {"binding": binding, "receipts": receipts, "unfinished": incomplete, "unresolved": unresolved,
              "execution": "incomplete" if incomplete else "complete", "scope": "named-article diagnostics"}
    (output / "summary.json").write_bytes(encoded(report))
    return report


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--article":
        request = json.load(sys.stdin.buffer)
        require(collector() == request["collector"], "Worker method or runtime differs")
        observation = measure_one(Path(sys.argv[2]), request["article"])
        require(collector() == request["collector"], "Worker method changed during measurement")
        sys.stdout.buffer.write(encoded(observation))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        for arg in ("project", "plan", "output"):
            parser.add_argument(arg, type=Path)
        parser.add_argument("--seconds", required=True, type=float)
        parser.add_argument("--resume", type=Path)
        args = parser.parse_args()
        result = run(args.project.resolve(), args.plan, args.output, args.seconds, args.resume)
        print(json.dumps(result, indent=2))
        raise SystemExit(int(bool(result["unfinished"] or result["unresolved"])))
