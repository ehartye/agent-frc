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
SCENE_SCHEMA = "agent-frc/preliminary-review-scene@1"
PAGE = Path(__file__).resolve().parents[1] / "templates/preliminary-review/review.html"
SCENE_FILE = "review-scene.json.gz"
UNITS = "Millimetres in the registered STEP world; kg, A, V"
ROLE_COLOURS = {"drive": "mechanism", "payload": "game-piece", "battery": "electrical", "other": "reference", "service": "reserved-space"}


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
            mesh = dict(v=[_round(p, 4) for p in body["vertices"]], f=[list(t) for t in body["triangles"]])
            key = json.dumps(mesh, sort_keys=True, separators=(",", ":"))
            if key not in index:
                index[key] = len(meshes)
                meshes.append(mesh)
            bodies[name] = dict(mesh=index[key], matrices=[_round(m, 7) for m in body["matrices"]])
        cases.append(dict(id=case["id"], stage=case["stage"], bodies=bodies))
    return dict(meshes=meshes, cases=cases)


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


def safe_href(href):
    """A link the review may follow: relative to the release page without a scheme, or https with a host."""
    parts = urlsplit(href) if isinstance(href, str) else None
    return bool(parts) and not re.search(r"[\x00-\x20\x7f\\]", href) and (
        parts.scheme == "https" and bool(re.fullmatch(r"[A-Za-z0-9.-]+", parts.netloc))
        or not parts.scheme and not parts.netloc and not href.startswith("/") and ":" not in href.split("/")[0])


def field_interactions(root, plan):
    """Season-owned field-interaction or physics players linked from the review."""
    rows = []
    objectives = {o.get("objective") for o in (plan.get("narrativeReview") or {}).get("objectives", [])}
    for item in plan.get("presentation", {}).get("fieldInteractions", []):
        require(isinstance(item, dict) and named(item.get("title")) and named(item.get("href"))
                and named(item.get("objective")), "Give each field interaction a title, href and mission objective")
        href = item["href"]
        require(safe_href(href), "Link a field interaction with a relative URL or https: " + repr(href))
        evidence = item.get("evidence")
        if isinstance(evidence, dict):
            pinned(root, evidence)
            evidence = dict(file=evidence["file"], sha256=evidence["sha256"])
        else:
            require(named(evidence), "Describe or pin the evidence for field interaction " + item["title"])
        rows.append(dict(title=item["title"], href=href, objective=item["objective"], evidence=evidence,
                         embed=bool(item.get("embed")), objectiveKnown=item["objective"] in objectives))
    return rows


VOLUME_TYPES = ("material", "envelope", "gauge")


def component_inspector(plan, scenes, study_cases, mass_lines=None, load_members=None, fixtures=()):
    """Per placed ID: identity, classification, volume, mass basis, explanations, loads and moving cases.

    Category (what it is), subsystem (what function it serves) and motion group (what it moves with) stay
    separate. Every field the project has not supplied is listed under `missing` so the page shows it."""
    presentation = plan.get("presentation", {})
    components = presentation.get("components", {})
    groups = plan.get("groups", {})
    group_of = {m: (key, g.get("role")) for key, g in groups.items() for m in g.get("members", [])}
    volumes = {}
    for case in scenes:
        for name, body in case["bodies"].items():
            if volumes.get(name) is None and body.get("volumeMm3") is not None:
                volumes[name] = round(body["volumeMm3"], 3)
    rows = {}
    for member in sorted(group_of):
        entry = components.get(member, {}) if isinstance(components.get(member), dict) else {}
        group, role = group_of[member]
        missing = []
        volume_type = entry.get("volumeType")
        if volume_type is not None:
            require(volume_type in VOLUME_TYPES, "volumeType for " + member + " is material, envelope or gauge")
        lines = []
        for line in mass_lines or []:
            if member in line.get("members", []):
                others = [m for m in line["members"] if m != member]
                lines.append(dict(id=line["id"], kg=line["kg"], basis=line.get("basis"), sharedWith=others,
                                  note=("Shared with " + ", ".join(others) + "; unallocated until the line is split")
                                  if others else "Allocated to this component alone"))
        excluded = member in fixtures or role in ("payload", "service")
        if not lines and not excluded and mass_lines is not None:
            missing.append("mass line")
        for field in ("purpose", "rationale"):
            if not named(entry.get(field)):
                missing.append(field)
        for field in ("material", "subsystem"):
            if not named(entry.get(field)):
                missing.append(field)
        if volume_type is None:
            missing.append("volume type")
        if volumes.get(member) is None:
            missing.append("volume")
        moves = [c["id"] for c in study_cases if member in c.get("moves", {})]
        rows[member] = dict(
            id=member, name=entry.get("name") or member, category=entry.get("category") or role, role=role,
            subsystem=entry.get("subsystem"), motionGroup=group, material=entry.get("material"),
            volumeMm3=volumes.get(member), volumeType=volume_type,
            mass=lines, massExcluded=("Field fixture; not robot mass" if member in fixtures else
                                      "Excluded from inspection weight (" + role + ")")
                     if excluded else None,
            purpose=entry.get("purpose"), rationale=entry.get("rationale"),
            loads=sorted(k for k, ids in (load_members or {}).items() if member in ids),
            movesIn=moves, missing=missing)
    return rows


def review_header(plan, snapshot):
    presentation = plan.get("presentation", {})
    narrative = (plan.get("narrativeReview") or {}).get("source")
    decision = first_unmet(snapshot)
    return dict(architecture=presentation.get("architecture"), issue=plan["issue"],
                datum=(plan.get("datum") or {}).get("name"), units="Millimetres in the registered STEP world; kg, A, V",
                narrative=narrative, status="blocked" if decision and decision["kind"] in ("clearance", "weight", "voltage") else "pending receipt",
                firstUnmet=decision)




def parked_assembly(observed_cases, study_cases, roster):
    """The checker's parked-assembly result: every pair of installed bodies at the STEP pose.

    A pair counts as parked in a case when neither body moves there and neither starts displaced. The
    union over cases gives the positive-volume pairs and the pairs the checker left unresolved."""
    by_id = {c["id"]: c for c in study_cases}
    installed = sorted(roster)
    positive, unresolved = {}, set()
    for observed in observed_cases:
        case = by_id.get(observed["case"], {})
        still = set(installed) - set(case.get("moves", {})) - set(case.get("initialPose", {}))
        for row in observed.get("pairs", []):
            pair = tuple(sorted(row["pair"]))
            if not set(pair) <= still:
                continue
            witness = row.get("witness")
            if row["status"] == "fail" and isinstance(witness, dict) and witness.get("volumeMm3", 0) > 0:
                positive[pair] = max(positive.get(pair, 0), round(witness["volumeMm3"], 3))
            elif row["status"] == "open":
                unresolved.add(pair)
    # Every pair the checker examined with both bodies still, in any case, counts as screened.
    screened = set()
    for observed in observed_cases:
        case = by_id.get(observed["case"], {})
        still = sorted(set(installed) - set(case.get("moves", {})) - set(case.get("initialPose", {})))
        screened.update((a, b) for i, a in enumerate(still) for b in still[i + 1:])
    return dict(screenedPairs=len(screened), positive=[dict(pair=list(p), volumeMm3=v) for p, v in sorted(positive.items())],
                unresolved=[list(p) for p in sorted(unresolved)])


def _colour(palette, category, role):
    return palette.get(category) or palette.get(role) or palette.get(ROLE_COLOURS.get(role, "")) or palette.get("reference") or "#8a9199"


def _timeline(plan, case_id, frames):
    """Optional per-frame time, readout and field position from presentation.caseTimelines."""
    timelines = plan.get("presentation", {}).get("caseTimelines", {})
    require(isinstance(timelines, dict) and set(timelines) <= set(plan.get("stages", {})),
            "presentation.caseTimelines maps commissioned case IDs to their timelines")
    line = timelines.get(case_id) or {}
    require(isinstance(line, dict) and set(line) <= {"time", "measure", "positions"}, "caseTimelines entries hold time, measure and positions")
    out = {}
    for key, value in line.items():
        require(isinstance(value, list) and len(value) == frames,
                "caseTimelines." + case_id + "." + key + " needs one entry per frame (" + str(frames) + ")")
        out[key] = value
    return out


def _running_additions(presentation, roster):
    additions = presentation.get("runningAdditions")
    if additions is None:
        return None
    require(isinstance(additions, list) and all(
        isinstance(a, dict) and named(a.get("name")) and isinstance(a.get("kg"), list) and len(a["kg"]) == 2
        and set(a.get("members", [])) <= roster for a in additions),
        "presentation.runningAdditions lists {name, kg: [low, high], members} with placed IDs")
    return [dict(name=a["name"], kg=a["kg"], members=list(a.get("members", []))) for a in additions]


def build_scene(root, plan, scenes, observed, budgets, review):
    """The standardized scene the stock review page reads (agent-frc/preliminary-review-scene@1)."""
    from component_palette import resolve_palette
    presentation = plan.get("presentation", {})
    palette = {k: v.lower() for k, v in resolve_palette(root).items()}
    fixtures = set(review.get("fixtures", set()))
    study_cases = review.get("studyCases", [])
    payload = scene_payload(scenes)
    ledger = read(pinned(root, budgets["source"])) if budgets else None
    lines = [{k: row[k] for k in ("id", "kg", "members", "basis")} for row in ledger["masses"]] if ledger else None
    inspector = component_inspector(plan, scenes, study_cases, lines, presentation.get("loadMembers", {}), fixtures)
    roster = {m for g in plan.get("groups", {}).values() for m in g.get("members", [])}
    support = presentation.get("loadPaths", {})
    require(isinstance(support, dict) and set(support) <= roster, "presentation.loadPaths maps placed IDs to support text")
    bodies = {}
    for member, row in inspector.items():
        bodies[member] = dict(name=row["name"], category=row["category"], role=row["role"],
                              color=_colour(palette, row["category"], row["role"]), subsystem=row["subsystem"],
                              motionGroup=row["motionGroup"], material=row["material"], volumeMm3=row["volumeMm3"],
                              volumeType=row["volumeType"], closed=row["volumeMm3"] is not None, fixture=member in fixtures,
                              purpose=row["purpose"], rationale=row["rationale"], support=support.get(member),
                              massExcluded=row["massExcluded"], missing=row["missing"])
    by_id = {c["id"]: c for c in study_cases}
    observed_by_id = {c["case"]: c for c in observed["cases"]}
    kinds = presentation.get("caseKinds", {})
    control = plan.get("control") or {}
    witness = (review.get("control") or {}).get("witness")
    cases = []
    for captured, placed in zip(scenes, payload["cases"]):
        cid = captured["id"]
        is_control = cid == CONTROL_ID
        study = by_id.get(control.get("case") if is_control else cid, {})
        frames = max(len(b["matrices"]) for b in placed["bodies"].values())
        row = observed_by_id.get(cid, {})
        results = ([witness] if witness else row.get("pairs", [])) if is_control else row.get("pairs", [])
        case = dict(id=cid, label=cid + " (" + ("displaced control" if is_control else captured["stage"]) + ")",
                    kind="displaced control" if is_control else kinds.get(cid, "nominal"), stage=captured["stage"],
                    basis=(control.get("basis") if is_control else study.get("basis")) or "",
                    status=row.get("status", "not run"), allowanceMm=study.get("minGapMm"),
                    bodies=placed["bodies"], removed=[], results=[r for r in results if r])
        if not is_control:
            case.update(_timeline(plan, cid, frames))
        cases.append(case)
    snapshot = dict(cases=[c for c in observed["cases"] if c["case"] != CONTROL_ID], budgets=budgets,
                    control=review.get("control"), missingInputs=list(review.get("missing", [])))
    header = review_header(plan, snapshot)
    control_case = next((c for c in observed["cases"] if c["case"] == CONTROL_ID), None)
    mass, power = None, []
    if budgets:
        limits = read(pinned(root, budgets["limits"]))
        mass = dict(limitKg=limits["inspectionLimitKg"], inspectionKg=budgets["inspectionKg"], remainingKg=budgets["remainingKg"],
                    runningKg=budgets["runningKg"], lines=lines, runningAdditions=_running_additions(presentation, roster),
                    runningBasis=presentation.get("runningBasis"))
        members = presentation.get("loadMembers", {})
        for row in budgets["electricalCases"]:
            duty = ledger["electricalCases"][row["case"]]
            # The checker's lower bus bound uses the low open-circuit voltage and the high resistance.
            power.append(dict(case=row["case"], duty=row["duty"], stage=row.get("stage", ""), batteryCondition=row["batteryCondition"],
                              openCircuitV=duty["openCircuitV"][0], resistanceOhm=duty["resistanceOhm"][1],
                              requiredMinV=row["requiredMinV"], loadedBusV=row["loadedBusV"], batterySideA=row["batterySideA"],
                              marginV=row["marginV"], status=row["status"],
                              lines=[dict(name=k, amps=v, members=list(members.get(k, []))) for k, v in duty["batterySideA"].items()]))
    narrative = plan.get("narrativeReview") or {}
    cycle = plan.get("cycle") or []
    nominal = [c for c in observed["cases"] if c["case"] != CONTROL_ID]
    scene = dict(schema=SCENE_SCHEMA, issue=plan["issue"], context=presentation.get("context"),
                 architecture=presentation.get("architecture"), datum=(plan.get("datum") or {}).get("name"), units=UNITS,
                 links=presentation.get("links", []),
                 sources=dict(design=plan.get("design"), step=plan["step"], motion=plan["motion"], narrative=narrative.get("source")),
                 decision=dict(status=header["status"], firstUnmet=header["firstUnmet"]), palette=palette,
                 meshes=payload["meshes"], bodies=bodies, cases=cases,
                 openingCase=presentation.get("openingCase") or (cycle[0] if cycle else cases[0]["id"]),
                 parked=parked_assembly(nominal, study_cases, roster - fixtures), mass=mass, power=power,
                 required=[dict(role=k, ids=list(v)) for k, v in presentation.get("required", {}).items()],
                 narrativeReview=dict(source=narrative.get("source"), objectives=narrative.get("objectives", [])),
                 motionEvidence=motion_evidence(plan, study_cases, nominal, review.get("control"), control_case),
                 returnCriteria=return_criteria(), fieldInteractions=field_interactions(root, plan),
                 focus=presentation.get("focus"), notes=presentation.get("notes"), cutaway=presentation.get("cutaway"))
    require(scene["openingCase"] in {c["id"] for c in cases}, "presentation.openingCase names a commissioned case")
    cut = scene["cutaway"]
    if cut is not None:
        require(isinstance(cut, dict) and named(cut.get("label")) and isinstance(cut.get("hides"), list)
                and set(cut["hides"]) <= fixtures, "presentation.cutaway needs a label and the fixture IDs it hides")
    require(isinstance(scene["links"], list) and all(isinstance(link, dict) and set(link) == {"label", "href"} and named(link["label"])
                                                     and safe_href(link["href"]) for link in scene["links"]),
            "presentation.links holds {label, href} with relative or https links")
    return scene


def _validate(content):
    """Refuse a scene the stock page or the release gate would reject, before any view is credited."""
    import subprocess
    script = Path(__file__).with_name("review-scene.mjs")
    run = subprocess.run(["node", str(script), "validate", "-"], input=content, capture_output=True)
    try:
        errors = json.loads(run.stdout)["errors"]
    except (ValueError, KeyError):
        raise ValueError("Could not validate the review scene: " + run.stderr.decode(errors="replace").strip()) from None
    require(not errors, "The review scene is invalid: " + "; ".join(errors[:5]))


def verify_view(root, plan, scenes, write, observed, budgets, review=None):
    """Write or check the stock review page and its scene. The page is the plugin template byte for byte; the scene is pinned."""
    name = plan.get("view")
    if not name:
        return None
    review = review or {}
    path = (root / name).resolve()
    require(not Path(name).is_absolute() and path.is_relative_to(root) and path.suffix.lower() == ".html"
            and Path(name).parent == Path("."), "Select an HTML view beside the layout plan")
    page = PAGE.read_bytes().replace(b"\r\n", b"\n")
    content = json.dumps(build_scene(root, plan, scenes, observed, budgets, review), allow_nan=False, sort_keys=True,
                         separators=(",", ":")).encode("utf-8")
    _validate(content)
    scene_file = path.with_name(SCENE_FILE)
    if write and not path.exists():
        with path.open("xb") as output:
            output.write(page)
    if write and not scene_file.exists():
        with scene_file.open("xb") as output:
            output.write(gzip.compress(content, compresslevel=9, mtime=0))
    try:
        stored = scene_file.read_bytes()
        stream = zlib.decompressobj(16 + zlib.MAX_WBITS)
        scene_ok = stream.decompress(stored, len(content) + 1) == content and stream.eof
    except (OSError, zlib.error):
        stored, scene_ok = None, False
    served = stored if stored is not None else gzip.compress(content, compresslevel=9, mtime=0)
    return dict(file=name, sha256=hashlib.sha256(page).hexdigest(),
                verified=path.is_file() and path.read_bytes() == page and scene_ok,
                scene=dict(file=scene_file.relative_to(root).as_posix(), sha256=hashlib.sha256(served).hexdigest(),
                           contentSha256=hashlib.sha256(content).hexdigest(), bytes=len(content)))
