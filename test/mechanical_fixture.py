"""Bounded synthetic evidence for release-gate tests. Never used as a student robot issue."""
import json
from pathlib import Path
import sys
import zipfile
from hashlib import sha256

SCRIPTS=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(SCRIPTS))
from mechanical_readiness import digest, review, scope_digest,scan


def write(root,name,data):
    file=root/name
    file.parent.mkdir(exist_ok=True,parents=True)
    file.write_text(json.dumps(data,indent=2)+"\n",encoding="utf-8")
    return pin(root,name)


def pin(root,name):
    return {"file":name,"sha256":digest(root/name)}


def fixture(root,source="fixture.step",assets=(),archive_name="test.f3d", measured=None):
    if not (root/source).exists():
        (root/source).write_text("ISO-10303-21; synthetic unit test input",encoding="ascii")
    if not (root/archive_name).exists():
        with zipfile.ZipFile(root/archive_name,"w") as file:
            file.writestr("FusionAssetName/Manifest.xml","Synthetic reopen receipt for a unit test")
    native=pin(root,archive_name)
    step=pin(root,source)
    bind=dict(archiveSha256=native["sha256"],stepSha256=step["sha256"],configuration="Registered test issue")
    poses=[[1,0,0,i*10,0,1,0,0,0,0,1,0,0,0,0,1] for i in range(2)]
    labels=["frame","block"]
    boxes={"frame":[0,0,0,10,10,10],"block":[10,0,0,20,10,10]}
    if measured:
        boxes=measured["bodies"]
        labels=sorted(boxes,key=lambda n:boxes[n][0])
        require_two=len(labels)==2
        assert require_two
    if measured:
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.STEPControl import STEPControl_AsIs,STEPControl_Writer
        from showcase_contacts import load_solids
        official=root/"original.step"
        writer=STEPControl_Writer()
        writer.Transfer(BRepPrimAPI_MakeBox(10.,10.,10.).Shape(),STEPControl_AsIs)
        writer.Write(str(official))
        source_label=next(iter(load_solids(official)[0]))
        for i,b in enumerate(labels):
            poses[i][3]=round(boxes[b][0],5)
    else:
        (root/"original.step").write_text("synthetic test component",encoding="ascii")
        source_label="original"
    neutral=pin(root,"original.step")
    geom=measured or dict(schema="agent-frc/step-solid-intersections@1",method="placed-step-distance-and-common-volume",
        units="mm",stepSha256=step["sha256"],toleranceMm=.02,bodies=boxes,nonSolidLeaves=[],pairs=[["block","frame",0,0]])
    geom["seatAreasMm2"]=[dict(pair=sorted(labels),area=100)]
    geom["componentDifferences"]={b:dict(absentMm3=0,extraMm3=0) for b in labels}
    geometry=write(root,"test-geometry.json",geom)
    drawing=write(root,"test-drawing.json",{"fictional":"machining and spacer proof"})
    bought=neutral
    native_rows=[dict(path=b,solids=[b],article=("frame","block")[i],revision="r1",configuration="A",worldTransform=poses[i],
        worldBoundsMm={b:box},nativeBodyNames={b:b},sourceSolids={b:source_label},neutralSha256=neutral["sha256"],modelSha256=(native if i==0 else bought)["sha256"],editable=i==0) for i,b in enumerate(labels) for box in [boxes[b]]]
    poses_to_check=[dict(id="saved",joints=[]),dict(id="extension",joints=[dict(group="slide",type="joint",name="slide",occurrence="@root",coordinate="slideValue",nativeValue=1)])]
    reopened=write(root,"test-reopen.json",dict(**bind,opened=True,transferMissions=[],movingGroups=["slide"],inspectionPoses=poses_to_check,motionRanges={"slide":[0,10]},installedOccurrences=native_rows))
    base=dict(shapeResolutionMm3=.000001,neutral=neutral,revision="r1",configuration="A",rights="exact-redistribution",rightsBasis="Original test data.")
    articles={"frame":dict(**base,id="frame",kind="fabricated",materialGrade="Synthetic grade",model=native,drawing=drawing),
              "block":dict(**base,id="block",kind="purchased",manufacturer="Original teaching vendor",partNumber="Test B",
                manufacturerSource="Original test catalog",representation="official-exact",model=bought)}
    spec=dict(schema="agent-frc/vendor-configuration@1",manufacturer="Original teaching vendor",partNumber="Test B",configuration="A",
        revision="r1",issued="Initial teaching issue",authority="Original synthetic supplier",sources=[drawing],
        items=[dict(position="guide",partNumber="test guide",revision="r1",quantity=1)])
    articles["block"].update(procurementBom=write(root,"ordered.json",dict(spec,role="selected-purchase")),
        asDrawnBom=write(root,"as-drawn.json",dict(spec,role="as-drawn",modelSha256=bought["sha256"])))
    domains={"sweep":("geometry","operatingRange","boundOrSolver","control"),"shop":("process","material","tool","access","datums","toleranceStack"),
        "assembly":("joint","assemblyOrder","toolApproach","retention","inspection"),
        "service":("removalPath","toolAccess","replacement","reinspection"),
        "strength":("loadPath","loadCase","material","allowableBasis","boundary","uncertainty"),
        "stiffness":("loadPath","loadCase","displacementBudget","boundary","uncertainty"),
        "impact":("contactDirection","loadCase","energyOrForceBasis","retainedFunction","uncertainty"),
        "fatigue":("dutySpectrum","cyclesRequired","lifeBasis","material","stressConcentration","uncertainty")}
    raw_rows={d:dict(value=.75,duty=d,case="adverse",unit="ratio",subjects=labels) for d in domains}
    raw_rows["sweep"].update(motionRanges={"slide":[0,10]},coverage="conservatively-bounded")
    raw=write(root,"test-raw.json",{**bind,"schema":"agent-frc/mechanical-measurements@1","measurements":raw_rows,"synthetic":True})
    observations={"joint":{"kind":"retained-joint","pair":labels,"mechanism":"captive guide","inspection":"seated fastener",
        "loadPath":"guide to fixed plate","verified":True,"maxInterfaceGapMm":.1,"interface":"planar-seat","minBearingAreaMm2":20,"sources":[drawing]}}
    duties=[]
    for domain,inputs in domains.items():
        measurement={**raw,"pointer":"/measurements/"+domain+"/value"}
        observations[domain]=dict(kind=domain,subjects=labels,case="adverse",duty=domain,unit="ratio",value=.75,
            method="Synthetic indexed comparison",measurement=measurement,sources=[measurement],inputs={k:"Original synthetic case" for k in inputs})
        if domain=="sweep":
            observations[domain].update(coverage="conservatively-bounded",movingGroups=["slide"])
        duties.append(dict(domain=domain,id=domain,subjects=labels,case="adverse",basis="Test comparator",unit="ratio",max=1))
    for scope in ["build","engineering"]:
        observations[scope]=dict(kind="scope-review",scope=scope,reviewer="Fixture independent observer",basis="Complete fixture inventory",
            complete=True,bodies=list(boxes),duties=list(domains) if scope=="build" else ["sweep"],sources=[drawing])
    scopes={k:observations.pop(k) for k in ("build","engineering")}
    obs=write(root,"test-observations.json",dict(**bind,observations=observations))
    for row in duties:
        row["observation"]={**obs,"id":row["domain"]}
    release=[]
    for file in set([*assets,archive_name,source]):
        scope="native" if file==archive_name else "neutral" if file==source else "mesh" if file.endswith((".gz",".glb")) else "render"
        release.append({**pin(root,file),"scope":scope,"rightsBasis":"Original synthetic fixture"})
    study=dict(schema="agent-frc/mechanical-readiness@1",configuration=bind["configuration"],archive=native,step=step,geometry=geometry,
        contactToleranceMm=.02,reopenBoundsToleranceMm=.001,reopen=reopened,chassisAnchor=labels[0],articles=articles,
        installed={b:dict(article=("frame","block")[i],transform=poses[i]) for i,b in enumerate(labels)},
        connections=[dict(pair=sorted(labels),evidence={**obs,"id":"joint"})],mating=[],duties=duties,
        coverage={s:{**obs,"id":s} for s in ("build","engineering")},
        distribution={**bind,"approvedBy":"Test observer","files":release})
    study["nativeCensus"]=write(root,"test-census.json",{"schema":"agent-frc/fusion-body-census@1","archiveSha256":native["sha256"],
        "programSha256":digest(SCRIPTS/"fusion_issue_inventory.py"),"fusionVersion":"synthetic test","otherGeometry":[],
        "bodies":[dict(path=b,name=b,revision="r1",bodyLight=True,occurrenceVisible=True,worldTransform=poses[i],boundsMm=boxes[b])
            for i,b in enumerate(labels)]})
    census=json.loads((root/"test-census.json").read_bytes())
    for b in census["bodies"]:b.update(visible=True,worldVertexErrorMm=0)
    census.update(documentId="fixture",rootComponentId="frame",rootRevision="r1",pose=poses_to_check[0],
        contacts={"method":"native paired test","units":"mm3","candidatePairs":1,"complete":True,"programSha256":digest(SCRIPTS/"fusion_issue_contacts.py"),
                  "pairs":[dict(pair=[0,1],interferenceMm3=geom["pairs"][0][3],temporaryCommonMm3=geom["pairs"][0][3])]})
    study["nativeCensus"]=write(root,"test-census.json",census)
    alternate=json.loads(json.dumps(census));alternate["pose"]=poses_to_check[1]
    moving=alternate["bodies"][1];moving["worldTransform"][3]+=10
    for index in (0,3):moving["boundsMm"][index]+=10
    a,b=(r["boundsMm"] for r in alternate["bodies"])
    nearby=all(min(a[k+3],b[k+3])-max(a[k],b[k])>=-1e-6 for k in range(3))
    alternate["contacts"]["candidatePairs"]=int(nearby)
    alternate["contacts"]["pairs"]=[dict(pair=[0,1],interferenceMm3=0,temporaryCommonMm3=0)] if nearby else []
    study["nativePoses"]=[write(root,"test-extended.json",alternate)]
    study["connections"][0]["jointGroup"]="slide"
    study["jointAuthority"]=write(root,"test-native-joints.json",dict(schema="agent-frc/fusion-joint-authority@2",
        archiveSha256=native["sha256"],stepSha256=step["sha256"],collectorSha256=digest(SCRIPTS/"fusion_joint_authority.py"),
        occurrences=[dict(path=b,parent="@root",groundedToParent=i==0) for i,b in enumerate(labels)],
        localCounts={p:dict(joint=int(p=="@root"),asBuilt=0,rigidGroups=0,motionLinks=0) for p in ["@root",*labels]},
        rigidGroups=[],motionLinks=[],joints=[dict(motionType="SliderJointMotion",health="healthy",suppressed=False,locked=False,recognized=True,type="joint",name="slide",occurrence="@root",members=labels,coordinates={"slideValue":dict(saved=0,minimum=0,maximum=1)})]))
    authority=write(root,"cad/fusion-authority.json",dict(schema="agent-frc/fusion-authority@1",id="bench",revision="r1",basis="Teaching fixture",
        configuration=bind["configuration"],nativeConfiguration="unconfigured",source=dict(kind="offline",archive=native)))
    study.update(authority=authority,lineage=write(root,"test-lineage.json",dict(schema="agent-frc/fusion-export-lineage@1",archive=native,step=step,
        authority=authority,id="bench",revision="r1",configuration=bind["configuration"],nativeConfiguration="unconfigured",exporterSha256=digest(SCRIPTS/"fusion_authority.py"),
        inspectedAt="captured test",dirty=False,externalReferences=[],policy="registered-offline-archive")))
    study["operatingRequirements"]={**write(root,"fixture-commissioning.json",dict(operatingIntent=dict(authorityId="bench",configuration=bind["configuration"],
        mode="articulated",basis="Independent fixture travel requirement",motionRanges={"slide":[0,10]},
        nativeCoordinates={"slide":dict(type="joint",occurrence="@root",name="slide",coordinate="slideValue")},transferMissions=[],externalIssues=[]))),"pointer":"/operatingIntent"}
    study["transferClaims"]={}
    study["externalIssues"]=[]
    if measured:
        geom=scan(root,study)
        study["geometry"]=write(root,"test-geometry.json",geom)
    grade=dict(grade="Synthetic grade",basis="Original test drawing",fusionMaterial="Stock A",materialIds=["stock-a"],densityKgM3=[900,1100])
    bought_bom=articles["block"]["procurementBom"]["file"]
    purchase=json.loads((root/bought_bom).read_bytes());purchase["bodyMaterials"]={source_label:grade}
    articles["block"]["procurementBom"]=write(root,bought_bom,purchase)
    articles["frame"]["materialSpecification"]=write(root,"stock.json",dict(drawing=drawing,bodyMaterials={source_label:grade}))
    study["materialCensus"]=write(root,"materials.json",dict(schema="agent-frc/fusion-body-materials@1",archiveSha256=native["sha256"],
        stepSha256=step["sha256"],bodies=[dict(path=b,name=b,materialName="Stock A",materialId="stock-a",volumeCm3=1,massKg=.001) for b in labels]))
    fingerprint=scope_digest(study)
    for v in scopes.values():
        v["criteriaSha256"]=fingerprint
    signed=write(root,"test-scope.json",dict(**bind,observations=scopes))
    study["coverage"]={k:{**signed,"id":k} for k in scopes}
    write(root,"test-readiness.json",study)
    return study


if __name__=="__main__":
    root=Path(sys.argv[1])
    source=sys.argv[2]
    archive=sys.argv[3]
    fixture(root,source,sys.argv[4:],archive)
