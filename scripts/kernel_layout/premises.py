"""Judge what the layout was asked to answer: the narrative objectives and the premises it holds from upstream."""
from mechanical_readiness import named, number, pinned, read, require, resolve_references


def narrative(root, plan, missing):
    """The narrative review as the receipt records it. Each open objective is a missing input."""
    review = plan.get("narrativeReview") or {}
    require(isinstance(review, dict), "Supply a narrative review record")
    if review.get("source"):
        pinned(root, review["source"])
    else:
        missing.append("Read and identify the current strategic narrative")
    objectives = review.get("objectives", [])
    require(isinstance(objectives, list), "List the reviewed narrative objectives")
    if not objectives:
        missing.append("Account for the narrative objectives and fallbacks")
    for row in objectives:
        require(isinstance(row, dict) and named(row.get("objective")) and named(row.get("basis"))
                and row.get("disposition") in ("represented", "open", "out-of-scope"),
                "Record each narrative objective, its disposition and basis")
        if row["disposition"] == "open":
            missing.append("Open narrative objective: " + row["objective"])
    return review


def record(root, ref):
    return resolve_references(root, read(pinned(root, ref)))


def given(source, key, expected):
    """Whether an optional digest a record repeats is absent or equals the checked one."""
    return not isinstance(source, dict) or source.get(key) is None or source[key] == expected


def within(criterion, value):
    if "range" in criterion:
        require(number(value), "Expected an observed finite number")
        return criterion["range"][0] <= value <= criterion["range"][1]
    require(named(value), "Expected a current categorical observation")
    return value == criterion["equals"]


def accepted_premise(root, links, groups, seen):
    accepted = record(root, links["accepted"])
    key = accepted["id"]
    require(named(key) and key not in seen and named(accepted["scenario"]) and named(accepted["basis"])
            and accepted["phase"] in ("conceptual-design", "preliminary-design") and named(accepted["unit"]),
            "Bind each premise to a unique ID, scenario, unit, upstream phase and evidence")
    seen.add(key)
    interfaces = accepted["interfaces"]
    require(isinstance(interfaces, list) and interfaces and set(interfaces) <= set(groups), "Unknown group in the interfaces of premise " + key)
    pinned(root, accepted["source"])
    criterion = accepted["criterion"]
    if set(criterion) == {"range"}:
        lo, hi = criterion["range"]
        require(number(lo) and number(hi) and lo <= hi, "Supply an ordered finite acceptance interval")
    else:
        require(set(criterion) == {"equals"} and named(criterion["equals"]), "Supply one categorical or numeric criterion")
    return accepted, dict(id=key, phase=accepted["phase"], scenario=accepted["scenario"], interfaces=sorted(interfaces),
                          unit=accepted["unit"], criterion=criterion, accepted=links["accepted"], status="unknown")


def compare(root, plan, missing):
    """One decision per accepted premise: within its criterion, reopened, or unknown for want of a current observation."""
    rows = plan.get("premises", [])
    require(isinstance(rows, list), "List the accepted upstream premises")
    if not rows:
        missing.append("No upstream premise commissioned")
    decisions, seen = [], set()
    for links in rows:
        accepted, decision = accepted_premise(root, links, plan["groups"], seen)
        decisions.append(decision)
        if not links.get("current"):
            missing.append("Missing current observation for " + decision["id"])
            continue
        current = record(root, links["current"])
        # A stable scenarioId on both records lets the observer word the scenario differently.
        ids = (current.get("scenarioId"), accepted.get("scenarioId"))
        same = ids[0] == ids[1] if None not in ids else current.get("scenario") == accepted["scenario"]
        require(same and all(current.get(k) == accepted[k] for k in ("id", "unit")), "Premise observation differs in scope: " + decision["id"])
        source = read(pinned(root, current["source"]))
        require(named(current["valueField"]) and isinstance(source, dict) and current["valueField"] in source,
                "Locate the observed value in its project measurement: " + decision["id"])
        value = source[current["valueField"]]
        require(value == current["value"] and type(value) == type(current["value"]), "Reported value differs from its source: " + decision["id"])
        decision.update(current=links["current"], value=value)
        # The issue name binds an observation to this design. A digest the observation repeats is still compared.
        if current.get("issue") != plan["issue"] or not given(current, "designSha256", plan["design"]["sha256"]):
            missing.append("Earlier revision cannot resume " + decision["id"])
            continue
        decision["status"] = "within" if within(decision["criterion"], value) else "reopen"
    return decisions
