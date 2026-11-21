"""Create an original fixed solid in its own saved Fusion archive and collect trusted native evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import adsk.core
import adsk.fusion


def capture(app, project, installed_scripts, key, station_folder, *, moving=False, rigid=False, coupled=False):
    moving=moving or coupled
    project=Path(project).resolve()
    project.mkdir(parents=True,exist_ok=False)
    cad=project/"cad";cad.mkdir();archive=cad/"reference.f3d"
    before=app.activeDocument;count=app.documents.count
    doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    try:
        product=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        product.designType=(adsk.fusion.DesignTypes.ParametricDesignType if moving or rigid else adsk.fusion.DesignTypes.DirectDesignType)
        manager=adsk.fusion.TemporaryBRepManager.get()
        def block(center,dimensions):
            box=adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create(*center),
                adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),*dimensions)
            return manager.createBox(box)
        plinth=block((1.0,1.2 if coupled else .5,.2),(2,2.4 if coupled else 1,.4))
        if not manager.booleanOperation(plinth,block((1,.5,.4),(1.6 if moving else .82,.62,.4)),adsk.fusion.BooleanTypes.DifferenceBooleanType):
            raise ValueError("Could not form the locating pocket")
        insert=block((1,.5,.4),(.8,.6,.4))
        articles=[("Pocketed base",plinth),("Seated gauge",insert)]
        if coupled:
            if not manager.booleanOperation(plinth,block((1,1.9,.4),(1.6,.62,.4)),adsk.fusion.BooleanTypes.DifferenceBooleanType):
                raise ValueError("Could not form the second locating pocket")
            # Fixed receiver rails flank the first slider. A broad inspection article can be
            # supported at both edges by the base when the opposing gauges reach their stops.
            for y in (.13,.87):
                rail=block((1.49,y,.45),(.62,.1,.30))
                if not manager.booleanOperation(plinth,rail,adsk.fusion.BooleanTypes.UnionBooleanType):
                    raise ValueError("Could not join the fixed receiver rail to the base")
            other_gauge=block((1,1.9,.4),(.8,.6,.4))
            # The first gauge carries an integral lateral key. Its engaged vertical faces
            # carry horizontal force into the second gauge in either direction.
            drive_key=block((.7,1.18,.50),(.10,1.40,.12))
            if not manager.booleanOperation(insert,drive_key,adsk.fusion.BooleanTypes.UnionBooleanType):
                raise ValueError("Could not form the integral carriage key")
            if not manager.booleanOperation(other_gauge,block((.7,1.715,.56),(.10,.34,.28)),adsk.fusion.BooleanTypes.DifferenceBooleanType):
                raise ValueError("Could not form the second gauge keyway")
            articles.append(("Keyed gauge",other_gauge))
        e=product.exportManager
        occurrences=[]
        for name,shape in articles:
            occ=product.rootComponent.occurrences.addNewComponent(adsk.core.Matrix3D.create())
            occurrences.append(occ)
            occ.component.name=name
            if moving or rigid:
                feature=occ.component.features.baseFeatures.add()
                feature.startEdit()
                body=occ.component.bRepBodies.add(shape,feature)
                body.name=name
                feature.finishEdit()
            else:
                body=occ.component.bRepBodies.add(shape);body.name=name
            if not e.execute(e.createFusionArchiveExportOptions(str(cad/(name+".f3d")),occ.component)) or not e.execute(
                    e.createSTEPExportOptions(str(cad/(name+".step")),occ.component)):
                raise ValueError("Could not export the original made part")
        if moving or rigid:
            base,carriage=occurrences[:2]
            base.isGroundToParent=True
            root=product.rootComponent
            origin=adsk.fusion.JointGeometry.createByPoint(root.originConstructionPoint)
            joint_input=root.asBuiltJoints.createInput(carriage,base,origin)
            if moving:
                joint_input.setAsSliderJointMotion(adsk.fusion.JointDirections.XAxisJointDirection)
            else:joint_input.setAsRigidJointMotion()
            joint=root.asBuiltJoints.add(joint_input)
            joint.name="Travel along pocket" if moving else "Fixed gauge"
            if moving:
                limits=joint.jointMotion.slideLimits
                limits.minimumValue=0;limits.isMinimumValueEnabled=True
                limits.maximumValue=.3;limits.isMaximumValueEnabled=True
            if coupled:
                other_input=root.asBuiltJoints.createInput(occurrences[2],base,origin)
                other_input.setAsSliderJointMotion(adsk.fusion.JointDirections.XAxisJointDirection)
                other=root.asBuiltJoints.add(other_input);other.name="Keyed travel"
                limits=other.jointMotion.slideLimits
                limits.minimumValue=0;limits.isMinimumValueEnabled=True
                limits.maximumValue=.3;limits.isMaximumValueEnabled=True
                link=root.motionLinks.createInput(joint,other)
                link.valueOne=adsk.core.ValueInput.createByString("1 mm")
                link.valueTwo=adsk.core.ValueInput.createByString("1 mm")
                link.isReversed=False
                root.motionLinks.add(link).name="Keyed travel relation"
        if not e.execute(e.createFusionArchiveExportOptions(str(archive))):
            raise ValueError("Could not save the original teaching coupon")
    finally:
        doc.close(False)
        if before and before.isValid:before.activate()
    register={"schema":"agent-frc/fusion-authority@1","id":"datum-coupon","configuration":"Keyed teaching coupon" if coupled else "Sliding teaching coupon" if moving else "Static teaching coupon",
        "nativeConfiguration":"unconfigured","revision":"original-r1","basis":"Original digitally qualified classroom reference artifact",
        "source":{"kind":"offline","archive":{"file":"cad/reference.f3d","sha256":hashlib.sha256(archive.read_bytes()).hexdigest()}},
        "pinnedChildren":[]}
    (cad/"fusion-authority.json").write_text(json.dumps(register,indent=2),encoding="utf-8")
    spec=importlib.util.spec_from_file_location("native_station",Path(installed_scripts)/"fusion_issue_station.py")
    station=importlib.util.module_from_spec(spec);spec.loader.exec_module(station)
    lineage=station.export_current(app,project,project/"issue",key)
    observed=station.measure_pose(app,project,project/"issue/lineage.json",project/"issue/native.json",key,station_folder)
    station.module("fusion_body_materials").capture(app,project,project/"issue/lineage.json",project/"issue/materials.json",key)
    station.module("fusion_joint_authority").capture(app,project,project/"issue/lineage.json",project/"issue/joints.json",key)
    if moving:
        targets=(("home",0),("middle",.15),("extended",.3),("reset",0)) if coupled else (("home",0),("extended",.3))
        for name,coordinate in targets:
            pose={"id":name,"joints":[{"group":"carriage","type":"asBuilt","name":"Travel along pocket",
                "occurrence":"@root","coordinate":"slideValue","nativeValue":coordinate}]}
            data=station.measure_pose(app,project,project/"issue/lineage.json",project/("issue/"+name+".json"),key,station_folder,pose)
            if not data["complete"]:raise ValueError("Incomplete native moving control")
        if coupled:
            coords={g:dict(type="asBuilt",occurrence="@root",name=n,coordinate="slideValue") for g,n in
                    (("carriage","Travel along pocket"),("companion","Keyed travel"))}
            sites={k:dict(occurrence=n+":1",body=n,localMm=p) for k,n,p in
                   (("anchor","Pocketed base",[0,0,0]),("near","Seated gauge",[14,8,6]),("far","Keyed gauge",[14,22,6]))}
            request=dict(coordinates=coords,landmarks=sites,frames=[dict(id=name,commands={"carriage":v}) for name,v in targets])
            station.module("fusion_link_calibration").capture(app,project,project/"issue/lineage.json",request,project/"issue/links.json",key)
    if not observed["complete"] or app.documents.count!=count or before and app.activeDocument.creationId!=before.creationId:
        raise ValueError("Native review or original document restoration failed")
    return {"lineage":lineage,"observed":observed,"documentsRestored":True}
