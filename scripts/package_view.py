"""Build the review page of a preliminary design from its design source, its judgement file, its page file and the
design library's records, and write it beside the judgement file.

    design preliminary-page PROJECT JUDGEMENT [--check] [--quiet]

The verdict is judged from the committed records and nothing is measured: a stale or missing record refuses the page,
naming it. The page is review.html, created once from the stock template and never replaced, and its scene,
review-scene.json.gz, which is rebuilt whenever what it shows changes. With --check nothing is written: it says whether
the committed scene is the one the current records build, and exits 1 when it is not.

The page file holds only words and display choices, and it never reaches the verdict. The judgement file names it as
page: {file}. Every field is optional, and a solid with no entry shows its name, its group and its note from the source:

    {"schema": "agent-frc/review-page@1", "title": "...", "context": "...", "architecture": "...", "focus": "...",
     "notes": ["..."], "links": [{"label", "href"}], "alliance": "blue", "opening": "<motion>",
     "phases": {"<phase>": {"title": "...", "headline": true}},
     "solids": {"<solid>": {"name", "subsystem", "description", "category", "material"}},
     "cutaway": {"label": "...", "hides": ["<fixture>"], "outline": [[x, y, z], ...]}}

Each motion's timeline comes from the motion itself: a driven motion plays on its nominal duration from rest to rest,
and reads out each drive's joint value and peak current and the bus voltage from its electrical record.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
import zlib

from atomic_file import write_atomic
from kernel_layout.files import digest, named, read, reference, require

CONTROL_ID = "package-displacement-control"
SCENE_SCHEMA = "agent-frc/preliminary-review-scene@2"
PAGE_SCHEMA = "agent-frc/review-page@1"
TEMPLATE = Path(__file__).resolve().parents[1] / "templates/preliminary-review/review.html"
PAGE_NAME, SCENE_FILE = "review.html", "review-scene.json.gz"
UNITS = "Millimetres in the design source frame; kg, A, V"
PAGE_KEYS = ("schema", "title", "context", "architecture", "focus", "notes", "links", "alliance", "opening", "phases", "solids", "cutaway")
SOLID_KEYS = ("name", "subsystem", "description", "category", "material")
ROLE_COLOURS = {"drive": "mechanism", "payload": "game-piece", "battery": "electrical", "other": "reference", "service": "reserved-space"}
NOT_ROBOT = ("payload", "service")
METRIC = dict(metric="Minimum surface gap; positive overlap volume", units="mm, mm³")


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
        cases.append(dict(id=case["id"], bodies=bodies))
    return meshes, cases


def safe_href(href):
    """A link the review may follow: relative to the release page without a scheme, or https with a host."""
    parts = urlsplit(href) if isinstance(href, str) else None
    return bool(parts) and not re.search(r"[\x00-\x20\x7f\\]", href) and (
        parts.scheme == "https" and bool(re.fullmatch(r"[A-Za-z0-9.-]+", parts.netloc))
        or not parts.scheme and not parts.netloc and not href.startswith("/") and ":" not in href.split("/")[0])


def page_file(inputs):
    """(the page file, its pin) or ({}, None) when the judgement names none. Refuses a page file the page cannot use, naming it."""
    from kernel_layout.stages import PHASES
    ref = inputs.judgement.get("page")
    if ref is None:
        return {}, None
    problems = []
    path = reference(inputs.root, ref, "page", problems)
    require(not problems, "Refused the page: " + "; ".join(problems))
    name, page = path.name, read(path)
    require(isinstance(page, dict) and page.get("schema") == PAGE_SCHEMA, name + " has schema " + PAGE_SCHEMA)
    for key in sorted(set(page) - set(PAGE_KEYS)):
        problems.append(name + " has no field " + key + "; it holds " + ", ".join(PAGE_KEYS))
    for key in ("title", "context", "architecture", "focus", "alliance"):
        if key in page and not named(page[key]):
            problems.append(name + ": give " + key + " as words")
    if "notes" in page and not (isinstance(page["notes"], list) and all(named(n) for n in page["notes"])):
        problems.append(name + ": notes is a list of sentences")
    if not (isinstance(page.get("links", []), list) and all(isinstance(k, dict) and set(k) == {"label", "href"} and named(k["label"]) and safe_href(k["href"])
                                                          for k in page.get("links", []))):
        problems.append(name + ": links holds {label, href} with relative or https links")
    if "opening" in page and page["opening"] not in inputs.data["motions"]:
        problems.append(name + ": opening names " + str(page["opening"]) + ", which is not a motion of the design source")
    phases = page.get("phases", {})
    if not (isinstance(phases, dict) and set(phases) <= set(PHASES) and all(isinstance(v, dict) and set(v) <= {"title", "headline"} and named(v.get("title", "x"))
                                                                          and isinstance(v.get("headline", True), bool) for v in phases.values())):
        problems.append(name + ": phases maps a phase of the cycle (" + ", ".join(PHASES) + ") to {title, headline}")
    solids = page.get("solids", {})
    if not isinstance(solids, dict):
        problems.append(name + ": solids maps a solid of the design source to {" + ", ".join(SOLID_KEYS) + "}")
        solids = {}
    for solid, entry in sorted(solids.items()):
        if solid not in inputs.roster:
            problems.append(name + ": solids names " + solid + ", which is not a solid or fixture of the design source")
        elif not (isinstance(entry, dict) and set(entry) <= set(SOLID_KEYS) and all(named(v) for v in entry.values())):
            problems.append(name + ": solids." + solid + " holds words for " + ", ".join(SOLID_KEYS))
    cut = page.get("cutaway")
    if cut is not None and not (isinstance(cut, dict) and named(cut.get("label")) and isinstance(cut.get("hides"), list) and set(cut["hides"]) <= inputs.fixtures
                                and set(cut) <= {"label", "hides", "outline"}):
        problems.append(name + ": cutaway needs a label and the fixtures it hides")
    require(not problems, "Refused the page: " + "; ".join(problems))
    return page, dict(file=path.relative_to(inputs.root).as_posix(), sha256=digest(path))


def _colour(palette, category, role, alliance, fixture):
    """A body's viewing colour: its own category, else the field colour for a fixture, the alliance colour for a bumper, then its role."""
    own = palette.get(category) or palette.get(role)
    if not own and fixture:
        own = palette.get("field")
    if not own and role == "bumper":
        own = palette.get("bumper-" + alliance)
    return own or palette.get(ROLE_COLOURS.get(role, "")) or palette.get("reference") or "#8a9199"


def bodies_of(inputs, assembly, volumes, page, palette):
    """Every solid and fixture: what the source says of it, with the page file's words where it gives them."""
    alliance = page.get("alliance", "blue")
    require("bumper-" + alliance in palette, "The page's alliance names a bumper colour of the palette, such as red or blue: bumper-" + alliance + " is not one")
    data, own = inputs.data, page.get("solids", {})
    motors = {}
    for name, drive in sorted((data.get("drives") or {}).items()):
        if drive.get("motorSolid"):
            motors.setdefault(drive["motorSolid"], []).append(name)
    lumps = {g for g, entry in data["groups"].items() if "massKg" in entry}
    out = {}
    for name, solid in assembly.solids.items():
        said, role, fixture = own.get(name, {}), inputs.groups[solid.group]["role"], solid.fixture
        category = said.get("category") or ("field" if fixture and role != "payload" else role)
        volume = volumes.get(name)
        out[name] = dict(name=said.get("name", name), category=category, role=role, color=_colour(palette, category, role, alliance, fixture).lower(),
                         subsystem=said.get("subsystem", solid.group), motionGroup=solid.group, material=said.get("material"),
                         volumeMm3=None if volume is None else round(volume, 3), closed=volume is not None, fixture=fixture,
                         description=said.get("description") or solid.note or None, massKg=solid.mass_kg,
                         massRangeKg=list(solid.mass_range_kg) if solid.mass_range_kg else None,
                         massFrom=solid.mass_from or ("group" if solid.group in lumps else None),
                         massExcluded="Field fixture; not robot weight" if fixture else "Not robot weight (" + role + ")" if role in NOT_ROBOT else None,
                         motorOf=motors.get(name, []))
        mounts = [dict(on=m["on"], pointMm=list(m["atMm"]), basis=m.get("note") or "") for m in data["mounts"] if m.get("member") == name]
        if mounts:
            out[name]["mounts"] = mounts
    return out


def results_of(rows):
    """A clearance record's kept pairs as the page lists them: failing, open, or near and clear."""
    out = []
    for r in rows:
        status = "fail" if r["proven"] and r["closerThanMinGap"] else "pass" if r["proven"] else "open"
        row = dict(pair=list(r["pair"]), status=status, method=r.get("method"))
        if r.get("t") is not None and r.get("gapMm") is not None:
            row["witness"] = dict(t=r["t"], gapMm=r["gapMm"], volumeMm3=r.get("overlapMm3") or 0)
        elif r.get("unresolved"):
            row["witness"] = list(r["unresolved"])
        if r.get("lowerBoundMm") is not None:
            row["lowerBoundMm"] = r["lowerBoundMm"]
        out.append(row)
    return out


def start_of(entry):
    start = entry.get("from")
    return "Where " + start["after"] + " ends" if isinstance(start, dict) else "Pose " + start if start else "As drawn"


def environment(inputs, case):
    present = sorted(inputs.fixtures - set(case["absent"]))
    return ("Field fixtures: " + ", ".join(present)) if present else "Robot only, floor at Z = 0"


def basis_of(entry):
    drives = sorted(entry.get("drive") or {})
    return entry.get("note") or ("Driven by " + ", ".join(drives) if drives else "Moved by " + str(entry.get("by")))


def limiting(row, record):
    """(pair, time, value, method) of a judged motion: its worst failing pair, its first open pair, or its closest one."""
    methods = {frozenset(r["pair"]): r.get("method") for r in record["result"]["pairs"]}
    if row["failing"]:
        w = min(row["failing"], key=lambda r: (r["gapMm"], -r["overlapMm3"]))
    elif row["open"]:
        w = row["open"][0]
        return w["pair"], None, {}, "Unresolved over t " + json.dumps(w["interval"]) + " at the search depth"
    else:
        w = row.get("closest")
    if not w:
        return None, None, None, "Every pair stays beyond the allowance in the broad phase"
    return list(w["pair"]), w["t"], dict(gapMm=w["gapMm"], volumeMm3=w.get("overlapMm3") or 0), methods.get(frozenset(w["pair"])) or "adaptive search"


def evidence_row(inputs, case, row, record):
    pair, t, value, method = limiting(row, record)
    entry = dict(case=case["id"], kind="nominal", purpose=case["purpose"], cause=case["cause"], result=row["status"], playable=True,
                 start=start_of(inputs.data["motions"][case["id"]]), groups=row["movingGroups"], environment=environment(inputs, case), **METRIC,
                 limitingPair=pair, limitingTime=t, limitingValue=value, allowanceMm=row["allowanceMm"], allowanceBasis=row["allowanceBasis"],
                 method=method, basis=basis_of(inputs.data["motions"][case["id"]]))
    if case.get("pathToleranceMm") is not None:
        entry["pathToleranceMm"] = case["pathToleranceMm"]
    for key in ("requiredContacts", "compression", "withdrawal"):
        if row.get(key):
            entry[key] = row[key]
    return entry


def control_row(inputs, verdict, case):
    control = verdict["control"]
    w = control.get("witness") or {}
    return dict(case=CONTROL_ID, kind="displaced control", purpose=case["purpose"], cause=case["cause"], expected="fail", playable=True,
                result="rejected as expected" if control["rejected"] else "not rejected",
                start=control["displaced"] + " displaced " + json.dumps(control["offsetMm"]) + " mm", groups=case["movingGroups"],
                environment=environment(inputs, case), **METRIC, limitingPair=w.get("pair"), limitingTime=w.get("t"),
                limitingValue=dict(gapMm=w["gapMm"], volumeMm3=w["overlapMm3"]) if w else None, allowanceMm=case["minGapMm"],
                allowanceBasis=case["allowanceBasis"], method="adaptive search", basis=control["basis"])


def motion_evidence(inputs, verdict, order, records):
    """The check list: each motion, the displaced control, and what no motion represents."""
    by_id = {c["id"]: c for c in inputs.cases}
    rows = [evidence_row(inputs, by_id[m], verdict["motions"][m], records[m]) for m in order]
    if verdict["control"]:
        rows.append(control_row(inputs, verdict, by_id[verdict["control"]["motion"]]))
    else:
        rows.append(dict(case=CONTROL_ID, kind="uncovered", result="missing", playable=False, note="The judgement file commissions no matched displaced control"))
    rows += [dict(case="objective: " + o["objective"], kind="uncovered", result=o["disposition"], playable=False, note=o.get("basis", ""))
             for o in verdict["narrative"]["objectives"] if o["disposition"] != "represented"]
    return rows


def animations(inputs, verdict, page):
    """One entry per phase of the cycle, playing its motions end to end; a motion outside the cycle plays alone."""
    titles, purpose, placed, out = page.get("phases", {}), {c["id"]: c["purpose"] for c in inputs.cases}, set(), []
    for entry in verdict["cycle"]:
        motions = [m for m in entry.get("motions", []) if m not in placed]
        if not motions:
            continue
        placed.update(motions)
        own = titles.get(entry["phase"], {})
        out.append(dict(id=entry["phase"], title=own.get("title", entry["phase"].capitalize()),
                        mission=own.get("headline", any(purpose[m] == "operating" for m in motions)), cases=motions))
    taken = {a["id"] for a in out}
    for case in inputs.cases:
        if case["id"] not in placed:
            key = case["id"] if case["id"] not in taken else case["id"] + " (motion)"
            out.append(dict(id=key, title=case["id"], mission=False, cases=[case["id"]]))
    return out


def parked(inputs, records):
    """Every pair of robot solids that stays still in a motion: how many, those that overlap, those left unresolved."""
    robot, positive, unresolved, screened = inputs.roster - inputs.fixtures, {}, set(), set()
    for case in inputs.cases:
        still = sorted(robot - set(case["moved"]) - set(case["absent"]))
        screened.update((a, b) for i, a in enumerate(still) for b in still[i + 1:])
        for r in records[case["id"]]["result"]["pairs"]:
            pair = tuple(sorted(r["pair"]))
            if not set(pair) <= set(still):
                continue
            if r["proven"] and r["closerThanMinGap"] and (r.get("overlapMm3") or 0) > 0:
                positive[pair] = max(positive.get(pair, 0), round(r["overlapMm3"], 3))
            elif not r["proven"]:
                unresolved.add(pair)
    return dict(screenedPairs=len(screened), positive=[dict(pair=list(p), volumeMm3=v) for p, v in sorted(positive.items())],
                unresolved=[list(p) for p in sorted(unresolved)])


def weight_of(inputs, verdict, mass):
    from frc_design_kernel.source.sourced import span
    groups = {g: dict(massKg=row["massKg"], rangeKg=row["rangeKg"], members=inputs.groups.get(g, {}).get("members", []), extra=row.get("extra", []))
              for g, row in mass["groups"].items()}
    extra = [dict(name=e["name"], group=e["group"], rangeKg=list(span(e["massKg"])[1:]), note=e.get("note")) for e in inputs.data.get("extraMass", [])]
    w = verdict["weight"]
    return dict(totalKg=w["totalKg"], rangeKg=w["rangeKg"], notRobotWeight=w["notRobotWeight"], unweighed=mass.get("unweighed", []), groups=groups,
                extraMass=extra, limits=w["limits"])


def power_of(inputs, verdict, order, electrical):
    """Each powered motion: every running drive's current and the motor voltage it needs, and the bus under all of them."""
    source, motions = inputs.data.get("drives") or {}, []
    members = lambda name: [source[name]["motorSolid"]] if source.get(name, {}).get("motorSolid") in inputs.roster else []
    for m in [m for m in order if m in verdict["electrical"]["motions"]]:
        row, found = verdict["electrical"]["motions"][m], electrical[m]
        drives = [dict(drive=name, motor=source[name].get("motor"), motorSolid=source[name].get("motorSolid"), count=d["count"], group=d["group"], kind=d["kind"],
                       change=d["change"], unit="°" if d["kind"] == "rotation" else "mm", currentA=d["currentA"]["range"], neededA=d["neededA"]["range"],
                       limitA=d["limitA"], motorV=d["motorV"]["range"], clamped=d["clamped"], busA=d["busA"]["range"], members=members(name))
                  for name, d in sorted(found["drives"].items())]
        also = [dict(drive=r["drive"], busA=r["busA"]["range"], members=members(r["drive"])) for r in found.get("alsoRunning", [])]
        bus = found["bus"]
        motions.append(dict(motion=m, status=row["status"], busV=row["busV"], loadA=row["loadA"], requiredV=row["requiredV"], governs=row["governs"],
                            marginV=row["marginV"], clamped=row["clamped"], openCircuitV=bus["openCircuitV"][1:], resistanceOhm=bus["resistanceOhm"][1:],
                            drives=drives, alsoRunning=also))
    return dict(minBusV=verdict["electrical"]["minBusV"], conservative=verdict["electrical"]["conservative"], motions=motions)


def return_criteria(verdict):
    conceptual = ["A represented narrative objective can no longer be represented by a motion",
                  *("Premise %s (%s) leaves %s · now %s" % (p["id"], p["unit"], json.dumps(p["criterion"]), p["status"]) for p in verdict["premises"])]
    return dict(preliminary=["A motion fails clearance, leaves an open interval or misses a required contact", "The displaced control is not rejected",
                             "A weight limit is exceeded at the high end of the weight range",
                             "A motion's weak-pack bus falls below minBusV or below a running drive's motor voltage", "A robot solid floats"],
                conceptual=conceptual)


def trial_replays(found, meshes, bodies, placed, palette):
    """The trial replays of the one animation list, from the library's trial records (kernel_layout.replays).

    found lists (replay, pieces) pairs: each piece a body with its display mesh, shared by every replay that draws it.
    The pieces and their meshes are appended to `bodies` and `meshes`; the replay rows are returned."""
    rows, mesh_index = [], {}
    for row, pieces in found:
        for use, mesh in pieces.items():
            key = hashlib.sha256(json.dumps(mesh, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            if key not in mesh_index:
                mesh_index[key] = len(meshes)
                meshes.append(mesh)
            for member in [m for m in row["bodies"] if m == "piece: " + use or m.startswith("piece: " + use + " (")]:
                require(member not in placed or placed[member] == mesh_index[key], "Trial piece " + member + " is drawn with two shapes")
                placed[member] = mesh_index[key]
                bodies[member] = dict(name=member, category="game piece", role="payload", color=_colour(palette, "game piece", "payload", "blue", False).lower(),
                                      subsystem=None, motionGroup="trial piece", material=None, volumeMm3=None, closed=True, fixture=False,
                                      description="The trial's free piece, with the shape its record gives it; it moves as the run traced it",
                                      massKg=None, massRangeKg=None, massFrom=None, massExcluded="Game piece; not robot weight", motorOf=[])
        require(row["id"] not in {r["id"] for r in rows}, "Two trials replay under one ID: " + row["id"] + ". Name them apart")
        rows.append(dict(row, bodies={member: dict(mesh=placed[member], group=group) for member, group in sorted(row["bodies"].items()) if member in placed},
                         groups={name: [_round(m, 6) for m in series] for name, series in sorted(row["groups"].items())}))
    return rows


def scene_of(root, file):
    """(the scene, the verdict) of one design: the verdict judged from its committed records, which measures nothing."""
    from component_palette import resolve_palette
    from kernel_layout import measure, replays, view
    from kernel_layout.inputs import load
    from kernel_layout.verdict import REQUIRED_ROLES, judge
    verdict = judge(root, file, judge_only=True)
    inputs = load(root, file)
    page, page_pin = page_file(inputs)
    by_id, cycle = {c["id"]: c for c in inputs.cases}, [m for e in verdict["cycle"] for m in e.get("motions", [])]
    order = list(dict.fromkeys([m for m in cycle if m in by_id] + [c["id"] for c in inputs.cases]))
    record = lambda name: measure.read(inputs.records, name)
    clearances = {m: record("clearance.motion." + m) for m in order}
    electrical = {m: record(row["id"])["result"] for m in order for row in verdict["records"]["jobs"] if row["id"] == "electrical." + m}
    assembly, volumes = view.built(inputs)
    captured, volumes = view.scenes(inputs, assembly, volumes, order, verdict["control"])
    meshes, placed_cases = scene_payload(captured)
    palette = {k: v.lower() for k, v in resolve_palette(root).items()}
    bodies = bodies_of(inputs, assembly, volumes, page, palette)
    power = power_of(inputs, verdict, order, electrical)
    powered = {p["motion"]: p for p in power["motions"]}
    cases = []
    for placed in placed_cases:
        control = placed["id"] == CONTROL_ID
        m = verdict["control"]["motion"] if control else placed["id"]
        case, row = by_id[m], verdict["motions"][m]
        time, lines = view.readout(inputs, case, clearances[m], powered.get(m))
        shown = dict(id=placed["id"], label="Displaced control" if control else m + " (" + case["purpose"] + ")", kind="displaced control" if control else "nominal",
                     purpose=case["purpose"], cause=case["cause"], basis=verdict["control"]["basis"] if control else basis_of(inputs.data["motions"][m]),
                     status=("fail" if verdict["control"]["rejected"] else "pass") if control else row["status"], allowanceMm=case["minGapMm"],
                     bodies=placed["bodies"], removed=[], results=results_of(record("clearance.motion." + m + ".displaced." + verdict["control"]["displaced"])["result"]["pairs"]
                                                                             if control else clearances[m]["result"]["pairs"]), measure=lines)
        if time:
            shown["time"] = time
        cases.append(shown)
    first = {}
    for case in cases:
        for member, body in case["bodies"].items():
            first.setdefault(member, body["mesh"])
    narrative = verdict["narrative"]["file"]
    scene = dict(schema=SCENE_SCHEMA, issue=verdict["issue"], design=verdict["design"], title=page.get("title"), context=page.get("context"),
                 architecture=page.get("architecture"), datum=inputs.data.get("frame"), units=UNITS, links=page.get("links", []), focus=page.get("focus"),
                 notes=page.get("notes"), cutaway=page.get("cutaway"),
                 sources=dict(design=dict(file=inputs.source.relative_to(root).as_posix(), sha256=inputs.design.sha256),
                              narrative=dict(file=narrative, sha256=digest(root / narrative)), page=page_pin),
                 records=dict(folder=verdict["records"]["folder"], jobs=[dict(id=r["id"], file=r["file"], sha256=digest(inputs.records / r["file"]))
                                                                         for r in verdict["records"]["jobs"]],
                              trials=dict(file=(inputs.records / "trials.json").relative_to(root).as_posix(), sha256=digest(inputs.records / "trials.json"))
                              if (inputs.records / "trials.json").is_file() else None),
                 decision=dict(status=verdict["status"], firstUnmet=verdict["firstUnmet"]), unmet=verdict["unmet"], reopen=verdict["reopen"],
                 premises=verdict["premises"], palette=palette, meshes=meshes, bodies=bodies, cases=cases,
                 openingCase=page.get("opening") or order[0], animations=animations(inputs, verdict, page), parked=parked(inputs, clearances),
                 weight=weight_of(inputs, verdict, record("mass.drawn")["result"]), power=power,
                 required=[dict(role=role, ids=sorted(inputs.members((role,)))) for role in REQUIRED_ROLES],
                 narrativeReview=dict(source=dict(file=narrative, sha256=digest(root / narrative)), objectives=verdict["narrative"]["objectives"]),
                 motionEvidence=motion_evidence(inputs, verdict, order, clearances), returnCriteria=return_criteria(verdict),
                 interactions=verdict["interactions"], adjustments=verdict["adjustments"], attachment=verdict["attachment"])
    rows = trial_replays(replays.build(inputs), scene["meshes"], scene["bodies"], first, palette)
    if rows:
        scene["replays"] = rows
    return scene, verdict


def validate(content, verdict):
    """Refuse a scene the stock page cannot play, or one that does not repeat the verdict judged from the records."""
    import subprocess
    with TemporaryDirectory() as temp:
        file = Path(temp) / "verdict.json"
        file.write_text(json.dumps(verdict), encoding="utf-8")
        run = subprocess.run(["node", str(Path(__file__).with_name("review-scene.mjs")), "validate", "-", "--verdict", str(file)], input=content, capture_output=True)
    try:
        errors = json.loads(run.stdout)["errors"]
    except (ValueError, KeyError):
        raise ValueError("Could not validate the review scene: " + run.stderr.decode(errors="replace").strip()) from None
    require(not errors, "The review scene is invalid: " + "; ".join(errors[:5]))


def build(root, file, check=False):
    """Build the page of one design, or with check say whether the committed scene is the one its records build.

    Returns {file, scene, bytes, current, written, verdict}. Nothing is written with check, or when the scene is current."""
    root, file = Path(root).resolve(), Path(file).resolve()
    scene, verdict = scene_of(root, file)
    content = json.dumps(scene, allow_nan=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    validate(content, verdict)
    page, scene_file = file.with_name(PAGE_NAME), file.with_name(SCENE_FILE)
    try:
        stream = zlib.decompressobj(16 + zlib.MAX_WBITS)
        current = stream.decompress(scene_file.read_bytes(), len(content) + 1) == content and stream.eof
    except (OSError, zlib.error):
        current = False
    written = []
    if not check:
        if not page.exists():
            # The page is only ever created: a project may keep its own copy, which is never replaced.
            write_atomic(page, TEMPLATE.read_bytes().replace(b"\r\n", b"\n"), exclusive=True)
            written.append(PAGE_NAME)
        if not current:
            write_atomic(scene_file, gzip.compress(content, compresslevel=9, mtime=0))
            written.append(SCENE_FILE)
    return dict(file=scene_file.relative_to(root).as_posix(), scene=scene, bytes=len(content), current=current, written=written, verdict=verdict)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("project", type=Path)
    parser.add_argument("judgement", help="The project-relative judgement file; the page is written beside it")
    parser.add_argument("--check", action="store_true", help="Write nothing; exit 1 unless the committed scene is the one the current records build")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    try:
        from kernel_layout.files import project_path
        root = args.project.resolve()
        found = build(root, project_path(root, args.judgement), check=args.check)
    except (KeyError, IndexError, ValueError, TypeError, OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 2
    scene = found["scene"]
    motions = sum(1 for c in scene["cases"] if c["kind"] != "displaced control")
    told = (f"{motions} motion(s)" + (", the displaced control" if any(c["kind"] == "displaced control" for c in scene["cases"]) else "")
            + f" and {len(scene.get('replays', []))} trial replay(s) from {len(scene['records']['jobs'])} record(s); verdict {scene['decision']['status']}")
    if args.check:
        print(found["file"] + (" is the page built from the current records: " + told if found["current"] else
                               " is not the page built from the current records. Build it again with design preliminary-page " + args.project.as_posix()
                               + " " + args.judgement))
        return 0 if found["current"] else 1
    if not args.quiet:
        print(("Wrote " + ", ".join(found["written"]) if found["written"] else "Unchanged") + ": " + found["file"] + " shows " + told)
    return 0


if __name__ == "__main__":
    sys.exit(main())
