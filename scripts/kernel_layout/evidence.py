"""The files one judgement was made from, each with the SHA-256 of its bytes. Nothing here measures or judges.

    {"source":    the design source's top file, then each subsystem file it lists, in its order
     "parts":     the part, trial and custom code files the source names
     "judgement": the judgement file, the season's requirements and each accepted premise
     "records":   each job record judged, trials.json and adjustments.json}

Paths are the project's own. The stage gate writes these into gate.json, the one place a digest is kept, and the staging
command publishes the source, the judgement file and the records. The page file and the narrative are not among them:
the verdict does not depend on what they say.
"""
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
