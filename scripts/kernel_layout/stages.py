"""Judge the motions as a whole: what each moves, what moved each game piece and on what trial, and the one cycle.

A payload that moves in a motion rides on a mechanism (carriedBy in the source, or carriedWith here), is transported
by contact, on a free path or supported by a field fixture. The last three name a trial of the design library, and
the payload's move in that motion must be the path the trial fitted, whole or over a window of its kept points, so a
path is never an arbitrary animation. A fitted path that turns carries one angle per kept point about one axis; a
window keeps the angles of its points.

The cycle is one ordered list of phases, each naming its motions or why it does not apply:

    "cycle": [{"phase": "acquire", "motions": ["intake down", "grab"]}, {"phase": "endgame", "notApplicable": "..."}]

Each motion of the source is listed once. Along the phases before service, each motion must start where the one before
it ended.
"""
from .files import named, number

PHASES = ("acquire", "retain", "transfer", "deliver", "reset", "endgame", "park", "service")
PATHS = ("transportedBy", "freePath", "supportedBy")
SAMPLES = (0.0, 0.25, 0.5, 0.75, 1.0)
TOLERANCE_MM = 1e-4
# The fit's lists with one entry per kept point: a window takes the same points from each.
PER_POINT = ("throughMm", "turnDeg")


def placed(inputs, motion):
    """[{group: 12 numbers}] at the sample fractions of a motion, as the library places it. Needs no CAD kernel."""
    from .inputs import library
    kernel = library()
    return [kernel.placements(inputs.design, motion=motion, t=t) for t in SAMPLES]


def moving(inputs):
    """Give each case the groups its motion moves, carriers included, and the solids in them."""
    from frc_design_kernel.motion import matrix
    for case in inputs.cases:
        steps = placed(inputs, case["id"])
        case["movingGroups"] = sorted(g for g in steps[0] if g in inputs.groups and any(matrix.gap(steps[0][g], s[g]) > TOLERANCE_MM for s in steps[1:]))
        case["moved"] = sorted(m for g in case["movingGroups"] for m in inputs.groups[g]["members"])


def carried_chain(data, group):
    """The groups that carry this one, nearest first."""
    chain, at = [], data["groups"][group].get("carriedBy")
    while at and at not in chain:
        chain.append(at)
        at = data["groups"][at].get("carriedBy")
    return chain


def together(inputs, motion, payload, carrier):
    """Whether the payload keeps its place on the carrier all along the motion."""
    from frc_design_kernel.motion import matrix
    steps = placed(inputs, motion)
    rel = [matrix.compose(matrix.inverse(s[carrier]), s[payload]) for s in steps]
    return all(matrix.gap(rel[0], r) <= TOLERANCE_MM for r in rel[1:])


def carried(inputs, case, problems):
    """Check carriedWith: the payload and its mechanism move together. True when the motion carries a payload with a mechanism."""
    groups, moving_now = inputs.groups, set(case["movingGroups"])
    for payload, carrier in (case["bindings"].get("carriedWith") or {}).items():
        if not (payload in moving_now and carrier in moving_now and groups.get(payload, {}).get("role") == "payload"
                and groups.get(carrier, {}).get("role") == "mechanism"):
            problems.append("Identify the moving payload and its carrier in " + case["id"])
        elif not together(inputs, case["id"], payload, carrier):
            problems.append("The attached payload diverges from its carrier in " + case["id"] + ": give " + payload + " the same operations as "
                            + carrier + ", or set carriedBy on its group in the design source")
    rides = any(groups[g]["role"] == "payload" and any(c in moving_now and groups.get(c, {}).get("role") == "mechanism" for c in carried_chain(inputs.data, g))
                for g in moving_now if g in groups)
    return rides or bool(case["bindings"].get("carriedWith"))


def bindings(inputs, case, problems):
    """Check the trial bindings of one motion: who may move a payload, and that each names a trial the source defines."""
    groups, moving_now, key = inputs.groups, set(case["movingGroups"]), case["id"]
    declared = [p for field in PATHS for p in (case["bindings"].get(field) or {})] + list(case["bindings"].get("carriedWith") or {})
    if len(declared) != len(set(declared)):
        problems.append("Declare each payload of " + key + " once: carried, transported, on a free path or supported")
    for field in PATHS:
        entries = case["bindings"].get(field, {})
        if not isinstance(entries, dict):
            problems.append("List " + field + " of " + key + " by payload group")
            continue
        for payload, spec in entries.items():
            if not (payload in moving_now and groups.get(payload, {}).get("role") == "payload" and isinstance(spec, dict) and named(spec.get("basis"))
                    and named(spec.get("trial"))):
                problems.append("Under " + field + " of " + key + ", name a moving payload group, the basis of its path and the design library trial "
                                "that moves it, as trial: NAME: " + payload)
                continue
            if spec["trial"] not in inputs.data.get("trials", {}):
                problems.append(field + " names trial " + spec["trial"] + ", which the design source does not define")
            if field == "transportedBy":
                mechanisms, drive = spec.get("mechanisms") or [], spec.get("drive", {})
                if not (mechanisms and all(groups.get(m, {}).get("role") == "mechanism" for m in mechanisms) and isinstance(drive, dict) and set(drive) <= set(mechanisms)):
                    problems.append("Only mechanism groups transport a payload, each with a declared drive: " + payload + " in " + key)
            if field == "supportedBy":
                fixtures = spec.get("fixtures") or []
                if not (fixtures and set(fixtures) <= inputs.fixtures - set(case["absent"])):
                    problems.append("Only a field fixture present in " + key + " can support a payload: " + payload)


def window_of(fit, window, where, problems):
    """The fitted path over a window of its kept points: both ends must be kept points of the fit, at their atS times.
    Every list with one entry per kept point is cut to the window's points; a turn is counted from the window's first
    point, so its angles are kept as the fit wrote them."""
    if window is None:
        return fit["operation"]
    times = fit["atS"]
    if not (isinstance(window, list) and len(window) == 2 and all(number(t) for t in window) and window[0] < window[1]
            and window[0] in times and window[1] in times):
        problems.append("The window of " + where + " runs between two kept points of the trial's fit, at its atS times: " + ", ".join(f"{t:g}" for t in times))
        return None
    inside = [i for i, t in enumerate(times) if window[0] <= t <= window[1]]
    return dict(fit["operation"], **{key: [fit["operation"][key][i] for i in inside] for key in PER_POINT if key in fit["operation"]})


def strays(fit):
    """In words, how the fit misses the trace by more than its own tolerances, or None. The library measures each sample
    against its own piece of the kept path, and a turn made standing still shows only as maxTurnDeviationDeg."""
    words = []
    if fit["maxDeviationMm"] > fit["toleranceMm"]:
        words.append(f"{fit['maxDeviationMm']:g} mm from its trace, past its tolerance of {fit['toleranceMm']:g} mm")
    if "maxTurnDeviationDeg" in fit and fit["maxTurnDeviationDeg"] > fit["turnToleranceDeg"]:
        words.append(f"{fit['maxTurnDeviationDeg']:g} degrees from its trace, past its tolerance of {fit['turnToleranceDeg']:g} degrees")
    return " and ".join(words) or None


def fits(inputs, trials, problems, unmet):
    """Whether each bound payload moves on the path its trial fitted. A trial with no record is refused; a path that is not its fit is unmet.
    A fit that strays past its own tolerance binds no motion. Returns {field: {motion: {payload: bound}}}."""
    found = {}
    for case in inputs.cases:
        for field in PATHS:
            for payload, spec in (case["bindings"].get(field) or {}).items():
                where, trial = payload + " in " + case["id"], spec["trial"]
                record = ((trials or {}).get("trials") or {}).get(trial)
                if record is None:
                    problems.append("Run trial " + trial + " with the design library: its record is not in the records folder's trials.json")
                    continue
                ok = record["fit"]["operation"] is not None
                if not ok:
                    unmet.append(dict(kind="path", motion=case["id"], text="Trial " + trial + " fitted no path: its piece did not move. The move of " + where + " cannot be bound to it"))
                off = ok and strays(record["fit"])
                if off:
                    ok = False
                    unmet.append(dict(kind="path", motion=case["id"], text="The fit of trial " + trial + " strays " + off + ", so the path of " + where
                                      + " is not the trial. Run the trial with a smaller fitToleranceMm"))
                path = window_of(record["fit"], spec.get("window"), where, problems) if ok else None
                if ok and path is not None and inputs.data["motions"][case["id"]].get("moves", {}).get(payload) != [path]:
                    ok = False
                    unmet.append(dict(kind="path", motion=case["id"], text="The move of " + where + " is not the path trial " + trial + " fitted"
                                      + (" over its window" if "window" in spec else "") + ". Write its fit operation as the move in the design source"))
                found.setdefault(field, {}).setdefault(case["id"], {})[payload] = ok
                if field == "transportedBy":
                    for still in sorted(set(spec.get("mechanisms") or []) - set(case["movingGroups"]) - set(spec.get("drive", {}))):
                        unmet.append(dict(kind="path", motion=case["id"], text="Declare the drive of stationary transporter " + still + " in " + case["id"]))
    return found


def cycle_entries(inputs, problems):
    """The cycle as written, checked: phase words, each once, motions of the source in a phase that suits their purpose."""
    listed = inputs.judgement.get("cycle")
    if not isinstance(listed, list):
        problems.append("Give the cycle as an ordered list of {phase, motions} or {phase, notApplicable}")
        return []
    purpose = {c["id"]: c["purpose"] for c in inputs.cases}
    seen = set()
    for i, entry in enumerate(listed):
        if not (isinstance(entry, dict) and set(entry) in ({"phase", "motions"}, {"phase", "notApplicable"})):
            problems.append("cycle[" + str(i) + "] is {phase, motions} or {phase, notApplicable}")
            continue
        if entry["phase"] not in PHASES:
            problems.append("cycle[" + str(i) + "] names the phase " + str(entry["phase"]) + "; a phase is one of " + ", ".join(PHASES))
        elif entry["phase"] in seen:
            problems.append("The cycle lists the phase " + entry["phase"] + " twice")
        seen.add(entry["phase"])
        if "notApplicable" in entry:
            if not named(entry["notApplicable"]):
                problems.append("Say why the phase " + str(entry["phase"]) + " does not apply")
            continue
        if not (isinstance(entry["motions"], list) and entry["motions"]):
            problems.append("cycle[" + str(i) + "] lists the motions of the phase " + str(entry["phase"]) + ", or says why it does not apply")
            continue
        for name in entry["motions"]:
            if name not in purpose:
                problems.append("The cycle names " + str(name) + ", which is not a motion of the design source")
            elif purpose[name] in ("park", "service") and entry["phase"] != purpose[name]:
                problems.append(name + " is a " + purpose[name] + " motion and is listed under " + str(entry["phase"]))
            elif entry["phase"] in ("park", "service") and purpose[name] != entry["phase"]:
                problems.append(name + " is listed under " + entry["phase"] + " and is a " + purpose[name] + " motion: list it in purposes." + entry["phase"])
    return listed


def control(inputs, problems):
    """The displaced control, checked: one solid that stays still in its motion, shifted against one that moves there."""
    spec = inputs.judgement.get("control")
    if spec is None:
        return None
    by_id = {c["id"]: c for c in inputs.cases}
    if not (isinstance(spec, dict) and spec.get("motion") in by_id):
        problems.append("The displaced control names a motion of this design")
        return None
    case, shift = by_id[spec["motion"]], spec.get("offsetMm")
    if not (spec.get("displaced") in inputs.roster and spec["displaced"] not in case["moved"] and spec.get("moving") in case["moved"]
            and spec["displaced"] not in case["absent"] and isinstance(shift, list) and len(shift) == 3 and all(number(v) for v in shift) and any(shift)
            and named(spec.get("basis")) and set(spec) == {"motion", "displaced", "moving", "offsetMm", "basis"}):
        problems.append("Shift one retained stationary solid against a solid that moves in the control's motion, and give the basis")
        return None
    return spec


def checked(inputs, problems):
    """Every check of the motions that needs no measuring: bindings, carriers, the cycle and the control."""
    for case in inputs.cases:
        bindings(inputs, case, problems)
        case["loaded"] = carried(inputs, case, problems) and case["purpose"] == "operating"
    cycle_entries(inputs, problems)
    control(inputs, problems)


def coverage(inputs, paths):
    """What the motions leave unexamined, as unmet rows: a purpose with no motion, no loaded operating motion, no full withdrawal."""
    unmet = []
    for purpose in sorted({"operating", "park", "service"} - {c["purpose"] for c in inputs.cases}):
        unmet.append(dict(kind="coverage", text="Unexamined purpose: no " + purpose + " motion"))
    transported = {m for m, rows in paths.get("transportedBy", {}).items() if any(rows.values())}
    if not any(c["loaded"] or (c["purpose"] == "operating" and c["id"] in transported) for c in inputs.cases):
        unmet.append(dict(kind="coverage", text="No operating motion moves the payload with a mechanism"))
    if not any(c["extract"] for c in inputs.cases if c["purpose"] == "service"):
        unmet.append(dict(kind="coverage", text="No full service withdrawal commissioned"))
    return unmet


def continuity(inputs):
    """The cycle as judged: every motion listed, and along the phases before service each starts where the one before it ended."""
    from frc_design_kernel.motion import matrix
    listed = cycle_entries(inputs, [])
    named_motions = [m for entry in listed for m in entry.get("motions", [])]
    unmet = [dict(kind="cycle", motion=c["id"], text="The cycle does not list " + c["id"]) for c in inputs.cases if c["id"] not in named_motions]
    order = []
    for entry in listed:
        if entry.get("phase") != "service":
            for name in entry.get("motions", []):
                if not order or order[-1] != name:
                    order.append(name)
    for left, right in zip(order, order[1:]):
        end, start = placed(inputs, left)[-1], placed(inputs, right)[0]
        for group in sorted(g for g in end if g in inputs.groups and matrix.gap(end[g], start[g]) > TOLERANCE_MM):
            unmet.append(dict(kind="cycle", motion=right, text="Discontinuous cycle: " + group + " between " + left + " and " + right))
    return listed, unmet
