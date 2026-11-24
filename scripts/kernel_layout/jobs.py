"""The library jobs a judgement asks for: every measurement the plugin needs, as a question with the judgement's numbers.

    clearance along each motion       its allowance and search depth, every still pair included, its absent solids
    reach for each required contact   the pair, the touching gap and the window
    indentation for each squeeze      the payload, the contact and the allowed depth
    withdrawal for a service motion   that withdraws its moved solids
    electrical for each powered motion
    the displaced control             one clearance along its motion with one solid shifted and every other left out
    attachment at the start of the cycle, and the robot's mass as drawn

Each job is tagged with what it answers, so a record is read back for the motion and the rule that asked for it. The
library names each record from its question; the plugin never writes a measured number.
"""
from . import attachment


def for_case(case):
    """The jobs of one motion, each with its tag."""
    m = case["id"]
    found = [((dict(kind="clearance", motion=m, minGapMm=case["minGapMm"], depth=case["depth"], includeStill=True, absent=case["absent"])), ("clearance", m))]
    for rule in case["requiredContacts"]:
        found.append((dict(kind="reach", motion=m, pair=rule["pair"], withinMm=rule["maxGapMm"], window=rule.get("window", [0, 1]), absent=case["absent"],
                           depth=case["depth"]), ("reach", m, rule["id"])))
    for rule in case["compression"]:
        found.append((dict(kind="indentation", motion=m, piece=rule["payload"], contact=rule["contact"], maxDepthMm=rule["maxDepthMm"], absent=case["absent"],
                           depth=case["depth"]), ("indentation", m, rule["payload"], rule["contact"])))
    if case["purpose"] == "service" and case["extract"]:
        found.append((dict(kind="withdrawal", motion=m, absent=case["absent"]), ("withdrawal", m)))
    if case["powered"]:
        found.append((dict(kind="electrical", motion=m), ("electrical", m)))
    return found


def control(inputs, spec):
    """The displaced control: the clearance of the one commissioned pair with the named solid shifted by the offset."""
    case = next(c for c in inputs.cases if c["id"] == spec["motion"])
    others = sorted(inputs.roster - {spec["displaced"], spec["moving"]})
    return dict(kind="clearance", motion=case["id"], minGapMm=case["minGapMm"], depth=case["depth"], includeStill=True, absent=others,
                contacts=[], displace={spec["displaced"]: spec["offsetMm"]})


def asked(inputs, spec):
    """[(job, tag)] for the whole judgement, in a fixed order."""
    found = [pair for case in inputs.cases for pair in for_case(case)]
    if spec:
        found.append((control(inputs, spec), ("control",)))
    found.append((attachment.job(inputs), ("attachment",)))
    found.append((dict(kind="mass", pose=None), ("mass",)))
    return found
