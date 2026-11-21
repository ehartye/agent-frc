"""Cold inventory and export of an explicitly chosen set of solid-bearing Fusion leaf occurrences."""
import hashlib
import json
from collections import Counter
from pathlib import Path


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream,"sha256").hexdigest()


def save(file, value):
    with file.open("x",encoding="utf8",newline="\n") as stream:
        json.dump(value,stream,indent=2,allow_nan=False)
        stream.write("\n")


def body_rows(component):
    result={}
    if component.occurrences.count or component.meshBodies.count:
        raise ValueError("Select each complete solid-bearing leaf occurrence")
    for body in component.bRepBodies:
        if not body.isSolid or body.name in result:
            raise ValueError("Unexpected non-solid or ambiguous body")
        box=body.preciseBoundingBox
        result[body.name]=dict(materialId=body.material.id,volumeCm3=body.volume,faces=body.faces.count,
                               edges=body.edges.count,vertices=body.vertices.count,
                               localBoundsCm=list(box.minPoint.asArray())+list(box.maxPoint.asArray()))
    if not result:
        raise ValueError("Empty selected component")
    return result


def relationships(root, expected, fusion):
    """Read each relationship once in root context, accounting for each owner instance."""
    seen = Counter()

    def owner(item, kind):
        context = item.assemblyContext
        path = context.fullPathName if context is not None else "@root"
        if (path, kind) not in expected:
            raise ValueError("Unknown relationship owner: " + path)
        seen[path, kind] += 1
        return path

    def member(occurrence, parent):
        # A null joint end denotes the owning component. Preserve that convention
        # for a nested component as well as the document root.
        if occurrence is None:
            return parent
        path = occurrence.fullPathName
        if ((path, "joint") not in expected or
                (parent != "@root" and path != parent and not path.startswith(parent + "+"))):
            raise ValueError(f"Unresolved rooted relationship member {path} in {parent}")
        return path

    joints = []
    for kind, collection in (("joint", root.allJoints), ("asBuilt", root.allAsBuiltJoints)):
        for joint in collection:
            parent = owner(joint, kind)
            motion = joint.jointMotion
            edge = dict(owner=parent, kind=kind, name=joint.name, one=member(joint.occurrenceOne, parent),
                        two=member(joint.occurrenceTwo, parent), motion=motion.objectType, suppressed=joint.isSuppressed)
            if fusion.RevoluteJointMotion.cast(motion):
                edge["rotationRad"] = motion.rotationValue
            if fusion.SliderJointMotion.cast(motion):
                edge["slideCm"] = motion.slideValue
            joints.append(edge)
    groups = []
    for group in root.allRigidGroups:
        parent = owner(group, "rigidGroup")
        occurrences = list(group.occurrences)
        if any(occ is None for occ in occurrences):
            raise ValueError("Missing member of rigid group: " + group.name)
        groups.append(dict(owner=parent, name=group.name, occurrences=[member(occ, parent) for occ in occurrences]))
    for key, count in expected.items():
        if seen[key] != count:
            raise ValueError(f"Rooted relationship count differs for {key}: expected {count}, observed {seen[key]}")
    return joints, groups


def inventory(design, parent, pose, version):
    from adsk import core, fusion
    root=design.rootComponent
    contexts=[(None,root)]+[(o,o.component) for o in root.allOccurrences]
    rows, counts=[],{}
    for occ, comp in contexts:
        path=occ.fullPathName if occ else "@root"
        counts[path, "joint"] = comp.joints.count
        counts[path, "asBuilt"] = comp.asBuiltJoints.count
        counts[path, "rigidGroup"] = comp.rigidGroups.count
        transform=occ.transform2 if occ else core.Matrix3D.create()
        bodies=list(comp.bRepBodies)
        rows.append(dict(occurrence=path,component=comp.name,partNumber=comp.partNumber,matrixCm=list(transform.asArray()),
                         solids=[b.name for b in bodies if b.isSolid],
                         otherBodies=[b.name for b in bodies if not b.isSolid]+[m.name for m in comp.meshBodies]))

    joints, groups = relationships(root, counts, fusion)
    return dict(sourceArchive=parent,pose=pose,rootPath="@root",fusion=version,occurrences=rows,joints=joints,
                rigidGroups=groups,allBodies=sum(len(r["solids"]) for r in rows))


def capture(app, parent_file, expected, choice, job_id, output):
    """Run through a pinned project recipe. Outputs are private evidence for carry-child."""
    from adsk import fusion
    parent, out=Path(parent_file),Path(output)
    if app.documents.count or app.activeDocument or digest(parent)!=expected:
        raise ValueError("Begin at Home with the registered native archive")
    names=choice["occurrences"]
    if not names or len(names)!=len(set(names)):
        raise ValueError("Select distinct native occurrences")
    out.mkdir(parents=True,exist_ok=False)
    manager=app.importManager
    owned=[]

    def open_design(path):
        doc=manager.importToNewDocument(manager.createFusionArchiveImportOptions(str(path)))
        owned.append(doc)
        return doc,fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))

    report=dict(job=job_id,parent=expected,build=app.version,exports={})
    try:
        doc,design=open_design(parent)
        roster=inventory(design,expected,choice["sourcePose"],app.version)
        doc.close(False)
        save(out/"roster.json",roster)
        save(out/"roster-terminal.json",dict(status="complete",sourceArchive=expected,sourceUnchanged=digest(parent)==expected,
              fusion=app.version,roster=digest(out/"roster.json"),bodies=roster["allBodies"],joints=len(roster["joints"]),
              occurrences=len(roster["occurrences"])-1))
        doc,design=open_design(parent)
        occurrences={o.fullPathName:o for o in design.rootComponent.allOccurrences}
        manifest=dict(nativeParent=expected,configuration=choice["configuration"],groups={},sourceJoints=[])
        for i,name in enumerate(names):
            occ=occurrences[name]
            comp=occ.component
            path=out/f"component-{i+1:03d}.f3d"
            before=body_rows(comp)
            options=design.exportManager.createFusionArchiveExportOptions(str(path),comp)
            if not options or not design.exportManager.execute(options):
                raise ValueError("Fusion refused component export: "+name)
            manifest["groups"][name]=dict(occurrence=name,component=comp.name,partNumber=comp.partNumber,
                 matrixCm=list(occ.transform2.asArray()),file=path.name,sha256=digest(path),bodies=before)
        manifest["sourceJoints"]=[j for j in inventory(design,expected,choice["sourcePose"],app.version)["joints"]
                                  if j["one"] in names and j["two"] in names]
        doc.close(False)
        for g in manifest["groups"].values():
            child,design=open_design(out/g["file"])
            g["cold"]=body_rows(design.rootComponent)
            child.close(False)
        save(out/"manifest.json",manifest)
        report["exports"][choice["exportId"]]=dict(coldManifestSha256=digest(out/"manifest.json"),
                   exportedBodies=sum(len(g["cold"]) for g in manifest["groups"].values()))
    except Exception as exc:
        report["error"]=str(exc)
        raise
    finally:
        for doc in reversed(owned):
            if doc.isValid:
                doc.close(False)
        report.update(restored=app.documents.count==0 and app.activeDocument is None,parentUnchanged=digest(parent)==expected)
        save(out/"terminal.json",report)
