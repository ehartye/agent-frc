"""Report the robot solids of a preliminary layout that nothing holds, and the field fixtures that hang above the floor.

The report is information. It never changes a status, a missing input or an exit code, and no release check reads it."""
from itertools import combinations
from time import perf_counter

from mechanical_readiness import named, number, require
from showcase_contacts import box_gap

# Two solids closer than this count as touching. A project states its own figure as attachment.gapMm in the layout plan.
GAP_MM = 3
FLOOR_Z_MM = 0
KEYS = ("gapMm", "floorZMm", "unmounted", "suspended")
# Group roles that are not physical robot parts: game pieces, and service gauges or clearance envelopes.
EXCLUDED_ROLES = ("payload", "service")


def settings(plan, roster):
    """The plan's attachment settings, checked: the touching gap, the floor height and the labelled exceptions."""
    own = plan.get("attachment", {})
    require(isinstance(own, dict) and set(own) <= set(KEYS), "Give attachment as an object with " + ", ".join(KEYS))
    require("gapMm" not in own or number(own["gapMm"]) and own["gapMm"] >= 0, "Give attachment.gapMm as zero or a positive number of millimetres")
    require("floorZMm" not in own or number(own["floorZMm"]), "Give attachment.floorZMm as the floor height in the STEP world, in millimetres")
    for key, what in (("unmounted", "unmounted allowance"), ("suspended", "suspended field fixture")):
        labelled = own.get(key, {})
        require(isinstance(labelled, dict) and set(labelled) <= set(roster) and all(named(reason) for reason in labelled.values()),
                "attachment." + key + " maps a placed ID to the reason it is " + ("an " if key == "unmounted" else "a ") + what)
    return dict(gapMm=own.get("gapMm", GAP_MM), floorZMm=own.get("floorZMm", FLOOR_Z_MM),
                unmounted=dict(own.get("unmounted", {})), suspended=dict(own.get("suspended", {})))


def loose_box(shape):
    """A quick axis-aligned box that encloses the solid. It may be larger than the solid, so a box gap is a lower bound."""
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box
    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box, False)
    return [*box.CornerMin().Coord(), *box.CornerMax().Coord()]


class _Sets:
    """Disjoint sets of names."""
    def __init__(self, names):
        self.parent = {n: n for n in names}

    def find(self, n):
        while self.parent[n] != n:
            self.parent[n] = self.parent[self.parent[n]]
            n = self.parent[n]
        return n

    def join(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.parent[max(a, b)] = min(a, b)

    def groups(self):
        out = {}
        for n in sorted(self.parent):
            out.setdefault(self.find(n), []).append(n)
        return out


class _Gaps:
    """Surface gaps between the solids of one pose: the ones the check already measured, then exact distances on demand."""
    def __init__(self, scene, known, measure, box):
        self.scene, self.known, self.measure = scene, dict(known), measure
        self.boxes = {n: box(s) for n, s in scene.items()}
        self.measured = self.unresolved = 0

    def lower(self, a, b):
        return box_gap(self.boxes[a], self.boxes[b])

    def gap(self, a, b):
        key = (a, b) if a < b else (b, a)
        if key not in self.known:
            try:
                self.known[key] = self.measure(self.scene[a], self.scene[b])
                self.measured += 1
            except Exception:
                # An advisory report never stops a run: a pair the kernel cannot resolve is left apart.
                self.known[key] = None
                self.unresolved += 1
        return self.known[key]

    def touching(self, sets, names, limit):
        """Join the names whose surfaces lie within the limit. Pairs already joined through others are not measured."""
        near = [(a, b) for a, b in combinations(sorted(names), 2) if self.lower(a, b) <= limit]
        # Measured pairs cost nothing, so they join first; then the closest boxes.
        near.sort(key=lambda p: (p not in self.known, self.lower(*p)))
        for a, b in near:
            if sets.find(a) == sets.find(b):
                continue
            gap = self.gap(a, b)
            if gap is not None and gap <= limit:
                sets.join(a, b)

    def nearest(self, name, others):
        """The closest of the other solids and its gap. Enclosing boxes rule out the ones that cannot be closer."""
        best = (None, None)
        for other in sorted(others, key=lambda o: (self.lower(name, o), o)):
            if best[1] is not None and self.lower(name, other) >= best[1]:
                break
            gap = self.gap(name, other)
            if gap is not None and (best[1] is None or gap < best[1]):
                best = (other, gap)
        return best


def _start_gaps(case, rows):
    """Pair gaps the check already holds for the start of this case: declared interfaces touch, and a witness at t = 0 is that pose."""
    known = {}
    for row in rows or []:
        witness = row.get("witness")
        if isinstance(witness, dict) and witness.get("t") == 0 and number(witness.get("gapMm")):
            known[tuple(sorted(row["pair"]))] = witness["gapMm"]
    for interface in case.get("intendedInterfaces", []):
        known[tuple(sorted(interface["pair"]))] = 0.0
    return known


def report(plan, groups, mounts, case, scene, rows, fixtures, measure=None, box=loose_box, exact_box=None):
    """The attachment report for one case's start pose: the informational receipt field and the stderr lines.

    scene maps each placed ID to its solid at the start of the case. rows are that case's checked pairs, whose
    measured gaps are reused. A robot solid is attached when contacts within the gap, declared interfaces or
    registered mounts lead from it to the frame: the connected set that holds the most structure solids."""
    if measure is None or exact_box is None:
        from mechanical_motion import bounds, distance
        measure, exact_box = measure or distance, exact_box or bounds
    began = perf_counter()
    own = settings(plan, {m for g in groups.values() for m in g["members"]})
    limit, floor = own["gapMm"], own["floorZMm"]
    group_of = {m: key for key, g in groups.items() for m in g["members"]}
    role_of = {m: groups[key]["role"] for m, key in group_of.items()}
    components = (plan.get("presentation") or {}).get("components") or {}
    gauge = {m for m, entry in components.items() if isinstance(entry, dict) and entry.get("volumeType") == "gauge"}
    present = [n for n in sorted(scene) if n in group_of]
    robot = [n for n in present if n not in fixtures and role_of[n] not in EXCLUDED_ROLES and n not in gauge]
    field = [n for n in present if n in fixtures and role_of[n] != "payload"]
    gaps = _Gaps({n: scene[n] for n in [*robot, *field]}, _start_gaps(case, rows), measure, box)
    result = dict(informational=True, case=case["id"], pose="start of the case", gapMm=limit, floorZMm=floor, robotSolids=len(robot),
                  excluded=dict(fieldFixtures=len([n for n in present if n in fixtures]),
                                payloads=len([n for n in present if n not in fixtures and role_of[n] == "payload"]),
                                serviceAndGauges=len(present) - len(robot) - len([n for n in present if n in fixtures or role_of[n] == "payload"])))

    # Robot solids: contacts first, then the registered mounts.
    touching = _Sets(robot)
    gaps.touching(touching, robot, limit)
    held = _Sets(robot)
    for members in touching.groups().values():
        for other in members[1:]:
            held.join(members[0], other)
    for mount in mounts:
        host = mount["on"]
        if host not in held.parent:
            continue
        if "member" in mount:
            ends = [mount["member"]]
        else:
            # A group mount holds the member of its group that lies nearest the registered point.
            point = [*mount["pointMm"], *mount["pointMm"]]
            members = [m for m in groups[mount["group"]]["members"] if m in held.parent and m != host]
            reach = {m: box_gap(gaps.boxes[m], point) for m in members}
            ends = [m for m in members if reach[m] <= min(reach.values()) + 1e-6]
        for end in ends:
            if end in held.parent:
                held.join(host, end)
    structure = {n for n in robot if role_of[n] == "structure"}
    sets = held.groups()
    floating, mount_only, allowances, on_allowance = [], [], [], []
    if structure:
        frame = max(sets.values(), key=lambda members: (len(structure.intersection(members)), len(members)))
        frame_set = set(frame)
        # Within the frame, the solids its largest touching set does not reach are held across a gap by a mount alone.
        core = max((members for members in touching.groups().values() if members[0] in frame_set),
                   key=lambda members: (len(structure.intersection(members)), len(members)))
        mount_only = sorted(frame_set - set(core))
        for name, reason in sorted(own["unmounted"].items()):
            if name in held.parent:
                allowances.append(dict(solid=name, group=group_of[name], reason=reason, reachesFrame=name in frame_set))
        for members in sets.values():
            if members[0] in frame_set:
                continue
            labelled = set(members) & set(own["unmounted"])
            if labelled:
                on_allowance.extend(n for n in members if n not in labelled)
                continue
            for name in members:
                other, gap = gaps.nearest(name, frame)
                floating.append(dict(solid=name, group=group_of[name], nearest=other, gapMm=None if gap is None else round(gap, 3)))
        result.update(frameSolids=len(frame), floating=floating, heldByMountOnly=mount_only, unmountedAllowances=allowances,
                      onUnmountedAllowance=sorted(on_allowance))
    else:
        result.update(skipped="No structure group is placed in this case, so no frame is identified")

    # Field fixtures: one reaches the floor itself, or rests on a fixture that does.
    off_floor, suspended = [], []
    lowest = {n: exact_box(scene[n])[2] for n in field}
    grounded = _Sets(field)
    seeds = [n for n in field if lowest[n] <= floor + limit]
    for other in seeds[1:]:
        grounded.join(seeds[0], other)
    hanging = [n for n in field if n not in seeds and n not in own["suspended"]]
    if hanging and seeds:
        gaps.touching(grounded, [n for n in field if n not in own["suspended"]], limit)
    for name in hanging:
        if not seeds or grounded.find(name) != grounded.find(seeds[0]):
            off_floor.append(dict(fixture=name, lowestAboveFloorMm=round(lowest[name] - floor, 3)))
    for name, reason in sorted(own["suspended"].items()):
        if name in lowest:
            suspended.append(dict(fixture=name, reason=reason, lowestAboveFloorMm=round(lowest[name] - floor, 3)))
    # How many pairs were measured depends on what the run had already measured, so it stays out of the receipt.
    result.update(fixturesOffFloor=off_floor, suspendedFixtures=suspended)

    plural = lambda n, one, many=None: f"{n} {one if n == 1 else many or one + 's'}"
    lines = [f"[attachment] {case['id']} start pose, touching within {limit:g} mm: {plural(len(robot), 'robot solid')} checked, "
             f"{len(floating)} floating, {len(mount_only)} held by a registered mount alone, "
             f"{plural(len(allowances), 'unmounted allowance')}, {plural(len(off_floor), 'field fixture')} off the floor "
             f"({gaps.measured} extra pair distances, {perf_counter() - began:.2f}s)"]
    if "skipped" in result:
        lines.append("[attachment] note: " + result["skipped"])
    for row in floating:
        lines.append(f"[attachment] floating: {row['solid']} ({row['group']}); nearest attached solid "
                     + ("not resolved" if row["nearest"] is None else f"{row['nearest']}, {row['gapMm']:g} mm away"))
    if mount_only:
        lines.append("[attachment] held across a gap by a registered mount alone: " + ", ".join(mount_only))
    for row in allowances:
        lines.append(f"[attachment] unmounted allowance: {row['solid']} ({row['group']}): {row['reason']}"
                     + (". It reaches the frame, so the label can go" if row["reachesFrame"] else ""))
    if on_allowance:
        lines.append("[attachment] carried by an unmounted allowance: " + ", ".join(sorted(on_allowance)))
    for row in off_floor:
        lines.append(f"[attachment] field fixture off the floor: {row['fixture']}, lowest point {row['lowestAboveFloorMm']:g} mm above "
                     f"the floor at Z = {floor:g} mm")
    for row in suspended:
        lines.append(f"[attachment] suspended field fixture: {row['fixture']}: {row['reason']}")
    if gaps.unresolved:
        lines.append(f"[attachment] note: {plural(gaps.unresolved, 'pair distance')} could not be resolved and "
                     + ("counts" if gaps.unresolved == 1 else "count") + " as apart")
    if floating or off_floor:
        lines.append("[attachment] note: nothing floats. Give each floating solid a support that touches it and traces to the frame, or "
                     "register its mount; rest each field fixture on the floor or on a fixture that reaches it. Where the support is "
                     "deliberately not modelled yet, label the solid under attachment.unmounted, or the fixture under "
                     "attachment.suspended, with the reason. This is information and does not change the result.")
    return result, lines
