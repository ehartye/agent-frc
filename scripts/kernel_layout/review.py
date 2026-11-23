"""Check one design: read its two inputs, have the library measure it, judge the result and write the receipt."""
import json
from pathlib import Path
from time import perf_counter

from mechanical_readiness import digest, named, read, require
from package_view import CONTROL_ID, PHASE_GUIDE, first_unmet, mission_animations, parked_assembly, verify_view

from . import attachment, judge, premises, scope, stages
from .budgets import budget_review
from .inputs import generated, load
from .measure import Measured, Placements

RECEIPT = "agent-frc/preliminary-layout-result@1"
REQUIRED_ROLES = ("structure", "bumper", "drive", "battery", "mechanism", "payload")
# Words a stage may change without changing what was measured.
STAGE_LABELS = ("phase", "basis", "allowanceBasis")


def structure(inputs, bounds, missing):
    """The layout's roles, explanations and mounts. Each gap is a missing input; none stops the run."""
    plan, groups, mounts = inputs.plan, inputs.plan["groups"], inputs.plan["mounts"]
    components = plan.get("presentation", {}).get("components", {})
    require(isinstance(components, dict) and not components.keys() - inputs.roster, "Component explanations must use the names of solids in the design source")
    for member in sorted(inputs.roster):
        entry = components.get(member, {})
        require(isinstance(entry, dict), "Invalid component explanation: " + member)
        missing.extend("Missing component " + field + ": " + member for field in ("purpose", "rationale") if not named(entry.get(field)))
    for role in sorted(set(REQUIRED_ROLES) - {g["role"] for g in groups.values()}):
        missing.append("Missing role from loaded layout: " + role)
    if not mounts:
        missing.append("No mount datums registered")
    for key, group in groups.items():
        if group["role"] == "mechanism" and not any(m["group"] == key for m in mounts):
            missing.append("Missing mount datum for " + key)
    for m in mounts:
        box = bounds.get(m["on"])
        if box is None or any(p < box[i] - 1e-6 or p > box[i + 3] + 1e-6 for i, p in enumerate(m["pointMm"])):
            missing.append("Mount datum outside the selected host envelope: " + m["group"] + (" (" + m["member"] + ")" if "member" in m else "") + " on " + m["on"])
    return {m["on"]: bounds[m["on"]] for m in mounts if m["on"] in bounds}


def physics_of(result, control):
    """What a receipt records of the measuring inputs: a view-only rebuild reuses its cases only while this is unchanged."""
    unlabelled = {key: {k: v for k, v in stage.items() if k not in STAGE_LABELS} for key, stage in (result.get("stages") or {}).items()}
    control = control or {}
    return {"the design source": (result.get("design") or {}).get("sha256"), "the generated solids": (result.get("step") or {}).get("sha256"),
            "the issue name": result.get("issue"), "the stages": unlabelled, "the groups": result.get("groups"), "the mounts": result.get("mounts"),
            "the displaced control": [control.get("case"), control.get("displaced"), control.get("offsetMm")],
            # Compared as JSON, the form the receipt was saved in.
            "the weight and voltage budgets": json.loads(json.dumps(result.get("budgets")))}


def unchanged_since(held, result, spec):
    """Refuse a view-only rebuild, naming what changed, unless every measuring input is the one the held receipt recorded."""
    was, now = physics_of(held, held.get("control")), physics_of(result, spec)
    changed = [name for name in now if now[name] != was[name]]
    require(not changed, "--view-only reuses the checked cases of a receipt only while their inputs are unchanged. Changed since that "
            "receipt: " + ", ".join(changed) + ". Run the full check with --write-view")


def held_receipt(root, view_only):
    require(Path(view_only).is_file(), "--view-only needs the receipt of an earlier check of this design; none at "
            + Path(view_only).relative_to(root).as_posix() + ". Name it with --from-receipt or run the full check with --write-view")
    held = read(view_only)
    require(isinstance(held, dict) and held.get("schema") == RECEIPT and not held.get("partial") and isinstance(held.get("cases"), list),
            "--view-only needs the receipt of a whole layout check. Run the full check with --write-view")
    require(not held.get("control") or held["control"].get("witness"), "--view-only cannot rebuild the displaced control of a receipt that did "
            "not reject it. Run the full check with --write-view")
    return held


def measure_cases(inputs, measured, chosen, workers, say):
    """Have the library measure the chosen cases, then judge each one."""
    began = perf_counter()
    say(f"[motion] measuring {len(chosen)} case(s) with the design library " + str(measured.stamp().get("version")) + " ...")
    rows = []
    for case, found in zip(chosen, measured.clearances(chosen, workers)):
        contacts = [judge.contact_row(rule, measured.reached(case, rule)) for rule in case["requiredContacts"]]
        rows.append(judge.case_row(case, found, contacts, measured.withdrawn(case) if case["extract"] else None))
        near = found["closest"]
        say(f"[motion] {case['id']} {rows[-1]['status']}: {found['counts']['measured']} of {found['counts']['pairs']} pairs measured"
            + (f", closest {near['pair'][0]} and {near['pair'][1]} at {near['gapMm']:.3f} mm" if near else ""))
    say(f"[motion] done {len(rows)} case(s) in {perf_counter() - began:.1f}s")
    return rows


def checked(inputs, measured, spec, held, only, workers, say, missing):
    """(case rows, control field, control case row, partial fields): measured now, or taken from a held receipt."""
    if held is not None:
        say(f"[view] reusing {len(held['cases'])} checked case(s) and the displaced control from the receipt; no case is measured again")
        control = held.get("control")
        return held["cases"], control, dict(case=CONTROL_ID, status="fail", pairs=[control["witness"]]) if control else None, {}
    chosen = [c for c in inputs.cases if only is None or c["id"] in only]
    rows = measure_cases(inputs, measured, chosen, workers, say)
    if only is not None:
        skipped = [c["id"] for c in inputs.cases if c["id"] not in only]
        missing.append("Partial run of " + ", ".join(c["id"] for c in chosen) + "; run without --cases to check " + str(len(skipped))
                       + " other case(s), the displaced control and the view")
        return rows, dict(spec, witness=None, status="skipped") if spec else None, None, dict(
            partial=True, checkedCases=[c["id"] for c in chosen], skippedCases=skipped)
    if not spec:
        return rows, None, None, {}
    by_id = {c["id"]: c for c in inputs.cases}
    control, control_case = judge.control_row(spec, measured.displaced(by_id[spec["case"]], spec))
    say("[control] " + spec["displaced"] + " shifted " + json.dumps(spec["offsetMm"]) + " mm in " + spec["case"] + ": "
        + ("rejected, as it must be" if control["witness"] else "NOT rejected"))
    if control["witness"] is None:
        missing.append("Matched displacement did not reject the commissioned pair")
    return rows, control, control_case, {}


def budgets_of(inputs, missing, say):
    began = perf_counter()
    # A fixture is not robot mass: the ledger accounts for the robot's own groups.
    robot = {k: g for k, g in inputs.plan["groups"].items() if not set(g["members"]) <= inputs.fixtures}
    found = budget_review(inputs.root, dict(inputs.plan, groups=robot), missing)
    summary = "none" if not found else "mass=" + found["massStatus"] + " electrical=" + (
        "fail" if any(r["status"] == "fail" for r in found["electricalCases"]) else "pass")
    say(f"[budgets] done {summary} {perf_counter() - began:.2f}s")
    return found


def prepare(inputs, measured, placements, missing, say):
    """Everything judged before a case is measured. Returns the receipt so far and what the later steps need."""
    plan = inputs.plan
    result = dict(schema=RECEIPT, issue=plan["issue"], planSha256=digest(inputs.file), design=plan["design"], designId=inputs.data["name"],
                  datum=plan["datum"], library=measured.stamp(), status="provisional", missingInputs=missing)
    result["narrativeReview"] = premises.narrative(inputs.root, plan, missing)
    result["premises"] = premises.compare(inputs.root, plan, missing)
    result["reopen"] = [dict(phase=d["phase"], reason=d["id"], affected=d["interfaces"]) for d in result["premises"] if d["status"] == "reopen"]
    plan["step"], bounds = generated(inputs)
    result.update(step=plan["step"], motion=plan["motion"], parts=inputs.parts)
    hosts = structure(inputs, bounds, missing)
    result["scope"], lines = scope.report(plan, len(inputs.roster - inputs.fixtures), len(inputs.fixtures))
    for line in lines:
        say(line)
    listed = plan.get("cycle") or []
    ids = [c["id"] for c in inputs.cases]
    shown = mission_animations(plan, [k for k in listed if k in ids] + [k for k in ids if k not in listed])
    if len(shown) > PHASE_GUIDE:
        say(f"[view] note: the review lists {len(shown)} animations for {len(ids)} cases. Name the phase of each case under stages.CASE.phase "
            "so the segments of one motion play as one animation. This is information and does not change the result.")
    attachment.settings(plan, inputs.roster)
    free, supports = stages.coverage(inputs, missing)
    result["cycle"] = stages.cycle(inputs, placements, missing)
    return result, hosts, free, supports, stages.control(inputs, missing)


def review(root, file, *, write_view=False, physics_only=False, view_only=None, only=None, workers=None, progress=None):
    """Check one design and return its receipt.

    physics_only leaves the review view alone; its receipt is marked and is not one to publish. view_only names an
    earlier receipt of this design: its case results and control are reused and the view is rebuilt around them,
    refused when a measuring input has changed. only limits the run to the named cases and marks the receipt partial."""
    say = progress or (lambda line: None)
    inputs = load(root, file)
    plan, missing = inputs.plan, list(inputs.judgement.get("missingInputs", []))
    measured, placements = Measured(inputs), Placements(inputs)
    result, hosts, free, supports, spec = prepare(inputs, measured, placements, missing, say)
    known = {c["id"] for c in inputs.cases}
    require(only is None or only and set(only) <= known, "--cases names stages of this design: " + ", ".join(sorted(known)))
    held = held_receipt(root, view_only) if view_only is not None else None
    rows, control, control_case, partial = checked(inputs, measured, spec, held, only, workers, say, missing)
    result.update(partial, groups=plan["groups"], mounts=plan["mounts"], mountHostBoundsMm=hosts, stages=plan["stages"], cases=rows)
    if control:
        result["control"] = control
    opening = plan.get("presentation", {}).get("openingCase") or (result["cycle"] or [inputs.cases[0]["id"]])[0]
    by_id = {c["id"]: c for c in inputs.cases}
    result["attachment"], lines = attachment.report(inputs, measured, by_id.get(opening, inputs.cases[0]))
    for line in lines:
        say(line)
    result["budgets"] = budgets_of(inputs, missing, say)
    if held is not None:
        unchanged_since(held, result, spec)
    writes = []
    if partial or physics_only:
        result.update({} if partial else {"physicsOnly": True})
        result["view"] = dict(file=plan["view"], verified=False, skipped="partial run" if partial else "--physics-only run") if plan.get("view") else None
    else:
        from .view import scenes
        observed = dict(cases=[*rows, *([control_case] if control_case else [])])
        extra = dict(control=control, missing=missing, studyCases=inputs.cases, fixtures=inputs.fixtures, freePaths=free, supports=supports,
                     attachment=result["attachment"])
        result["view"] = verify_view(root, plan, scenes(inputs, measured, placements, spec if control_case else None), write_view or held is not None,
                                     observed, result["budgets"], extra, deferred=writes, beside=inputs.file.resolve().parent)
        if not result["view"] or not result["view"]["verified"]:
            missing.append("Generate the matching view of these checked motions with --write-view")
    require(digest(inputs.source) == inputs.design.sha256 and digest(inputs.file) == result["planSha256"], "The design source or the judgement file changed during the check")
    result["status"] = judge.decide(result, missing)
    result["parked"] = parked_assembly(rows, inputs.cases, inputs.roster - inputs.fixtures)
    result["decision"] = dict(status=result["status"], firstUnmet=first_unmet(result))
    # Nothing above can stop the run any more: a run that ends in an error has left the previous view untouched.
    for write in writes:
        write()
    return result
