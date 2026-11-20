"""Read actual joint ownership and enabled operating limits from the registered cold Fusion archive."""
import importlib.util
import json
from pathlib import Path


def capture(app, project, lineage_file, output, station_key):
    import adsk.fusion
    root=Path(project).resolve();output=Path(output).resolve()
    if not output.is_relative_to(root) or output.exists():raise ValueError("Use a fresh project-owned native record")
    path=Path(__file__).with_name("fusion_issue_station.py")
    spec=importlib.util.spec_from_file_location("joint_station",path)
    station=importlib.util.module_from_spec(spec);spec.loader.exec_module(station)
    authority=station.module("fusion_authority")
    register=root/"cad/fusion-authority.json"
    lineage=authority.verify(root,register,Path(lineage_file))
    archive=authority.resolve(root,authority.load(lineage_file)["archive"])
    before=app.activeDocument;count=app.documents.count
    imp=app.importManager;doc=imp.importToNewDocument(imp.createFusionArchiveImportOptions(str(archive)))
    try:
        design=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        component=design.rootComponent
        joints=[]
        for kind,collection in (("joint",component.allJoints),("asBuilt",component.allAsBuiltJoints)):
            for joint in collection:
                motion=joint.jointMotion
                members=[o.fullPathName if o else "@root" for o in (joint.occurrenceOne,joint.occurrenceTwo)]
                row=dict(type=kind,name=joint.name,occurrence=joint.assemblyContext.fullPathName if joint.assemblyContext else "@root",
                         members=members,motionType=motion.objectType,coordinates={})
                for attr,limit_name in (("slideValue","slideLimits"),("rotationValue","rotationLimits")):
                    if hasattr(motion,attr):
                        lim=getattr(motion,limit_name)
                        row["coordinates"][attr]=dict(saved=getattr(motion,attr),
                            minimum=lim.minimumValue if lim.isMinimumValueEnabled else None,
                            maximum=lim.maximumValue if lim.isMaximumValueEnabled else None)
                joints.append(row)
        result=dict(schema="agent-frc/fusion-joint-authority@1",archiveSha256=lineage["archiveSha256"],
            stepSha256=lineage["stepSha256"],collectorSha256=station.digest(Path(__file__)),joints=joints,
            occurrences=[dict(path=o.fullPathName,groundedToParent=o.isGroundToParent) for o in component.allOccurrences])
    finally:
        doc.close(False)
        if before and before.isValid:before.activate()
    if app.documents.count!=count:raise ValueError("Native document set changed")
    with output.open("x",encoding="utf8") as stream:json.dump(result,stream,indent=2,allow_nan=False)
    station.seal(root,output,station_key,"native-joint-authority",station.digest(register),lineage["archiveSha256"],lineage["stepSha256"])
    return result
