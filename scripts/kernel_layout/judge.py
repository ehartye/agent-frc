"""Decide what the library's records mean: each pair, each motion, the displaced control, and the verdict as a whole.

A motion passes when no pair comes closer than its allowance, every required contact is reached, no game piece is
squeezed past its allowed depth and, for a service withdrawal, the moved solids end beyond the allowance of
everything that stayed. A pair the search could not settle is open, never clear.

The verdict is blocked by a failing motion, a weight over a limit, a motion the bus cannot power or a solid that
floats; it reopens an upstream phase when a premise leaves its criterion; it is provisional while anything else is
unmet; otherwise it is layout-checked.
"""
from .attachment import floating

BLOCKING = ("clearance", "weight", "voltage", "floating")
# The order in which the first unmet requirement is named.
ORDER = ("clearance", "weight", "voltage", "floating", "control", "premise")


def gap_row(row):
    return dict(pair=row["pair"], gapMm=row["gapMm"], t=row["t"], overlapMm3=row["overlapMm3"])


def clearance(found):
    """(failing pairs, open pairs) of a clearance record: closer than the allowance, or not settled by the depth limit."""
    rows = found["pairs"]
    failing = [gap_row(r) for r in rows if r["proven"] and r["closerThanMinGap"]]
    unsettled = [dict(pair=r["pair"], interval=list(r.get("unresolved") or [0, 1])) for r in rows if not r["proven"]]
    return failing, unsettled


def contact_row(rule, found):
    """A required contact: reached, proven never reached, or left open by the depth limit."""
    status = "pass" if found["reached"] else "fail" if found["proven"] else "open"
    return dict(id=rule["id"], pair=rule["pair"], criterion=rule.get("criterion"), maxGapMm=rule["maxGapMm"], window=found["window"],
                status=status, gapMm=found["gapMm"], t=found["t"])


def compression_row(rule, found):
    """A squeezed game piece: within its allowed depth with a proven ceiling, past it, or left open by the depth limit."""
    status = "fail" if found["deeperThanLimit"] else "pass" if found["proven"] else "open"
    return dict(payload=rule["payload"], contact=rule["contact"], maxDepthMm=rule["maxDepthMm"], basis=rule["basis"], status=status,
                deepestMm=found["deepestMm"], t=found["t"], upperBoundMm=found["upperBoundMm"], sectionRadiusMm=found["sectionRadiusMm"])


def worst(statuses):
    statuses = list(statuses)
    return "fail" if "fail" in statuses else "open" if "open" in statuses else "pass"


def motion_row(case, results):
    """One judged motion from its records. results is {tag: result} for this motion's jobs."""
    m = case["id"]
    found = results[("clearance", m)]
    failing, unsettled = clearance(found)
    contacts = [contact_row(rule, results[("reach", m, rule["id"])]) for rule in case["requiredContacts"]]
    pressed = [compression_row(rule, results[("indentation", m, rule["payload"], rule["contact"])]) for rule in case["compression"]]
    status = "fail" if failing else "open" if unsettled else worst(r["status"] for r in [*contacts, *pressed])
    row = dict(purpose=case["purpose"], cause=case["cause"], status=status, allowanceMm=case["minGapMm"], allowanceBasis=case["allowanceBasis"],
               movingGroups=case["movingGroups"], absent=case["absent"], closest=found.get("closest"), failing=failing, open=unsettled,
               counts=found.get("counts"), requiredContacts=contacts, compression=pressed)
    if ("withdrawal", m) in results:
        gap = results[("withdrawal", m)]["smallestBoxGapMm"]
        row["withdrawal"] = dict(smallestBoxGapMm=gap, extracted=case["moved"] if gap > case["minGapMm"] else [])
        if gap <= case["minGapMm"] and row["status"] == "pass":
            row["status"] = "open"
    return row


def motion_unmet(name, row):
    if row["status"] == "pass":
        return None
    if row["failing"]:
        w = min(row["failing"], key=lambda r: (r["gapMm"], -r["overlapMm3"]))
        detail = "overlap %.1f mm3 at t %.3f" % (w["overlapMm3"], w["t"]) if w["overlapMm3"] > 0 else "gap %.3f mm at t %.3f" % (w["gapMm"], w["t"])
        text = name + ": " + " and ".join(w["pair"]) + " " + detail + ", inside the " + f"{row['allowanceMm']:g} mm allowance"
    elif row["open"]:
        text = name + ": " + " and ".join(row["open"][0]["pair"]) + " unresolved over t " + str(row["open"][0]["interval"])
    else:
        bad = next((r for r in [*row["requiredContacts"], *row["compression"]] if r["status"] != "pass"), None)
        text = name + ": " + (("required contact " + bad["id"] if "id" in bad else "squeeze of " + bad["payload"] + " by " + bad["contact"]) + " is " + bad["status"]
                              if bad else "the withdrawn solids end within the allowance of what stayed")
    return dict(kind="clearance", motion=name, status=row["status"], text=text)


def control_row(spec, found):
    """The control's verdict field. The check can fail only if the shifted pair is rejected."""
    failing, _ = clearance(found)
    hit = next((r for r in failing if set(r["pair"]) == {spec["moving"], spec["displaced"]}), None)
    return dict(motion=spec["motion"], displaced=spec["displaced"], moving=spec["moving"], offsetMm=spec["offsetMm"], basis=spec["basis"],
                rejected=hit is not None, witness=hit)


def decide(verdict, unmet):
    """The status and the first unmet requirement, blocking findings first; adds what reopens for a failing motion."""
    groups = verdict["groups"]
    for name, row in verdict["motions"].items():
        if row["status"] == "fail":
            hits = {n for r in row["failing"] for n in r["pair"]}
            affected = set(row["movingGroups"]) | {k for k, g in groups.items() if hits.intersection(g["members"])}
            verdict["reopen"].append(dict(phase="preliminary-design", reason=name, affected=sorted(affected)))
    loose = floating(verdict.get("attachment"))
    if loose:
        unmet.append(dict(kind="floating", text="Floating: " + ", ".join(loose) + ". Give each a support or mount that traces to the frame, rest each "
                          "fixture on the floor, or label it under attachment in the judgement file with the reason"))
    ranked = sorted(unmet, key=lambda r: ORDER.index(r["kind"]) if r["kind"] in ORDER else len(ORDER))
    blocking = [r for r in ranked if r["kind"] in BLOCKING and r.get("status", "fail") == "fail"]
    first = blocking[0] if blocking else ranked[0] if ranked else None
    reopen = any(r["phase"] != "preliminary-design" for r in verdict["reopen"])
    status = "blocked" if blocking else "reopen" if reopen else "provisional" if ranked else "layout-checked"
    return status, first, ranked
