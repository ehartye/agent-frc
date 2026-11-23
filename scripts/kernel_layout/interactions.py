"""Judge a design's interactions: how far a planar trial can be trusted, what each trial found, and what an adjustment covers.

The library reports plain facts: the screen facts of each interaction it declares, the campaign record of each
trial, and the clearances at both ends of each mechanical adjustment. This module holds the plugin's guidelines and
turns those facts into the words a reviewer reads. The readiness report applies the effective bar to what it records.
"""
from mechanical_readiness import named, pinned, read, require

VERDICTS = ("planar is enough", "needs 3D", "configurable")
# Guidelines, not rules. An author may override a verdict with a written reason; the review lists every override.
GUIDELINES = {
    "sectionShare": 0.05,   # a meeting solid's section that moves by more than this share of the piece's thickness across its width
    "sectionMm": 2.0,       # ... or by more than this, whichever is larger
    "sidewaysShare": 0.10,  # a side gap wider than this share of the piece's width across the plane
    "squeezeRatio": 0.10,   # a squeeze deeper than this share of the piece's thickness: the result is only indicative
    "approachDeg": 10.0,    # an approach angle beyond this: the piece arrives skewed
}
RESULTS = ("passed", "covered by adjustment", "not covered", "failed", "control not rejected", "not converged", "incomplete")


def round_in_plane(piece, normal):
    axis = piece.get("axis")
    return piece["class"] == "sphere" or piece["class"] == "body of revolution" and bool(axis) and abs(axis["xyz".index(normal)]) > 0.999


def sideways(facts, g):
    """Why the piece can leave its section sideways: a side with no guide, or a gap wider than the guideline."""
    piece, reasons = facts["piece"], []
    ends = sorted(solid for solid, row in facts["sections"].items() if row["notCutAtLevelsMm"])
    # A ball that drifts sideways meets the same section, unless a meeting solid ends inside its width. Any other piece can turn.
    if piece["class"] == "sphere" and not ends:
        return reasons
    limit = g["sidewaysShare"] * piece["widthAcrossPlaneMm"]
    for hold in facts["sidewaysHold"]:
        for side in ("plus", "minus"):
            found = hold[side]
            if found is None:
                reasons.append("nothing guides the piece on the " + side + " side of the plane")
            elif found["gapMm"] > limit:
                reasons.append(f"a {found['gapMm']:.0f} mm gap to {found['solid']} on the {side} side lets the piece drift or turn")
    if reasons and ends:
        reasons.append("sections of " + ", ".join(ends) + " end inside the piece's width")
    return sorted(set(reasons))


def three_d(facts, g, groups=None):
    """Reasons the answer may depend on what one section cannot show. With groups, only those groups' movements count:
    the field moving under a driving robot does not take the piece out of its section."""
    piece, normal, reasons = facts["piece"], facts["plane"]["normal"], []
    if not round_in_plane(piece, normal):
        reasons.append("the piece is " + piece["class"] + " and is not round in the section")
    limit = max(g["sectionMm"], g["sectionShare"] * piece["thicknessInPlaneMm"])
    for solid, row in sorted(facts["sections"].items()):
        if not row["cutAtCentre"]:
            reasons.append("the section plane misses " + solid)
        elif row["largestDifferenceMm"] > limit:
            reasons.append(f"the section of {solid} changes by {row['largestDifferenceMm']:.1f} mm across the piece's width")
        if row["curvedAcross"]:
            reasons.append(solid + " has " + " and ".join(row["curvedAcross"]))
    reasons += sideways(facts, g)
    reasons += [row["group"] + " " + row["why"] + " in " + row["motion"] for row in facts["mechanismOutOfPlane"] if groups is None or row["group"] in groups]
    if facts["piecesAtOnce"] > 1:
        reasons.append(f"{facts['piecesAtOnce']} pieces at once")
    if facts.get("targetOffPlane"):
        reasons.append("the target is off the section plane")
    angles = (facts.get("approach") or {}).get("angleDeg") or []
    if angles and max(abs(a) for a in angles) > g["approachDeg"]:
        reasons.append(f"the piece may arrive up to {max(abs(a) for a in angles):g} degrees skewed")
    return reasons


def indicative(facts, g):
    """Reasons a simulated result is only a best guess, whatever the engine."""
    reasons = []
    squeeze = facts["squeeze"]
    if squeeze.get("ratio") is not None and squeeze["ratio"] > g["squeezeRatio"]:
        reasons.append(f"{squeeze['solid']} squeezes the piece by {100 * squeeze['ratio']:.0f}% of its thickness")
    reasons += [row["solid"] + " is " + row["class"] for row in facts["notRigid"]]
    return reasons


def verdict(facts, g=GUIDELINES, groups=None):
    """(verdict, reasons) for one interaction's screen facts. groups are the groups of the solids the piece meets."""
    deep, soft = three_d(facts, g, groups), indicative(facts, g)
    if deep:
        return "needs 3D", deep + soft
    if soft:
        return "configurable", soft
    return "planar is enough", ["the piece is round in the section, every meeting solid is the same across its width and nothing leaves the plane"]


def trial_facts(record, name):
    """What a reviewer reads of one trial's campaign record."""
    found = record["trials"][name]
    assumptions = found.get("assumptions") or {}
    return dict(name=name, engine=found["engine"]["name"], result=found["result"], findings=found.get("findings", []),
                assumptions=[*assumptions.get("stated", []), *assumptions.get("engine", [])],
                inputs=[{k: row[k] for k in ("path", "value", "source", "range", "reference") if k in row} for row in found.get("inputs", [])],
                sensitivity=[row["input"] for row in found.get("sensitivity", [])],
                coverage=[dict(input=row["input"], adjustment=row["adjustment"], someSettingPassesEach=row["someSettingPassesEach"],
                               oneSettingPassesBoth=row["oneSettingPassesBoth"], setting=row.get("setting"),
                               atLow=(row.get("atLow") or {}).get("passes"), atHigh=(row.get("atHigh") or {}).get("passes"))
                          for row in found.get("coverage", [])],
                adjustments=sorted((found.get("definition") or {}).get("adjustments") or []),
                touchedHulled=found.get("touchedHulled", []))


def records(inputs):
    """The trial campaign and the measurements the judgement file names, read, with their pins. Both sit in one folder."""
    out = {}
    for key in ("trials", "measurements"):
        ref = inputs.judgement.get(key)
        if ref is None:
            continue
        require(isinstance(ref, dict) and named(ref.get("file")), "Name the library's " + key + " record as " + key + ": {file}")
        path = pinned(inputs.root, dict(ref))
        out[key] = (read(path), dict(file=ref["file"], sha256=ref["sha256"]), path.parent)
    folders = {folder for _, _, folder in out.values()}
    require(len(folders) <= 1, "Keep trials.json and measurements.json in one records folder: the library's status reads them together")
    return out


def extremes(inputs, measurements):
    """For each mechanical adjustment: whether both ends are measured, and the pairs that only come close at an end."""
    rows, record = [], measurements[0] if measurements else None
    allowance = max(case["minGapMm"] for case in inputs.cases)
    for name, adjustment in sorted((inputs.data.get("adjustments") or {}).items()):
        row = dict(name=name, kind=adjustment["kind"], input=adjustment["input"], range=adjustment["range"], measured=False, findings=[])
        rows.append(row)
        if adjustment["kind"] != "mechanical":
            continue
        found = (record or {}).get("adjustments", {}).get(name)
        if not found or record["settings"]["minGapMm"] < allowance:
            row["hint"] = ("Measure both ends with python -m frc_design_kernel measure SOURCE --out RECORDS --extremes --min-gap " + f"{allowance:g}"
                           + ": the largest stage allowance")
            continue
        row["measured"] = True
        nominal = {motion: {frozenset(p) for p in found_motion.get("closer", [])} for motion, found_motion in record.get("motions", {}).items()}
        for setting in found["settings"]:
            for motion, at in sorted(setting["motions"].items()):
                new = sorted(" and ".join(sorted(p)) for p in at.get("closer", []) if frozenset(p) not in nominal.get(motion, set()))
                row["findings"] += [f"at {setting['setting']:g}: {pair} come closer than {allowance:g} mm in {motion}" for pair in new]
    return rows


def judge(inputs, measured, missing, say):
    """The receipt's interactions and adjustments, and the pins of the records read.

    Only an interaction the judgement file does not explain is a missing input: what it decides is settled at the
    arrangement stage. Trial results and adjustment extremes never block the layout; the readiness report reads them."""
    declared = inputs.data.get("interactions") or {}
    judged = inputs.judgement.get("interactions") or {}
    require(isinstance(judged, dict) and not set(judged) - set(declared),
            "Each interaction of the judgement file is declared under interactions in the design source: " + ", ".join(sorted(set(judged) - set(declared))))
    found = inputs.records
    campaign = found.get("trials")
    state = measured.status(found["trials"][2] if campaign else found["measurements"][2]) if found else {}
    owner = {s["name"]: s["group"] for s in [*inputs.data["solids"], *inputs.data["fixtures"]]}
    rows = []
    for name in sorted(declared):
        entry = judged.get(name)
        facts = measured.screen(name)
        involved = [*declared[name]["solids"], *declared[name].get("guides", []), *([declared[name]["pieceSolid"]] if "pieceSolid" in declared[name] else [])]
        word, reasons = verdict(facts, groups={owner[s] for s in involved if s in owner})
        row = dict(id=name, piece=facts["piece"]["name"], plane=facts["plane"], verdict=word, reasons=reasons)
        rows.append(row)
        say(f"[screen] {name}: {word}, because " + "; ".join(reasons))
        if not isinstance(entry, dict):
            missing.append("Say in the judgement file what interaction " + name + " decides, and name its trial or why it needs none")
            continue
        require(named(entry.get("decides")) and (named(entry.get("trial")) != named(entry.get("noTrial"))) and isinstance(entry.get("cases", []), list)
                and set(entry.get("cases", [])) <= {c["id"] for c in inputs.cases},
                "Interaction " + name + " says what it decides, names one trial or the reason it needs none, and lists the stages it backs")
        row.update(decides=entry["decides"], cases=sorted(entry.get("cases", [])))
        if "override" in entry:
            over = entry["override"]
            require(isinstance(over, dict) and over.get("verdict") in VERDICTS and named(over.get("reason")),
                    "An override of interaction " + name + " gives a verdict (" + ", ".join(VERDICTS) + ") and the reason")
            row.update(screened=word, verdict=over["verdict"], override=over["reason"])
        if named(entry.get("noTrial")):
            row["noTrial"] = entry["noTrial"]
            continue
        trial = entry["trial"]
        if not campaign or trial not in campaign[0].get("trials", {}):
            row["trial"] = dict(name=trial, result=None, state="not run")
            continue
        row["trial"] = dict(trial_facts(campaign[0], trial), **trial_state(state, trial))
        say(f"[trial] {trial} ({row['trial']['engine']}): {row['trial']['result']}" + (", stale" if row["trial"]["state"] == "stale" else ""))
    adjustments = extremes(inputs, found.get("measurements"))
    pins = {key: pin for key, (_, pin, _) in found.items()}
    return rows, adjustments, pins


def trial_state(state, trial):
    row = next((r for r in state.get("records", []) if r["record"] == f'trial "{trial}"'), None)
    return dict(state=row["state"] if row else "not run", changes=row["changes"] if row else [])
