"""Review an early loaded-mechanism layout in one registered STEP world frame."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys

from component_shape import proper_rotation
from mechanical_motion import evaluate, transforms, vec
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


def compare_premises(root, rows, plan, missing):
    require(isinstance(rows,list),"List the accepted upstream premises")
    decisions=[]
    seen=set()
    if not rows:missing.append("No upstream premise commissioned")
    for links in rows:
        accepted=read(pinned(root,links["accepted"]))
        key=accepted["id"]
        require(named(key) and key not in seen and named(accepted["scenario"]) and named(accepted["basis"])
                and accepted["phase"] in ("previsualization","package-layout") and named(accepted["unit"]),
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


def repeated_field_input(root, repeat, value, unit, replayed):
    """Read the effective actor and program from the repeated finite field rehearsal."""
    profile_path=pinned(root,repeat["profile"])
    saved=read(pinned(root,repeat["result"]))
    key=repeat["profile"]["sha256"]
    if key not in replayed:
        process=subprocess.run(["node",str(Path(__file__).with_name("rehearsal-series.mjs")),str(profile_path)],
                               capture_output=True,text=True)
        require(process.returncode==0,"Field repeat did not finish: "+process.stderr)
        replayed[key]=json.loads(process.stdout)
    require(saved==replayed[key] and saved["profileSha256"]==key,"Prior field result does not reproduce on its selected profile")
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
    if repeat["input"]=="pickupFace":
        # The directional Field Lab models the front mouth only.
        return unit=="face" and value=="front" and bool(robot.get("intake"))
    if repeat["input"] not in ("speed","height","heading"):return False
    field=repeat["input"]
    return unit=={"speed":"in/s","height":"in","heading":"deg"}[field] and robot.get(field)==value


def verify_reopens(root, plan, prior, decisions, observations, missing, budget):
    """The project supplies its previously held checkpoint independently of the proposed package."""
    require(prior["schema"]=="agent-frc/package-layout-result@1","Unknown parent checkpoint")
    previous_study=prior["planSha256"]
    original={d["id"]:d for d in prior["premises"]}
    current={d["id"]:d for d in decisions}
    history=[]
    replayed={}
    for hold in prior["reopen"]:
        phase,key=hold["phase"],hold["reason"]
        checked=False
        if phase=="package-layout" and key=="inspection-weight":
            checked=budget and budget["massStatus"]=="pass" and not missing
        elif phase=="package-layout" and key.startswith("voltage/"):
            checked=budget and not missing and any(row["case"]==key[len("voltage/"):] and row["status"]=="pass" for row in budget["electricalCases"])
        elif phase=="package-layout" and key in plan["stages"]:
            checked=set(hold["affected"])<=plan["groups"].keys() and any(row["case"]==key and row["status"]=="pass" for row in observations)
        elif key in current and key in original:
            accepted=read(pinned(root,current[key]["accepted"]))
            repeat=accepted.get("repeat")
            if isinstance(repeat,dict):
                evidence=read(pinned(root,accepted["source"]))
                before=read(pinned(root,original[key]["accepted"]))
                selection={k:v for k,v in evidence.get("fieldReplay",{}).items() if k not in ("profile","result")}
                checked=(bool(selection) and selection==before.get("fieldInput")==accepted.get("fieldInput")
                         and phase==accepted["phase"]==before["phase"] and current[key]["status"]=="within" and repeat.get("previousPlanSha256")==previous_study
                         and evidence.get("issue")==plan["issue"] and evidence.get("designSha256")==plan["design"]["sha256"]
                         and evidence.get("stepSha256")==plan["step"]["sha256"] and evidence.get("phase")==phase
                         and evidence.get("scenario")==accepted["scenario"] and evidence.get("premise")==key
                         and phase=="previsualization" and isinstance(evidence.get("fieldReplay"),dict)
                         and repeated_field_input(root,evidence["fieldReplay"],current[key]["value"],accepted["unit"],replayed))
        history.append(dict(**hold,repeatVerified=checked))
        if not checked:missing.append("Repeat "+phase+" on this issue before resuming "+key)
    return history


def review(root, file, previous=None, *, write_view=False):
    plan_hash=digest(file)
    plan=read(file)
    require(plan["schema"]=="agent-frc/package-layout@1" and named(plan["issue"]), "Select a package issue")
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
    result=dict(schema="agent-frc/package-layout-result@1",issue=plan["issue"],planSha256=plan_hash,
                design=plan["design"],designRevision=design["revision"],robotFrame=robot_frame,datum=datum,
                status="provisional",missingInputs=missing)
    decisions=compare_premises(root,plan.get("premises",[]),plan,missing)
    result["premises"]=decisions
    reopen=[dict(phase=d["phase"],reason=d["id"],affected=d["interfaces"]) for d in decisions if d["status"]=="reopen"]
    result["reopen"]=reopen
    if reopen:result["status"]="reopen"
    prior = read(previous) if previous else None
    if prior:
        require(prior["schema"] == "agent-frc/package-layout-result@1" and prior.get("designId")==design["id"],
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
    observed=evaluate(root,study,mount_hosts={m["on"] for m in mounts},package_scene=inspect_scene)
    result["view"]=verify_view(root,plan,sorted(frames,key=lambda f:cycle.index(f["id"]) if f["id"] in cycle else len(cycle)),write_view)
    if not result["view"] or not result["view"]["verified"]:
        missing.append("Generate the matching view of these checked trajectories with --write-view")
    result["budgets"]=budget_review(root,plan,missing)
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
    if control:
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
            reopen.append(dict(phase="package-layout",reason=c["case"],affected=sorted(affected)))
        result["status"]="blocked"
    elif not reopen and observations and not missing and all(c["status"]=="pass" for c in observations):result["status"]="layout-checked"
    budgets = result["budgets"]
    if budgets:
        failures = (["inspection-weight"] if budgets["massStatus"]=="fail" else [])
        failures += ["voltage/"+row["case"] for row in budgets["electricalCases"] if row["status"]=="fail"]
        for key in failures:
            reopen.append(dict(phase="package-layout",reason=key,affected=sorted(groups)))
        if failures:result["status"]="blocked"
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project",type=Path)
    parser.add_argument("plan")
    parser.add_argument("--write-view",action="store_true",help="Create the matching local player at the plan view path")
    parser.add_argument("--require-checked",action="store_true")
    parser.add_argument("--previous",help="Project-selected previous checkpoint, relative to the project")
    args=parser.parse_args()
    try:
        root=args.project.resolve()
        result=review(root,project_path(root,args.plan),project_path(root,args.previous) if args.previous else None, write_view=args.write_view)
        print(json.dumps(result,indent=2,allow_nan=False))
        sys.exit(int(args.require_checked and result["status"]!="layout-checked"))
    except (KeyError,IndexError,ValueError,TypeError,OSError,RuntimeError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(2)
