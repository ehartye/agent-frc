"""Build a local solid-model player from the exact rigid trajectories being checked."""
import hashlib
import json
from pathlib import Path

from mechanical_motion import transforms
from mechanical_readiness import pinned, read, require


def capture(case, scene):
    from OCP.BRepCheck import BRepCheck_Analyzer
    from package_mesh import surface_mesh
    from OCP.gp import gp_Trsf
    bodies = {}
    for name, solid in sorted(scene.items()):
        require(BRepCheck_Analyzer(solid).IsValid(), "Invalid package solid: " + name)
        mesh = surface_mesh(solid)
        matrices = []
        moves = case["moves"].get(name, [])
        for i in range(25 if moves else 1):
            combined = gp_Trsf()
            for operation in transforms(moves, i / 24):
                combined.PreMultiply(operation)
            matrices.append([combined.Value(r, c) for r in (1, 2, 3) for c in (1, 2, 3, 4)])
        bodies[name] = dict(**mesh, matrices=matrices)
    return dict(id=case["id"], stage=case["stage"], bodies=bodies)


def verify_view(root, plan, scenes, write, observed, budgets):
    name = plan.get("view")
    if not name:
        return None
    path = (root / name).resolve()
    require(not Path(name).is_absolute() and path.is_relative_to(root) and path.suffix.lower() == ".html",
            "Select a project-relative HTML view")
    template = Path(__file__).with_name("package-view.html").read_text(encoding="utf-8")
    series = dict(issue=plan["issue"], step=plan["step"], motion=plan["motion"], groups=plan["groups"], cases=scenes)
    from component_palette import resolve_palette
    series["palette"] = resolve_palette(root)
    presentation = plan.get("presentation", {})
    series["components"] = presentation.get("components", {})
    series["narrativeReview"] = plan.get("narrativeReview") or {}
    series["required"] = presentation.get("required", {})
    series["evidence"] = {c["case"]: {"status": c["status"], "pairs": c["pairs"]} for c in observed["cases"]}
    if budgets:
        ledger = read(pinned(root, budgets["source"]))
        limits = read(pinned(root, budgets["limits"]))
        series["mass"] = {"range": budgets["inspectionKg"], "remaining": budgets["remainingKg"],
                          "limit": limits["inspectionLimitKg"], "running": budgets["runningKg"],
                          "lines": [{k: row[k] for k in ("id", "kg", "members", "basis")} for row in ledger["masses"]]}
        series["power"] = []
        for row in budgets["electricalCases"]:
            duty = ledger["electricalCases"][row["case"]]
            series["power"].append({**row, "loads": duty["batterySideA"], "resistance": duty["resistanceOhm"],
                                    "openCircuit": duty["openCircuitV"]})
        series["loadMembers"] = presentation.get("loadMembers", {})
    data = json.dumps(series, allow_nan=False, sort_keys=True, separators=(",", ":")).replace("<", "\\u003c")
    expected = template.replace("PACKAGE_DATA", data).encode("utf-8")
    if write and not path.exists():
        with path.open("xb") as output:
            output.write(expected)
    return dict(file=name, sha256=hashlib.sha256(expected).hexdigest(),
                verified=path.is_file() and path.read_bytes() == expected)
