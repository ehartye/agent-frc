"""Create an original fixed solid in its own saved Fusion archive and collect trusted native evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import adsk.core
import adsk.fusion


def capture(app, project, installed_scripts, key, station_folder, *, moving=False):
    project=Path(project).resolve()
    project.mkdir(parents=True,exist_ok=False)
    cad=project/"cad";cad.mkdir();archive=cad/"reference.f3d"
    before=app.activeDocument;count=app.documents.count
    doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    try:
        product=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        product.designType=(adsk.fusion.DesignTypes.ParametricDesignType if moving else adsk.fusion.DesignTypes.DirectDesignType)
        manager=adsk.fusion.TemporaryBRepManager.get()
        def block(center,dimensions):
            box=adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create(*center),
                adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),*dimensions)
            return manager.createBox(box)
        plinth=block((1.0,.5,.2),(2,1,.4))
        if not manager.booleanOperation(plinth,block((1,.5,.4),(1.6 if moving else .82,.62,.4)),adsk.fusion.BooleanTypes.DifferenceBooleanType):
            raise ValueError("Could not form the locating pocket")
        insert=block((1,.5,.4),(.8,.6,.4))
        e=product.exportManager
        occurrences=[]
        for name,shape in (("Pocketed base",plinth),("Seated gauge",insert)):
            occ=product.rootComponent.occurrences.addNewComponent(adsk.core.Matrix3D.create())
            occurrences.append(occ)
            occ.component.name=name
            if moving:
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
        if moving:
            base,carriage=occurrences
            base.isGroundToParent=True
            root=product.rootComponent
            origin=adsk.fusion.JointGeometry.createByPoint(root.originConstructionPoint)
            joint_input=root.asBuiltJoints.createInput(carriage,base,origin)
            joint_input.setAsSliderJointMotion(adsk.fusion.JointDirections.XAxisJointDirection)
            joint=root.asBuiltJoints.add(joint_input);joint.name="Travel along pocket"
            limits=joint.jointMotion.slideLimits
            limits.minimumValue=0;limits.isMinimumValueEnabled=True
            limits.maximumValue=.3;limits.isMaximumValueEnabled=True
        if not e.execute(e.createFusionArchiveExportOptions(str(archive))):
            raise ValueError("Could not save the original teaching coupon")
    finally:
        doc.close(False)
        if before and before.isValid:before.activate()
    register={"schema":"agent-frc/fusion-authority@1","id":"datum-coupon","configuration":"Sliding teaching coupon" if moving else "Static teaching coupon",
        "nativeConfiguration":"unconfigured","revision":"original-r1","basis":"Original digitally qualified classroom reference artifact",
        "source":{"kind":"offline","archive":{"file":"cad/reference.f3d","sha256":hashlib.sha256(archive.read_bytes()).hexdigest()}},
        "pinnedChildren":[]}
    (cad/"fusion-authority.json").write_text(json.dumps(register,indent=2),encoding="utf-8")
    spec=importlib.util.spec_from_file_location("native_station",Path(installed_scripts)/"fusion_issue_station.py")
    station=importlib.util.module_from_spec(spec);spec.loader.exec_module(station)
    lineage=station.export_current(app,project,project/"issue",key)
    observed=station.measure_pose(app,project,project/"issue/lineage.json",project/"issue/native.json",key,station_folder)
    station.module("fusion_body_materials").capture(app,project,project/"issue/lineage.json",project/"issue/materials.json",key)
    if moving:
        station.module("fusion_joint_authority").capture(app,project,project/"issue/lineage.json",project/"issue/joints.json",key)
    if moving:
        for name,coordinate in (("home",0),("extended",.3)):
            pose={"id":name,"joints":[{"group":"carriage","type":"asBuilt","name":"Travel along pocket",
                "occurrence":"@root","coordinate":"slideValue","nativeValue":coordinate}]}
            data=station.measure_pose(app,project,project/"issue/lineage.json",project/("issue/"+name+".json"),key,station_folder,pose)
            if not data["complete"]:raise ValueError("Incomplete native moving control")
    if not observed["complete"] or app.documents.count!=count or before and app.activeDocument.creationId!=before.creationId:
        raise ValueError("Native review or original document restoration failed")
    return {"lineage":lineage,"observed":observed,"documentsRestored":True}
