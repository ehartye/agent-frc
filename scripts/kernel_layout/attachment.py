"""Nothing floats: judge the library's attachment record at the start of the cycle.

The library's attachment job says what touches what, which solids hang together and which fixtures do not reach the
floor. This module asks for that job, applies the labels the judgement file gives (an unmounted allowance, a
suspended fixture) and writes the report. A floating robot solid or a fixture off the floor that no label explains
fails the layout check: judge.decide reads them from the report with floating().
"""
from .files import named, number, require

GAP_MM = 3
FLOOR_Z_MM = 0
KEYS = ("gapMm", "floorZMm", "unmounted", "suspended")
# Group roles that are not physical robot parts: game pieces, and service gauges or clearance envelopes.
EXCLUDED_ROLES = ("payload", "service")


def floating(report):
    """The solids that float at the start of the opening case, sorted: robot solids no chain of contacts or mounts holds to the
    frame, and field fixtures that do not reach the floor, each without a label that explains it."""
    report = report or {}
    return sorted([row["solid"] for row in report.get("floating", [])] + [row["fixture"] for row in report.get("fixturesOffFloor", [])])


def settings(plan, roster):
    """The judgement's attachment settings, checked: the touching gap, the floor height and the labelled exceptions."""
    own = plan.get("attachment", {})
    require(isinstance(own, dict) and set(own) <= set(KEYS), "Give attachment as an object with " + ", ".join(KEYS))
    require("gapMm" not in own or number(own["gapMm"]) and own["gapMm"] >= 0, "Give attachment.gapMm as zero or a positive number of millimetres")
    require("floorZMm" not in own or number(own["floorZMm"]), "Give attachment.floorZMm as the floor height, in millimetres")
    for key, what in (("unmounted", "an unmounted allowance"), ("suspended", "a suspended field fixture")):
        labelled = own.get(key, {})
        require(isinstance(labelled, dict) and set(labelled) <= set(roster) and all(named(reason) for reason in labelled.values()),
                "attachment." + key + " maps a solid to the reason it is " + what)
    return dict(gapMm=own.get("gapMm", GAP_MM), floorZMm=own.get("floorZMm", FLOOR_Z_MM),
                unmounted=dict(own.get("unmounted", {})), suspended=dict(own.get("suspended", {})))


def left_out(inputs):
    """(payloads, service solids): the solids that are not physical robot or field parts."""
    return inputs.members(("payload",)), inputs.members(("service",))


def frame_of(found, structure):
    """The connected set that is the frame: the one with the most structure solids, then the largest."""
    sets = found["connectedSets"]
    return max(sets, key=lambda members: (len(structure.intersection(members)), len(members))) if sets else []


def opening(inputs):
    """The motion whose start the attachment is judged at, and that start as a pose name (None as drawn)."""
    from .stages import cycle_entries
    listed = [m for entry in cycle_entries(inputs, []) if entry.get("phase") != "service" for m in entry.get("motions", [])]
    first = (listed or [c["id"] for c in inputs.cases])[0]
    start = inputs.data["motions"][first].get("from")
    if "through" in inputs.data["motions"][first]:
        start = inputs.data["motions"][first]["through"][0]
    return first, start


def start_checked(inputs, problems):
    """The cycle's first motion must start at a named pose or as drawn: the attachment is judged there."""
    first, start = opening(inputs)
    if isinstance(start, dict):
        problems.append("The first motion of the cycle, " + first + ", starts after " + str(start.get("after")) + ": start it at a named pose or as "
                        "drawn, so attachment is judged there")


def job(inputs):
    """The library's attachment job at the start of the cycle, with the judgement's touching gap, floor and the parts it leaves out."""
    own = settings(inputs.judgement, inputs.roster)
    first, start = opening(inputs)
    case = next(c for c in inputs.cases if c["id"] == first)
    payloads, gauges = left_out(inputs)
    return dict(kind="attachment", pose=start, touchGapMm=own["gapMm"], floorZMm=own["floorZMm"], ignore=sorted((payloads | gauges) - set(case["absent"])),
                absent=case["absent"])


def report(inputs, found):
    """The attachment report from the library's attachment record: the verdict field and the stderr lines."""
    own = settings(inputs.judgement, inputs.roster)
    first, _ = opening(inputs)
    case = next(c for c in inputs.cases if c["id"] == first)
    groups = inputs.groups
    group_of = {m: key for key, g in groups.items() for m in g["members"]}
    structure = inputs.members(("structure",))
    payloads, gauges = left_out(inputs)
    frame = frame_of(found, structure)
    present = set(inputs.roster) - set(case["absent"])
    result = dict(motion=first, pose="start of the motion", gapMm=own["gapMm"], floorZMm=own["floorZMm"], robotSolids=found["robotSolids"],
                  excluded=dict(fieldFixtures=len(present & inputs.fixtures), payloads=len(present & payloads - inputs.fixtures),
                                serviceAndGauges=len(present & gauges - inputs.fixtures)))
    floating, allowances, on_allowance = [], [], []
    if structure.intersection(frame):
        loose = {row["solid"]: row for row in found["notConnectedToBase"]}
        for name, reason in sorted(own["unmounted"].items()):
            if any(name in members for members in found["connectedSets"]):
                allowances.append(dict(solid=name, group=group_of[name], reason=reason, reachesFrame=name in frame))
        for members in found["connectedSets"]:
            if members == frame:
                continue
            labelled = set(members) & set(own["unmounted"])
            if labelled:
                on_allowance.extend(n for n in members if n not in labelled)
                continue
            for n in members:
                near = loose.get(n, {})
                floating.append(dict(solid=n, group=group_of[n], nearest=near.get("nearest"),
                                     gapMm=None if near.get("gapMm") is None else round(near["gapMm"], 3)))
        result.update(frameSolids=len(frame), floating=sorted(floating, key=lambda r: r["solid"]), heldByMountOnly=found["heldByMountOnly"] or [],
                      unmountedAllowances=allowances, onUnmountedAllowance=sorted(on_allowance))
    else:
        result.update(skipped="No structure group is placed at the start of " + first + ", so no frame is identified")
    hanging = {row["fixture"]: round(row["lowestAboveFloorMm"], 3) for row in found["fixturesOffFloor"]}
    off_floor = [dict(fixture=n, lowestAboveFloorMm=z) for n, z in sorted(hanging.items()) if n not in own["suspended"]]
    suspended = [dict(fixture=n, reason=reason, **({"lowestAboveFloorMm": hanging[n]} if n in hanging else {"reachesFloor": True}))
                 for n, reason in sorted(own["suspended"].items()) if n in present]
    result.update(fixturesOffFloor=off_floor, suspendedFixtures=suspended,
                  mountsOffHost=[dict(group=m["group"], member=m["member"], on=m["on"], pointToOnMm=round(m["pointToOnMm"], 3))
                                 for m in found.get("mounts", []) if m.get("pointToOnMm") is not None and m["pointToOnMm"] > own["gapMm"]])
    return result, lines(result, first)


def lines(result, motion):
    plural = lambda n, one: f"{n} {one if n == 1 else one + 's'}"
    floating, mount_only = result.get("floating", []), result.get("heldByMountOnly", [])
    allowances, off_floor = result.get("unmountedAllowances", []), result["fixturesOffFloor"]
    out = [f"[attachment] {motion} start, touching within {result['gapMm']:g} mm: {plural(result['robotSolids'], 'robot solid')} checked, "
           f"{len(floating)} floating, {len(mount_only)} held by a registered mount alone, {plural(len(allowances), 'unmounted allowance')}, "
           f"{plural(len(off_floor), 'field fixture')} off the floor"]
    if "skipped" in result:
        out.append("[attachment] note: " + result["skipped"])
    for row in floating:
        out.append(f"[attachment] floating: {row['solid']} ({row['group']}); nearest attached solid "
                   + ("not resolved" if row["nearest"] is None else f"{row['nearest']}, {row['gapMm']:g} mm away"))
    if mount_only:
        out.append("[attachment] held across a gap by a registered mount alone: " + ", ".join(mount_only))
    for row in allowances:
        out.append(f"[attachment] unmounted allowance: {row['solid']} ({row['group']}): {row['reason']}"
                   + (". It reaches the frame, so the label can go" if row["reachesFrame"] else ""))
    if result.get("onUnmountedAllowance"):
        out.append("[attachment] carried by an unmounted allowance: " + ", ".join(result["onUnmountedAllowance"]))
    for row in off_floor:
        out.append(f"[attachment] field fixture off the floor: {row['fixture']}, lowest point {row['lowestAboveFloorMm']:g} mm above "
                   f"the floor at Z = {result['floorZMm']:g} mm")
    for row in result["suspendedFixtures"]:
        out.append(f"[attachment] suspended field fixture: {row['fixture']}: {row['reason']}"
                   + (". It reaches the floor, so the label can go" if row.get("reachesFloor") else ""))
    if floating or off_floor:
        out.append("[attachment] note: nothing floats. Give each floating solid a support that touches it and traces to the frame, or "
                   "give it a mount in the design source; rest each field fixture on the floor or on a fixture that reaches it. Where "
                   "the support is deliberately not modelled yet, label the solid under attachment.unmounted, or the fixture under "
                   "attachment.suspended, in the judgement file with the reason. Until then the layout is not layout-checked.")
    return out
