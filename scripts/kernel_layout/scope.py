"""Scope and time, said aloud. Both are guidelines: neither changes a status or an exit code."""
from .files import named, number, require

SCOPE_SOLIDS = 80
SCOPE_TOLERANCE_MM = 10
BUDGET_FIELDS = ("detail", "question", "allowance", "stopsWhen")
# The time guidelines of docs/testing-methodology.md, in seconds.
EDIT_SECONDS = 60
MERGE_SECONDS = 5 * 60
GATE_SECONDS = 15 * 60


def took(seconds):
    return f"{seconds:.0f} s" if seconds < 120 else f"{seconds / 60:.1f} min"


def time_lines(seconds, ran, skipped):
    """What the run cost against the time guidelines, and what it ran and did not run."""
    lines = [f"[time] {ran} in {took(seconds)}. Guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate."]
    if skipped:
        lines.append("[time] not run: " + skipped)
    if seconds > GATE_SECONDS:
        lines.append("[time] note: this run passed the guideline for a stage gate. Stop and tell the owner what is slow and why, and agree "
                     "a bounded budget before running it again. Do not repeat a run whose inputs have not changed.")
    elif seconds > EDIT_SECONDS:
        lines.append("[time] note: past the guideline for a check while editing. Check the stages you changed with --cases, use "
                     "--view-only after a change to names, titles or the page alone, and merge solids that move together.")
    return lines


def report(plan, solids, fixtures):
    """Count the solids and find the finest declared path tolerance, and name each guideline the layout has passed.

    Returns the informational receipt field and the stderr lines."""
    own = plan.get("scopeGuidelines", {})
    require(isinstance(own, dict), "Give scopeGuidelines as an object with solids, toleranceMm or extendedBudget")
    for key in ("solids", "toleranceMm"):
        require(key not in own or number(own[key]) and own[key] > 0, "Give scopeGuidelines." + key + " as a positive number")
    budget = own.get("extendedBudget")
    require(budget is None or isinstance(budget, dict) and all(named(budget.get(k)) for k in BUDGET_FIELDS),
            "An agreed extended budget names its " + ", ".join(BUDGET_FIELDS))
    guide = dict(solids=own.get("solids", SCOPE_SOLIDS), toleranceMm=own.get("toleranceMm", SCOPE_TOLERANCE_MM),
                 source="judgement file" if "solids" in own or "toleranceMm" in own else "plugin default")
    declared = []
    for key, stage in plan["stages"].items():
        if "pathToleranceMm" in stage:
            require(number(stage["pathToleranceMm"]) and stage["pathToleranceMm"] > 0,
                    "Give the path tolerance of " + key + " as a positive number of millimetres")
            declared.append((stage["pathToleranceMm"], key))
    finest = min(declared) if declared else None
    passed = (["solids"] if solids > guide["solids"] else []) + (["pathTolerance"] if finest and finest[0] < guide["toleranceMm"] else [])
    field = dict(informational=True, solids=solids, fieldFixtures=fixtures, guideline=guide,
                 finestPathToleranceMm=finest[0] if finest else None, finestPathToleranceCase=finest[1] if finest else None,
                 undeclaredPathTolerance=len(plan["stages"]) - len(declared), passed=passed)
    if budget:
        field["extendedBudget"] = {k: budget[k] for k in BUDGET_FIELDS}
    tolerance = f"{finest[0]:g} mm in {finest[1]}" if finest else "not declared"
    lines = [f"[scope] solids={solids} (guideline: up to about {guide['solids']:g} for a whole robot) "
             f"finest path tolerance={tolerance} (guideline: {guide['toleranceMm']:g} mm or coarser) figures={guide['source']}"]
    reasons = []
    if "solids" in passed:
        reasons.append(f"the layout has {solids} solids, past the guideline of about {guide['solids']:g}")
    if "pathTolerance" in passed:
        reasons.append(f"{finest[1]} is checked to a {finest[0]:g} mm path tolerance, finer than the guideline of {guide['toleranceMm']:g} mm")
    if reasons and budget:
        lines.append("[scope] note: " + " and ".join(reasons) + ". The judgement file records an agreed extended budget: " + budget["detail"]
                     + "; question: " + budget["question"] + "; allowance: " + budget["allowance"] + "; stops when: " + budget["stopsWhen"]
                     + ". Check in again before going past it.")
    elif reasons:
        lines.append("[scope] note: " + " and ".join(reasons) + ". This is information and does not change the result. Check in with "
                     "the user and agree a bounded extended budget (what detail, for which question, how much, and when it stops) "
                     "before going deeper, then record it under scopeGuidelines.extendedBudget in the judgement file.")
    return field, lines
