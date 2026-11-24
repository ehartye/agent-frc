"""Write the review scene and page of a checked layout from its frames, results and presentation text."""
import gzip
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
import zlib

from atomic_file import write_atomic
from kernel_layout.attachment import floating
from kernel_layout.files import named, pinned, read, require, resolve_references

CONTROL_ID = "package-displacement-control"
CASE_KINDS = ("nominal", "inhibited", "adverse")
SCENE_SCHEMA = "agent-frc/preliminary-review-scene@1"
PAGE = Path(__file__).resolve().parents[1] / "templates/preliminary-review/review.html"
SCENE_FILE = "review-scene.json.gz"
UNITS = "Millimetres in the registered STEP world; kg, A, V"
ROLE_COLOURS = {"drive": "mechanism", "payload": "game-piece", "battery": "electrical", "other": "reference", "service": "reserved-space"}


def _round(values, places):
    return [round(v, places) + 0.0 for v in values]


def scene_payload(scenes):
    """Store each distinct tessellation once; cases keep only per-frame placements."""
    meshes, index, known, cases = [], {}, {}, []
    for case in scenes:
        bodies = {}
        for name, body in sorted(case["bodies"].items()):
            # A tessellation shared between cases is the same list; it is rounded and compared once.
            shared = (id(body["vertices"]), id(body["triangles"]))
            if shared not in known:
                mesh = dict(v=[_round(p, 4) for p in body["vertices"]], f=[list(t) for t in body["triangles"]])
                key = json.dumps(mesh, sort_keys=True, separators=(",", ":"))
                if key not in index:
                    index[key] = len(meshes)
                    meshes.append(mesh)
                known[shared] = index[key]
            bodies[name] = dict(mesh=known[shared], matrices=[_round(m, 7) for m in body["matrices"]])
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


PHASE_GUIDE = 12


def _stem(case_id):
    """A case ID without a trailing segment number: acquire-07 and acquire_7 both read acquire."""
    return re.sub(r"[-_. ]\d+$", "", case_id) or case_id


def mission_animations(plan, order):
    """The entries of the review's animation list: one per mission phase, each playing its cases end to end.

    A case is one checked path segment, so it is evidence and not an animation. A stage names its phase under `phase`;
    without one the phase is the case ID less a trailing segment number. Consecutive cases of one phase, in the order
    given, form one animation. `presentation.phases` gives a phase a title and says whether it is a headline mission
    animation; by default a phase is one when it holds an operating case of the cycle."""
    stages, cycle = plan.get("stages", {}), set(plan.get("cycle") or [])
    for key in order:
        require("phase" not in stages.get(key, {}) or named(stages[key]["phase"]), "Give the phase of " + key + " as a short name, such as acquire")
    rows, seen = [], {}
    for key in order:
        stage = stages.get(key, {})
        phase = stage.get("phase") or _stem(key)
        last = rows[-1] if rows else None
        if last and last["phase"] == phase and (key in cycle) == last["cycle"]:
            last["cases"].append(key)
            continue
        require(phase not in seen or "phase" not in stage and "phase" not in stages.get(seen[phase], {}),
                "Phase " + phase + " is split in the cycle: " + key + " does not follow " + str(seen.get(phase))
                + ". One animation plays one continuous motion, so give each run its own phase")
        seen[phase] = key
        rows.append(dict(phase=phase, cycle=key in cycle, cases=[key]))
    taken, out = set(), []
    for row in rows:
        # A derived name that returns later in the cycle is a second run of that motion.
        name, run = row["phase"], 1
        while name in taken or name == CONTROL_ID:
            run += 1
            name = row["phase"] + "-run-" + str(run)
        taken.add(name)
        words = re.sub(r"[-_.]+", " ", name).strip() or name
        out.append(dict(id=name, title=words[:1].upper() + words[1:], cases=row["cases"],
                        mission=any(c in cycle and stages.get(c, {}).get("purpose") == "operating" for c in row["cases"])))
    said = plan.get("presentation", {}).get("phases", {})
    require(isinstance(said, dict) and set(said) <= taken | {CONTROL_ID} and all(
        isinstance(v, dict) and set(v) <= {"title", "headline"} and ("title" not in v or named(v["title"]))
        and isinstance(v.get("headline", True), bool) for v in said.values()),
        "presentation.phases maps a phase to {title, headline}. The phases of this plan: " + ", ".join(sorted(taken)))
    # The displaced control is a check, never a mission animation: it takes a title and nothing else.
    require(set(said.get(CONTROL_ID, {})) <= {"title"}, "presentation.phases." + CONTROL_ID + " takes a title only")
    for row in out:
        own = said.get(row["id"], {})
        row["title"] = own.get("title", row["title"])
        row["mission"] = own.get("headline", row["mission"])
    return out


def control_title(plan):
    """What the review calls the displaced control: the title the plan gives it under presentation.phases, else plain words."""
    said = (plan.get("presentation") or {}).get("phases") or {}
    own = said.get(CONTROL_ID) if isinstance(said, dict) else None
    return own["title"] if isinstance(own, dict) and named(own.get("title")) else "Displaced control"


def motion_evidence(plan, study_cases, observed_cases, control=None, control_case=None, free_paths=None, supports=None):
    """The check list: nominal, inhibited, adverse, displaced-control and uncovered cases. The page groups it by phase.

    A case with a declared free payload path names the trial behind it in its method and under `freePath`.
    A case with a payload that a field fixture supports does the same under `supportedBy`."""
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
        if "pathToleranceMm" in stage and kind != "displaced control":
            entry["pathToleranceMm"] = stage["pathToleranceMm"]
        flights = [dict(payload=payload, basis=spec.get("basis"), trial=spec["trial"], bound=bound)
                   for payload, bound in ((free_paths or {}).get(case["id"]) or {}).items()
                   for spec in [stage["freePath"][payload]]] if kind != "displaced control" else []
        if flights:
            entry["freePath"] = flights
            entry["method"] += "".join(
                " · Free path of " + f["payload"] + (" from trial " + f["trial"] if f["bound"]
                                                     else " without a trial that records this path") for f in flights)
        rests = [dict(payload=payload, fixtures=sorted(spec.get("fixtures") or []), basis=spec.get("basis"),
                      trial=spec["trial"], bound=bound)
                 for payload, bound in ((supports or {}).get(case["id"]) or {}).items()
                 for spec in [stage["supportedBy"][payload]]] if kind != "displaced control" else []
        if rests:
            entry["supportedBy"] = rests
            entry["method"] += "".join(
                " · " + r["payload"] + " supported by fixture " + ", ".join(r["fixtures"])
                + (" from trial " + r["trial"] if r["bound"] else " without a trial that records this path")
                for r in rests)
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
    loose = floating(result.get("attachment"))
    if loose:
        return dict(kind="floating", text="Floating: " + ", ".join(loose) + ". Give each a support or mount that traces to the frame, "
                    "rest each fixture on the floor, or label it under attachment in the judgement file with the reason")
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
        # A field fixture reads as field, not as the robot role of the group that lists it. A game piece stays a game piece.
        category = entry.get("category") or ("field" if member in fixtures and role != "payload" else role)
        rows[member] = dict(
            id=member, name=entry.get("name") or member, category=category, role=role,
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


def _colour(palette, category, role, alliance="blue", fixture=False):
    """A body's viewing colour: its own category, else the field colour for a fixture, the alliance colour for a bumper, then its role."""
    own = palette.get(category) or palette.get(role)
    if not own and fixture:
        own = palette.get("field")
    if not own and role == "bumper":
        own = palette.get("bumper-" + alliance)
    return own or palette.get(ROLE_COLOURS.get(role, "")) or palette.get("reference") or "#8a9199"


def _alliance(presentation, palette):
    """The alliance whose colour the bumper covers take: presentation.alliance, blue when the plan names none."""
    alliance = presentation.get("alliance", "blue")
    require(named(alliance) and "bumper-" + alliance in palette,
            "presentation.alliance names an alliance with a bumper-ALLIANCE colour in the palette, such as red or blue")
    return alliance


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


REPLAY_SET = "agent-frc/review-replays@1"
REPLAY_KEYS = {"id", "label", "basis", "objective", "evidence", "recorded", "display", "time", "measure", "events",
               "follow", "bodies", "groups", "tubes"}


def _watertight(mesh):
    """Every edge of a closed triangle mesh is shared by exactly two triangles."""
    edges = {}
    for a, b, c in mesh["f"]:
        for edge in ((a, b), (b, c), (c, a)):
            key = tuple(sorted(edge))
            edges[key] = edges.get(key, 0) + 1
    return bool(edges) and all(n == 2 for n in edges.values())


def replay_entries(root, plan, meshes, bodies, placed, palette):
    """Trial replays for the one animation list, from the replay sets named under presentation.replays.

    A replay set is a project-generated JSON file (optionally gzipped) with schema agent-frc/review-replays@1. It holds
    `replays` and, optionally, `fieldBodies`: field parts and loose game pieces that only replays show, each with its own
    display mesh. A replay moves bodies by rigid group, one transform per frame per group, so a whole-robot run stays
    small. Field bodies and their meshes are appended to `bodies` and `meshes`; the replay rows are returned."""
    refs = plan.get("presentation", {}).get("replays", [])
    require(isinstance(refs, list), "presentation.replays lists replay sets as {file}")
    rows, mesh_index, taken = [], {}, set()
    for ref in refs:
        # The checker filled in the digest of a replay set named by path alone; a typed sha256 is verified here.
        require(isinstance(ref, dict) and set(ref) == {"file", "sha256"}, "presentation.replays lists replay sets as {file}")
        raw = pinned(root, ref).read_bytes()
        where = "Replay set " + ref["file"]
        try:
            data = json.loads(gzip.decompress(raw) if raw[:2] == bytes([31, 139]) else raw)
        except (OSError, EOFError, ValueError, zlib.error):
            raise ValueError(where + " is not JSON or gzipped JSON") from None
        require(isinstance(data, dict) and data.get("schema") == REPLAY_SET and set(data) <= {"schema", "fieldBodies", "replays"}
                and isinstance(data.get("replays"), list) and data["replays"], where + " needs schema " + REPLAY_SET + " and a replays list")
        data = resolve_references(root, data)
        field = data.get("fieldBodies", {})
        require(isinstance(field, dict), where + ": fieldBodies maps new body IDs to {name, mesh: {v, f}}")
        for member, item in sorted(field.items()):
            require(isinstance(item, dict) and set(item) <= {"name", "category", "color", "subsystem", "material", "purpose", "rationale", "mesh"} and named(item.get("name"))
                    and isinstance(item.get("mesh"), dict) and set(item["mesh"]) == {"v", "f"},
                    where + ": field body " + member + " needs a name and a mesh {v, f}")
            mesh = dict(v=[_round(p, 4) for p in item["mesh"]["v"]], f=[list(t) for t in item["mesh"]["f"]])
            key = hashlib.sha256(json.dumps(mesh, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            if key not in mesh_index:
                mesh_index[key] = len(meshes)
                meshes.append(mesh)
            category = item.get("category") or "field"
            colour = item.get("color") or _colour(palette, category, "reference", fixture=True)
            require(isinstance(colour, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", colour), where + ": field body " + member + " color is #rrggbb")
            body = dict(name=item["name"], category=category, role="reference", color=colour.lower(),
                        subsystem=item.get("subsystem"), motionGroup="field", material=item.get("material"), volumeMm3=None,
                        volumeType=None, closed=_watertight(mesh), fixture=True, purpose=item.get("purpose"),
                        rationale=item.get("rationale"), support=None, massExcluded="Field fixture; not robot mass",
                        missing=[k for k in ("purpose", "rationale") if not named(item.get(k))])
            require(member not in bodies or (member in placed and placed[member] == mesh_index[key] and bodies[member] == body),
                    where + ": field body " + member + " repeats a placed ID or differs from an earlier replay set")
            bodies[member] = body
            placed[member] = mesh_index[key]
        for item in data["replays"]:
            require(isinstance(item, dict) and set(item) <= REPLAY_KEYS and named(item.get("id")), where + ": a replay holds " + ", ".join(sorted(REPLAY_KEYS)))
            at = where + ", replay " + item["id"]
            require(item["id"] not in taken and item["id"] not in plan.get("stages", {}) and item["id"] != CONTROL_ID,
                    at + " repeats a case or replay ID")
            taken.add(item["id"])
            shown = item.get("bodies")
            require(isinstance(shown, dict) and shown and set(shown) <= set(placed), at + ": bodies maps placed IDs or field bodies to a group or null")
            evidence = item.get("evidence")
            require(isinstance(evidence, list) and evidence, at + " names the trial files it plays back under evidence")
            pins = []
            for pin in evidence:
                require(isinstance(pin, dict) and set(pin) <= {"file", "sha256", "role"}, at + ": evidence holds {file, role}")
                pinned(root, pin)
                pins.append({k: pin[k] for k in ("file", "sha256", "role") if k in pin})
            groups = item.get("groups")
            require(isinstance(groups, dict) and all(isinstance(series, list) for series in groups.values()), at + ": groups maps a name to one transform per frame")
            row = {k: item[k] for k in ("id", "label", "basis", "objective", "recorded", "display", "time", "measure", "events", "follow") if k in item}
            tubes = item.get("tubes", [])
            require(isinstance(tubes, list) and all(isinstance(tube, dict) for tube in tubes), at + ": tubes is a list")
            if tubes:
                # A tube that names a field body carries that body's mesh along its centerline.
                require(all("body" not in tube or (tube["body"] in placed and tube["body"] not in shown and "mesh" not in tube) for tube in tubes),
                        at + ": a tube body is a field body that the replay does not also place")
                row["tubes"] = [dict(tube, mesh=placed[tube["body"]]) if "body" in tube else tube for tube in tubes]
            row.update(evidence=pins, bodies={member: dict(mesh=placed[member], group=group) for member, group in sorted(shown.items())},
                       groups={name: [m if m is None else _round(m, 6) for m in series] for name, series in sorted(groups.items())})
            rows.append(row)
    return rows


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
    alliance = _alliance(presentation, palette)
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
                              color=_colour(palette, row["category"], row["role"], alliance, member in fixtures), subsystem=row["subsystem"],
                              motionGroup=row["motionGroup"], material=row["material"], volumeMm3=row["volumeMm3"],
                              volumeType=row["volumeType"], closed=row["volumeMm3"] is not None, fixture=member in fixtures,
                              purpose=row["purpose"], rationale=row["rationale"], support=support.get(member),
                              massExcluded=row["massExcluded"], missing=row["missing"])
        # Only a mount that names this member is attributed to it; a group-level mount belongs to no single member.
        own = [dict(on=m["on"], pointMm=m["pointMm"], basis=m["basis"]) for m in plan.get("mounts", []) if m.get("member") == member]
        if own:
            bodies[member]["mounts"] = own
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
        case = dict(id=cid, label=control_title(plan) if is_control else cid + " (" + captured["stage"] + ")",
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
    scene = dict(schema=SCENE_SCHEMA, issue=plan["issue"], title=presentation.get("title"), context=presentation.get("context"),
                 architecture=presentation.get("architecture"), datum=(plan.get("datum") or {}).get("name"), units=UNITS,
                 links=presentation.get("links", []),
                 sources=dict(design=plan.get("design"), step=plan["step"], narrative=narrative.get("source")),
                 decision=dict(status=header["status"], firstUnmet=header["firstUnmet"]), palette=palette,
                 meshes=payload["meshes"], bodies=bodies, cases=cases,
                 animations=mission_animations(plan, [c["id"] for c in cases if c["id"] != CONTROL_ID]),
                 openingCase=presentation.get("openingCase") or (cycle[0] if cycle else cases[0]["id"]),
                 parked=parked_assembly(nominal, study_cases, roster - fixtures), mass=mass, power=power,
                 required=[dict(role=k, ids=list(v)) for k, v in presentation.get("required", {}).items()],
                 narrativeReview=dict(source=narrative.get("source"), objectives=narrative.get("objectives", [])),
                 motionEvidence=motion_evidence(plan, study_cases, nominal, review.get("control"), control_case, review.get("freePaths"), review.get("supports")),
                 returnCriteria=return_criteria(), interactions=review.get("interactions", []), adjustments=review.get("adjustments", []),
                 focus=presentation.get("focus"), notes=presentation.get("notes"), cutaway=presentation.get("cutaway"))
    require(scene["openingCase"] in {c["id"] for c in cases}, "presentation.openingCase names a commissioned case")
    # The first tessellation of each placed body is the mesh a replay moves; replay-only field bodies join below.
    placed = {}
    for case in cases:
        for member, body in case["bodies"].items():
            placed.setdefault(member, body["mesh"])
    attachment = review.get("attachment")
    if attachment:
        # What the layout check reported about floating solids; the page lists it and the inspector repeats it.
        scene["attachment"] = attachment
    rows = replay_entries(root, plan, scene["meshes"], bodies, placed, palette)
    if rows:
        scene["replays"] = rows
    cut = scene["cutaway"]
    if cut is not None:
        require(isinstance(cut, dict) and named(cut.get("label")) and isinstance(cut.get("hides"), list)
                and set(cut["hides"]) <= {member for member, body in bodies.items() if body["fixture"]},
                "presentation.cutaway needs a label and the fixture IDs it hides")
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


def verify_view(root, plan, scenes, write, observed, budgets, review=None, deferred=None, beside=None):
    """Write or check the review scene, and create the stock review page when the project has none.

    The page is a starting place: a project may change its copy, and it is never compared or replaced. `verified` says
    that the scene on disk is the one this check produced.

    The view sits in `beside`, the folder of the layout plan, so a package checked from its repository root keeps
    its page and scene in its own sub-folder. Without `beside` the project root is that folder, where an existing
    view is checked and none is written.

    With a `deferred` list, nothing is written here: each write is appended as a callable and the result describes
    the files as they will be once the caller runs them, after its last check that can still stop the run."""
    name = plan.get("view")
    if not name:
        return None
    review = review or {}
    home = root if beside is None else Path(beside).resolve()
    require(home == root or home.is_relative_to(root), "Keep the layout plan inside the project")
    require(isinstance(name, str), "Name the view as a project-relative HTML path")
    path = (root / name).resolve()
    example = (home.relative_to(root) / ((Path(name).stem or "NAME") + ".html")).as_posix()
    require(not Path(name).is_absolute() and path.is_relative_to(root) and path.suffix.lower() == ".html"
            and path.parent == home, "Select an HTML view beside the layout plan, such as " + example
            + ": a project-relative path in the plan's own folder")
    # A view is never written at the project root. One already there, from a package checked in its own folder, still verifies.
    require(not write or home != root, "A review view is not written at the project root. Check from the repository root "
            "and keep the layout plan, its inputs and its view together in a release folder, such as "
            "cad/preliminary-design/releases/ID/" + path.name)
    # The receipt records one spelling of a path in a release folder, with forward slashes, whatever the plan typed.
    # A view at the project root keeps the spelling its issued receipt recorded.
    if home != root:
        name = path.relative_to(root).as_posix()
    page = PAGE.read_bytes().replace(b"\r\n", b"\n")
    content = json.dumps(build_scene(root, plan, scenes, observed, budgets, review), allow_nan=False, sort_keys=True,
                         separators=(",", ":")).encode("utf-8")
    _validate(content)
    scene_file = path.with_name(SCENE_FILE)
    # Each file is written whole through a temporary file and a rename, so a reader never finds a partial one.
    actions = []
    if write and not os.path.lexists(path):
        # The page is only ever created: a project may keep its own copy, which is never replaced.
        actions.append(lambda: write_atomic(path, page, exclusive=True))
    compressed = gzip.compress(content, compresslevel=9, mtime=0)
    try:
        stored = scene_file.read_bytes()
        stream = zlib.decompressobj(16 + zlib.MAX_WBITS)
        scene_ok, replaceable = stream.decompress(stored, len(content) + 1) == content and stream.eof, True
    except FileNotFoundError:
        stored, scene_ok, replaceable = None, False, True
    except zlib.error:
        scene_ok, replaceable = False, True
    except OSError:
        # A scene that cannot be read right now may be current; it is reported, never replaced.
        stored, scene_ok, replaceable = None, False, False
    if write and not scene_ok and replaceable:
        # The scene is generated data: a missing, stale or corrupt one is replaced whole.
        actions.append(lambda: write_atomic(scene_file, compressed))
        stored, scene_ok = compressed, True
    if deferred is None:
        for action in actions:
            action()
    else:
        deferred.extend(actions)
    served = stored if stored is not None else compressed
    return dict(file=name, sha256=hashlib.sha256(page).hexdigest(),
                verified=scene_ok and (write or path.is_file()),
                scene=dict(file=scene_file.relative_to(root).as_posix(), sha256=hashlib.sha256(served).hexdigest(),
                           contentSha256=hashlib.sha256(content).hexdigest(), bytes=len(content)))
