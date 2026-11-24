"""Judge the weight against the season's limits and each powered motion's bus voltage, from the library's records.

Weight: the mass record states each group's weight range. A limit passes when the high end of the weight it counts
is at or under its limitKg. A limit counts every robot group except the ones it excludes; game pieces and service
gauges (groups of role payload and service) are never robot weight.

Voltage: each powered motion's electrical record states, for every drive the motion runs, the current and the motor
voltage it needs, and the bus voltage under all of them at once. The motion passes when the weak pack's bus, the low
end of the bus range, is at or above both the season's minBusV and the highest motor voltage any running drive needs,
and no drive is clamped at its current limit, which would mean it cannot make its torque. Adding every drive's peak
current at once is conservative, and the record says so.
"""
NOT_ROBOT = ("payload", "service")


def weight(inputs, mass):
    """(the verdict's weight field, unmet rows) from the mass record."""
    groups, auto = mass["groups"], sorted(g for g in mass["groups"] if inputs.groups.get(g, {}).get("role") in NOT_ROBOT)
    limits, unmet = [], []
    for row in inputs.requirements.get("weightLimits", []):
        left = set(row["excludesGroups"]) | set(auto)
        counted = [g for g in groups if g not in left]
        low, high = (sum(groups[g]["rangeKg"][i] for g in counted) for i in (0, 1))
        margin = row["limitKg"] - high
        limits.append(dict(name=row["name"], limitKg=row["limitKg"], excludesGroups=row["excludesGroups"], basis=row["basis"], rangeKg=[low, high],
                           marginKg=margin, status="pass" if margin >= 0 else "fail"))
        if margin < 0:
            unmet.append(dict(kind="weight", text="Weight limit %s: up to %.2f kg against %.2f kg (%+.2f kg)" % (row["name"], high, row["limitKg"], margin)))
    stray = sorted(set(mass["unweighed"]) - inputs.members(("service",)))
    if stray:
        unmet.append(dict(kind="weight", text="The mass record lists unweighed robot solids: " + ", ".join(stray)))
    return dict(totalKg=mass["totalKg"], rangeKg=mass["rangeKg"], notRobotWeight=auto, limits=limits), unmet


def motion_power(inputs, motion, found, floor):
    """(the verdict row, unmet rows) of one motion's electrical record."""
    drives, bus = found["drives"], found["bus"]
    need = {name: d["motorV"]["range"][1] for name, d in drives.items()}
    governs = max(need, key=need.get) if need and max(need.values()) > floor else "minBusV"
    required = max([floor, *need.values()])
    low = bus["volts"]["range"][0]
    clamped = sorted(name for name, d in drives.items() if d["clamped"])
    moved = sorted({n for d in drives.values() for n in d.get("unweighed", [])} - inputs.members(("service",)))
    row = dict(status="pass", busV=bus["volts"]["range"], loadA=bus["loadA"]["range"], requiredV=required, governs=governs, marginV=low - required,
               clamped=clamped, drives={name: dict(currentA=d["currentA"], neededA=d["neededA"], limitA=d["limitA"], clamped=d["clamped"], motorV=d["motorV"])
                                        for name, d in drives.items()},
               alsoRunning=[dict(drive=r["drive"], busA=r["busA"]) for r in found.get("alsoRunning", [])])
    unmet = []
    if low < required:
        why = "minBusV" if governs == "minBusV" else "drive " + governs + "'s motor"
        unmet.append(dict(kind="voltage", motion=motion, text="%s: weak-pack bus %.2f V against %.2f V required by %s (%+.2f V)" % (motion, low, required, why, low - required)))
    for name in clamped:
        d = drives[name]
        unmet.append(dict(kind="voltage", motion=motion, text="%s: drive %s needs up to %.1f A per motor and is clamped at its %g A limit, so it cannot make its "
                                                              "torque" % (motion, name, d["neededA"]["range"][1], d["limitA"])))
    if moved:
        unmet.append(dict(kind="voltage", motion=motion, status="open", text=motion + " moves unweighed solids: " + ", ".join(moved)))
    if any(r.get("status", "fail") == "fail" for r in unmet):
        row["status"] = "fail"
    return row, unmet


def electrical(inputs, results):
    """(the verdict's electrical field, unmet rows) from every powered motion's electrical record."""
    floor, rows, unmet = inputs.requirements.get("minBusV"), {}, []
    statement = None
    for case in inputs.cases:
        found = results.get(("electrical", case["id"]))
        if found is None:
            continue
        rows[case["id"]], more = motion_power(inputs, case["id"], found, floor)
        unmet += more
        statement = found.get("conservative")
    return dict(minBusV=floor, motions=rows, conservative=statement), unmet
