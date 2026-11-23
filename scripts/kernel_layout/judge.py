"""Decide what the library's measurements mean: each pair, each case and the displaced control."""
from package_view import CONTROL_ID


def pair_row(row):
    """One measured pair as the receipt records it: pass, fail or open, with the witness or the proven bound."""
    pair = row["pair"]
    if not row["proven"]:
        # The search reached its depth limit: the pair is never passed off as clear.
        return dict(pair=pair, status="open", witness=list(row.get("unresolved") or [0, 1]))
    if row["closerThanMinGap"]:
        return dict(pair=pair, status="fail", witness=dict(t=row["t"], gapMm=row["gapMm"], volumeMm3=row["overlapMm3"]))
    if row["method"] == "enclosed straight stroke":
        return dict(pair=pair, status="pass", method="Enclosed straight stroke: the swept solid stays beyond the allowance")
    if row["method"] == "fixed relative pose":
        return dict(pair=pair, status="pass", witness=dict(t=0, gapMm=row["gapMm"], volumeMm3=0))
    return dict(pair=pair, status="pass", lowerBoundMm=row["lowerBoundMm"], samples=row["samples"])


def contact_row(rule, found):
    """A required contact: reached, proven never reached, or left open by the depth limit."""
    status = "pass" if found["reached"] else "fail" if found["proven"] else "open"
    return dict(id=rule["id"], pair=rule["pair"], criterion=rule.get("criterion"), maxGapMm=rule["maxGapMm"], window=found["window"],
                status=status, gapMm=found["gapMm"], t=found["t"])


def case_row(case, found, contacts, withdrawal):
    """One checked case. It passes when no pair is closer than the allowance, every required contact is reached and,
    for a service withdrawal, the moved solids end beyond the allowance of everything that stayed."""
    pairs = [pair_row(row) for row in found["pairs"]]
    status = "fail" if any(r["status"] == "fail" for r in pairs) else "open" if any(r["status"] == "open" for r in pairs) else "pass"
    if status == "pass" and contacts:
        status = "fail" if any(r["status"] == "fail" for r in contacts) else "open" if any(r["status"] == "open" for r in contacts) else "pass"
    extracted = []
    if withdrawal is not None:
        if withdrawal["smallestBoxGapMm"] > case["minGapMm"]:
            extracted = list(case["extract"])
        elif status == "pass":
            status = "open"
    return dict(case=case["id"], status=status, allowanceMm=case["minGapMm"], moving=sorted(case["moves"]), removed=dict(case["removed"]),
                extracted=extracted, installedCount=case["present"],
                pairs=pairs, requiredContacts=contacts, counts=found["counts"],
                **({"withdrawnBoxGapMm": withdrawal["smallestBoxGapMm"]} if withdrawal is not None else {}))


def control_row(spec, found):
    """The control's receipt field and its case row. The check can fail only if the shifted pair is rejected."""
    rows = [pair_row(row) for row in found["pairs"]]
    hit = next((r for r in rows if set(r["pair"]) == {spec["moving"], spec["displaced"]} and r["status"] == "fail"), None)
    return (dict(case=spec["case"], displaced=spec["displaced"], offsetMm=spec["offsetMm"], witness=hit),
            dict(case=CONTROL_ID, status="fail" if hit else "pass", pairs=rows))


def decide(result, missing):
    """The receipt's status and what reopens: blocked on a failing case or budget, layout-checked when nothing is unmet."""
    cases, stages, groups, reopen = result["cases"], result["stages"], result["groups"], result["reopen"]
    failing = [c for c in cases if c["status"] == "fail"]
    for case in failing:
        hits = {name for row in case["pairs"] if row["status"] == "fail" for name in row["pair"]}
        affected = set(stages[case["case"]]["movingGroups"]) | {k for k, g in groups.items() if hits.intersection(g["members"])}
        reopen.append(dict(phase="preliminary-design", reason=case["case"], affected=sorted(affected)))
    budgets = result.get("budgets")
    over = []
    if budgets:
        over = (["inspection-weight"] if budgets["massStatus"] == "fail" else []) + [
            "voltage/" + row["case"] for row in budgets["electricalCases"] if row["status"] == "fail"]
        reopen.extend(dict(phase="preliminary-design", reason=key, affected=sorted(groups)) for key in over)
    if failing or over:
        return "blocked"
    if reopen:
        return "reopen"
    if cases and not missing and all(c["status"] == "pass" for c in cases):
        return "layout-checked"
    return "provisional"
