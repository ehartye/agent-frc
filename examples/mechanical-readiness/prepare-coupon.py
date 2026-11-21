"""Bind the original native Fusion control to a synthetic engineering duty and produce its student model inputs."""
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
source_joints=get("issue/joints.json")
moving=any(j["coordinates"] and not j["locked"] and not j["suppressed"] for j in source_joints["joints"])
coupled=bool(source_joints["motionLinks"])
ranges={"carriage":[0,3]} if moving else {}
if coupled:ranges["companion"]=[0,3]
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
    drawing=save("issue/"+name+"-drawing.json",{"part":name,"datum":"Lower left of base, Z normal to table",
        "drawing":("20 × 24 × 4 mm base with two" if coupled else "20 × 10 × 4 mm base with centered") + " " + ("16" if moving else "8.2") + " × 6.2 × 2 mm locating pocket" if name=="Pocketed base" else "8 × 6 × 4 mm removable gauge",
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
if set(members)!=({"Pocketed base","Seated gauge","Keyed gauge"} if coupled else {"Pocketed base","Seated gauge"}):raise ValueError("Expected the original native teaching assembly")
labels=sorted(members.values());anchor=members["Pocketed base"]
seats={name:sorted([anchor,label]) for name,label in members.items() if label!=anchor}
area=min(bearing_area(*(assembly[k] for k in pair)) for pair in seats.values())
if abs(area-48)>.001:raise ValueError("Reopened seat area is not 48 square mm")
pose_files=["issue/home.json","issue/extended.json"] if moving else []
if coupled:pose_files=["issue/"+name+".json" for name in ("home","middle","extended","reset")]
poses=[dict(id="saved",joints=[])]+[get(f)["pose"] for f in pose_files]
reopen=save("issue/mapped.json",dict(binding,opened=True,transferMissions=["present-to-fixed-receiver"] if coupled else [],installedOccurrences=native,
    movingGroups=list(ranges),motionRanges=ranges,inspectionPoses=poses))
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
    if coupled:motion["cases"][0]["moves"][members["Keyed gauge"]]=[dict(kind="translation",travelMm=[3,0,0])]
    full=evaluate(root,motion)
    if full["cases"][0]["status"]!="pass":raise ValueError("Slider travel did not clear the fixed base")
    save("issue/slide-sweep.json",full)
    duties[0].update(min=3,max=3)
    obs["sweep"].update(coverage="conservatively-bounded",movingGroups=list(ranges),value=3)
    raw["sweep"].update(value=3,coverage="conservatively-bounded",motionRanges=ranges,samples=[{g:0 for g in ranges},{g:3 for g in ranges}])
else:
    obs["sweep"].update(coverage="fixed-assembly",movingGroups=[])
rawref=save("issue/values.json",dict(binding,schema="agent-frc/mechanical-measurements@1",measurements=raw))
for domain in definitions:
    m=dict(rawref,pointer="/measurements/"+domain+"/value")
    obs[domain].update(measurement=m,sources=[m,basis])
for name,pair in seats.items():
    obs["seat-"+name]=dict(kind="retained-joint",pair=pair,mechanism="Gravity-seated removable gauge in a locating pocket",
    loadPath="Gauge underside to the base floor for a downward load only",inspection="Compare actual opposing planar faces in mm²",
    interface="planar-seat",minBearingAreaMm2=45,maxInterfaceGapMm=0,verified=True,sources=[basis])
if coupled:
    key_pair=sorted([members["Seated gauge"],members["Keyed gauge"]])
    key_area=bearing_area(*(assembly[k] for k in key_pair))
    if key_area<1:raise ValueError("Integral key does not engage the second gauge")
    obs["engaged-key"]=dict(kind="retained-joint",pair=key_pair,mechanism="Integral drive key in the open-top companion keyway",
        loadPath="Opposed machined key flanks transmit either sign of horizontal drive while the base supports the weight",
        inspection="Check finite engaged key faces and retain contact throughout the issued horizontal stroke",interface="planar-seat",
        minBearingAreaMm2=1,maxInterfaceGapMm=0,verified=True,sources=[basis])
obsref=save("issue/observations.json",dict(binding,observations=obs))
for d in duties:d["observation"]=dict(obsref,id=d["id"])
study=dict(schema="agent-frc/mechanical-readiness@1",configuration=configuration,archive=lineage["archive"],step=step,
    authority=ref("cad/fusion-authority.json"),lineage=ref("issue/lineage.json"),nativeCensus=ref("issue/native.json"),
    reopen=reopen,reopenBoundsToleranceMm=.001,contactToleranceMm=.02,chassisAnchor=anchor,articles=articles,installed=installed,
    connections=[dict(pair=pair,evidence=dict(obsref,id="seat-"+name),**({"jointGroup":"companion" if name=="Keyed gauge" else "carriage"} if moving else {})) for name,pair in seats.items()],mating=[],transferClaims={},duties=duties,externalIssues=[],nativePoses=[ref(f) for f in pose_files])
study["jointAuthority"]=ref("issue/joints.json")
intent=dict(authorityId="datum-coupon",configuration=configuration,
    mode="articulated" if moving else "fixed",basis="Original teaching coupon inspected for its registered operating duty",
    motionRanges=ranges,transferMissions=[],externalIssues=[],numericalInterfaces={},
    nativeCoordinates={"carriage":dict(type="asBuilt",occurrence="@root",name="Travel along pocket",coordinate="slideValue")} if moving else {})
if coupled:
    from coupled_inspection import prepare
    transfer,mission=prepare(root,study["archive"],step,members)
    study["transferClaims"]={"present-to-fixed-receiver":transfer}
    intent["transferCriteria"]={"present-to-fixed-receiver":mission}
    intent["transferMissions"]=list(study["transferClaims"])
    study["connections"].append(dict(pair=key_pair,evidence=dict(obsref,id="engaged-key")))
    study["linkCalibration"]=ref("issue/links.json")
    identity=[1.,0,0,0,0,1.,0,0,0,0,1.,0,0,0,0,1.]
    intent["nativeCoordinates"]["companion"]=dict(type="asBuilt",occurrence="@root",name="Keyed travel",coordinate="slideValue")
    intent.update(motionLinks={"companion":dict(driver="carriage",nativeRatio=1)},linkedReferencePoses={name+":1":identity for name in members},
        coupledOperatingPaths=[["home","middle","extended","reset"]],
        landmarks={k:dict(occurrence=n+":1",body=n,localMm=pt) for k,n,pt in
            (("anchor","Pocketed base",[0,0,0]),("near","Seated gauge",[14,8,6]),("far","Keyed gauge",[14,22,6]))},
        landmarkTrials=[dict(group=g,frame="extended",anchor="anchor",tip=tip,deltaMm=[dx,0,0],toleranceMm=.0001)
            for g,tip,dx in (("carriage","near",3),("companion","far",3))])
# These are fabrication coordinates from the coupon definition, independent of as-installed readback.
width=24 if coupled else 10
datums={"Pocketed base":[[0,0,0],[20,0,0],[0,width,0]],
        "Seated gauge":[[6,2,2],[14,2,2],[6,8,2]]}
if coupled:datums["Keyed gauge"]=[[6,16,2],[14,16,2],[6,22,2]]
intent["mountDatums"]=[dict(occurrence=name+":1",toleranceMm=.001,basis="Original coupon stock datums in the assembly reference",
     features=[dict(solid=members[name],body=name,localMm=p,worldMm=p) for p in points]) for name,points in datums.items()]
loadcase="Downward teaching load on the seated gauge"
load_direction=[0,0,-1];loaded=members["Seated gauge"];base=members["Pocketed base"]
support_capacity=save("issue/support-allowable.json",dict(binding,case=loadcase,direction=load_direction,
    **{"from":loaded,"to":base},kind="bearing-compression",allowablePressureMPa=2,
    basis="Synthetic desk exercise material bearing allowance from the registered strength duty"))
intent["structuralRoutes"]={"gauge-support":dict(binding,case=loadcase,loaded=loaded,chassis=base,members=[loaded,base],
    loadN=1.,direction=load_direction,interfaces=[{"from":loaded,"to":base,"capacitySource":support_capacity}])}
plan=save("commissioning.json",dict(operatingIntent=intent))
study["operatingRequirements"]=dict(plan,pointer="/operatingIntent")
study["materialCensus"]=ref("issue/materials.json")
study["geometry"]=save("issue/geometry.json",scan(root,study))
study["coverage"]={}
for scope in ("engineering","build"):
    o=dict(kind="scope-review",scope=scope,reviewer="Original digital release exercise",basis="All measured solids under the registered synthetic desk duty",
        complete=True,bodies=labels,duties=["sweep"] if scope=="engineering" else list(definitions),sources=[basis],criteriaSha256=scope_digest(study))
    rr=save("issue/"+scope+".json",dict(binding,observations={scope:o}))
    study["coverage"][scope]=dict(rr,id=scope)
cad_dir="docs/robot/cad"
save("cad-showcase.json",dict(source=step["file"],title="Pocket and removable gauge",scope="Original native engineering teaching fixture. Load duties are simulated."))
subprocess.run([sys.executable,str(PLUGIN/"scripts/export-showcase-cad.py"),str(root)],check=True)
files=[step["file"],lineage["archive"]["file"],cad_dir+"/assembly.png",cad_dir+"/assembly.stl.gz",cad_dir+"/receipt.json"]
study["distribution"]=dict(binding,approvedBy="Digital teaching fixture",files=[dict(ref(f),scope=scope,rightsBasis="Original student-facing exercise") for f,scope in zip(files,["neutral","native","render","mesh","render"])])
if moving:
    from slider_view import write_view
    filename=cad_dir+"/carriage.glb"
    spec=write_view(root,assembly,members["Seated gauge"],3,filename,members.get("Keyed gauge"));spec["step"]=step
    proof=save("issue/published-motion.json",spec)
    files.append(filename)
    study["distribution"]["files"].append(dict(ref(filename),scope="mesh",rightsBasis="Original native fixture",meshStudy=proof))
    (root/"private").mkdir(exist_ok=True)
    adverse=write_view(root,assembly,members["Seated gauge"],5,"private/overtravel.glb",members.get("Keyed gauge"));adverse["step"]=step
    save("private/overtravel.json",adverse)
save("issue/readiness.json",study)
save("delivery.json",dict(project="mechanical-coupon",scope="Original native teaching coupon and synthetic desk duties",files=[{"path":f} for f in files]))
print("Prepared the native teaching issue. Use the private issuer with the operator's native station public key.")
