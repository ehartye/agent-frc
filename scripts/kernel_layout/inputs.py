"""Read a design's two inputs and join them into the plan the rest of the check reads.

The design source is the library's and holds every solid, group, mount, contact, pose and motion. The judgement
file is the plugin's and holds none of those. The joined plan repeats the source's groups and mounts so the
receipt, the budgets and the review scene can name them.
"""
from dataclasses import dataclass, field
from pathlib import Path

from .files import digest, named, number, pinned, read, require, resolve_references

SCHEMA = "agent-frc/layout-judgement@1"
INSTALL = "pip install --upgrade git+https://github.com/ehartye/frc-design-kernel"
ROLES = ("structure", "bumper", "drive", "battery", "mechanism", "payload", "service", "other", "fixture")
PURPOSES = ("operating", "park", "service")
# What belongs to the design source. A judgement file that carries one of these is refused, naming it.
SOURCE_KEYS = ("groups", "mounts", "contacts", "solids", "fixtures", "poses", "motions", "datum", "step", "design")
STAGE_KEYS = {"purpose", "phase", "basis", "minGapMm", "allowanceBasis", "pathToleranceMm", "depth", "absent", "extract",
              "requiredContacts", "payloadCompression", "carriedWith", "transportedBy", "freePath", "supportedBy"}
DEFAULT_DEPTH = 9


def library():
    """The design library, or one message that says how to install it."""
    try:
        import frc_design_kernel
    except ImportError:
        raise ValueError("The design library frc-design-kernel is not installed in this Python. Install or update it with: " + INSTALL) from None
    return frc_design_kernel


@dataclass
class Inputs:
    """One design as the check reads it."""
    root: Path          # the project
    file: Path          # the judgement file
    judgement: dict     # the judgement file, with a digest beside every file it names
    design: object      # the library's loaded design source
    plan: dict          # the judgement joined with the source's groups, mounts and pins
    cases: list         # one record per stage: what moves, from where, against what allowance
    fixtures: set       # the names of the fixture solids
    roster: set         # every solid and fixture name
    volumes: dict = field(default_factory=dict)    # {solid: volume in mm3}, from the generated manifest
    parts: list = field(default_factory=list)      # the STEP files the source places solids from, each with its digest
    records: dict = field(default_factory=dict)    # {"trials" | "measurements": (record, pin, folder)}: the library's records the judgement names

    @property
    def data(self):
        return self.design.data

    @property
    def source(self):
        return self.design.path


def group_of(data):
    return {s["name"]: s["group"] for s in [*data["solids"], *data["fixtures"]]}


def carried_chain(data, group):
    """The groups that carry this one, nearest first."""
    chain, at = [], data["groups"][group].get("carriedBy")
    while at and at not in chain:
        chain.append(at)
        at = data["groups"][at].get("carriedBy")
    return chain


def own_motion(data, name):
    """(start, moves) of a motion as the source writes them: {group: operations} at the start and along the stroke.

    A motion through poses has no operations of its own; each group whose pose changes carries one marker
    operation that names the poses, so two records of the same motion still compare equal."""
    motion = data["motions"][name]
    if "through" in motion:
        stops = [data["poses"][pose] for pose in motion["through"]]
        moving = sorted({g for stop in stops for g in stop if any(other.get(g, []) != stop[g] for other in stops)})
        return dict(stops[0]), {g: [dict(kind="through", poses=list(motion["through"]))] for g in moving}
    return dict(data["poses"].get(motion.get("from"), {})), dict(motion["moves"])


def start_pose(data, name):
    """The named pose a motion starts from; None when it starts as drawn."""
    motion = data["motions"][name]
    return motion["through"][0] if "through" in motion else motion.get("from")


def has_travel(op):
    if op["kind"] == "translation":
        return any(op["travelMm"])
    if op["kind"] == "rotation":
        return op["travelDeg"] != 0
    if op["kind"] == "gravity-drop":
        return op["fallMm"] > 0
    return True     # a path or a motion through poses


def case_record(data, key, stage, members, fixtures):
    """One stage as a case: the solids it moves and poses, the allowance, and what is taken out of the scene."""
    start, moves = own_motion(data, key)
    for group, ops in moves.items():
        require(ops and any(has_travel(op) for op in ops), "Missing signed travel for " + group + " in " + key)
    moving = {g for g in data["groups"] if g in moves or any(c in moves for c in carried_chain(data, g))}
    posed = {g for g in data["groups"] if g in start or any(c in start for c in carried_chain(data, g))}
    absent = stage.get("absent", [])
    return dict(id=key, stage=stage["purpose"], basis=stage.get("basis"), minGapMm=stage["minGapMm"], depth=stage.get("depth", DEFAULT_DEPTH),
                movingGroups=sorted(moving), present=sum(len(names) for names in members.values()) - len(absent),
                moves={m: moves.get(g, []) for g in sorted(moving) for m in members[g]},
                initialPose={m: start.get(g, []) for g in sorted(posed) for m in members[g]},
                fixtures=[dict(id=name) for name in sorted(fixtures - set(absent))],
                removed={name: "Taken out before this case" for name in absent},
                extract=sorted(m for g in moving for m in members[g]) if stage.get("extract") else [],
                requiredContacts=stage.get("requiredContacts", []), compression=stage.get("payloadCompression", []))


def check_stage(key, stage, roster):
    require(isinstance(stage, dict) and set(stage) <= STAGE_KEYS,
            "Stage " + key + " holds " + ", ".join(sorted(STAGE_KEYS)) + ". Geometry and motion belong to the design source")
    require(stage.get("purpose") in PURPOSES and named(stage.get("allowanceBasis")) and number(stage.get("minGapMm")) and stage["minGapMm"] >= 0,
            "Give stage " + key + " a purpose (" + ", ".join(PURPOSES) + "), an allowance minGapMm of zero or more and its allowanceBasis")
    require("phase" not in stage or named(stage["phase"]), "Give the phase of " + key + " as a short name, such as acquire")
    require(set(stage.get("absent", [])) <= roster, "Stage " + key + " lists an absent solid the design source does not hold")
    require(isinstance(stage.get("depth", DEFAULT_DEPTH), int), "Give the search depth of " + key + " as a whole number")
    for rule in stage.get("payloadCompression", []):
        require(isinstance(rule, dict) and rule.get("payload") in roster and rule.get("contact") in roster and number(rule.get("maxDepthMm"))
                and rule["maxDepthMm"] > 0 and named(rule.get("basis")),
                "A compression rule of " + key + " names the payload solid, the contact solid that presses into it, maxDepthMm above zero and its basis")
    for rule in stage.get("requiredContacts", []):
        require(isinstance(rule, dict) and named(rule.get("id")) and isinstance(rule.get("pair"), list) and set(rule["pair"]) <= roster
                and len(rule["pair"]) == 2 and number(rule.get("maxGapMm")) and isinstance(rule.get("window", [0, 1]), list),
                "A required contact of " + key + " names an id, a pair of solids, maxGapMm and an optional window of stroke fractions")


def source_groups(data, fixtures):
    """{group: {role, members}} as the source states them. A role is one of the plugin's words."""
    groups = {}
    for name, entry in data["groups"].items():
        members = [s["name"] for s in [*data["solids"], *data["fixtures"]] if s["group"] == name]
        if not members:
            continue
        require(entry.get("role") in ROLES, "Group " + name + " in the design source has the role " + repr(entry.get("role"))
                + ". The layout check reads one of: " + ", ".join(ROLES))
        require(entry["role"] != "fixture" or set(members) <= fixtures, "Group " + name + " has the role fixture and holds a robot solid. "
                "List field parts under fixtures in the design source")
        groups[name] = dict(role=entry["role"], members=members)
    return groups


def source_mounts(data):
    mounts = []
    for mount in data["mounts"]:
        require(named(mount.get("note")), "Give each mount in the design source a note: it is the basis the review shows. Missing on "
                + mount["group"] + " on " + mount["on"])
        mounts.append(dict(group=mount["group"], on=mount["on"], pointMm=mount["atMm"], basis=mount["note"],
                           **({"member": mount["member"]} if "member" in mount else {})))
    return mounts


def load(root, file):
    """Read the judgement file and the design source it names. Raises ValueError with one message that says what to change."""
    raw = read(file)
    require(isinstance(raw, dict) and raw.get("schema") == SCHEMA and named(raw.get("issue")),
            "A judgement file has schema " + SCHEMA + " and an issue name")
    stray = sorted(set(raw) & set(SOURCE_KEYS))
    require(not stray, "The judgement file holds no geometry or motion. Move " + ", ".join(stray) + " to the design source, or remove "
            + ("it" if len(stray) == 1 else "them") + ": the check reads groups, mounts, poses and motions from the source")
    judgement = resolve_references(root, raw)
    require(isinstance(judgement.get("source"), dict), "Name the design source in the judgement file, as source: {file}")
    design = library().load(pinned(root, judgement["source"]))
    data = design.data
    fixtures = {s["name"] for s in data["fixtures"]}
    groups, mounts = source_groups(data, fixtures), source_mounts(data)
    roster = {m for g in groups.values() for m in g["members"]}
    stages = judgement.get("stages")
    require(isinstance(stages, dict) and stages, "List a stage for each motion of the design source under stages")
    unknown, unjudged = sorted(set(stages) - set(data["motions"])), sorted(set(data["motions"]) - set(stages))
    require(not unknown and not unjudged, "Each motion of the design source has exactly one stage in the judgement file"
            + ("; no motion is named " + ", ".join(unknown) if unknown else "") + ("; no stage judges " + ", ".join(unjudged) if unjudged else ""))
    members = {name: g["members"] for name, g in groups.items()}
    cases = []
    for key in data["motions"]:
        check_stage(key, stages[key], roster)
        cases.append(case_record(data, key, stages[key], {g: members.get(g, []) for g in data["groups"]}, fixtures))
    pin = dict(file=judgement["source"]["file"], sha256=design.sha256)
    plan = dict(judgement, groups=groups, mounts=mounts, datum=dict(name=data["frame"]), design=pin,
                stages={c["id"]: dict(stages[c["id"]], movingGroups=c["movingGroups"]) for c in cases})
    return Inputs(root=root, file=Path(file), judgement=judgement, design=design, plan=plan, cases=cases, fixtures=fixtures, roster=roster)


def generated(inputs):
    """The library's generated records for this source: the STEP pin and each solid's box. Stale or absent ones stop the check."""
    ref = inputs.judgement.get("generated")
    build = "python -m frc_design_kernel build " + inputs.judgement["source"]["file"] + " --out FOLDER"
    require(isinstance(ref, dict) and named(ref.get("file")) and (inputs.root / ref["file"]).is_file(),
            "Generate the solids and the manifest with the library (" + build + ") and name the manifest in the judgement file, as generated: {file}")
    path = pinned(inputs.root, dict(ref))
    manifest = read(path)
    require((manifest.get("design") or {}).get("sourceSha256") == inputs.design.sha256,
            "The generated solids are of an earlier design source. A generated file is never edited: regenerate them with " + build)
    step = path.with_name((manifest.get("files") or {}).get("design") or "design.step")
    require(step.is_file(), "The manifest names a STEP that is not beside it: " + step.name + ". Regenerate with " + build)
    rows = [*manifest.get("solids", []), *manifest.get("fixtures", [])]
    bounds = {row["name"]: row["boundsMm"] for row in rows}
    inputs.volumes.update({row["name"]: row["volumeMm3"] for row in rows})
    inputs.parts[:] = [dict(file=row["file"], sha256=row["sha256"], solids=len(row.get("solids", []))) for row in manifest.get("parts", [])]
    return dict(file=step.relative_to(inputs.root).as_posix(), sha256=digest(step)), bounds
