"""Bind the real two-part Fusion control to a synthetic engineering duty and produce its student model inputs."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

PLUGIN=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(PLUGIN/"scripts"))
from mechanical_readiness import digest,scan,scope_digest
from showcase_contacts import load_solids

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("project",type=Path)
args=p.parse_args()
root=args.project.resolve()

def ref(name):
    return {"file":name,"sha256":digest(root/name)}

def save(name,value):
    f=root/name;f.parent.mkdir(parents=True,exist_ok=True)
    f.write_text(json.dumps(value,indent=2,allow_nan=False)+"\n",encoding="utf8")
    return ref(name)

def get(name):
    return json.loads((root/name).read_bytes())

lineage=get("issue/lineage.json");census=get("issue/native.json")
configuration=lineage["configuration"]
moving=(root/"issue/joints.json").is_file()
binding={"configuration":configuration,"archiveSha256":lineage["archive"]["sha256"],"stepSha256":lineage["step"]["sha256"]}
step=lineage["step"];assembly=load_solids(root/step["file"])[0]
from mechanical_motion import bounds,bearing_area
boxes={key:bounds(shape) for key,shape in assembly.items()}
installed={};articles={};native=[];members={}
for physical in census["bodies"]:
    name=physical["name"]
    found=[key for key,b in boxes.items() if max(abs(x-y) for x,y in zip(b,physical["boundsMm"]))<.001]
    if len(found)!=1:raise ValueError("Cannot uniquely register the physical coupon solid")
    label=found[0];members[name]=label
    part=ref("cad/"+name+".f3d");neutral=ref("cad/"+name+".step")
    source=load_solids(root/neutral["file"])[0]
    if len(source)!=1:raise ValueError("The original coupon part must have one solid")
    drawing=save("issue/"+name+"-drawing.json",{"part":name,"datum":"Lower left of 20 × 10 mm base, Z normal to table",
        "drawing":"20 × 10 × 4 mm base with centered " + ("16" if moving else "8.2") + " × 6.2 × 2 mm locating pocket" if name=="Pocketed base" else "8 × 6 × 4 mm removable gauge",
        "grade":"Teaching Stock T; simulated process and acceptance limits","finish":"Square seat, clean face; relieve internal corners to the controlled process"})
    articles[name]=dict(id=name,kind="fabricated",model=part,neutral=neutral,revision="r1",configuration="original",
        materialGrade="Teaching Stock T (synthetic duty exercise)",drawing=drawing,rights="exact-redistribution",
        rightsBasis="Original classroom coupon and native component",shapeResolutionMm3=.000001)
    grade=dict(grade="Generic steel, modeled",basis="Original stock selection for the teaching fixture only",
        fusionMaterial="Steel",materialIds=["PrismMaterial-018"],densityKgM3=[7800,7900])
    material=save("issue/"+name+"-material.json",dict(drawing=drawing,bodyMaterials={next(iter(source)):grade}))
    articles[name].update(materialSpecification=material,materialGrade=grade["grade"])
    installed[physical["path"]]={"article":name,"transform":physical["worldTransform"]}
    native.append(dict(path=physical["path"],solids=[label],article=name,revision="r1",configuration="original",
        neutralSha256=neutral["sha256"],modelSha256=part["sha256"],editable=True,worldTransform=physical["worldTransform"],
        nativeBodyNames={label:name},worldBoundsMm={label:physical["boundsMm"]},sourceSolids={label:next(iter(source))}))
if set(members)!={"Pocketed base","Seated gauge"}:raise ValueError("Expected the original native teaching assembly")
labels=sorted(members.values());anchor=members["Pocketed base"]
area=bearing_area(*(assembly[k] for k in labels))
if abs(area-48)>.001:raise ValueError("Reopened seat area is not 48 square mm")
pose_files=["issue/home.json","issue/extended.json"] if moving else []
poses=[dict(id="saved",joints=[])]+[get(f)["pose"] for f in pose_files]
reopen=save("issue/mapped.json",dict(binding,opened=True,transferMissions=[],installedOccurrences=native,
    movingGroups=["carriage"] if moving else [],motionRanges={"carriage":[0,3]} if moving else {},inspectionPoses=poses))
basis=save("issue/teaching-duty.json",{"scope":"Original static desk fixture. The removed gauge is a separately serviced article. Keep base horizontal.",
    "qualification":"Synthetic numerical duties for exercising the release path. No robot, human-rated support or measured material property.",
    "seatAreaMm2":area,"testLoadsN":{"static":1,"shortDownwardPulse":10},"assumedCompressionModulusMPa":1000,
    "assumedCompressionLimitMPa":2,"assumedPulsedCompressionLimitMPa":.5,"assumedLifeCycles":10000,
    "pocketSideClearanceMm":.1,"simulatedWidthErrorMm":.02,"handGripProjectionMm":2})
obs={};raw={};duties=[]
definitions={
 "sweep":(0,"mm",0,0,("geometry","operatingRange","boundOrSolver","control")),
 "shop":(.1-.02,"mm",.05,None,("process","material","tool","access","datums","toleranceStack")),
 "assembly":(area,"mm2",45,None,("joint","assemblyOrder","toolApproach","retention","inspection")),
 "service":(2,"mm",1,None,("removalPath","toolAccess","replacement","reinspection")),
 "strength":(1/area,"MPa",None,2,("loadPath","loadCase","material","allowableBasis","boundary","uncertainty")),
 "stiffness":(1*4/(area*1000),"mm",None,.01,("loadPath","loadCase","displacementBudget","boundary","uncertainty")),
 "impact":(10/area,"MPa",None,.5,("contactDirection","loadCase","energyOrForceBasis","retainedFunction","uncertainty")),
 "fatigue":(100/10000,"damage",None,1,("dutySpectrum","cyclesRequired","lifeBasis","material","stressConcentration","uncertainty"))}
for domain,(value,unit,lo,hi,inputs) in definitions.items():
    raw[domain]=dict(value=value,unit=unit,subjects=labels,duty=domain,case="bounded desk exercise")
    d=dict(domain=domain,id=domain,case="bounded desk exercise",subjects=labels,basis="See the teaching-duty inputs",unit=unit)
    if lo is not None:d["min"]=lo
    if hi is not None:d["max"]=hi
    duties.append(d)
    obs[domain]=dict(kind=domain,duty=domain,case=d["case"],subjects=labels,unit=unit,value=value,
        method="Original fixed fixture geometry or explicitly synthetic load estimate",inputs={k:"Registered desk fixture and teaching-duty assumptions" for k in inputs})
if moving:
    from mechanical_motion import evaluate
    motion=dict(schema="agent-frc/mechanical-motion@1",step=step,cases=[dict(id="slide",basis="Measured native travel",
        minGapMm=0,checkLinearEnvelope=True,moves={members["Seated gauge"]:[dict(kind="translation",travelMm=[3,0,0])]})])
    full=evaluate(root,motion)
    if full["cases"][0]["status"]!="pass":raise ValueError("Slider travel did not clear the fixed base")
    save("issue/slide-sweep.json",full)
    duties[0].update(min=3,max=3)
    obs["sweep"].update(coverage="conservatively-bounded",movingGroups=["carriage"],value=3)
    raw["sweep"].update(value=3,coverage="conservatively-bounded",motionRanges={"carriage":[0,3]},samples=[{"carriage":0},{"carriage":3}])
else:
    obs["sweep"].update(coverage="fixed-assembly",movingGroups=[])
rawref=save("issue/values.json",dict(binding,schema="agent-frc/mechanical-measurements@1",measurements=raw))
for domain in definitions:
    m=dict(rawref,pointer="/measurements/"+domain+"/value")
    obs[domain].update(measurement=m,sources=[m,basis])
obs["seat"]=dict(kind="retained-joint",pair=labels,mechanism="Gravity-seated removable gauge in a locating pocket",
    loadPath="Gauge underside to the base floor for a downward load only",inspection="Compare actual opposing planar faces in mm²",
    interface="planar-seat",minBearingAreaMm2=45,maxInterfaceGapMm=0,verified=True,sources=[basis])
obsref=save("issue/observations.json",dict(binding,observations=obs))
for d in duties:d["observation"]=dict(obsref,id=d["id"])
study=dict(schema="agent-frc/mechanical-readiness@1",configuration=configuration,archive=lineage["archive"],step=step,
    authority=ref("cad/fusion-authority.json"),lineage=ref("issue/lineage.json"),nativeCensus=ref("issue/native.json"),
    reopen=reopen,reopenBoundsToleranceMm=.001,contactToleranceMm=.02,chassisAnchor=anchor,articles=articles,installed=installed,
    connections=[dict(pair=labels,evidence=dict(obsref,id="seat"))],mating=[],transferClaims={},duties=duties,externalIssues=[],nativePoses=[ref(f) for f in pose_files])
if moving:
    study["jointAuthority"]=ref("issue/joints.json")
    study["connections"][0]["jointGroup"]="carriage"
study["materialCensus"]=ref("issue/materials.json")
study["geometry"]=save("issue/geometry.json",scan(root,study))
study["coverage"]={}
for scope in ("engineering","build"):
    o=dict(kind="scope-review",scope=scope,reviewer="Original digital release exercise",basis="Two measured solids under the stated synthetic stationary duty",
        complete=True,bodies=labels,duties=["sweep"] if scope=="engineering" else list(definitions),sources=[basis],criteriaSha256=scope_digest(study))
    rr=save("issue/"+scope+".json",dict(binding,observations={scope:o}))
    study["coverage"][scope]=dict(rr,id=scope)
cad_dir="docs/robot/cad"
save("cad-showcase.json",dict(source=step["file"],title="Pocket and removable gauge",scope="Original two-part static engineering teaching fixture. Load duties are simulated."))
subprocess.run([sys.executable,str(PLUGIN/"scripts/export-showcase-cad.py"),str(root)],check=True)
files=[step["file"],lineage["archive"]["file"],cad_dir+"/assembly.png",cad_dir+"/assembly.stl.gz",cad_dir+"/receipt.json"]
study["distribution"]=dict(binding,approvedBy="Digital teaching fixture",files=[dict(ref(f),scope=scope,rightsBasis="Original student-facing exercise") for f,scope in zip(files,["neutral","native","render","mesh","render"])])
if moving:
    from slider_view import write_view
    filename=cad_dir+"/carriage.glb"
    spec=write_view(root,assembly,members["Seated gauge"],3,filename);spec["step"]=step
    proof=save("issue/published-motion.json",spec)
    files.append(filename)
    study["distribution"]["files"].append(dict(ref(filename),scope="mesh",rightsBasis="Original native fixture",meshStudy=proof))
    (root/"private").mkdir(exist_ok=True)
    adverse=write_view(root,assembly,members["Seated gauge"],5,"private/overtravel.glb");adverse["step"]=step
    save("private/overtravel.json",adverse)
save("issue/readiness.json",study)
save("delivery.json",dict(project="mechanical-coupon",scope="Original native teaching coupon and synthetic desk duties",files=[{"path":f} for f in files]))
print("Prepared the real two-part native issue. Use the private issuer with the operator's native station public key.")
