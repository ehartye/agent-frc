"""Review an early loaded-mechanism layout in one registered STEP world frame."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from time import perf_counter

from component_shape import proper_rotation
from mechanical_motion import evaluate, stderr_progress, transforms, vec
from package_budgets import budget_review
from package_view import capture, verify_view
from mechanical_readiness import digest, named, number, pinned, project_path, read, require


def names(items, label, *, empty=False):
    require(isinstance(items,list) and (items or empty) and all(named(x) for x in items)
            and len(set(items))==len(items), "Supply unique names for "+label)
    return set(items)


def has_travel(op):
    if op["kind"]=="translation":
        return any(vec(op["travelMm"]))
    if op["kind"]=="rotation":
        return number(op["travelDeg"]) and op["travelDeg"]!=0
    return op["kind"]=="gravity-drop" and number(op["fallMm"]) and op["fallMm"]>0


def contact_transport(root, key, case, stage, groups, moving, missing):
    """Return the payloads a mechanism moves by contact along their own evidenced path in this case.

    The payload keeps its own signed travel. Each transporter is a mechanism group that moves in the case or
    whose stationary drive is declared. A pinned trial must record this case, payload, transporters and the
    payload members' exact start and travel, so the path is not an arbitrary animation."""
    transported=stage.get("transportedBy",{})
    require(isinstance(transported,dict),"List contact-transported payloads by group")
    covered=[]
    for payload,spec in transported.items():
        require(payload in moving and groups.get(payload,{}).get("role")=="payload"
                and payload not in stage.get("carriedWith",{}),"Identify the moving payload transported by contact")
        require(isinstance(spec,dict) and named(spec.get("basis")),"Describe how contact transports "+payload)
        transporters=names(spec.get("mechanisms"),"transporting mechanisms")
        require(all(groups.get(t,{}).get("role")=="mechanism" for t in transporters),
                "Only mechanism groups can transport a payload")
        drive=spec.get("drive",{})
        require(isinstance(drive,dict) and set(drive)<=transporters and all(named(v) for v in drive.values()),
                "Declare each transporter drive against a named transporting mechanism")
        complete=True
        for t in sorted(transporters-moving-set(drive)):
            missing.append("Declare the drive of stationary transporter "+t+" in "+key);complete=False
        evidence=spec.get("evidence")
        if not (isinstance(evidence,dict) and named(evidence.get("file")) and named(evidence.get("sha256"))):
            missing.append("Pin the contact-transport evidence for "+payload+" in "+key);continue
        trial=read(pinned(root,evidence))
        members=groups[payload]["members"]
        expected=dict(case=key,payload=payload,mechanisms=sorted(transporters),
                      moves={n:case["moves"][n] for n in members},
                      initialPose={n:case.get("initialPose",{}).get(n,[]) for n in members})
        if not isinstance(trial,dict) or trial.get("transport")!=expected:
            missing.append("Contact-transport evidence for "+payload+" in "+key+" does not record this payload path");continue
        if complete:covered.append(payload)
    return covered


def compare_premises(root, rows, plan, missing):
    require(isinstance(rows,list),"List the accepted upstream premises")
    decisions=[]
    seen=set()
    if not rows:missing.append("No upstream premise commissioned")
    for links in rows:
        accepted=read(pinned(root,links["accepted"]))
        key=accepted["id"]
        require(named(key) and key not in seen and named(accepted["scenario"]) and named(accepted["basis"])
                and accepted["phase"] in ("conceptual-design","preliminary-design") and named(accepted["unit"]),
                "Bind each premise to a unique ID, scenario, unit, upstream phase and evidence")
        seen.add(key)
        interfaces=names(accepted["interfaces"],"affected interfaces")
        require(interfaces<=plan.get("groups",{}).keys(),"Unknown group in premise dependencies")
        pinned(root,accepted["source"])
        criterion=accepted["criterion"]
        if set(criterion)=={"range"}:
            lo,hi=criterion["range"]
            require(number(lo) and number(hi) and lo<=hi,"Supply an ordered finite acceptance interval")
        else:
            require(set(criterion)=={"equals"} and named(criterion["equals"]),"Supply one categorical or numeric criterion")
        decision=dict(id=key,phase=accepted["phase"],scenario=accepted["scenario"],interfaces=sorted(interfaces),
                      unit=accepted["unit"],criterion=criterion,accepted=links["accepted"],status="unknown")
        decisions.append(decision)
        if not links.get("current"):
            missing.append("Missing current observation for "+key)
            continue
        current=read(pinned(root,links["current"]))
        require(all(current.get(k)==accepted[k] for k in ("id","scenario","unit")),"Premise observation differs in scope")
        source=read(pinned(root,current["source"]))
        require(named(current["valueField"]) and isinstance(source,dict) and current["valueField"] in source,
                "Locate the observed value in its pinned project measurement")
        value=source[current["valueField"]]
        require(value==current["value"] and type(value)==type(current["value"]), "Reported value differs from its source")
        decision.update(current=links["current"],value=value)
        if (current.get("issue")!=plan["issue"] or current.get("designSha256")!=plan["design"]["sha256"]
                or current.get("stepSha256")!=(plan.get("step") or {}).get("sha256")):
            missing.append("Earlier revision cannot resume "+key)
            continue
        if "range" in criterion:
            require(number(value),"Expected an observed finite number")
            within=lo<=value<=hi
        else:
            require(named(value),"Expected a current categorical observation")
            within=value==criterion["equals"]
        decision["status"]="within" if within else "reopen"
    return decisions


# A replayed stand-off matches its premise to within numerical noise of the resolved field point.
STANDOFF_TOLERANCE_IN=1e-6


def repeated_station_position(profile_path, saved, repeat, criterion, unit, reasons):
    """Screen every scoring attempt one actor makes at one station across the whole repeated series.

    Each attempt step must stand off within the accepted range and leave the robot footprint clear. In each
    match where the actor attempts at the station, at least one attempt must deliver a carried piece.
    Attempts that find no cargo after a supply empties count for position but not for delivery."""
    require(set(repeat)=={"profile","result","input","actor","station"} and named(repeat["actor"]) and named(repeat["station"]),
            "Name only the actor and scoring station for a station replay")
    if unit!="in" or "range" not in criterion:
        reasons.append("Station replay: needs an inch stand-off range");return False
    process=subprocess.run(["node",str(Path(__file__).with_name("rehearsal-step-pose.mjs")),str(profile_path),"--station",
                            repeat["actor"],repeat["station"]],capture_output=True,text=True,encoding="utf-8")
    require(process.returncode==0,"Station attempts did not resolve: "+process.stderr)
    poses=json.loads(process.stdout)
    if poses["profileSha256"]!=saved["profileSha256"]:return False
    lo,hi=criterion["range"]
    where=lambda a:a["match"]+" "+a["period"]+" step "+str(a["stepIndex"])
    problems=[]
    if not poses["attempts"]:problems.append("no scoring attempt by "+repeat["actor"]+" at "+repeat["station"])
    for a in poses["attempts"]:
        if a["stationKind"]!="scoring":problems.append(where(a)+" does not target a scoring station")
        elif not lo<=a["standoffIn"]<=hi:problems.append(where(a)+" stands off "+format(a["standoffIn"],".3f")+" in, outside the accepted range")
        if a["footprint"]["status"]!="clear":problems.append(where(a)+" footprint is blocked by "+str(a["footprint"]["obstacle"]))
    delivering=0
    for match in saved["matches"]:
        tries=[e for e in match["game"]["events"] if e.get("robot")==repeat["actor"] and e.get("station")==repeat["station"]
               and e.get("operation")=="attempt"]
        if tries and not any(e.get("pieces") for e in tries):
            problems.append(repeat["actor"]+" delivered no piece at "+repeat["station"]+" in "+match["id"])
        delivering+=any(e.get("pieces") for e in tries)
    if not delivering:problems.append(repeat["actor"]+" delivered no piece at "+repeat["station"]+" in the series")
    reasons.extend("Station replay: "+text for text in problems)
    return not problems


def repeated_field_input(root, repeat, value, unit, replayed, criterion=None, reasons=None):
    """Read the effective actor and program from the repeated finite field rehearsal."""
    profile_path=pinned(root,repeat["profile"])
    saved=read(pinned(root,repeat["result"]))
    key=repeat["profile"]["sha256"]
    if key not in replayed:
        process=subprocess.run(["node",str(Path(__file__).with_name("rehearsal-series.mjs")),str(profile_path)],
                               capture_output=True,text=True,encoding="utf-8")
        require(process.returncode==0,"Field repeat did not finish: "+process.stderr)
        replayed[key]=json.loads(process.stdout)
    require(saved==replayed[key] and saved["profileSha256"]==key,"Prior field result does not reproduce on its selected profile")
    if repeat["input"]=="stationPosition":
        return repeated_station_position(profile_path,saved,repeat,criterion or {},unit,[] if reasons is None else reasons)
    matches=[m for m in saved["matches"] if m["id"]==repeat["match"]]
    require(len(matches)==1,"Select one repeated match")
    robots=[r for r in matches[0]["roster"] if r["id"]==repeat["actor"]]
    require(len(robots)==1,"Select one repeated robot")
    robot=robots[0]
    if repeat["input"]=="actionDwell":
        program=robot["plans"][repeat["period"]]
        steps=read(profile_path)["rehearsal"]["programs"][program]["steps"]
        index=repeat["stepIndex"]
        require(type(index)==int and 0<=index<len(steps) and named(repeat["stepLabel"]),"Identify the timed step")
        step=steps[index]
        return unit=="s" and step["label"]==repeat["stepLabel"] and step.get("dwell",0)==value
    if repeat["input"]=="stepPosition":
        return repeated_step_position(profile_path,saved,matches[0],robot,repeat,value,unit)
    if repeat["input"]=="pickupFace":
        # The directional Field Lab models the front mouth only.
        return unit=="face" and value=="front" and bool(robot.get("intake"))
    if repeat["input"] not in ("speed","height","heading"):return False
    field=repeat["input"]
    return unit=={"speed":"in/s","height":"in","heading":"deg"}[field] and robot.get(field)==value


def repeated_step_position(profile_path, saved, match, robot, repeat, value, unit):
    """Compare a named scoring step's stand-off in the repeated profile and screen the robot footprint there."""
    index=repeat.get("stepIndex")
    require(type(index)==int and index>=0 and named(repeat.get("stepLabel")) and named(repeat.get("station"))
            and named(repeat.get("period")),"Identify the delivery step, its period and its scoring station")
    process=subprocess.run(["node",str(Path(__file__).with_name("rehearsal-step-pose.mjs")),str(profile_path),
                            match["id"],robot["id"],repeat["period"],str(index)],capture_output=True,text=True,encoding="utf-8")
    require(process.returncode==0,"Delivery step did not resolve: "+process.stderr)
    pose=json.loads(process.stdout)
    # The step resolves on the same profile bytes that produced the saved result.
    if pose["profileSha256"]!=saved["profileSha256"]:return False
    # The game records carried pieces on an attempt only from an eligible position at the station.
    delivered=any(e.get("phase")==repeat["period"] and e.get("robot")==robot["id"] and e.get("station")==repeat["station"]
                  and e.get("operation")=="attempt" and e.get("pieces") for e in match["game"]["events"])
    return (unit=="in" and number(value) and pose["label"]==repeat["stepLabel"] and pose["operation"]=="attempt"
            and pose["station"]==repeat["station"] and pose["stationKind"]=="scoring"
            and pose["footprint"]["status"]=="clear" and delivered
            and abs(pose["standoffIn"]-value)<=STANDOFF_TOLERANCE_IN)


# Fields that identify the rehearsal delivery step a held field premise was accepted on.
FIELD_STEP=("match","actor","period","stepIndex","stepLabel","station")


def held_field_input(root, before, selection, replay):
    """Return the held premise's field input, or None and the reason it cannot be established.

    A delivery-position premise accepted before fieldInput records existed may still name its rehearsal
    step in its own pinned evidence, under fieldReplay or fieldInput. Every named record must agree, name
    every step field and nothing else but an optional program and input, and identify the same step, with
    the same types, as the repeat. A named program must be the one the repeated actor runs in that period."""
    if "fieldInput" in before:return before["fieldInput"],None
    unidentified="Held premise "+before["id"]+" predates fieldInput and its evidence does not identify the step"
    if selection.get("input") not in ("stepPosition","stationPosition"):return None,unidentified
    evidence=read(pinned(root,before["source"]))
    named_steps=[{k:v for k,v in evidence[key].items() if k not in ("profile","result")}
                 for key in ("fieldReplay","fieldInput") if isinstance(evidence,dict) and isinstance(evidence.get(key),dict)]
    # A generic premise names no step; only a replay of every attempt at the station can clear it.
    if not named_steps and selection.get("input")=="stationPosition":return selection,None
    if selection.get("input")!="stepPosition":return None,unidentified
    if (not named_steps or any(step!=named_steps[0] for step in named_steps)
            or not set(FIELD_STEP)<=set(named_steps[0])<=set(FIELD_STEP)|{"program","input"}):
        return None,unidentified
    derived=named_steps[0]
    same=all(type(derived[k])==type(selection.get(k)) and derived[k]==selection.get(k) for k in set(derived)-{"program"})
    if same and "program" in derived:
        saved=read(pinned(root,replay["result"]))
        robots=[r for m in saved["matches"] if m["id"]==selection["match"] for r in m["roster"] if r["id"]==selection["actor"]]
        same=len(robots)==1 and robots[0]["plans"].get(selection["period"])==derived["program"]
    if not same:return None,"Held premise "+before["id"]+" evidence identifies a different field step"
    return selection,None


def verify_reopens(root, plan, prior, decisions, observations, missing, budget):
    """The project supplies its previously held checkpoint independently of the proposed package."""
    require(prior["schema"]=="agent-frc/preliminary-layout-result@1","Unknown parent checkpoint")
    previous_study=prior["planSha256"]
    original={d["id"]:d for d in prior["premises"]}
    current={d["id"]:d for d in decisions}
    history=[]
    replayed={}
    for hold in prior["reopen"]:
        phase,key=hold["phase"],hold["reason"]
        checked=False
        if phase=="preliminary-design" and key=="inspection-weight":
            checked=bool(budget) and budget["massStatus"]=="pass" and not missing
        elif phase=="preliminary-design" and key.startswith("voltage/"):
            checked=bool(budget) and not missing and any(row["case"]==key[len("voltage/"):] and row["status"]=="pass" for row in budget["electricalCases"])
        elif phase=="preliminary-design" and key in plan["stages"]:
            checked=set(hold["affected"])<=plan["groups"].keys() and any(row["case"]==key and row["status"]=="pass" for row in observations)
        elif key in current and key in original:
            accepted=read(pinned(root,current[key]["accepted"]))
            repeat=accepted.get("repeat")
            if isinstance(repeat,dict):
                evidence=read(pinned(root,accepted["source"]))
                before=read(pinned(root,original[key]["accepted"]))
                selection={k:v for k,v in evidence.get("fieldReplay",{}).items() if k not in ("profile","result")}
                held_input,reason=held_field_input(root,before,selection,evidence["fieldReplay"]) if selection else (None,None)
                if reason:missing.append(reason)
                checked=(bool(selection) and selection==held_input==accepted.get("fieldInput")
                         and ("fieldInput" in before or before["scenario"]==accepted["scenario"]
                              and (before["unit"]==accepted["unit"] or selection.get("input")=="stationPosition"))
                         and phase==accepted["phase"]==before["phase"] and current[key]["status"]=="within" and repeat.get("previousPlanSha256")==previous_study
                         and evidence.get("issue")==plan["issue"] and evidence.get("designSha256")==plan["design"]["sha256"]
                         and evidence.get("stepSha256")==plan["step"]["sha256"] and evidence.get("phase")==phase
                         and evidence.get("scenario")==accepted["scenario"] and evidence.get("premise")==key
                         and phase=="conceptual-design" and isinstance(evidence.get("fieldReplay"),dict)
                         and repeated_field_input(root,evidence["fieldReplay"],current[key]["value"],accepted["unit"],replayed,
                                                  accepted["criterion"],missing))
        history.append(dict(**hold,repeatVerified=checked))
        if not checked:missing.append("Repeat "+phase+" on this issue before resuming "+key)
    return history


def review(root, file, previous=None, *, write_view=False, fail_fast=False, progress=None):
    """Check one package issue. progress receives stderr-only lines; fail_fast stops at the first non-passing nominal case."""
    plan_hash=digest(file)
    plan=read(file)
    require(plan["schema"]=="agent-frc/preliminary-layout@1" and named(plan["issue"]), "Select a package issue")
    design_path=pinned(root,plan["design"])
    check=subprocess.run(["node",str(Path(__file__).with_name("design.mjs")),"validate",str(design_path)],
                         capture_output=True,text=True)
    require(check.returncode==0,"Invalid editable design: "+check.stderr)
    design=read(design_path)
    datum=plan["datum"]
    require(named(datum["name"]),"Name the common robot datum")
    proper_rotation(datum["robotToStepMm"])
    robot_frame=design["frames"]["robot"]
    missing=list(plan["missingInputs"])
    names(plan["missingInputs"],"missing inputs",empty=True)
    result=dict(schema="agent-frc/preliminary-layout-result@1",issue=plan["issue"],planSha256=plan_hash,
                design=plan["design"],designRevision=design["revision"],robotFrame=robot_frame,datum=datum,
                status="provisional",missingInputs=missing)
    narrative = plan.get("narrativeReview") or {}
    require(isinstance(narrative, dict), "Supply a narrative review record")
    if narrative.get("source"):
        pinned(root, narrative["source"])
    else:
        missing.append("Read and identify the current strategic narrative")
    objectives = narrative.get("objectives", [])
    require(isinstance(objectives, list), "List the reviewed narrative objectives")
    if not objectives:
        missing.append("Account for the narrative objectives and fallbacks")
    for row in objectives:
        require(isinstance(row, dict) and named(row.get("objective")) and named(row.get("basis")) and
                row.get("disposition") in ("represented", "open", "out-of-scope"),
                "Record each narrative objective, its disposition and basis")
        if row["disposition"] == "open":
            missing.append("Open narrative objective: " + row["objective"])
    result["narrativeReview"] = narrative
    decisions=compare_premises(root,plan.get("premises",[]),plan,missing)
    result["premises"]=decisions
    reopen=[dict(phase=d["phase"],reason=d["id"],affected=d["interfaces"]) for d in decisions if d["status"]=="reopen"]
    result["reopen"]=reopen
    if reopen:result["status"]="reopen"
    prior = read(previous) if previous else None
    if prior:
        require(prior["schema"] == "agent-frc/preliminary-layout-result@1" and prior.get("designId")==design["id"],
                "Prior checkpoint belongs to another design")
        result["previousCheckpointSha256"] = digest(previous)
    result["designId"] = design["id"]
    if not all(plan.get(k) for k in ("step","motion")):
        missing.append("Selected STEP and registered motion study required to check paths")
        if prior:
            for hold in prior["reopen"]:
                if hold not in reopen:reopen.append(hold)
            if reopen:result["status"]="reopen"
        return result
    source=pinned(root,plan["step"])
    study=read(pinned(root,plan["motion"]))
    require(study["step"]==plan["step"] and study["layoutDesignSha256"]==plan["design"]["sha256"]
            and study["layoutDatum"]==datum, "Motion study differs from the selected geometry, design or datum")
    result.update(step=plan["step"],motion=plan["motion"])
    groups=plan["groups"]
    require(isinstance(groups,dict) and groups,"Register article groups and their functions")
    roster=set()
    for key,g in groups.items():
        require(named(key) and g["role"] in ("structure","bumper","drive","battery","mechanism","payload","service","other"),
                "Name each package group and its role")
        group=names(g["members"],key)
        require(not roster & group,"An article belongs to multiple groups")
        roster.update(group)
    roles={g["role"] for g in groups.values()}
    components = plan.get("presentation", {}).get("components", {})
    require(isinstance(components, dict) and not (components.keys() - roster),
            "Component explanations must use placed member IDs")
    for member in sorted(roster):
        entry = components.get(member, {})
        require(isinstance(entry, dict), "Invalid component explanation: " + member)
        for field in ("purpose", "rationale"):
            if not named(entry.get(field)):
                missing.append("Missing component " + field + ": " + member)
    for role in sorted({"structure","bumper","drive","battery","mechanism","payload"}-roles):
        missing.append("Missing role from loaded layout: "+role)
    mounts=plan["mounts"]
    if not mounts:missing.append("No mount datums registered")
    for m in mounts:
        require(m["group"] in groups and m["on"] in roster and named(m["basis"]),"Unknown mount group, host or basis")
        vec(m["pointMm"])
    for key,g in groups.items():
        if g["role"]=="mechanism" and not any(m["group"]==key for m in mounts):
            missing.append("Missing mount datum for "+key)
    cases=study["cases"]
    by_id={c["id"]:c for c in cases}
    stages=plan["stages"]
    require(set(by_id)==set(stages) and len(by_id)==len(cases),"Commission every selected motion case exactly once")
    covered=set()
    loaded_operating=False
    for key,stage in stages.items():
        c=by_id[key]
        require(stage["purpose"] in ("operating","park","service") and c.get("stage")==stage["purpose"]
                and named(stage["allowanceBasis"]) and number(c["minGapMm"]) and c["minGapMm"]>=0,
                "Register the purpose and clearance basis for each stage")
        moving=names(stage["movingGroups"],key)
        require(moving<=groups.keys(),"Unknown moving group")
        expected=set().union(*(groups[g]["members"] for g in moving))
        require(expected==set(c["moves"]),"Incomplete moving group for "+key)
        for member,ops in c["moves"].items():
            require(ops and any(has_travel(op) for op in ops),"Missing signed travel for "+member)
        for payload,carrier in stage.get("carriedWith",{}).items():
            require(payload in moving and carrier in moving and groups[payload]["role"]=="payload"
                    and groups[carrier]["role"]=="mechanism", "Identify the moving payload and its carrier")
            attached=groups[payload]["members"]+groups[carrier]["members"]
            reference=attached[0]
            initial=c.get("initialPose",{})
            require(all(c["moves"][n]==c["moves"][reference] and initial.get(n,[])==initial.get(reference,[])
                        for n in attached), "The attached payload diverges from its carrier")
            if stage["purpose"]=="operating":loaded_operating=True
        if contact_transport(root,key,c,stage,groups,moving,missing) and stage["purpose"]=="operating":loaded_operating=True
        covered.add(stage["purpose"])
    for purpose in sorted({"operating","park","service"}-covered):
        missing.append("Unexamined stage: "+purpose)
    if not loaded_operating:missing.append("No operating path includes the moving mechanism and finite payload")
    if not any(c.get("extract") for c in cases if c.get("stage")=="service"):
        missing.append("No full service withdrawal commissioned")
    cycle = plan.get("cycle", [])
    if set(cycle) != {c["id"] for c in cases if c["stage"]!="service"} or not cycle:
        missing.append("Select the complete ordered operating and park cycle")
    else:
        from OCP.gp import gp_Trsf
        def pose(case, member, end):
            operations=case.get("initialPose",{}).get(member,[])
            if end:operations=operations+case["moves"].get(member,[])
            result=gp_Trsf()
            for operation in transforms(operations,1):result.PreMultiply(operation)
            return [result.Value(i,j) for i in (1,2,3) for j in (1,2,3,4)]
        for left,right in zip(cycle,cycle[1:]):
            for member in roster:
                before=pose(by_id[left],member,True)
                after=pose(by_id[right],member,False)
                if max(abs(a-b) for a,b in zip(before,after))>1e-7:
                    missing.append("Discontinuous cycle: "+member+" between "+left+" and "+right)
    result["cycle"]=cycle
    control=plan.get("control")
    control_id="package-displacement-control"
    if control:
        require(control_id not in by_id,"Reserved control case ID")
        nominal=by_id[control["case"]]
        displaced=control["displaced"]
        moving=control["moving"]
        shift=vec(control["offsetMm"])
        require(displaced in roster and displaced not in nominal["moves"] and moving in nominal["moves"]
                and displaced not in nominal.get("removed",{}) and any(shift)
                and named(control["basis"]), "Shift one retained stationary member against a selected moving article")
        adverse=deepcopy(nominal)
        adverse.update(id=control_id,basis=control["basis"])
        # The adverse case cannot establish a removal or inherit a nominal contact qualification.
        adverse.pop("extract",None)
        adverse.pop("intendedInterfaces",None)
        adverse.setdefault("initialPose",{}).setdefault(displaced,[]).append(dict(kind="translation",travelMm=shift))
        study=dict(study,cases=[*cases,adverse])
    else:missing.append("Missing matched displaced control")
    frames = []
    def inspect_scene(case,scene):
        if case["id"]!=control_id:frames.append(capture(case,scene))
    # The displaced control is expected to fail, so it never stops a fail-fast run. It runs last and
    # only after every nominal case passed; otherwise it is skipped and the receipt cannot be checked.
    observed=evaluate(root,study,mount_hosts={m["on"] for m in mounts},package_scene=inspect_scene,
                      progress=progress,fail_fast=fail_fast,never_stop={control_id})
    partial=observed.get("partial",False)
    if partial:
        skipped=[c for c in observed["skippedCases"] if c!=control_id]
        result.update(partial=True,stoppedAt=observed["stoppedAt"],checkedCases=observed["checkedCases"],skippedCases=skipped)
        missing.append("Partial --fail-fast run stopped at "+observed["stoppedAt"]+"; rerun without --fail-fast to check "
                       +str(len(skipped))+" skipped case(s), the displaced control, budgets and view")
        result["budgets"]=None
        result["view"]=dict(file=plan["view"],verified=False,skipped="partial --fail-fast run") if plan.get("view") else None
        if write_view and plan.get("view"):
            print("[view] Not writing "+plan["view"]+": a partial --fail-fast run cannot produce a credited player",
                  file=sys.stderr,flush=True)
    else:
        if progress:progress("[budgets] start")
        began=perf_counter()
        result["budgets"]=budget_review(root,plan,missing)
        if progress:
            b=result["budgets"]
            summary="none" if not b else "mass="+b["massStatus"]+" electrical="+(
                "fail" if any(r["status"]=="fail" for r in b["electricalCases"]) else "pass")
            progress(f"[budgets] done {summary} {perf_counter()-began:.2f}s")
        result["view"]=verify_view(root,plan,sorted(frames,key=lambda f:cycle.index(f["id"]) if f["id"] in cycle else len(cycle)),write_view, observed, result["budgets"])
        if not result["view"] or not result["view"]["verified"]:
            missing.append("Generate the matching view of these checked trajectories with --write-view")
    for m in mounts:
        box=observed["mountHostBoundsMm"].get(m["on"])
        if box is None or any(p<box[i]-1e-6 or p>box[i+3]+1e-6 for i,p in enumerate(m["pointMm"])):
            missing.append("Mount datum outside the selected host envelope: "+m["group"]+" on "+m["on"])
    fixtures={f["id"] for c in cases for f in c.get("fixtures",[])}
    require(not fixtures & set(observed["occurrences"]), "A fixture shadows an installed member")
    sources={}
    for c in cases:
        for fixture in c.get("fixtures",[]):
            selection=(fixture["file"],fixture["solid"])
            require(sources.setdefault(fixture["id"],selection)==selection,"Fixture identity changes across package cases")
        if {f["id"] for f in c.get("fixtures",[])} != fixtures:
            missing.append("Fixture roster changes without a common package scene in "+c["id"])
    actual=set(observed["occurrences"])|fixtures
    require(roster==actual,"Package roster differs from the selected STEP and fixtures")
    if observed["nonSolidLeafCount"]:missing.append("Unexamined non-solid geometry in the selected STEP")
    observations=observed["cases"]
    if control and partial:
        result["control"]=dict(case=control["case"],displaced=displaced,offsetMm=shift,witness=None,status="skipped")
    elif control:
        control_row=observations[-1]
        hit=next((r for r in control_row["pairs"] if set(r["pair"])=={moving,displaced} and r["status"]=="fail"),None)
        result["control"]=dict(case=control["case"],displaced=displaced,offsetMm=shift,witness=hit)
        if hit is None:missing.append("Matched displacement did not reject the commissioned pair")
        observations=observations[:-1]
    for links in plan.get("premises",[]):
        for ref in (links["accepted"],links.get("current")):
            if ref:pinned(root,read(pinned(root,ref))["source"])
    for c in cases:
        for ref in [*(f["file"] for f in c.get("fixtures",[])),*(e["qualifiedBy"] for e in c.get("intendedInterfaces",[]))]:
            pinned(root,ref)
    for stage in stages.values():
        for spec in stage.get("transportedBy",{}).values():
            if isinstance(spec.get("evidence"),dict) and named(spec["evidence"].get("sha256")):pinned(root,spec["evidence"])
    require(digest(source)==observed["stepSha256"]==plan["step"]["sha256"] and digest(file)==plan_hash,
            "Source or commission changed during review")
    pinned(root,plan["motion"])
    pinned(root,plan["design"])
    result.update(groups=groups,mounts=mounts,mountHostBoundsMm=observed["mountHostBoundsMm"],stages=stages,cases=observations)
    if prior:
        result["priorDecisions"]=verify_reopens(root,plan,prior,decisions,observations,missing,result["budgets"])
        for held in result["priorDecisions"]:
            item={k:v for k,v in held.items() if k!="repeatVerified"}
            if not held["repeatVerified"] and item not in reopen:reopen.append(item)
        if reopen:result["status"]="reopen"
    if any(c["status"]=="fail" for c in observations):
        for c in observations:
            if c["status"]!="fail":continue
            hits={n for row in c["pairs"] if row["status"]=="fail" for n in row["pair"]}
            affected=set(stages[c["case"]]["movingGroups"])
            affected.update(k for k,g in groups.items() if hits.intersection(g["members"]))
            reopen.append(dict(phase="preliminary-design",reason=c["case"],affected=sorted(affected)))
        result["status"]="blocked"
    elif not reopen and observations and not missing and all(c["status"]=="pass" for c in observations):result["status"]="layout-checked"
    budgets = result["budgets"]
    if budgets:
        failures = (["inspection-weight"] if budgets["massStatus"]=="fail" else [])
        failures += ["voltage/"+row["case"] for row in budgets["electricalCases"] if row["status"]=="fail"]
        for key in failures:
            reopen.append(dict(phase="preliminary-design",reason=key,affected=sorted(groups)))
        if failures:result["status"]="blocked"
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project",type=Path)
    parser.add_argument("plan")
    parser.add_argument("--write-view",action="store_true",help="Create the matching local player at the plan view path")
    parser.add_argument("--require-checked",action="store_true")
    parser.add_argument("--previous",help="Project-selected previous checkpoint, relative to the project")
    parser.add_argument("--fail-fast",action="store_true",
                        help="Stop at the first nominal case that does not pass and write a partial, never checked receipt")
    parser.add_argument("--quiet",action="store_true",help="Omit progress lines on stderr")
    args=parser.parse_args()
    try:
        root=args.project.resolve()
        result=review(root,project_path(root,args.plan),project_path(root,args.previous) if args.previous else None,
                      write_view=args.write_view,fail_fast=args.fail_fast,progress=None if args.quiet else stderr_progress)
        print(json.dumps(result,indent=2,allow_nan=False))
        sys.exit(int(args.require_checked and (result.get("partial",False) or result["status"]!="layout-checked")))
    except (KeyError,IndexError,ValueError,TypeError,OSError,RuntimeError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(2)
