"""Generate a synthetic gravity handoff and loaded shutter fault for the installed transfer checker."""
import argparse
import json
import math
from pathlib import Path
import sys

SCRIPTS=Path(__file__).resolve().parents[2]/"scripts"
sys.path.insert(0,str(SCRIPTS))
from mechanical_readiness import digest


def pin(root,name):
    return {"file":name,"sha256":digest(root/name)}


def write(root,name,value):
    (root/name).write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8")
    return pin(root,name)


def generate(folder):
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
    from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
    from OCP.gp import gp_Pnt
    from mechanical_motion import bounds
    from showcase_contacts import load_solids
    root=folder/"candidate";root.mkdir(parents=True,exist_ok=False)
    def shapes(file,boxes):
        writer=STEPControl_Writer()
        for xyz,dims in boxes:writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(*xyz),*dims).Shape(),STEPControl_AsIs)
        writer.Write(str(root/file))
        return pin(root,file),load_solids(root/file)[0]
    step,body=shapes("shutters.step",[((0,0,7),(.5,1,1)),((.5,0,7),(.5,1,1)),((0,0,-1),(1,1,1))])
    floor,left,right=sorted(body,key=lambda k:(bounds(body[k])[2],bounds(body[k])[0]))
    file,piece=shapes("object.step",[((0,0,8),(1,1,1))])
    piece_id="object";g=9806.65;mass=.1;weight=mass*g/1000
    study=dict(schema="agent-frc/loaded-transfer@1",id="gravity",step=step,basis="Symmetric loaded shutters",
        gravityMmS2=g,traceToleranceMm=1e-6,piece=dict(id=piece_id,file=file,solid=next(iter(piece))),cases=[])
    trusted={"schema":"agent-frc/observed-transfer-inventory@1","observed":{}}
    def frame(t,state,opening=0,z=0):
        return dict(timeS=t,custody=state,offsetsMm={left:[-opening,0,0],right:[opening,0,0],piece_id:[0,0,z]})
    def observation(f):
        state=f["custody"];rows=[]
        if state not in ("free","received"):
            for member,x in ((left,.25),(right,.75)):
                rows.append(dict(body=member,pointMm=[x,.5,8],forceOnPieceN=[0,0,weight/2]))
        elif state=="received":
            rows.append(dict(body=floor,pointMm=[.5,.5,0],forceOnPieceN=[0,0,weight]))
        return dict(timeS=f["timeS"],accelerationMmS2=[0,0,0],contacts=rows)
    for duty in ("delivery","jam-reset"):
        time=.1+math.sqrt(16/g)
        frames=([frame(0,"held"),frame(.1,"free",.5),frame(time,"received",.5,-8)] if duty=="delivery" else
                [frame(0,"held"),frame(.05,"jammed"),frame(.1,"recovery")])
        obs=[observation(f) for f in frames];running=duty=="delivery"
        if running:
            obs[-1]["acceptedId"]=piece_id
            for contact,x in zip(obs[0]["contacts"],(0,1)):
                contact["nextPointMm"]=[x,.5,8]
        else:
            obs[1].update(obstructed=True,actuator=left,commandedOffsetMm=[-.5,0,0])
            obs[-1]["ready"]=True
        common=dict(stepSha256=step["sha256"],pieceSha256=file["sha256"],pieceId=piece_id,case=duty,stockIds=[],
            holder=left,frames=frames,resetObserved=not running)
        execution=write(root,duty+"-observed.json",dict(common,schema="agent-frc/observed-transfer@1",massKg=mass,
            centerOfMassLocalMm=[.5,.5,8.5],windowS=[0,frames[-1]["timeS"]],receiver=floor,duty=duty,
            outcome="pass",observations=obs))
        trusted["observed"][execution["sha256"]]=dict(origin="executed-simulation",observer="Teaching fixture",
            producer="Analytical gravity and static two-support reactions",basis="Two equal and opposite opening strokes")
        study["cases"].append(dict(id=duty,duty=duty,trace=write(root,duty+"-trace.json",dict(common,source="Observed fixture")),
            execution=execution,windowS=[0,frames[-1]["timeS"]],admissionGapMm=0,readyOffsetsMm={left:[0,0,0],right:[0,0,0]},
            terminalBoundsMm=([-1,-1,-1,2,2,2] if running else [-1,-1,7,2,2,10])))
    ledger=folder/"observations.json";ledger.write_text(json.dumps(trusted))
    write(root,"study.json",study)
    return root,study,ledger


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("new_folder",type=Path)
    args=parser.parse_args()
    root,_,ledger=generate(args.new_folder.resolve())
    print("Candidate",root)
    print("Synthetic observed execution register",ledger)
