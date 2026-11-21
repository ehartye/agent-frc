"""Digitally present an original finite article on a keyed manual bench fixture under a horizontal duty."""
from pathlib import Path
import json

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.gp import gp_Pnt
from mechanical_readiness import digest


def prepare(root, step, members):
    root=Path(root)
    def record(name,obj):
        p=root/name;p.write_text(json.dumps(obj,indent=2,allow_nan=False),encoding="utf8")
        return dict(file=name,sha256=digest(p))
    name="issue/inspection-article.step";p=root/name
    # A separate synthetic custody article with arm length sufficient to reach both receiving rails.
    writer=STEPControl_Writer()
    writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(9.5,.75,6),1.,8.5,1.).Shape(),STEPControl_AsIs)
    writer.Write(str(p))
    from showcase_contacts import load_solids
    shapes,_=load_solids(p)
    piece=dict(id="inspection-article",solid=next(iter(shapes)),file=dict(file=name,sha256=digest(p)))
    near=members["Seated gauge"];far=members["Keyed gauge"];receiver=members["Pocketed base"];part=piece["id"]
    mass=.000067;normal=mass*9.80665
    ledger=dict(schema="agent-frc/observed-transfer-inventory@1",observed={})
    cases=[]
    for duty in ("delivery","jam-reset"):
        travel=duty=="delivery";frames=[];events=[]
        for i,t in enumerate((0,.1,.2)):
            command=15*t if travel else (1. if i==1 else 0.)
            # Prescribed constant drive speed after entry into the inspection window.
            # The matched obstruction is an ideal travel stop at the admitted position.
            x=min(command,3. if travel else 0.)
            custody=(("held","guided","received") if travel else ("held","jammed","recovery"))[i]
            frames.append(dict(timeS=t,custody=custody,nativeCoordinates=dict(carriage=x/10,companion=x/10),
                               offsetsMm={near:[x,0,0],far:[x,0,0],part:[x,0,0]}))
            destination=travel and 9.5+x>=11.8
            contacts=([dict(body=receiver,pointMm=[10+x,y,6],forceOnPieceN=[0,0,normal/2]) for y in (1.3,8.7)]
                      if destination else [dict(body=near,pointMm=[10+x,5,6],forceOnPieceN=[0,0,normal])])
            observed=dict(timeS=t,accelerationMmS2=[0,0,0],contacts=contacts)
            if destination:observed["acceptedId"]=part
            if command>x:observed.update(obstructed=True,actuator=near,commandedOffsetMm=[command,0,0])
            if not travel and i==2:observed["ready"]=x==0
            events.append(observed)
        common=dict(stepSha256=step["sha256"],pieceSha256=piece["file"]["sha256"],pieceId=part,case=duty,
            stockIds=[],holder=near,frames=frames,resetObserved=not travel)
        raw=dict(common,schema="agent-frc/observed-transfer@1",massKg=mass,centerOfMassLocalMm=[10,5,6.5],
            windowS=[0,.2],receiver=receiver,duty=duty,outcome="pass",observations=events)
        execution=record("issue/"+duty+"-execution.json",raw)
        ledger["observed"][execution["sha256"]]=dict(origin="executed-simulation",observer="Original analytic teaching fixture",
            producer="coupled_inspection.py",basis="Finite article on a level carrier and two fixed rails; prescribed constant velocity or ideal blocked drive")
        trace=dict(common,source="Original analytic presentation with equal signed keyed travel")
        if travel:trace.update(guide=near,interpolationBasis="Constant horizontal velocity and balanced vertical reactions",trajectorySource=execution)
        cases.append(dict(id=duty,duty=duty,execution=execution,trace=record("issue/"+duty+"-trace.json",trace),windowS=[0,.2],
            admissionGapMm=0,readyOffsetsMm={near:[0,0,0],far:[0,0,0]},terminalBoundsMm=[12 if travel else 9,.7,5.9,14 if travel else 11,9.3,7.1]))
    record("issue/teaching-observer.json",ledger)
    return record("issue/teaching-transfer.json",dict(schema="agent-frc/loaded-transfer@1",id="present-to-fixed-receiver",
        step=step,piece=piece,basis="Supported horizontal delivery or blocked return; no powered actuator or physical endurance claim",
        gravityMmS2=9806.65,traceToleranceMm=.000001,cases=cases))
