"""Judge one design from the library's records, on demand. Nothing here writes a file.

judge() reads every input first and refuses, with the whole list, when one is missing or invalid. Then:

  - a draft check (judge_only=False) has the library measure each job whose record is not current, carrying the
    rest; the library writes each record as its job finishes, so a stopped run keeps what it measured;
  - a judge-only check (judge_only=True) measures nothing and refuses any job record that is stale or missing.

Either way a trial record the judgement uses must be current. With every_record, which the stage gate asks for, so must
every other record in the folder. The verdict is returned, never stored: the stage gate writes the one stored verdict,
gate.json, from its status and the files it names.
"""
from pathlib import Path
from time import perf_counter

from . import attachment, evidence, interactions, jobs as asking, judge as judging, limits, measure, premises, scope, stages
from .files import read
from .inputs import library, load, refused

VERDICT = "agent-frc/layout-verdict@1"
REQUIRED_ROLES = ("structure", "bumper", "drive", "battery", "mechanism", "payload")


def used_trials(inputs):
    """Every trial the judgement uses: its interactions, its mission cases and its payload bindings."""
    names = {e["trial"] for e in (inputs.judgement.get("interactions") or {}).values() if isinstance(e, dict) and e.get("trial")}
    names |= {row["trial"] for row in inputs.judgement.get("missionCases", [])}
    names |= {spec["trial"] for case in inputs.cases for field in stages.PATHS for spec in (case["bindings"].get(field) or {}).values()}
    return names


def trial_records(inputs, every_record, say):
    """(trials.json or None, the library's status of the records folder, seconds). Refuses a stale trial record the
    judgement uses or, with every_record, any record in the folder that is not current."""
    path = inputs.records / "trials.json"
    campaign = read(path) if path.is_file() else None
    names = used_trials(inputs) & set((campaign or {}).get("trials", {}))
    if not names and not every_record:
        return campaign, {}, 0.0
    began = perf_counter()
    state = measure.status(inputs.source, inputs.records)
    seconds = perf_counter() - began
    used = {f'trial "{n}"' for n in names}
    stale = [r for r in state["records"] if (every_record or r["record"] in used) and r["state"] != "current"]
    if stale:
        raise refused([r.get("file", r["record"]) + " is stale: " + "; ".join(r["changes"]) + (". Run it again with python -m frc_design_kernel try SOURCE --out RECORDS"
                       if r["record"].startswith("trial ") else ". Measure it again, or remove a record the design no longer needs") for r in stale],
                      "before judging, because " + ("a record" if every_record else "a trial record it uses") + " is not current")
    say(f"[records] {len(state['records'] if every_record else names)} " + ("record(s) in the folder" if every_record else "trial record(s) the judgement uses")
        + f" are current; status took {seconds:.1f} s")
    return campaign, state, seconds


def measured(inputs, asked, judge_only, workers, say):
    """({tag: result}, the jobs as listed in the verdict, seconds the staleness check took). The library names each record from
    its question, so the verdict says what each one answers."""
    listed = [job for job, _ in asked]
    if judge_only:
        began = perf_counter()
        rows = measure.check(inputs.source, listed, inputs.records)
        seconds = perf_counter() - began
        bad = [r for r in rows if r["state"] != "current"]
        if bad:
            raise ValueError("Refused: " + str(len(bad)) + " of " + str(len(rows)) + " job records are not current. Measure again with preliminary-check, "
                             "without --judge-only: it carries every current job and measures the rest.\n"
                             + "\n".join("- " + r["file"] + " is " + r["state"] + ": " + "; ".join(r["changes"]) for r in bad))
        records = [measure.read(inputs.records, r["record"]) for r in rows]
        return ({tag: held["result"] for (_, tag), held in zip(asked, records)},
                [dict(id=r["record"], kind=r["kind"], file=r["file"], action="current", answers=list(tag)) for (_, tag), r in zip(asked, rows)], seconds)
    report = lambda entry: say(f"[records] {entry['id']}: {entry['action']}")
    entries = measure.record(inputs.source, listed, inputs.records, workers=workers, report=report)
    done = sum(1 for e in entries if e["action"] == "measured")
    say(f"[records] {done} measured, {len(entries) - done} carried, in {inputs.records.relative_to(inputs.root).as_posix()}/measurements")
    return ({tag: e["record"]["result"] for (_, tag), e in zip(asked, entries)},
            [dict(id=e["id"], kind=e["kind"], file=e["file"], action=e["action"], answers=list(tag)) for (_, tag), e in zip(asked, entries)], 0.0)


def structure(inputs, found):
    """The layout's roles and mounts. Each gap is an unmet row."""
    unmet = [dict(kind="structure", text="Missing role from the layout: " + role) for role in REQUIRED_ROLES
             if role not in {g["role"] for g in inputs.groups.values()}]
    if not inputs.mounts:
        unmet.append(dict(kind="structure", text="No mount datums registered"))
    for key, group in sorted(inputs.groups.items()):
        if group["role"] == "mechanism" and not any(m["group"] == key for m in inputs.mounts):
            unmet.append(dict(kind="structure", text="Missing mount datum for " + key))
    unmet += [dict(kind="structure", text="Mount datum of " + m["group"] + " (" + m["member"] + ") is " + f"{m['pointToOnMm']:g}" + " mm from its host " + m["on"])
              for m in found.get("mountsOffHost", [])]
    return unmet


def upstream(inputs, mass, campaign):
    """(premise rows, reopen rows, unmet rows): each premise against what the records state, and the narrative's open objectives."""
    rows, reopen, unmet = [premises.judged(p, mass, campaign) for p in inputs.premises], [], []
    for row in rows:
        if row["status"] == "reopen":
            affected = sorted(inputs.groups) if "robot" in row["interfaces"] else row["interfaces"]
            reopen.append(dict(phase=row["phase"], reason=row["id"], affected=affected))
            unmet.append(dict(kind="premise", text="Reopened " + row["phase"] + ": premise " + row["id"] + " is " + str(row["value"]) + " " + row["unit"]
                              + ", outside " + str(row["criterion"])))
        elif row["status"] == "not observed":
            unmet.append(dict(kind="premise", status="open", text="Premise " + row["id"] + " is not observed: name the fact a record states under observes"))
    objectives = inputs.narrative["objectives"]
    if not objectives:
        unmet.append(dict(kind="narrative", text="Account for the narrative objectives and fallbacks"))
    unmet += [dict(kind="narrative", text="Open narrative objective: " + o["objective"]) for o in objectives if o["disposition"] == "open"]
    return rows, reopen, unmet


def judged(inputs, results, campaign, state, adjustments, paths, path_unmet, say):
    """The verdict from the records, and the stderr lines said along the way."""
    unmet, motions = list(path_unmet), {}
    for case in inputs.cases:
        motions[case["id"]] = judging.motion_row(case, results)
        row = judging.motion_unmet(case["id"], motions[case["id"]])
        if row:
            unmet.append(row)
        say(f"[motion] {case['id']}: {motions[case['id']]['status']}" + ("" if not row else " (" + row["text"] + ")"))
    spec = stages.control(inputs, [])
    control = judging.control_row(spec, results[("control",)]) if spec else None
    if not control or not control["rejected"]:
        unmet.append(dict(kind="control", status="open", text="Missing matched displaced control" if not control else
                          "Displaced control " + control["displaced"] + " was not rejected: the shifted pair stays clear, so it cannot show the check fails"))
    found, lines = attachment.report(inputs, results[("attachment",)])
    for line in lines:
        say(line)
    weight, more = limits.weight(inputs, results[("mass",)])
    power, extra = limits.electrical(inputs, results)
    cycle, gaps = stages.continuity(inputs)
    rows, reopen, upper = upstream(inputs, results[("mass",)], campaign)
    screened, unexplained = interactions.judge(inputs, measure.Screened(inputs), campaign, state, say)
    unmet += [*structure(inputs, found), *more, *extra, *stages.coverage(inputs, paths), *gaps, *upper, *unexplained]
    verdict = dict(schema=VERDICT, issue=inputs.judgement["issue"], design=inputs.data["name"], library=library().generator(), motions=motions,
                   control=control, attachment=found, weight=weight, electrical=power, cycle=cycle, premises=rows, reopen=reopen,
                   narrative=inputs.narrative, interactions=screened, adjustments=interactions.extremes(inputs, adjustments, results),
                   missionCases=interactions.mission_cases(inputs, campaign, state), risks=inputs.judgement.get("risks", []),
                   groups=inputs.groups)
    verdict["status"], verdict["firstUnmet"], verdict["unmet"] = judging.decide(verdict, unmet)
    verdict["scope"], lines = scope.report(inputs, len(inputs.roster - inputs.fixtures), len(inputs.fixtures))
    for line in lines:
        say(line)
    return verdict


def judge(root, file, *, judge_only=False, every_record=False, workers=None, progress=None):
    """Judge one design and return its verdict. Raises ValueError, naming every problem, when it cannot be judged."""
    say, began = progress or (lambda line: None), perf_counter()
    inputs = load(Path(root), Path(file))
    if inputs.records is None:
        raise refused(["Name the folder of the library's records as records: {folder}"])
    campaign, state, status_seconds = trial_records(inputs, every_record, say)
    problems, path_unmet = [], []
    paths = stages.fits(inputs, campaign, problems, path_unmet)
    if problems:
        raise refused(problems)
    asked = asking.asked(inputs, stages.control(inputs, []))
    results, listed, check_seconds = measured(inputs, asked, judge_only, workers, say)
    adjustments = read(inputs.records / "adjustments.json") if (inputs.records / "adjustments.json").is_file() else None
    verdict = judged(inputs, results, campaign, state, adjustments, paths, path_unmet, say)
    verdict["records"] = dict(folder=inputs.records.relative_to(inputs.root).as_posix(), jobs=listed)
    verdict["files"] = evidence.files(inputs, listed)
    verdict["seconds"] = dict(total=perf_counter() - began, status=status_seconds + check_seconds)
    return verdict
