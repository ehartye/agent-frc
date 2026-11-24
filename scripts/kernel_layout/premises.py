"""Judge what the layout was asked to answer: the narrative objectives and the premises it holds from upstream.

An accepted premise is a file, as conceptual design writes it (DIR/premises/<id>.json):

    {"id", "phase": "conceptual-design", "scenario", "basis", "unit", "interfaces": [groups or "robot"],
     "criterion": {"range": [low, high]} | {"equals": value}, "observes": "mass.rangeKg"}

observes names a fact the library states, so the current value is worked out, never typed:

    mass.rangeKg, mass.totalKg   the robot's weight, from the mass record (in kg, or converted to a premise in lb)
    trials.<trial>.<path>        a field of a trial's record in trials.json

A premise without observes is not observed: it stays unmet until a record states it.
"""
from .files import named, number, read, reference

KEYS = {"id", "scenario", "scenarioId", "phase", "basis", "unit", "interfaces", "criterion", "observes", "pointer", "betterDirection", "base", "source"}
PHASES = ("conceptual-design", "preliminary-design")
MASS = ("mass.rangeKg", "mass.totalKg")
UNITS = {"kg": 1.0, "lb": 1 / 0.45359237}
DISPOSITIONS = ("represented", "open", "out-of-scope")


def narrative(root, judgement, problems):
    """The narrative's file, which must resolve, and the objectives the layout was reviewed for."""
    own = judgement.get("narrative")
    if not isinstance(own, dict) or set(own) - {"file", "objectives"}:
        problems.append("Give narrative as {file, objectives}: the project's narrative and each objective's disposition and basis")
        return {"file": None, "objectives": []}
    reference(root, {"file": own.get("file")}, "narrative.file", problems)
    objectives = own.get("objectives", [])
    if not isinstance(objectives, list) or not all(isinstance(row, dict) and named(row.get("objective")) and named(row.get("basis"))
                                                   and row.get("disposition") in DISPOSITIONS for row in objectives):
        problems.append("Record each narrative objective, its disposition (" + ", ".join(DISPOSITIONS) + ") and basis")
        objectives = []
    return {"file": own.get("file"), "objectives": objectives}


def criterion_ok(criterion):
    if not isinstance(criterion, dict):
        return False
    if set(criterion) == {"range"}:
        found = criterion["range"]
        return isinstance(found, list) and len(found) == 2 and all(number(v) for v in found) and found[0] <= found[1]
    return set(criterion) == {"equals"} and (named(criterion["equals"]) or number(criterion["equals"]))


def observes_ok(premise):
    fact = premise.get("observes")
    if fact is None:
        return True
    if fact in MASS:
        return premise.get("unit") in UNITS
    return isinstance(fact, str) and fact.startswith("trials.") and len(fact.split(".")) >= 3


def accepted(root, ref, groups, seen, problems):
    """One accepted premise file, read and checked, or None with its problems appended. groups None skips the interface check."""
    path = reference(root, ref, "a premise", problems)
    if path is None:
        return None
    found = read(path)
    where = "Premise " + str(found.get("id") if isinstance(found, dict) else path.name)
    if not isinstance(found, dict) or set(found) - KEYS:
        problems.append(where + " holds " + ", ".join(sorted(KEYS)) + (": not " + ", ".join(sorted(set(found) - KEYS)) if isinstance(found, dict) else ""))
        return None
    for key in ("id", "scenario", "basis", "unit"):
        if not named(found.get(key)):
            problems.append(where + ": give its " + key)
    if found.get("id") in seen:
        problems.append(where + " is accepted twice")
    seen.add(found.get("id"))
    if found.get("phase") not in PHASES:
        problems.append(where + ": its phase is " + " or ".join(PHASES))
    interfaces = found.get("interfaces")
    if not (isinstance(interfaces, list) and interfaces):
        problems.append(where + ": list the groups it bounds under interfaces")
    elif groups is not None and set(interfaces) - set(groups) - {"robot"}:
        problems.append("Unknown group in the interfaces of premise " + str(found.get("id")) + ": " + ", ".join(sorted(set(interfaces) - set(groups) - {"robot"})))
    if not criterion_ok(found.get("criterion")):
        problems.append(where + ": supply one criterion, an ordered finite range or a value it equals")
    if not observes_ok(found):
        problems.append(where + " observes " + str(found.get("observes")) + ". It names " + ", ".join(MASS) + " (in kg or lb) or trials.<trial>.<field>")
    return found


def read_all(root, judgement, groups, problems):
    """Every accepted premise the judgement points to."""
    rows = judgement.get("premises", [])
    if not isinstance(rows, list):
        problems.append("List the accepted premises as premises: [{file}]")
        return []
    seen, found = set(), []
    for ref in rows:
        premise = accepted(root, ref, groups, seen, problems)
        if premise is not None:
            found.append(premise)
    return found


def within(criterion, value):
    """Whether an observed value, or the whole of an observed range, meets the criterion."""
    if "range" in criterion:
        low, high = criterion["range"]
        ends = value if isinstance(value, list) else [value]
        return all(number(v) and low <= v <= high for v in ends)
    return value == criterion["equals"]


def observed(premise, mass, trials):
    """The value of the fact a premise observes, in its unit; None when the record does not state it."""
    fact = premise["observes"]
    if fact in MASS:
        value = (mass or {}).get(fact.split(".")[1])
        scale = UNITS[premise["unit"]]
        return [v * scale for v in value] if isinstance(value, list) else value * scale if number(value) else None
    _, name, *path = fact.split(".")
    value = ((trials or {}).get("trials") or {}).get(name)
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def judged(premise, mass, trials=None):
    """One premise against what the records state now: within, reopen, or not observed."""
    row = {key: premise.get(key) for key in ("id", "phase", "scenario", "unit", "criterion", "observes")}
    row["interfaces"] = sorted(premise["interfaces"])
    if premise.get("observes") is None:
        return dict(row, status="not observed", value=None)
    value = observed(premise, mass, trials)
    if value is None:
        return dict(row, status="not observed", value=None)
    return dict(row, status="within" if within(premise["criterion"], value) else "reopen", value=value)
