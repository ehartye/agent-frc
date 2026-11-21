"""Replay a held and vertically released finite object through the installed receipt and recovery geometry."""
import argparse
import json
import math
from pathlib import Path
import sys
from mechanical_readiness import digest,named,number,pinned,project_path,read,require
from mechanical_motion import bounds,distance,evaluate,transform
from showcase_contacts import load_solids


def replay(root,study,*,motion_model=None,mission=None):
    require(study.get("schema")=="agent-frc/loaded-transfer@1" and named(study.get("id")),"Missing loaded duty")
    from transfer_trajectory import keys
    keys(study,set("schema id step piece basis gravityMmS2 traceToleranceMm cases stock".split()),"loaded study")
    keys(study["piece"],{"id","solid","file"},"admitted article")
    step=pinned(root,study["step"]);piece=study["piece"];shape=pinned(root,piece["file"])
    shapes,_=load_solids(shape)
    require(named(piece["id"]) and set(shapes)=={piece["solid"]},"Register the entire finite admitted article")
    local=bounds(shapes[piece["solid"]]);source_id=piece["id"]
    actual,_=load_solids(step)
    stock=study.get("stock",[])
    stock_ids={r["id"] for r in stock}
    require(len(stock_ids)==len(stock) and source_id not in stock_ids and not stock_ids.intersection(actual),
        "Adjacent stock must have distinct, finite, non-installed physical identities")
    stock_shapes={}
    for row in stock:
        keys(row,{"id","file","solid","offsetMm","basis"},"adjacent inventory")
        stock_shape=load_solids(pinned(root,row["file"]))[0][row["solid"]]
        stock_shapes[row["id"]]=transform(stock_shape,[dict(kind="translation",travelMm=row["offsetMm"])],1)
        require(named(row.get("basis")) and isinstance(row.get("offsetMm"),list) and len(row["offsetMm"])==3 and all(number(v) for v in row["offsetMm"]),
            "Register the source and actual placement of each retained external object")
    require(source_id not in actual,"Piece identity conflicts with an installed part")
    gravity=study["gravityMmS2"];tol=study["traceToleranceMm"]
    require(number(gravity) and gravity>0 and number(tol) and tol>=0 and named(study.get("basis")),"Missing physical trace basis")
    rows=[];types=set()
    for test in study["cases"]:
        keys(test,set("id duty execution trace windowS admissionGapMm readyOffsetsMm terminalBoundsMm interfaces maxDepth minGapMm releaseOnsets".split()),"loaded case")
        trace=read(pinned(root,test["trace"]));case=test["id"];duty=test["duty"];types.add(duty)
        require(duty in ("delivery","jam-reset") and named(case) and trace.get("stepSha256")==digest(step) and
            trace.get("pieceSha256")==digest(shape) and trace.get("pieceId")==source_id and trace.get("case")==case and
            bool(trace.get("source")),"Loaded trace identifies a different piece, case or robot")
        frames=trace["frames"];window=test["windowS"]
        require(len(frames)>=2 and window==[frames[0]["timeS"],frames[-1]["timeS"]] and all(number(v) for v in window),"Trace does not cover the registered clock")
        require(frames[0]["custody"]=="held" and named(trace.get("holder")) and trace["holder"] in actual,"Need an actual installed holder at the admitted start")
        all_keys=set(frames[0]["offsetsMm"])
        require(source_id in all_keys and all_keys<=set(actual)|{source_id},"Moving scene names unregistered bodies")
        for frame in frames:
            require(set(frame["offsetsMm"])==all_keys and all(isinstance(v,list) and len(v)==3 and all(number(n) for n in v)
                  for v in frame["offsetsMm"].values()) and number(frame["timeS"]),"Bind all moving bodies continuously at each source time")
        motion_error=None
        if motion_model is not None:
            from assembly_kinematics import check_trace
            try:check_trace(motion_model,frames)
            except (ValueError,TypeError,KeyError) as e:motion_error=str(e)
        require(set(trace.get("stockIds",[]))==stock_ids,"Remaining physical stock differs from the source trajectory")
        first=frames[0]["offsetsMm"]
        def placed(shape,offset):return transform(shape,[{"kind":"translation","travelMm":offset}],1)
        def installed_at(frame,name):
            if motion_model and motion_model.get("linked") and not motion_error:
                from linked_motion import segment_ops,coordinates
                lm=motion_model["linked"];n=lm["owners"][name]
                ops=segment_ops(lm,lm["paths"][n],lm["saved"],coordinates(motion_model,frame))
                return transform(actual[name],ops,1)
            return placed(actual[name],frame["offsetsMm"].get(name,[0,0,0]))
        def rotates_between(a,b,name):
            if not motion_model or not motion_model.get("linked") or motion_error:return False
            lm=motion_model["linked"]
            return any(lm["axes"][g][2] and abs(a["nativeCoordinates"][g]-b["nativeCoordinates"][g])>1e-10
                       for g,_ in lm["paths"][lm["owners"][name]])
        article=None
        if test.get("execution") or mission or any("articlePose" in f for f in frames):
            from rigid_article import ArticleMotion
            observed=read(pinned(root,test["execution"]))
            article=ArticleMotion(shapes[piece["solid"]],frames,observed,
                                  fixed_evidence=mission is not None and mission.get("orientationModel")=="fixed-in-saved-axes")
        def article_at(i):
            return article.at(i) if article else placed(shapes[piece["solid"]],frames[i]["offsetsMm"][source_id])
        admitted=distance(article_at(0),installed_at(frames[0],trace["holder"]))
        admission=test.get("admissionGapMm")
        require(number(admission) and admission>=0,"Freeze the measurable piece-to-holder admission gap")
        free=False;speed=0;stages=[]
        if any(f["custody"]=="guided" for f in frames):
            require(trace.get("guide") in actual and trace.get("trajectorySource") and named(trace.get("interpolationBasis")),
                "A released, guided object needs its installed guide and original executed trajectory")
            pinned(root,trace["trajectorySource"])
        for i,(a,b) in enumerate(zip(frames,frames[1:])):
            dt=b["timeS"]-a["timeS"]
            require(dt>0 and a["custody"] in ("held","free","guided","jammed","recovery","received"),"Invalid custody clock")
            initial={k:[dict(kind="translation",travelMm=v)] for k,v in a["offsetsMm"].items()}
            initial.update({r["id"]:[dict(kind="translation",travelMm=r["offsetMm"])] for r in stock})
            motion={}
            for key in all_keys:
                delta=[v-u for u,v in zip(a["offsetsMm"][key],b["offsetsMm"][key])]
                if key==source_id and a["custody"]=="free":
                    if not free:speed=0
                    fall=speed*dt+.5*gravity*dt*dt
                    require(math.hypot(delta[0],delta[1])<=1e-8 and delta[2]<=0 and abs(delta[2]+fall)<=tol,
                            "Free descent differs from the registered gravity-from-rest trace")
                    motion[key]=[dict(kind="gravity-drop",fallMm=-delta[2],quadraticFraction=min(1,.5*gravity*dt*dt/max(-delta[2],1e-15)))]
                    speed+=gravity*dt
                elif any(delta):
                    motion[key]=[dict(kind="translation",travelMm=delta)]
            if motion_model and motion_model.get("linked") and not motion_error:
                from linked_motion import geometry_segment
                installed_start,installed_moves=geometry_segment(motion_model,a,b)
                for key in actual:
                    initial.pop(key,None);motion.pop(key,None)
                initial.update(installed_start);motion.update(installed_moves)
            if article and article.rotating:
                article_start,article_moves=article.operations(i)
                if a["custody"]=="free":
                    # The rotation is about the initial center; the observed gravity law then moves that center.
                    article_moves=article_moves[:-1]+motion[source_id]
                initial[source_id]=article_start;motion[source_id]=article_moves
            if source_id not in motion:motion[source_id]=[dict(kind="translation",travelMm=[0,0,0])]
            free=a["custody"]=="free"
            exemptions=test.get("interfaces",{}).get(str(i),[])
            require(not any(set(r["pair"]) & ({source_id}|stock_ids) for r in exemptions),
                    "An intended robot mating interface cannot waive finite article or stock interference")
            stages.append(dict(id=case+"-"+str(i),basis=study["basis"],fixtures=[dict(piece,id=source_id,basis="Finite admitted piece from the trace"),*stock],
                initialPose=initial,moves=motion,checkLinearEnvelope=True,minGapMm=test.get("minGapMm",0),maxDepth=test.get("maxDepth",9),
                intendedInterfaces=exemptions))
        actual_cases=evaluate(root,dict(schema="agent-frc/mechanical-motion@1",step=study["step"],cases=stages))["cases"]
        custody=[f["custody"] for f in frames];terminal=frames[-1];region=test["terminalBoundsMm"]
        require(len(region)==6 and all(number(v) for v in region) and all(region[k]<region[k+3] for k in range(3)),
            "Register the complete terminal piece region in the CAD frame")
        at=terminal["offsetsMm"][source_id];end=bounds(article_at(len(frames)-1))
        inside=all(region[k]-tol<=end[k] and end[k+3]<=region[k+3]+tol for k in range(3))
        expected=((bool({"free","guided"}&set(custody)) and terminal["custody"]=="received") if duty=="delivery"
                  else "jammed" in custody and terminal["custody"]=="recovery" and trace.get("resetObserved") is True)
        if duty=="jam-reset":
            target=test.get("readyOffsetsMm",{})
            expected=expected and set(target)==all_keys-{source_id} and all(isinstance(v,list) and len(v)==3 and
                all(number(x) for x in v) and math.dist(v,terminal["offsetsMm"][k])<=tol for k,v in target.items())
        statuses={r["status"] for r in actual_cases}
        status="fail" if admitted>admission or "fail" in statuses or not inside or not expected else "open" if "open" in statuses else "pass"
        corridor=status
        from transfer_execution import inspect
        try:
            execution,reason=inspect(root,study,test,trace,actual,shapes[piece["solid"]],stock_shapes,installed_at=installed_at,rotates=rotates_between,mission=mission,article=article)
        except (ValueError,KeyError,OSError,TypeError) as e:
            execution,reason="fail",str(e)
        if motion_error:execution,reason="fail",motion_error
        if execution=="fail" or status=="fail":status="fail"
        elif execution!="pass":status="open"
        rows.append(dict(trajectoryEvidence=getattr(article,"trajectory_evidence",None),corridorStatus=corridor,executionStatus=execution,executionReason=reason,id=case,duty=duty,piece=source_id,admittedGapMm=admitted,windowS=window,releaseTimesS=[f["timeS"] for j,f in enumerate(frames)
            if f["custody"]=="free" and (not j or frames[j-1]["custody"]!="free")],terminalInside=inside,endBoundsMm=end,status=status,stages=actual_cases))
    require(len({x["id"] for x in rows})==len(rows),"Duplicate loaded case")
    status="fail" if any(r["status"]=="fail" for r in rows) else "open" if types!={"delivery","jam-reset"} or any(r["status"]=="open" for r in rows) else "pass"
    return {"schema":"agent-frc/loaded-transfer-result@1","id":study["id"],"installedMotionScope":"native-registered" if motion_model is not None else "standalone fixture","stepSha256":digest(step),"pieceSha256":digest(shape),"status":status,"cases":rows}


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("project",type=Path);p.add_argument("study")
    a=p.parse_args()
    try:
        root=a.project.resolve();r=replay(root,read(project_path(root,a.study)));print(json.dumps(r,indent=2,allow_nan=False));sys.exit(int(r["status"]!="pass"))
    except (KeyError,ValueError,TypeError,OSError,ImportError) as e:sys.exit(str(e))
