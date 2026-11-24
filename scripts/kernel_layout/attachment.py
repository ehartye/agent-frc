"""Nothing floats: judge the library's attachment facts at the start of the opening case.

The library says what touches what, which solids are not connected to the base and which fixtures do not reach the
floor. This module applies the labels the judgement file gives (an unmounted allowance, a suspended fixture) and
writes the report. A floating robot solid or a fixture off the floor that no label explains fails the layout check:
judge.decide reads them from the report with floating().
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
    """(payloads, service and gauges): the solids that are not physical robot or field parts."""
    components = (inputs.plan.get("presentation") or {}).get("components") or {}
    gauges = {m for m, entry in components.items() if isinstance(entry, dict) and entry.get("volumeType") == "gauge"}
    role_of = {m: g["role"] for g in inputs.plan["groups"].values() for m in g["members"]}
    payloads = {m for m, role in role_of.items() if role == "payload"}
    return payloads, {m for m, role in role_of.items() if role == "service"} | (gauges - payloads)


def frame_of(found, structure):
    """The connected set that is the frame: the one with the most structure solids, then the largest."""
    sets = found["connectedSets"]
    return max(sets, key=lambda members: (len(structure.intersection(members)), len(members))) if sets else []


def report(inputs, measured, case, earlier=None):
    """The attachment report for the start of one case: the receipt field and the stderr lines.

    earlier is the library's attachment result kept by an earlier receipt at the same case, as its "measured": the
    touching gaps and mount distances of the solids that did not change are carried from it. The report keeps this
    run's under "measured", and the library's count of what it measured and carried under "checked"."""
    own = settings(inputs.plan, inputs.roster)
    groups = inputs.plan["groups"]
    group_of = {m: key for key, g in groups.items() for m in g["members"]}
    structure = {m for g in groups.values() if g["role"] == "structure" for m in g["members"]}
    payloads, gauges = left_out(inputs)
    ignore = sorted(payloads | gauges)
    found = measured.attachment(case, own["gapMm"], own["floorZMm"], ignore, earlier=earlier)
    frame = frame_of(found, structure)
    if any(row["solid"] in frame for row in found["notConnectedToBase"]):
        # The library took the largest set as the base; the frame is the set that holds the structure.
        found = measured.attachment(case, own["gapMm"], own["floorZMm"], ignore, base=sorted(structure.intersection(frame) or frame)[0], earlier=earlier)
        frame = frame_of(found, structure)
    present = set(inputs.roster) - set(case["removed"])
    result = dict(case=case["id"], pose="start of the case", gapMm=own["gapMm"], floorZMm=own["floorZMm"],
                  robotSolids=found["robotSolids"],
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
            floating.extend(dict(solid=n, group=group_of[n], nearest=loose[n]["nearest"],
                                 gapMm=None if loose[n]["gapMm"] is None else round(loose[n]["gapMm"], 3)) for n in members)
        result.update(frameSolids=len(frame), floating=sorted(floating, key=lambda r: r["solid"]), heldByMountOnly=found["heldByMountOnly"],
                      unmountedAllowances=allowances, onUnmountedAllowance=sorted(on_allowance))
    else:
        result.update(skipped="No structure group is placed in this case, so no frame is identified")
    hanging = {row["fixture"]: round(row["lowestAboveFloorMm"], 3) for row in found["fixturesOffFloor"]}
    off_floor = [dict(fixture=n, lowestAboveFloorMm=z) for n, z in sorted(hanging.items()) if n not in own["suspended"]]
    suspended = [dict(fixture=n, reason=reason, **({"lowestAboveFloorMm": hanging[n]} if n in hanging else {"reachesFloor": True}))
                 for n, reason in sorted(own["suspended"].items()) if n in present]
    result.update(fixturesOffFloor=off_floor, suspendedFixtures=suspended, checked=found["checked"],
                  measured={key: found[key] for key in ("inputs", "touching", "mounts")})
    return result, lines(result, case)


def lines(result, case):
    plural = lambda n, one: f"{n} {one if n == 1 else one + 's'}"
    floating, mount_only = result.get("floating", []), result.get("heldByMountOnly", [])
    allowances, off_floor = result.get("unmountedAllowances", []), result["fixturesOffFloor"]
    out = [f"[attachment] {case['id']} start pose, touching within {result['gapMm']:g} mm: {plural(result['robotSolids'], 'robot solid')} checked, "
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
