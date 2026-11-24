"""Read every input of a judgement before anything is measured, and refuse with the whole list of what is missing.

The design source is the library's and holds everything physical: solids and their weight, groups, mounts, contacts,
motors and drives, the battery, poses and motions. The judgement file is the plugin's and holds none of those:

    {"schema": "agent-frc/layout-judgement@2", "issue": "...",
     "source": {"file"}, "records": {"folder"}, "requirements": {"file"},
     "narrative": {"file", "objectives": [{"objective", "disposition", "basis"}]},
     "premises": [{"file"}], "rules": {...}, "purposes": {...}, "motions": {...},
     "cycle": [{"phase", "motions": [...]} | {"phase", "notApplicable"}],
     "control": {"motion", "displaced", "moving", "offsetMm", "basis"},
     "attachment": {...}, "interactions": {...}, "missionCases": [...], "risks": [...], "scopeGuidelines": {...}}

A file is named by its path alone. The season's requirements file is shared by every release of the season:

    {"schema": "agent-frc/season-requirements@1", "basis": "...", "minBusV": 9,
     "weightLimits": [{"name", "limitKg", "excludesGroups": [...], "basis"}]}
"""
from dataclasses import dataclass, field
from pathlib import Path

from . import missions, premises, rules, stages
from .files import named, number, read, reference

SCHEMA = "agent-frc/layout-judgement@2"
REQUIREMENTS = "agent-frc/season-requirements@1"
INSTALL = "pip install --upgrade git+https://github.com/ehartye/frc-design-kernel"
ROLES = ("structure", "bumper", "drive", "battery", "mechanism", "payload", "service", "other", "fixture")
# Group roles that are not physical robot parts: game pieces, and service gauges or clearance envelopes.
NOT_ROBOT = ("payload", "service")
# What belongs to the design source. A judgement file that carries one of these is refused, naming it.
SOURCE_KEYS = ("groups", "mounts", "contacts", "solids", "fixtures", "poses", "stages", "datum", "step", "design", "drives", "battery")
KEYS = ("schema", "issue", "source", "records", "requirements", "narrative", "premises", "rules", "purposes", "motions", "cycle", "control",
        "attachment", "interactions", "missionCases", "risks", "scopeGuidelines")


def library():
    """The design library, or one message that says how to install it."""
    try:
        import frc_design_kernel
    except ImportError:
        raise ValueError("The design library frc-design-kernel is not installed in this Python. Install or update it with: " + INSTALL) from None
    return frc_design_kernel


def refused(problems, before="before measuring"):
    """One error that lists every problem."""
    return ValueError("Refused " + before + ": " + str(len(problems)) + " missing or invalid input" + ("" if len(problems) == 1 else "s")
                      + ":\n" + "\n".join("- " + p for p in problems))


@dataclass
class Inputs:
    """One design as the judgement reads it."""
    root: Path          # the project
    file: Path          # the judgement file
    judgement: dict     # the judgement file as written
    design: object      # the library's loaded design source
    records: Path       # the folder of the library's records
    requirements: dict  # the season's requirements
    premises: list      # the accepted premises
    narrative: dict     # the narrative's file and the objectives it was reviewed for
    cases: list         # one record per motion: its purpose, rules and bindings, and the groups it moves
    groups: dict        # {group: {role, members}}
    fixtures: set       # the names of the fixture solids
    roster: set         # every solid and fixture name
    mounts: list = field(default_factory=list)

    @property
    def data(self):
        return self.design.data

    @property
    def source(self):
        return self.design.path

    def members(self, roles):
        return {m for g in self.groups.values() if g["role"] in roles for m in g["members"]}


def source_groups(data, fixtures, problems):
    """{group: {role, members}} as the source states them. A role is one of the plugin's words."""
    groups = {}
    for name, entry in data["groups"].items():
        members = [s["name"] for s in [*data["solids"], *data["fixtures"]] if s["group"] == name]
        if not members:
            continue
        if entry.get("role") not in ROLES:
            problems.append("Group " + name + " in the design source has the role " + repr(entry.get("role")) + ". The judgement reads one of: " + ", ".join(ROLES))
        elif entry["role"] == "fixture" and not set(members) <= fixtures:
            problems.append("Group " + name + " has the role fixture and holds a robot solid. List field parts under fixtures in the design source")
        groups[name] = dict(role=entry.get("role"), members=members)
    return groups


def unweighed(data, groups):
    """The robot solids no weight covers: no massKg or densityKgM3 of their own and no lump on their group. Service solids need none."""
    lumps = {g for g, entry in data["groups"].items() if "massKg" in entry}
    return sorted(s["name"] for s in data["solids"] if groups.get(s["group"], {}).get("role") not in ("service",)
                  and "massKg" not in s and "densityKgM3" not in s and s["group"] not in lumps)


def season(root, judgement, groups, problems):
    """The season's requirements, read and checked: the bus floor and each weight limit with the groups it leaves out."""
    path = reference(root, judgement.get("requirements"), "requirements", problems)
    if path is None:
        return {}
    found = read(path)
    if not (isinstance(found, dict) and found.get("schema") == REQUIREMENTS and named(found.get("basis")) and number(found.get("minBusV"))
            and found["minBusV"] > 0 and isinstance(found.get("weightLimits"), list) and set(found) <= {"schema", "basis", "minBusV", "weightLimits"}):
        problems.append("A requirements file has schema " + REQUIREMENTS + ", a basis, minBusV above zero and a list of weightLimits")
        return {}
    for row in found["weightLimits"]:
        if not (isinstance(row, dict) and set(row) == {"name", "limitKg", "excludesGroups", "basis"} and named(row["name"]) and number(row["limitKg"])
                and row["limitKg"] > 0 and isinstance(row["excludesGroups"], list) and named(row["basis"])):
            problems.append("A weight limit names itself, its limitKg above zero, the groups it excludes and its basis")
            continue
        for group in row["excludesGroups"] if groups is not None else []:
            if group not in groups:
                problems.append("Weight limit " + row["name"] + " excludes " + str(group) + ", which is not a group of the design")
    return found


def top_level(raw, problems):
    """Refuse what the judgement file must not hold: geometry and motion, and anything it does not know."""
    stray = sorted(set(raw) & set(SOURCE_KEYS))
    if stray:
        problems.append("The judgement file holds no geometry or motion. Move " + ", ".join(stray) + " to the design source, or remove "
                        + ("it" if len(stray) == 1 else "them") + ": the judgement reads groups, mounts, poses and motions from the source")
    unknown = sorted(set(raw) - set(KEYS) - set(SOURCE_KEYS))
    if unknown:
        problems.append("The judgement file has no field " + ", ".join(unknown) + "; it holds " + ", ".join(KEYS))


def design_of(root, judgement, problems):
    path = reference(root, judgement.get("source"), "source", problems)
    if path is None:
        return None
    try:
        return library().load(path)
    except (ValueError, OSError) as problem:
        problems.append("The design source does not load: " + str(problem))
        return None


def physical(design, groups, cases, problems):
    """What the source must state for the judgement to be made: every robot solid weighed, and a battery for every powered motion."""
    problems.extend("Unweighed robot solid: " + name for name in unweighed(design.data, groups))
    powered = sorted(c["id"] for c in cases if c["powered"])
    if powered and not design.data.get("battery"):
        problems.append("Give the design source a battery: " + (", ".join(powered[:-1]) + " and " + powered[-1] if len(powered) > 1 else powered[0])
                        + " draw" + ("" if len(powered) > 1 else "s") + " from it")


def load(root, file):
    """Read the judgement file, the season's requirements, the premises and the design source. Raises ValueError listing every problem."""
    root, problems = Path(root).resolve(), []
    raw = read(Path(file))
    if not (isinstance(raw, dict) and raw.get("schema") == SCHEMA and named(raw.get("issue"))):
        raise refused(["A judgement file has schema " + SCHEMA + " and an issue name"])
    top_level(raw, problems)
    folder = reference(root, raw.get("records"), "records", problems, kind="folder")
    narrative = premises.narrative(root, raw, problems)
    design = design_of(root, raw, problems)
    if design is None:
        season(root, raw, None, problems)
        premises.read_all(root, raw, None, problems)
        raise refused(problems)
    data = design.data
    fixtures = {s["name"] for s in data["fixtures"]}
    groups = source_groups(data, fixtures, problems)
    roster = {m for g in groups.values() for m in g["members"]}
    requirements = season(root, raw, groups, problems)
    payloads = {m for g in groups.values() if g["role"] == "payload" for m in g["members"]}
    cases = rules.cases(raw, data, roster, payloads, problems)
    physical(design, groups, cases, problems)
    accepted = premises.read_all(root, raw, groups, problems)
    inputs = Inputs(root=root, file=Path(file), judgement=raw, design=design, records=folder, requirements=requirements, premises=accepted, narrative=narrative,
                    cases=cases, groups=groups, fixtures=fixtures, roster=roster,
                    mounts=[dict(group=m["group"], on=m["on"], pointMm=m["atMm"], basis=m.get("note"), **({"member": m["member"]} if "member" in m else {}))
                            for m in data["mounts"]])
    stages.moving(inputs)
    stages.checked(inputs, problems)
    missions.checked(inputs, problems)
    if problems:
        raise refused(problems)
    return inputs
