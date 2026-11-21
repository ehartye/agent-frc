"""Stage exact Fusion job dependencies before dispatch and retain them through cold readback."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import stat
import sys
import tempfile


MARKER = ".agent-frc-stage.json"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(file):
    with file.open("rb") as stream:
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1 << 20), b""):
            h.update(block)
        return h.hexdigest()


def pinned_json(file, expected):
    data = file.read_bytes()
    require(hashlib.sha256(data).hexdigest() == expected, f"Changed input: {file}")
    return json.loads(data)


def relative(name):
    require(isinstance(name, str) and name and "\\" not in name and ":" not in name,
            "Expected a project-relative POSIX path")
    parts = name.split("/")
    require(not PurePosixPath(name).is_absolute() and not PureWindowsPath(name).drive
            and all(p not in ("", ".", "..") and not p.endswith((" ", "."))
                    and not re.fullmatch(r"(?i)(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9\u00b9\u00b2\u00b3])(?:\..*)?", p) for p in parts),
            f"Unsafe relative path: {name}")
    return Path(*parts)


def no_link(path):
    info = path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and not (getattr(info, "st_file_attributes", 0) & 1024),
            f"Linked dependency or workspace: {path}")


def source_file(root, name):
    path = root
    for part in relative(name).parts:
        path = path / part
        no_link(path)
    require(path.is_file(), f"Expected an ordinary file: {path}")
    return path


def files(rows):
    require(isinstance(rows, list), "Expected an explicit file inventory")
    expected = {}
    names = set()
    for row in rows:
        name, digest = row["path"], row["sha256"]
        relative(name)
        require(name.casefold() not in names and re.fullmatch(r"[0-9a-f]{64}", digest),
                f"Duplicate path or invalid digest: {name}")
        names.add(name.casefold())
        expected[name] = digest
    return expected


def check_plan(plan):
    require(plan["schema"] == "agent-frc/native-job@1" and
            re.fullmatch(r"[A-Za-z0-9_-]{1,80}", plan["jobId"]), "Invalid native job registration")
    recipe = relative(plan["recipe"])
    require(len(recipe.parts) > 1 and recipe.parts[0] in ("plugin", "inputs") and recipe.suffix == ".py",
            "Choose a packaged Fusion recipe")
    return files(plan["inputs"])


def plugin_files(source, plan):
    manifest = pinned_json(source_file(source, MARKER), plan["pluginInventorySha256"])
    require(manifest["schema"] == "agent-frc/local-stage@1" and
            manifest["sourceHead"] == plan["pluginCommit"] and
            re.fullmatch(r"[0-9a-f]{40}", plan["pluginCommit"]), "Different plugin source issue")
    items = files(manifest["files"])
    require("plugin.json" in items and MARKER not in items, "Incomplete plugin inventory")
    items[MARKER] = plan["pluginInventorySha256"]
    return items


def check_tree(root, expected):
    actual = set()
    no_link(root)
    for current, directories, names in os.walk(root, onerror=fail_walk):
        for name in directories:
            no_link(Path(current) / name)
        for name in names:
            path = Path(current) / name
            no_link(path)
            key = path.relative_to(root).as_posix()
            require(key in expected and path.is_file() and sha(path) == expected[key],
                    f"Unexpected or changed job dependency: {key}")
            actual.add(key)
    require(actual == set(expected), f"Missing staged dependency in {root}")


def fail_walk(error):
    raise error


def verify(bundle, expected):
    bundle = Path(bundle).absolute()
    no_link(bundle)
    plan = pinned_json(source_file(bundle, "job.json"), expected)
    inputs = check_plan(plan)
    require(bundle.name == plan["jobId"], "Bundle name differs from native job ID")
    check_tree(bundle / "plugin", plugin_files(bundle / "plugin", plan))
    check_tree(bundle / "inputs", inputs)
    recipe = source_file(bundle, plan["recipe"])
    return {"jobId": plan["jobId"], "registrationSha256": expected, "recipe": str(recipe),
            "pluginCommit": plan["pluginCommit"], "scripts": str(bundle / "plugin/scripts"),
            "inputs": str(bundle / "inputs")}


def stage(package, project, registration, expected, station):
    plan = pinned_json(registration, expected)
    inputs = check_plan(plan)
    package, project, station = (p.resolve(strict=True) for p in (package, project, station))
    require(not station.is_relative_to(package), "Keep the station workspace outside the replaceable plugin")
    bundle = station / plan["jobId"]
    issued = plugin_files(package, plan)
    with lease(bundle, publication=True):
        if bundle.exists():
            return verify(bundle, expected)
        temporary = Path(tempfile.mkdtemp(prefix=f".preparing-{bundle.name}-", dir=station))
        candidate = temporary / bundle.name
        candidate.mkdir()
        try:
            for root, folder, inventory in ((package, "plugin", issued), (project, "inputs", inputs)):
                destination = candidate / folder
                destination.mkdir()
                for name in inventory:
                    source = source_file(root, name)
                    target = destination / relative(name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(source, target)
            shutil.copyfile(registration, candidate / "job.json")
            result = verify(candidate, expected)
            for file in candidate.rglob("*"):
                if file.is_file():
                    file.chmod(file.stat().st_mode & ~0o222)
            # The verified job becomes visible in one operation on its station filesystem.
            candidate.rename(bundle)
            for name in ("recipe", "scripts", "inputs"):
                result[name] = str(bundle / Path(result[name]).relative_to(candidate))
            return result
        finally:
            def remove_readonly(function, name, _error):
                os.chmod(name, stat.S_IREAD | stat.S_IWRITE)
                function(name)
            shutil.rmtree(temporary, onerror=remove_readonly)


@contextmanager
def lease(bundle, *, publication=False):
    # Reuse one stable lock file. Removing it while a competing process still has an
    # open handle could create two independent locks for the same job on POSIX.
    prefix = ".native-publish-" if publication else ".native-use-"
    path = bundle.parent / (prefix + bundle.name)
    if path.exists():
        no_link(path)
    with path.open("a+b") as lock:
        if lock.tell() == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise ValueError("Native job is active; its station lock is held") from error
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


@contextmanager
def using_job(bundle, expected):
    """Use inside Fusion around the native recipe, including lazy imports and readbacks."""
    bundle = Path(bundle).absolute()
    with lease(bundle):
        job = verify(bundle, expected)
        directories = [Path(job["scripts"]), Path(job["inputs"])]
        local_modules = {f.stem for directory in directories for f in directory.glob("*.py")}
        for name in local_modules:
            module = sys.modules.get(name)
            if module is not None and module is not sys.modules.get(__name__):
                origin = getattr(module, "__file__", None)
                require(origin and Path(origin).resolve().is_relative_to(bundle),
                        f"Another job already loaded module {name}; use a clean interpreter or isolated import")
        previous_path, previous_bytecode = sys.path[:], sys.dont_write_bytecode
        previous_modules = set(sys.modules)
        try:
            sys.path[:0] = [str(p) for p in directories]
            sys.dont_write_bytecode = True
            yield job
            verify(bundle, expected)
        finally:
            sys.path[:] = previous_path
            sys.dont_write_bytecode = previous_bytecode
            for name in set(sys.modules) - previous_modules:
                origin = getattr(sys.modules[name], "__file__", None)
                if origin and Path(origin).resolve().is_relative_to(bundle):
                    del sys.modules[name]


def fusion_script(bundle, expected, config):
    """Prepare the run(context) script for an existing guarded Fusion transport."""
    bundle = Path(bundle).absolute()
    details = verify(bundle, expected)
    require(config["jobId"] == details["jobId"], "Request belongs to a different native job")
    # Embed the checked verifier before dispatch. Fusion can enter this script after the cache is gone.
    return f"""def run(context):
    from pathlib import Path
    verifier = {{"__name__": "_frc_station_job"}}
    exec(compile({Path(__file__).read_bytes()!r}, "native_job.py", "exec"), verifier)
    with verifier["using_job"](Path({str(bundle)!r}), {expected!r}) as job:
        recipe = Path(job["recipe"])
        request = {config!r}
        request["plugin"] = job["scripts"]
        request["jobInputs"] = job["inputs"]
        job["verifyDependencies"] = lambda: verifier["verify"](Path({str(bundle)!r}), {expected!r})
        namespace = {{"__name__": "_frc_native_recipe", "__file__": str(recipe),
                     "CONFIG": request, "NATIVE_JOB": job}}
        exec(compile(recipe.read_bytes(), str(recipe), "exec"), namespace)
        return namespace["run"](context)
"""


def retire(bundle, expected, receipt, receipt_digest, archive):
    bundle = bundle.absolute()
    archive = archive.resolve(strict=True)
    require(not archive.is_relative_to(bundle), "Choose a separate private archive")
    destination = archive / bundle.name
    require(not destination.exists(), "Archived job already exists")
    with lease(bundle, publication=True), lease(bundle):
        job = verify(bundle, expected)
        release = pinned_json(receipt, receipt_digest)
        require(release.get("schema") == "agent-frc/native-job-release@1" and
                release.get("jobId") == job["jobId"] and release.get("registrationSha256") == expected
                and release.get("nativeReleased") is True, "Missing matching terminal station release")
        before = release["before"]
        require(isinstance(before, dict) and isinstance(before.get("documents"), list) and
                all(isinstance(x, str) and x for x in before["documents"]) and
                len(set(before["documents"])) == len(before["documents"]) and
                "active" in before and (before["active"] in before["documents"] or
                (before["active"] is None and not before["documents"])) and release.get("after") == before,
                "Native document roster or active document has not been restored")
        outcome = release["outcome"]
        fields = {"completed": ("native", "step", "readback"), "aborted": ("diagnostic",)}
        require(outcome in fields, "Unknown or incomplete native work")
        for key in fields[outcome]:
            pin = release["evidence"][key]
            require(sha(source_file(receipt.parent, pin["path"])) == pin["sha256"],
                    f"Changed terminal evidence: {key}")
        if outcome == "completed":
            evidence = release["evidence"]
            readback = pinned_json(source_file(receipt.parent, evidence["readback"]["path"]), evidence["readback"]["sha256"])
            require(readback.get("archiveSha256") == evidence["native"]["sha256"] and
                    readback.get("stepSha256") == evidence["step"]["sha256"] and
                    readback.get("restored") is True, "Cold readback differs from the final issued native/STEP pair")
        else:
            diagnostic = release["evidence"]["diagnostic"]
            report = pinned_json(source_file(receipt.parent, diagnostic["path"]), diagnostic["sha256"])
            require(report.get("jobId") == job["jobId"] and report.get("outcome") == "aborted"
                    and report.get("restored") is True, "No matching terminal native abort observation")
        # A same-filesystem rename preserves every byte; the caller retains the release receipt.
        bundle.rename(destination)
    return destination


def main():
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest="action", required=True)
    for action, arguments in (("stage", ("package", "project", "registration", "digest", "station")),
                              ("verify", ("bundle", "digest")),
                              ("retire", ("bundle", "digest", "release", "release_digest", "archive"))):
        sub = commands.add_parser(action)
        for name in arguments:
            sub.add_argument(name, type=str if "digest" in name else Path)
    a = p.parse_args()
    if a.action == "stage":
        result = stage(a.package, a.project, a.registration, a.digest, a.station)
    elif a.action == "verify":
        result = verify(a.bundle, a.digest)
    else:
        result = {"archived": str(retire(a.bundle, a.digest, a.release, a.release_digest, a.archive))}
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, KeyError, OSError) as error:
        sys.exit(str(error))
