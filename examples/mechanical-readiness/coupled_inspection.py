"""Digitally present an original finite article on a keyed manual bench fixture under a horizontal duty."""
from pathlib import Path
import json

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.gp import gp_Pnt
from mechanical_readiness import digest
from transfer_mission import identity as mission_identity


def prepare(root, archive, step, members):
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
    times={"delivery":[0,.1,.2,.275,.3],"jam-reset":[0,.1,.2]}
    from transfer_trajectory import SCHEMA
    mission=dict(trajectorySchema=SCHEMA,archiveSha256=archive["sha256"],stepSha256=step["sha256"],mode="handoff",orientationModel="fixed-in-saved-axes",
        article=dict(id=part,solid=piece["solid"],sha256=piece["file"]["sha256"]),
        donor=dict(occurrence="Seated gauge:1",body="Seated gauge",solid=near),
        recipient=dict(occurrence="Pocketed base:1",body="Pocketed base",solid=receiver),
        regionFrame="saved-root",terminalBoundsMm=[15.5,.7,5.9,18.1,9.3,7.1],
        positionToleranceMm=.000001,donorClearanceMm=1.,minRecipientWeightFraction=1.,dwellS=.025,
        cases={k:dict(duty=k,windowS=[v[0],v[-1]]) for k,v in times.items()})
    cases=[]
    for duty,clock in times.items():
        travel=duty=="delivery";frames=[];events=[]
        for i,t in enumerate(clock):
            # The admitted plate has 15 mm/s horizontal speed at entry. It coasts on level
            # fixed rails as the unloaded drive reverses. This duty claims no capture brake.
            command=min(15*t,30*(.3-t)) if travel else (1. if i==1 else 0.)
            x=max(0,command) if travel else 0.
            article_x=3.+(15*t if travel else 0.)
            custody=(("held","guided","received","received","received") if travel else ("held","jammed","recovery"))[i]
            frames.append(dict(timeS=t,custody=custody,nativeCoordinates=dict(carriage=x/10,companion=x/10),
                               offsetsMm={near:[x,0,0],far:[x,0,0],part:[article_x,0,0]}))
            destination=travel and t>=.2
            contacts=([dict(body=receiver,pointMm=[10+article_x,y,6],forceOnPieceN=[0,0,normal/2]) for y in (1.3,8.7)]
                      if destination else [dict(body=near,pointMm=[10+article_x,5,6],forceOnPieceN=[0,0,normal])])
            observed=dict(timeS=t,accelerationMmS2=[0,0,0],contacts=contacts)
            if destination:observed["acceptedId"]=part
            if command>x:observed.update(obstructed=True,actuator=near,commandedOffsetMm=[command,0,0,])
            if not travel and i==2:observed["ready"]=x==0
            events.append(observed)
        common=dict(stepSha256=step["sha256"],pieceSha256=piece["file"]["sha256"],pieceId=part,case=duty,
            stockIds=[],holder=near,frames=frames,resetObserved=not travel)
        raw=dict(common,schema="agent-frc/observed-transfer@1",massKg=mass,orientationModel="fixed-in-saved-axes",centerOfMassLocalMm=[10,5,6.5],
            windowS=[clock[0],clock[-1]],receiver=receiver,duty=duty,outcome="pass",observations=events)
        law=dict(schema=SCHEMA,errorMm=0,errorRad=0,series=[],segments=[
            dict(windowS=[a,b],center="constant-velocity",orientation="constant-orientation",installed="linear-native-coordinates")
            for a,b in zip(clock,clock[1:])])
        raw["trajectory"]=law
        execution=record("issue/"+duty+"-execution.json",raw)
        ledger["observed"][execution["sha256"]]=dict(origin="executed-simulation",observer="Original analytic teaching fixture",
            trajectorySha256=mission_identity(law),missionSha256=mission_identity(mission),producer="coupled_inspection.py",basis="Finite article on a level carrier and two fixed rails; prescribed constant velocity or ideal blocked drive")
        trace=dict(common,trajectorySha256=mission_identity(law),source="Original analytic presentation with equal signed keyed travel")
        if travel:trace.update(guide=near,interpolationBasis=SCHEMA,trajectorySource=execution)
        cases.append(dict(id=duty,duty=duty,execution=execution,trace=record("issue/"+duty+"-trace.json",trace),windowS=[clock[0],clock[-1]],
            admissionGapMm=0,readyOffsetsMm={near:[0,0,0],far:[0,0,0]},terminalBoundsMm=mission["terminalBoundsMm"] if travel else [12,.7,5.9,14,9.3,7.1]))
    record("issue/teaching-observer.json",ledger)
    return record("issue/teaching-transfer.json",dict(schema="agent-frc/loaded-transfer@1",id="present-to-fixed-receiver",
        step=step,piece=piece,basis="Supported horizontal delivery or blocked return; no powered actuator or physical endurance claim",
        gravityMmS2=9806.65,traceToleranceMm=.000001,cases=cases)),mission
