"""What the judgement says the design must accomplish and what is still at risk, checked before anything is measured.

    "interactions": {"<declared interaction>": {"decides": "...", "trial": "<trial>" | "noTrial": "why", "override": {"verdict", "reason"}}}
    "missionCases": [{"name", "trial", "accomplishes", "objective"}]
    "risks":        [{"id", "risk", "closedBy": "a trial, interaction, adjustment, measured job, or a sentence"}
                     | {"id", "risk", "benchTest": {"measure", "pass", "fail", "unit"}}]

A mission case names a trial the design source defines; the readiness report reads its record. A risk is closed in
words or by naming something the records hold, never by a file.
"""
from . import attachment, scope
from .files import named

VERDICTS = ("planar is enough", "needs 3D", "configurable")


def interactions(inputs, problems):
    declared = inputs.data.get("interactions") or {}
    judged = inputs.judgement.get("interactions", {})
    if not isinstance(judged, dict):
        problems.append("Give interactions as {interaction: {decides, trial or noTrial}}")
        return
    for name in sorted(set(judged) - set(declared)):
        problems.append("Each interaction of the judgement file is declared under interactions in the design source: " + name)
    for name, entry in judged.items():
        if not (isinstance(entry, dict) and named(entry.get("decides")) and named(entry.get("trial")) != named(entry.get("noTrial"))
                and set(entry) <= {"decides", "trial", "noTrial", "override"}):
            problems.append("Interaction " + name + " says what it decides and names one trial or the reason it needs none")
            continue
        if named(entry.get("trial")) and entry["trial"] not in inputs.data.get("trials", {}):
            problems.append("Interaction " + name + " names trial " + entry["trial"] + ", which the design source does not define")
        over = entry.get("override")
        if over is not None and not (isinstance(over, dict) and over.get("verdict") in VERDICTS and named(over.get("reason"))):
            problems.append("An override of interaction " + name + " gives a verdict (" + ", ".join(VERDICTS) + ") and the reason")


def mission_cases(inputs, problems):
    rows = inputs.judgement.get("missionCases", [])
    if not isinstance(rows, list):
        problems.append("List the mission cases as missionCases: [{name, trial, accomplishes, objective}]")
        return
    names = set()
    for row in rows:
        if not (isinstance(row, dict) and set(row) == {"name", "trial", "accomplishes", "objective"} and all(named(row[k]) for k in row)):
            problems.append("A mission case is {name, trial, accomplishes, objective}")
            continue
        if row["name"] in names:
            problems.append("Mission case " + row["name"] + " is listed twice")
        names.add(row["name"])
        if row["trial"] not in inputs.data.get("trials", {}):
            problems.append("Mission case " + row["name"] + " names trial " + row["trial"] + ", which the design source does not define")


def risks(inputs, problems):
    rows = inputs.judgement.get("risks", [])
    if not isinstance(rows, list):
        problems.append("List the open risks as risks: [{id, risk, closedBy}], or an empty list when none remains")
        return
    for row in rows:
        if not (isinstance(row, dict) and named(row.get("id")) and named(row.get("risk")) and set(row) <= {"id", "risk", "closedBy", "benchTest"}):
            problems.append("A risk is {id, risk, closedBy} or {id, risk, benchTest}")
            continue
        if "closedBy" in row and not named(row["closedBy"]):
            problems.append("Risk " + row["id"] + ": closedBy names a trial, interaction, adjustment or measured job, or is a sentence; a file is not allowed")


def checked(inputs, problems):
    """Every check of the judgement's own statements that needs no measuring."""
    interactions(inputs, problems)
    mission_cases(inputs, problems)
    risks(inputs, problems)
    attachment.start_checked(inputs, problems)
    for check in (lambda: attachment.settings(inputs.judgement, inputs.roster), lambda: scope.report(inputs, 0, 0)):
        try:
            check()
        except ValueError as problem:
            problems.append(str(problem))
