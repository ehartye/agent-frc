"""Cold-observe coupled Fusion coordinates and installed occurrence poses without commanding followers."""
import importlib.util
import json
import math
from pathlib import Path


def capture(app, project, lineage_file, request, output, station_key):
    import adsk
    import adsk.fusion
    root = Path(project).resolve()
    output = Path(output).resolve()
    if not output.is_relative_to(root) or output.exists():
        raise ValueError("Choose a fresh project-owned link observation")
    spec = importlib.util.spec_from_file_location("link_station", Path(__file__).with_name("fusion_issue_station.py"))
    station = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(station)
    authority = station.module("fusion_authority")
    register = authority.register_path(root)
    issue = authority.verify(root,register,Path(lineage_file))
    archive = authority.resolve(root,authority.load(lineage_file)["archive"])
    before = app.activeDocument
    count = app.documents.count
    imp = app.importManager
    doc = imp.importToNewDocument(imp.createFusionArchiveImportOptions(str(archive)))
    try:
        design = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        comp = design.rootComponent
        def owner(j):return j.assemblyContext.fullPathName if j.assemblyContext else "@root"
        def key(j):return ("asBuilt" if j.objectType.endswith("::AsBuiltJoint") else "joint",owner(j),j.name)
        joints = {key(j):j for collection in (comp.allAsBuiltJoints,comp.allJoints) for j in collection}
        aliases = {tuple(r[k] for k in ("type","occurrence","name")):g for g,r in request["coordinates"].items()}
        if len(aliases)!=len(request["coordinates"]):raise ValueError("Ambiguous joint coordinate")
        axes = {g:(joints[k],request["coordinates"][g]["coordinate"]) for k,g in aliases.items()}
        once = list(comp.allOccurrences)
        placed={o.fullPathName:o for o in once}
        markers={}
        for name,site in request.get("landmarks",{}).items():
            occurrence=placed.get(site["occurrence"])
            if occurrence is None and site["occurrence"]!="@root":
                raise ValueError("Unknown physical landmark occurrence")
            body=(occurrence.component if occurrence else comp).bRepBodies.itemByName(site["body"])
            if body is None or not body.isSolid:
                raise ValueError("Physical landmark needs an original solid")
            matches=[v for v in body.vertices if math.dist([10*x for x in v.geometry.asArray()],site["localMm"])<1e-5]
            if not matches:
                raise ValueError("Landmark did not resolve to a vertex on the original solid: "+name)
            markers[name]=(matches[0],occurrence)
        links = []
        for occ in [None,*once]:
            for local in (occ.component if occ else comp).motionLinks:
                link=local.createForAssemblyContext(occ) if occ else local
                if link.isSuppressed:continue
                def identify(j,kind):
                    alias=aliases[key(j)]
                    expected={"slideValue":adsk.fusion.JointMotionTypes.SliderJointSlideMotionType,
                              "rotationValue":adsk.fusion.JointMotionTypes.RevoluteJointRotateMotionType}
                    if kind!=expected[axes[alias][1]]:raise ValueError("Unsupported linked joint coordinate")
                    return alias
                links.append(dict(name=link.name,occurrence=owner(link),
                    one=identify(link.jointOne,link.motionOne),two=identify(link.jointTwo,link.motionTwo),
                    valueOne=link.valueOne.value,valueTwo=link.valueTwo.value,reversed=link.isReversed,
                    healthy=link.healthState==adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState))
        followers={l["two"] for l in links}
        def frame(identifier,commands):
            for g,value in commands.items():
                if g in followers or g not in axes or not math.isfinite(value):
                    raise ValueError("Command only finite independent driver coordinates")
                joint,attr=axes[g]
                setattr(joint.jointMotion,attr,value)
                adsk.doEvents()
            transforms={"@root":[1.,0,0,0,0,1.,0,0,0,0,1.,0,0,0,0,1.]}
            for o in once:
                matrix=list(o.transform2.asArray())
                for i in (3,7,11):matrix[i]*=10
                transforms[o.fullPathName]=matrix
            sites={n:[10*x for x in (v.createForAssemblyContext(o) if o else v).geometry.asArray()]
                   for n,(v,o) in markers.items()}
            return dict(id=identifier,commands=commands,landmarks=sites,values={g:getattr(j.jointMotion,k) for g,(j,k) in axes.items()},
                        transforms=transforms)
        rows=[frame("saved",{})]
        for row in request["frames"]:
            rows.append(frame(row["id"],row["commands"]))
        result=dict(schema="agent-frc/native-link-calibration@1",archiveSha256=issue["archiveSha256"],
            stepSha256=issue["stepSha256"],collectorSha256=station.digest(Path(__file__)),coordinates=request["coordinates"],
            links=links,landmarks=request.get("landmarks",{}),frames=rows)
    finally:
        doc.close(False)
        if before and before.isValid:before.activate()
    if app.documents.count!=count:raise ValueError("Native document set changed")
    with output.open("x",encoding="utf8") as f:json.dump(result,f,allow_nan=False)
    station.seal(root,output,station_key,"native-link-calibration",station.digest(register),issue["archiveSha256"],issue["stepSha256"])
    return result
