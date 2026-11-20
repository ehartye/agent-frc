"""Create an original two-solid tool-access exercise in a new directory. No machine or robot connection."""
from hashlib import sha256
import json
from pathlib import Path
import sys

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.STEPControl import STEPControl_AsIs,STEPControl_Writer
from OCP.gp import gp_Pnt

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"scripts"))
from showcase_contacts import load_solids
from mechanical_motion import bounds

folder=Path(sys.argv[1]).resolve()
folder.mkdir(parents=True,exist_ok=False)
out=folder/"bench.step"
writer=STEPControl_Writer()
for x,dx in [(0,10),(20,5)]:
    writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(x,0,0),dx,10.,10.).Shape(),STEPControl_AsIs)
writer.Write(str(out))
shapes=load_solids(out)[0]
tool,bracket=sorted(shapes,key=lambda n:bounds(shapes[n])[0])
step={"file":out.name,"sha256":sha256(out.read_bytes()).hexdigest()}
def store(name,value):
    (folder/name).write_text(json.dumps(value,indent=2)+"\n",encoding="utf8")
def trial(label,travel,basis):
    return {"id":label,"basis":basis,"minGapMm":.1,"moves":{tool:[{"kind":"translation","travelMm":travel}]}}
store("motion.json",{"schema":"agent-frc/mechanical-motion@1","step":step,"cases":[
    trial("through-bracket",[40,0,0],"Both endpoint poses are clear. Check the whole tool withdrawal."),
    trial("side-withdrawal",[0,20,0],"Test the alternative straight service approach.")]})
store("issue.json",{"schema":"agent-frc/mechanical-readiness@1","configuration":"Stationary teaching bench","step":step,
    "contactToleranceMm":.02,"reopenBoundsToleranceMm":.001,"chassisAnchor":bracket,"externalIssues":[],
    "articles":{},"installed":{},"connections":[],"mating":[],"duties":[],"coverage":{}})
print("Run mechanical_motion.py on motion.json; the issue.json is a deliberately incomplete model review.")
