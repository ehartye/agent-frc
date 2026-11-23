"""Judge the stages: what moved each game piece and on what evidence, and whether the cycle is whole.

A payload that moves in a stage is carried with a mechanism, transported by contact, on a free path or supported
by a field fixture. The last three name a trial record, which must record this stage, this payload and the exact
start and travel the design source gives it, so a path is never an arbitrary animation.
"""
from mechanical_readiness import named, pinned, read, require
from .inputs import carried_chain, own_motion

# How a stage says a payload moved, the field of the trial record that must repeat the path, and whether the
# stage counts as a loaded operating case.
PATHS = (("transportedBy", "transport", "contact-transport", True), ("freePath", "freePath", "free-path", False),
         ("supportedBy", "support", "fixture-support", False))


def expected_path(case, payload, members, extra):
    return dict(case=case["id"], payload=payload, **extra, moves={m: case["moves"][m] for m in members},
                initialPose={m: case["initialPose"].get(m, []) for m in members})


def bound_paths(inputs, case, stage, missing):
    """{field: {payload: bound}} for each payload this stage moves on trial evidence. Unbound ones are named as missing."""
    groups, moving, key = inputs.plan["groups"], set(case["movingGroups"]), case["id"]
    declared = [payload for field, *_ in PATHS for payload in stage.get(field, {})] + list(stage.get("carriedWith", {}))
    require(len(declared) == len(set(declared)), "Declare each payload of " + key + " once: carried, transported, on a free path or supported")
    found = {}
    for field, record_field, label, _ in PATHS:
        entries = stage.get(field, {})
        require(isinstance(entries, dict), "List " + field + " of " + key + " by payload group")
        for payload, spec in entries.items():
            require(payload in moving and groups.get(payload, {}).get("role") == "payload" and isinstance(spec, dict) and named(spec.get("basis")),
                    "Under " + field + " of " + key + ", name a moving payload group and the basis of its path: " + payload)
            extra = {}
            if field == "transportedBy":
                mechanisms = spec.get("mechanisms") or []
                drive = spec.get("drive", {})
                require(mechanisms and all(groups.get(m, {}).get("role") == "mechanism" for m in mechanisms) and isinstance(drive, dict)
                        and set(drive) <= set(mechanisms), "Only mechanism groups transport a payload, each with a declared drive: " + payload + " in " + key)
                for still in sorted(set(mechanisms) - moving - set(drive)):
                    missing.append("Declare the drive of stationary transporter " + still + " in " + key)
                extra = dict(mechanisms=sorted(mechanisms))
            if field == "supportedBy":
                fixtures = spec.get("fixtures") or []
                require(fixtures and set(fixtures) <= inputs.fixtures - set(case["removed"]),
                        "Only a field fixture present in " + key + " can support a payload: " + payload)
                extra = dict(fixtures=sorted(fixtures))
            bound = False
            evidence = spec.get("evidence")
            if named(spec.get("trial")):
                require(evidence is None, "Bind " + payload + " in " + key + " to one trial: a library trial or an evidence file")
                bound = fitted(inputs, case, payload, groups[payload]["members"], spec["trial"], missing)
            elif not (isinstance(evidence, dict) and named(evidence.get("file"))):
                missing.append("Name the " + label + " evidence file for " + payload + " in " + key)
            elif (read(pinned(inputs.root, evidence)) or {}).get(record_field) != expected_path(case, payload, groups[payload]["members"], extra):
                missing.append(label.capitalize() + " evidence for " + payload + " in " + key + " does not record this payload path")
            else:
                bound = True
            found.setdefault(field, {})[payload] = bound
    return found


def fitted(inputs, case, payload, members, trial, missing):
    """Whether the payload's move in this case is the path the library's trial fitted, so the animation is the trial."""
    record = (inputs.records.get("trials") or (None,))[0]
    found = (record or {}).get("trials", {}).get(trial)
    if found is None:
        missing.append("Run trial " + trial + " with the design library and name its record in the judgement file as trials: {file}")
        return False
    path = [found["fit"]["operation"]]
    if any(case["moves"].get(m) != path for m in members):
        missing.append("The move of " + payload + " in " + case["id"] + " is not the path trial " + trial + " fitted. Write its fit operation as the move in the design source")
        return False
    return True


def carried(inputs, case, stage):
    """Whether this stage carries a payload with a mechanism. The source must move the two together."""
    data, groups, moving = inputs.data, inputs.plan["groups"], set(case["movingGroups"])
    start, moves = own_motion(data, case["id"])
    for payload, carrier in stage.get("carriedWith", {}).items():
        require(payload in moving and carrier in moving and groups[payload]["role"] == "payload" and groups[carrier]["role"] == "mechanism",
                "Identify the moving payload and its carrier in " + case["id"])
        rides = carrier in carried_chain(data, payload) and payload not in moves and payload not in start
        same = moves.get(payload) == moves.get(carrier) and start.get(payload, []) == start.get(carrier, [])
        require(rides or same, "The attached payload diverges from its carrier in " + case["id"] + ": give " + payload
                + " the same operations as " + carrier + ", or set carriedBy on its group in the design source")
    return bool(stage.get("carriedWith"))


def squeezes(inputs, case, stage, missing):
    """Judge the compression rules of a stage: each squeezed pair is a declared contact, and a named trial repeats the depth."""
    declared = {frozenset(row["pair"]) for row in inputs.data.get("contacts", []) if "during" not in row or case["id"] in row["during"]}
    payloads = {m for g in inputs.plan["groups"].values() if g["role"] == "payload" for m in g["members"]}
    for rule in stage.get("payloadCompression", []):
        pair = frozenset((rule["payload"], rule["contact"]))
        require(rule["payload"] in payloads and rule["contact"] not in payloads, "A compression rule of " + case["id"]
                + " names a solid of a payload group and the solid that presses into it")
        require(pair in declared, "Declare " + rule["payload"] + " and " + rule["contact"] + " as a contact during " + case["id"]
                + " in the design source: a squeezed pair shares volume, so it is judged by its depth and left out of the clearance test")
        evidence = rule.get("evidence")
        if evidence is None:
            continue
        require(isinstance(evidence, dict) and named(evidence.get("file")) and named(evidence.get("field")),
                "Name the trial behind a compression depth as evidence: {file, field}")
        measured = read(pinned(inputs.root, {k: v for k, v in evidence.items() if k != "field"})).get(evidence["field"])
        if measured != rule["maxDepthMm"]:
            missing.append("The compression depth of " + rule["payload"] + " in " + case["id"] + " is not the figure its trial records under " + evidence["field"])


def coverage(inputs, missing):
    """Judge every stage. Returns (free paths, supports) by case, for the review's check list."""
    stages, covered, loaded = inputs.plan["stages"], set(), False
    free, supports = {}, {}
    for case in inputs.cases:
        stage = stages[case["id"]]
        operating = stage["purpose"] == "operating"
        loaded |= carried(inputs, case, stage) and operating
        squeezes(inputs, case, stage, missing)
        found = bound_paths(inputs, case, stage, missing)
        loaded |= operating and any(found.get("transportedBy", {}).values())
        if found.get("freePath"):
            free[case["id"]] = found["freePath"]
        if found.get("supportedBy"):
            supports[case["id"]] = found["supportedBy"]
        covered.add(stage["purpose"])
    for purpose in sorted({"operating", "park", "service"} - covered):
        missing.append("Unexamined stage: " + purpose)
    if not loaded:
        missing.append("No operating path includes the moving mechanism and finite payload")
    if not any(case["extract"] for case in inputs.cases if case["stage"] == "service"):
        missing.append("No full service withdrawal commissioned")
    return free, supports


def cycle(inputs, placements, missing):
    """The ordered cycle. Each stage must start where the one before it ended; placements gives where every group is."""
    listed = inputs.plan.get("cycle") or []
    if not listed or set(listed) != {c["id"] for c in inputs.cases if c["stage"] != "service"}:
        missing.append("Select the complete ordered operating and park cycle")
        return listed
    for left, right in zip(listed, listed[1:]):
        for group in placements.apart(left, right):
            missing.append("Discontinuous cycle: " + group + " between " + left + " and " + right)
    return listed


def control(inputs, missing):
    """The displaced control, checked: one solid that stays still in its case, shifted against one that moves there."""
    spec = inputs.plan.get("control")
    if not spec:
        missing.append("Missing matched displaced control")
        return None
    by_id = {c["id"]: c for c in inputs.cases}
    require(isinstance(spec, dict) and spec.get("case") in by_id, "The displaced control names a stage of this design")
    case, shift = by_id[spec["case"]], spec.get("offsetMm")
    require(spec.get("displaced") in inputs.roster and spec["displaced"] not in case["moves"] and spec.get("moving") in case["moves"]
            and spec["displaced"] not in case["removed"] and isinstance(shift, list) and len(shift) == 3 and any(shift) and named(spec.get("basis")),
            "Shift one retained stationary solid against a solid that moves in the control's stage, and give the basis")
    return spec
