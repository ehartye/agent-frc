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
    register=authority.register_path(root)
    lineage=authority.verify(root,register,Path(lineage_file))
    archive=authority.resolve(root,authority.load(lineage_file)["archive"])
    before=app.activeDocument;count=app.documents.count
    imp=app.importManager;doc=imp.importToNewDocument(imp.createFusionArchiveImportOptions(str(archive)))
    try:
        design=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        component=design.rootComponent
        joints=[]
        joint_types={"RigidJointMotion":(),"SliderJointMotion":("slide",),"RevoluteJointMotion":("rotation",),
            "CylindricalJointMotion":("slide","rotation"),"PinSlotJointMotion":("slide","rotation"),
            "PlanarJointMotion":("primarySlide","secondarySlide","rotation"),"BallJointMotion":("pitch","roll","yaw")}
        def name(o):return o.fullPathName if o else "@root"
        def health(item):
            target=item if hasattr(item,"healthState") else item.timelineObject
            if target is None or not target.isValid:
                return "unknown"
            states=adsk.fusion.FeatureHealthStates
            for label in ("Healthy","Warning","Error","Suppressed","RolledBack","Unknown"):
                if target.healthState==getattr(states,label+"FeatureHealthState"):
                    return label.lower()
            return "unknown"
        def joint_id(j):
            return dict(type="asBuilt" if j.objectType.endswith("::AsBuiltJoint") else "joint",
                occurrence=name(j.assemblyContext),name=j.name)
        occurrences=[];local_counts={}
        for occ in [None,*list(component.allOccurrences)]:
            comp=occ.component if occ else component
            path_name=name(occ)
            if occ:
                occurrences.append(dict(path=path_name,parent=name(occ.assemblyContext),groundedToParent=occ.isGroundToParent,
                    visible=occ.isVisible,referenced=occ.isReferencedComponent,grounded=occ.isGrounded))
            local_counts[path_name]=dict(joint=comp.joints.count,asBuilt=comp.asBuiltJoints.count,
                rigidGroups=comp.rigidGroups.count,motionLinks=comp.motionLinks.count)

        for kind,collection in (("joint",component.allJoints),("asBuilt",component.allAsBuiltJoints)):
            for joint in collection:
                motion=joint.jointMotion
                members=[o.fullPathName if o else "@root" for o in (joint.occurrenceOne,joint.occurrenceTwo)]
                row=dict(type=kind,name=joint.name,occurrence=joint.assemblyContext.fullPathName if joint.assemblyContext else "@root",
                         members=members,motionType=motion.objectType,coordinates={})
                row.update(suppressed=joint.isSuppressed,locked=joint.isLocked if kind=="joint" else False,
                    lockSupported=kind=="joint",visible=joint.isVisible,health=health(joint))
                t=motion.objectType.split("::")[-1]
                row["recognized"]=t in joint_types
                for axis_name in joint_types.get(t,()):
                    attr=axis_name+"Value"
                    lim=getattr(motion,axis_name+"Limits")
                    row["coordinates"][attr]=dict(saved=getattr(motion,attr),
                        minimum=lim.minimumValue if lim.isMinimumValueEnabled else None,
                        maximum=lim.maximumValue if lim.isMaximumValueEnabled else None)
                joints.append(row)
        rigid_groups=[dict(name=g.name,occurrence=name(g.assemblyContext),suppressed=g.isSuppressed,health=health(g),
            members=[o.fullPathName for o in g.occurrences]) for g in component.allRigidGroups]
        links=[]
        for occ in [None,*list(component.allOccurrences)]:
            for local in (occ.component if occ else component).motionLinks:
                link=local.createForAssemblyContext(occ) if occ else local
                links.append(dict(name=link.name,occurrence=name(occ),suppressed=link.isSuppressed,health=health(link),
                    joints=[joint_id(link.jointOne),joint_id(link.jointTwo)]))
        result=dict(schema="agent-frc/fusion-joint-authority@2",archiveSha256=lineage["archiveSha256"],
            stepSha256=lineage["stepSha256"],collectorSha256=station.digest(Path(__file__)),joints=joints,
            occurrences=occurrences,localCounts=local_counts,rigidGroups=rigid_groups,motionLinks=links)
    finally:
        doc.close(False)
        if before and before.isValid:before.activate()
    if app.documents.count!=count:raise ValueError("Native document set changed")
    with output.open("x",encoding="utf8") as stream:json.dump(result,stream,indent=2,allow_nan=False)
    station.seal(root,output,station_key,"native-joint-authority",station.digest(register),lineage["archiveSha256"],lineage["stepSha256"])
    return result
