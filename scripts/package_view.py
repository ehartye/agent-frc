"""Build a local solid-model player from the exact rigid trajectories being checked."""
import gzip
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
import zlib

from mechanical_motion import transforms
from mechanical_readiness import named, pinned, read, require

CONTROL_ID = "package-displacement-control"
CASE_KINDS = ("nominal", "inhibited", "adverse")
SCENE_SCHEMA = "agent-frc/package-geometry@1"


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


def _round(values, places):
    return [round(v, places) + 0.0 for v in values]


def scene_payload(scenes):
    """Store each distinct tessellation once; cases keep only per-frame placements."""
    meshes, index, cases = [], {}, []
    for case in scenes:
        bodies = {}
        for name, body in sorted(case["bodies"].items()):
            mesh = dict(vertices=[_round(p, 4) for p in body["vertices"]],
                        triangles=[list(t) for t in body["triangles"]], volumeMm3=round(body["volumeMm3"], 3))
            key = json.dumps(mesh, sort_keys=True, separators=(",", ":"))
            if key not in index:
                index[key] = len(meshes)
                meshes.append(mesh)
            bodies[name] = dict(mesh=index[key], matrices=[_round(m, 7) for m in body["matrices"]])
        cases.append(dict(id=case["id"], stage=case["stage"], bodies=bodies))
    return dict(schema=SCENE_SCHEMA, meshes=meshes, cases=cases)


def _placed(m, p):
    return [m[k + 3] + m[k] * p[0] + m[k + 1] * p[1] + m[k + 2] * p[2] for k in (0, 4, 8)]


def _frame(bounds):
    low, high = bounds
    return dict(center=[round((a + b) / 2, 4) for a, b in zip(low, high)],
                extent=round(max(1.0, sum((b - a) ** 2 for a, b in zip(low, high)) ** .5), 4))


def fit_views(scenes, fixtures):
    """Fit the robot at its opening pose on the floor; fit the field interaction separately."""
    if not scenes:
        return dict(robot=None, field=None)
    opening = scenes[0]["bodies"]

    def bounds(names, floor):
        low, high = [float("inf")] * 3, [float("-inf")] * 3
        for name in names:
            body = opening[name]
            for v in body["vertices"]:
                for i, x in enumerate(_placed(body["matrices"][0], v)):
                    low[i], high[i] = min(low[i], x), max(high[i], x)
        if floor and names:
            low[2], high[2] = min(low[2], 0.0), max(high[2], 0.0)
        return (low, high) if names else None

    robot = [n for n in opening if n not in fixtures]
    robot_box = bounds(robot or list(opening), True)
    field_box = None
    for case in scenes:
        if not fixtures.intersection(case["bodies"]):
            continue
        opening = case["bodies"]
        low, high = bounds(list(opening), True)
        field_box = (low, high) if field_box is None else ([min(a, b) for a, b in zip(field_box[0], low)],
                                                           [max(a, b) for a, b in zip(field_box[1], high)])
    return dict(robot=_frame(robot_box), field=_frame(field_box) if field_box else None)


def _pair_gap(row):
    witness = row.get("witness")
    if isinstance(witness, dict) and "gapMm" in witness:
        return witness["gapMm"]
    return row.get("lowerBoundMm", float("inf"))


def _limiting(pairs, moving=None):
    """Worst pair: failures, then open intervals, then the smallest gap. Prefer pairs with a moving member."""
    rank = {"fail": 0, "open": 1, "pass": 2}
    rows = [r for r in pairs if r.get("status") in rank]
    if moving:
        # A passing pair at constant pose is not evidence about this path's motion.
        rows = [r for r in rows if moving.intersection(r["pair"]) or r["status"] != "pass"]
    if not rows:
        return None
    return min(rows, key=lambda r: (rank[r["status"]], _pair_gap(r) if _pair_gap(r) is not None else float("inf")))


def _method(row):
    if row is None:
        return "Every moving pair separated by bounding boxes beyond the allowance"
    witness = row.get("witness")
    if row.get("method"):
        return row["method"]
    if row["status"] == "open":
        return "Interval bisection left an unresolved interval"
    if "lowerBoundMm" in row:
        return "Interval bisection lower bound from " + str(row.get("samples", 0)) + " exact distance samples"
    if isinstance(witness, dict) and witness.get("t") == 0 and row["status"] == "pass":
        return "Exact distance at a constant relative pose"
    return "Exact distance and common volume at the witness pose"


def _limit_time(row):
    witness = (row or {}).get("witness")
    if isinstance(witness, dict) and isinstance(witness.get("t"), (int, float)):
        return witness["t"]
    if isinstance(witness, list) and len(witness) == 2:
        return witness[0]
    return None


def _start(case, control):
    initial = case.get("initialPose", {})
    if not initial:
        return "Installed STEP pose"
    parts = []
    for name, ops in sorted(initial.items()):
        if control and name == control["displaced"]:
            parts.append(name + " displaced " + json.dumps(control["offsetMm"]) + " mm")
        else:
            parts.append(name + " offset")
    return "Commissioned start: " + ", ".join(parts)


def _environment(case):
    fixtures = [f["id"] for f in case.get("fixtures", [])]
    removed = sorted(case.get("removed", {}))
    text = ("Field fixtures: " + ", ".join(fixtures)) if fixtures else "Robot package only, floor at Z = 0"
    return text + ("; removed: " + ", ".join(removed) if removed else "")


def motion_evidence(plan, study_cases, observed_cases, control=None, control_case=None):
    """Region 6 rows: nominal, inhibited, adverse, displaced-control and uncovered cases."""
    presentation = plan.get("presentation", {})
    kinds = presentation.get("caseKinds", {})
    require(isinstance(kinds, dict) and all(v in CASE_KINDS for v in kinds.values())
            and set(kinds) <= {c["id"] for c in study_cases}, "caseKinds maps commissioned case IDs to nominal, inhibited or adverse")
    by_id = {c["id"]: c for c in study_cases}
    stages = plan.get("stages", {})
    rows = []

    def row(case, observed, kind, stage, extra=None):
        best = _limiting((observed or {}).get("pairs", []), set(case.get("moves", {})))
        witness = (best or {}).get("witness")
        value = None
        if isinstance(witness, dict):
            value = {k: witness[k] for k in ("gapMm", "volumeMm3") if k in witness}
        elif best and "lowerBoundMm" in best:
            value = {"lowerBoundMm": best["lowerBoundMm"]}
        entry = dict(case=case["id"], kind=kind, stage=case.get("stage"), basis=case.get("basis"),
                     start=_start(case, control if kind == "displaced control" else None),
                     groups=list(stage.get("movingGroups", [])), environment=_environment(case),
                     metric="Minimum surface gap; positive overlap volume", units="mm, mm³",
                     limitingPair=(best or {}).get("pair"), limitingTime=_limit_time(best), limitingValue=value,
                     allowanceMm=case.get("minGapMm"), allowanceBasis=stage.get("allowanceBasis"),
                     method=_method(best), result=(observed or {}).get("status", "not run"), playable=True)
        entry.update(extra or {})
        rows.append(entry)

    observed_by_id = {c["case"]: c for c in observed_cases}
    order = [c for c in plan.get("cycle", []) if c in by_id] + [c for c in by_id if c not in plan.get("cycle", [])]
    for key in order:
        row(by_id[key], observed_by_id.get(key), kinds.get(key, "nominal"), stages.get(key, {}))
    spec = plan.get("control")
    if spec and spec["case"] in by_id:
        nominal = by_id[spec["case"]]
        case = dict(nominal, id=CONTROL_ID, initialPose={**nominal.get("initialPose", {}),
                                                         spec["displaced"]: [dict(kind="translation", travelMm=spec["offsetMm"])]})
        hit = (control or {}).get("witness")
        status = (control or {}).get("status")
        result = "rejected as expected" if hit else ("skipped" if status == "skipped" or control_case is None else "not rejected")
        observed = {"pairs": [hit]} if hit else control_case
        row(case, observed, "displaced control", stages.get(spec["case"], {}),
            dict(controlOf=spec["case"], displaced=spec["displaced"], expected="fail", result=result,
                 basis=spec.get("basis"), playable=control_case is not None))
    else:
        rows.append(dict(case=CONTROL_ID, kind="uncovered", result="missing", playable=False,
                         note="No matched displaced control was commissioned"))
    for item in presentation.get("uncoveredCases", []):
        require(isinstance(item, dict) and named(item.get("id")) and named(item.get("condition")) and named(item.get("reason")),
                "Describe each uncovered case with an id, condition and reason")
        rows.append(dict(case=item["id"], kind="uncovered", result="not evaluated", playable=False,
                         note=item["condition"] + " — " + item["reason"]))
    for objective in (plan.get("narrativeReview") or {}).get("objectives", []):
        if objective.get("disposition") != "represented":
            rows.append(dict(case="objective: " + objective.get("objective", "?"), kind="uncovered",
                             result=objective.get("disposition", "open"), playable=False, note=objective.get("basis", "")))
    return rows


def return_criteria():
    """What sends this layout back to preliminary or conceptual design.

    The page adds each accepted conceptual premise from the receipt, so a premise edit does not change the view."""
    conceptual = ["A represented narrative objective can no longer be represented by a checked case",
                  "An accepted conceptual-design premise leaves its criterion"]
    return dict(preliminary=["A nominal path fails clearance or leaves an open interval",
                             "The displaced control is not rejected",
                             "Inspection weight exceeds the project limit",
                             "A loaded-voltage case falls below its required floor"],
                conceptual=conceptual)


def first_unmet(result):
    """The first unmet requirement in a receipt or partial receipt, blocking findings first."""
    for case in result.get("cases") or []:
        if case.get("status") in ("fail", "open"):
            row = _limiting(case.get("pairs", []))
            if row and row.get("status") in ("fail", "open"):
                w = row.get("witness")
                if row["status"] == "open":
                    detail = "unresolved over t " + json.dumps(w)
                elif isinstance(w, dict) and w.get("volumeMm3", 0) > 0:
                    detail = "overlap %.1f mm³ at t %.3f" % (w["volumeMm3"], w.get("t", 0))
                else:
                    detail = "gap %.3f mm at t %.3f" % ((w or {}).get("gapMm", 0), (w or {}).get("t", 0))
                return dict(kind="clearance", case=case["case"], text=case["case"] + ": " + " and ".join(row["pair"]) + " " + detail)
            return dict(kind="clearance", case=case["case"], text=case["case"] + " did not pass its clearance, seat, contact or visibility check")
    budgets = result.get("budgets") or {}
    if budgets.get("massStatus") == "fail":
        return dict(kind="weight", text="Inspection weight: %+.2f kg headroom against the limit" % budgets.get("remainingKg", 0))
    for row in budgets.get("electricalCases", []):
        if row.get("status") == "fail":
            return dict(kind="voltage", case=row["case"], text="%s: minimum bus %.2f V against %.2f V required (%+.2f V)" % (
                row["case"], row["loadedBusV"][0], row["requiredMinV"], row["marginV"]))
    control = result.get("control")
    if control and not control.get("witness"):
        return dict(kind="control", text="Displaced control " + str(control.get("displaced")) + " was "
                    + ("skipped" if control.get("status") == "skipped" else "not rejected"))
    for hold in result.get("reopen") or []:
        return dict(kind="reopen", text="Reopened " + str(hold.get("phase")) + ": " + str(hold.get("reason")))
    for item in result.get("missingInputs") or []:
        return dict(kind="missing", text=item)
    return None


def field_interactions(root, plan):
    """Season-owned field-interaction or physics players linked from the review."""
    rows = []
    objectives = {o.get("objective") for o in (plan.get("narrativeReview") or {}).get("objectives", [])}
    for item in plan.get("presentation", {}).get("fieldInteractions", []):
        require(isinstance(item, dict) and named(item.get("title")) and named(item.get("href"))
                and named(item.get("objective")), "Give each field interaction a title, href and mission objective")
        href = item["href"]
        parts = urlsplit(href)
        require(not re.search(r"[\x00-\x20\x7f\\]", href)
                and (parts.scheme == "https" and parts.netloc or not parts.scheme and not parts.netloc and not href.startswith("/")),
                "Link a field interaction with a relative URL or https: " + repr(href))
        evidence = item.get("evidence")
        if isinstance(evidence, dict):
            pinned(root, evidence)
            evidence = dict(file=evidence["file"], sha256=evidence["sha256"])
        else:
            require(named(evidence), "Describe or pin the evidence for field interaction " + item["title"])
        rows.append(dict(title=item["title"], href=href, objective=item["objective"], evidence=evidence,
                         embed=bool(item.get("embed")), objectiveKnown=item["objective"] in objectives))
    return rows


def review_header(plan, snapshot):
    presentation = plan.get("presentation", {})
    narrative = (plan.get("narrativeReview") or {}).get("source")
    decision = first_unmet(snapshot)
    return dict(architecture=presentation.get("architecture"), issue=plan["issue"],
                datum=(plan.get("datum") or {}).get("name"), units="Millimetres in the registered STEP world; kg, A, V",
                narrative=narrative, status="blocked" if decision and decision["kind"] in ("clearance", "weight", "voltage") else "pending receipt",
                firstUnmet=decision)


def geometry_name(view):
    return Path(view).stem + ".geometry.json.gz"


def verify_view(root, plan, scenes, write, observed, budgets, review=None):
    name = plan.get("view")
    if not name:
        return None
    review = review or {}
    path = (root / name).resolve()
    require(not Path(name).is_absolute() and path.is_relative_to(root) and path.suffix.lower() == ".html",
            "Select a project-relative HTML view")
    template = Path(__file__).with_name("package-view.html").read_text(encoding="utf-8")
    scene = json.dumps(scene_payload(scenes), allow_nan=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    scene_file = path.with_name(geometry_name(name))
    fixtures = review.get("fixtures", set())
    series = dict(issue=plan["issue"], step=plan["step"], motion=plan["motion"], groups=plan["groups"],
                  cases=[dict(id=s["id"], stage=s["stage"]) for s in scenes],
                  geometry=dict(file=scene_file.name, contentSha256=hashlib.sha256(scene).hexdigest(), bytes=len(scene)),
                  fit=fit_views(scenes, fixtures), fixtures=sorted(fixtures))
    from component_palette import resolve_palette
    series["palette"] = resolve_palette(root)
    presentation = plan.get("presentation", {})
    series["components"] = presentation.get("components", {})
    series["narrativeReview"] = plan.get("narrativeReview") or {}
    series["required"] = presentation.get("required", {})
    series["evidence"] = {c["case"]: {"status": c["status"], "pairs": c["pairs"]} for c in observed["cases"]}
    snapshot = dict(cases=[c for c in observed["cases"] if c["case"] != CONTROL_ID], budgets=budgets,
                    control=review.get("control"), missingInputs=list(review.get("missing", [])))
    series["header"] = review_header(plan, snapshot)
    control_case = next((c for c in observed["cases"] if c["case"] == CONTROL_ID), None)
    series["motionEvidence"] = motion_evidence(plan, review.get("studyCases", []),
                                               [c for c in observed["cases"] if c["case"] != CONTROL_ID],
                                               review.get("control"), control_case)
    series["returnCriteria"] = return_criteria()
    series["fieldInteractions"] = field_interactions(root, plan)
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
    if write and not scene_file.exists():
        with scene_file.open("xb") as output:
            output.write(gzip.compress(scene, compresslevel=9, mtime=0))
    try:
        stored = scene_file.read_bytes()
        stream = zlib.decompressobj(16 + zlib.MAX_WBITS)
        scene_ok = stream.decompress(stored, len(scene) + 1) == scene and stream.eof
    except (OSError, zlib.error):
        stored, scene_ok = None, False
    served = stored if stored is not None else gzip.compress(scene, compresslevel=9, mtime=0)
    return dict(file=name, sha256=hashlib.sha256(expected).hexdigest(),
                verified=path.is_file() and path.read_bytes() == expected and scene_ok,
                geometry=dict(file=scene_file.relative_to(root).as_posix(), sha256=hashlib.sha256(served).hexdigest(),
                           contentSha256=hashlib.sha256(scene).hexdigest()))
