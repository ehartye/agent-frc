"""What one judgement was made from: its files, each with the SHA-256 of its bytes, and the evidence whose staleness the
design library's status cannot see yet. Nothing here measures or judges.

    {"source":    the design source's top file, then each subsystem file it lists, in its order
     "parts":     the part, trial and custom code files the source names
     "judgement": the judgement file, the season's requirements and each accepted premise
     "records":   each job record judged, trials.json and adjustments.json}

Paths are the project's own. The stage gate writes these into gate.json, the one place a digest is kept, and the staging
command publishes the source, the judgement file and the records. The page file and the narrative are not among them:
the verdict does not depend on what they say.
"""
from hashlib import sha256

from .files import digest, read


def referenced(design):
    """The part, trial and custom code files a design source names, beside it."""
    data, top = design.data, read(design.path)
    names = {s["part"]["file"] for s in [*data["solids"], *data["fixtures"]] if "part" in s}
    names |= {t["file"] for t in top.get("trials", {}).values() if set(t) == {"file"}}
    return sorted({(design.folder / name).resolve() for name in names} | {design.custom_file(name).resolve() for name in design.custom_used})


def files(inputs, jobs):
    """{group: {project path: sha256}} of what this judgement read. jobs are the verdict's job rows."""
    root, judgement = inputs.root, inputs.judgement
    rel = lambda path: path.resolve().relative_to(root).as_posix()
    kept = [inputs.records / row["file"] for row in jobs] + [p for p in (inputs.records / "trials.json", inputs.records / "adjustments.json") if p.is_file()]
    groups = dict(source=inputs.design.files, parts=referenced(inputs.design), records=kept,
                  judgement=[inputs.file, root / judgement["requirements"]["file"], *(root / ref["file"] for ref in judgement.get("premises", []))])
    return {name: {rel(path): digest(path) for path in groups[name]} for name in ("source", "parts", "judgement", "records")}


def custom_code(trial):
    """The names of the custom code a trial runs: its forces and its pass criterion."""
    return sorted({use["use"] for use in [*trial.get("forces", []), *([trial["pass"]["custom"]] if "custom" in trial["pass"] else [])]})


def unguarded(inputs, names, campaign, adjustments, state):
    """The evidence a gate cannot rely on, in words: what the library's status does not say is current.

    The stage gate trusts status, and status does not read adjustments.json, the end a chained trial started from or the
    code of a custom force or criterion. Each could be of an earlier design and still read as passing, so each is refused
    until a record says what it used. names are the trials the judgement uses."""
    found, said = [], {row["record"] for row in state.get("records", [])}
    for name, entry in sorted((inputs.data.get("adjustments") or {}).items()):
        if entry["kind"] == "mechanical" and name in ((adjustments or {}).get("adjustments") or {}) and f'adjustment "{name}"' not in said:
            found.append(f"adjustment {name}: the library's status does not say whether its measured ends are of the design as it is now")
    for name in sorted(names):
        trial, record = inputs.data["trials"][name], campaign["trials"][name]
        after = trial["piece"]["start"].get("after")
        if after and "start" not in record["used"]:
            found.append(f"trial {name} starts where trial {after} ends, and its record does not say which end it started from")
        for code in custom_code(trial):
            now = sha256(inputs.design.custom_file(code).read_text(encoding="utf-8").encode("utf-8")).hexdigest()
            if not any(row["name"] == code and row["sha256"] == now and f"trial {name}" in row["usedBy"] for row in campaign.get("custom", [])):
                found.append(f"trial {name} runs custom code {code}, and its campaign record is not of that code as it is now: run the whole campaign again")
    return found
