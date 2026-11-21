"""Open the chosen local Fusion archive in a disposable document and enumerate its complete BRep inventory."""
import hashlib
import json
from pathlib import Path


def sha(path):
    with path.open("rb") as stream:
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
        return h.hexdigest()


def placement_witness(body,occ,point2d,world_points=None):
    import math
    samples=[];errors=[]
    def add(before,observed):
        coords=list(before.asArray())
        predicted=before.copy()
        if occ:predicted.transformBy(occ.transform2)
        err=10*predicted.distanceTo(observed)
        if not math.isfinite(err):raise ValueError("Invalid world point")
        if err>.001:raise ValueError("Native versus occurrence-context placement differs by "+str(err)+" mm")
        errors.append(err)
        count=len(samples)
        if not samples:
            samples.append(coords)
        elif len(samples)==1:
            if math.dist(samples[0],coords)>1e-6:samples.append(coords)
        elif len(samples)==2:
            a=[q-p for p,q in zip(samples[0],samples[1])];b=[q-p for p,q in zip(samples[0],coords)]
            cross=[a[(j+1)%3]*b[(j+2)%3]-a[(j+2)%3]*b[(j+1)%3] for j in range(3)]
            if math.hypot(*cross)/math.hypot(*a)>1e-6:samples.append(coords)
        if world_points is not None and len(samples)>count:
            world_points.append([10*v for v in observed.asArray()])
    n=body.vertices.count
    for ix in dict.fromkeys([i for i in (0,n//2,n-1) if 0<=i<n]):
        v=body.vertices.item(ix);other=v.createForAssemblyContext(occ) if occ else v
        add(v.geometry,other.geometry)
    if len(samples)<3:
        for f in body.faces:
            proxy=f.createForAssemblyContext(occ) if occ else f
            evaluator=f.evaluator;region=evaluator.parametricRange
            if callable(region):region=region()
            if isinstance(region,tuple):
                if not region[0]:continue
                region=region[-1]
            ok,center=evaluator.getParameterAtPoint(f.pointOnFace)
            if not ok:continue
            lo,hi=region.minPoint,region.maxPoint
            uv=[center]
            uv.extend(point2d.create(lo.x+fx*(hi.x-lo.x),lo.y+fy*(hi.y-lo.y))
                for fx in (.25,.5,.75,.125,.875) for fy in (.25,.5,.75,.125,.875))
            for p in uv:
                if not evaluator.isParameterOnFace(p):continue
                ok,local=evaluator.getPointAtParameter(p);world_ok,actual=proxy.evaluator.getPointAtParameter(p)
                if ok and world_ok:add(local,actual)
                if len(samples)==3:break
            if len(samples)==3:break
    if len(samples)!=3:raise ValueError("Three noncollinear placed points could not be established")
    return max(errors),samples


def timeline_health(timeline, states):
    """Read timeline leaves, including the children of collapsed display groups."""
    names = {getattr(states, name+"FeatureHealthState"): name.lower()
             for name in ("Healthy", "Warning", "Error", "Suppressed", "RolledBack", "Unknown")}
    def read_items(collection):
        rows = []
        for i in range(collection.count):
            item = collection.item(i)
            row = {"name": item.name, "type": item.objectType}
            if item.objectType.endswith("::TimelineGroup"):
                row["children"] = read_items(item)
            else:
                entity = item.entity
                row["entityType"] = entity.objectType if entity else None
                row["health"] = names.get(item.healthState, "unknown")
                if row["health"] in ("warning", "error"):
                    row["message"] = item.errorOrWarningMessage
            rows.append(row)
        return {"count": collection.count, "items": rows}
    return read_items(timeline)


def inspect_pose(design, pose, events):
    """Apply only the commissioned commands and read every coordinate at the observed stage."""
    import math
    if not pose.get("id") or not isinstance(pose.get("joints"), list):
        raise ValueError("Identify the inspected joint pose")
    commands = pose["joints"]
    default = "command-response" if commands else "archive-rest"
    stage = pose.get("stage", default)
    if (stage not in ("archive-rest", "command-response", "after-recompute", "captured-recompute")
            or (stage == "archive-rest") != (not commands)
            or (pose["id"] == "saved" and commands)):
        raise ValueError("Archive rest needs an untouched cold issue; commanded poses need an observed motion stage")
    targets = {}
    root = design.rootComponent
    for item in commands:
        group = item["group"]
        if not isinstance(group, str) or not group or group in targets or item["type"] not in ("joint", "asBuilt"):
            raise ValueError("Identify each distinct commissioned joint command")
        collection = root.allJoints if item["type"] == "joint" else root.allAsBuiltJoints
        matching = [j for j in collection if j.name == item["name"] and
                    (j.assemblyContext.fullPathName if j.assemblyContext else "@root") == item["occurrence"]]
        attr = item["coordinate"]
        value = item["nativeValue"]
        if len(matching) != 1 or attr not in ("slideValue", "rotationValue") or not math.isfinite(value):
            raise ValueError("Ambiguous or invalid requested native joint coordinate")
        joint = matching[0]
        targets[group] = (joint, attr, value, getattr(joint.jointMotion, attr))
    evidence = {"stage": stage}
    rebuilt = stage in ("after-recompute", "captured-recompute")
    if rebuilt:
        import adsk.fusion
        evidence["coldTimeline"] = timeline_health(design.timeline, adsk.fusion.FeatureHealthStates)
    for joint, attr, value, _ in targets.values():
        setattr(joint.jointMotion, attr, value)
        events()
    if stage == "captured-recompute":
        if not design.snapshots.hasPendingSnapshot or design.snapshots.add() is None:
            raise ValueError("A captured-position claim needs a new pending snapshot in the disposable document")
    if rebuilt:
        if not design.computeAll():
            raise ValueError("Fusion could not complete the required recompute")
        events()
        evidence["timeline"] = timeline_health(design.timeline, adsk.fusion.FeatureHealthStates)
    values = {group: {"before": before, "observed": getattr(joint.jointMotion, attr)}
              for group, (joint, attr, _, before) in targets.items()}
    # Keep the actual readback, including a return to rest. The reviewer compares it to the plan.
    return {**evidence, "coordinates": values}


def capture(app, archive, output, *, batch=256, pose=None, retry_pairs=(), checkpoint=None):
    import adsk.fusion
    import adsk.core
    import importlib.util
    import math
    if output.exists():
        raise ValueError("Choose a new receipt file")
    identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    native_hash = sha(archive)
    previous = app.activeDocument
    manager = app.importManager
    opened = manager.importToNewDocument(manager.createFusionArchiveImportOptions(str(archive)))
    try:
        design = adsk.fusion.Design.cast(opened.products.itemByProductType("DesignProductType"))
        root = design.rootComponent
        brep = adsk.fusion.TemporaryBRepManager.get()
        pose=pose or {"id":"saved","joints":[]}
        stage_evidence = inspect_pose(design, pose, adsk.doEvents)
        rows = []
        proxies=[]
        operands=[]
        extra = []
        keys = set()
        for occ in [None, *root.allOccurrences]:
            comp = occ.component if occ else root
            path = occ.fullPathName if occ else "@root"
            if comp.meshBodies.count:
                extra.append({"path": path, "kind": "mesh", "count": comp.meshBodies.count})
            transform = list(occ.transform2.asArray()) if occ else list(identity)
            for i in (3, 7, 11):
                transform[i] *= 10
            for body in comp.bRepBodies:
                key = (path, body.name)
                if key in keys:
                    raise ValueError("Ambiguous native body identity: " + repr(key))
                keys.add(key)
                if not body.isSolid:
                    extra.append({"path": path, "kind": "surface", "name": body.name})
                    continue
                placed = brep.copy(body)
                if occ and not brep.transform(placed, occ.transform2):
                    raise ValueError("Failed native placement: " + repr(key))
                box = placed.preciseBoundingBox
                proxy=body.createForAssemblyContext(occ) if occ else body
                world_sites=[]
                error,local_sites=placement_witness(body,occ,adsk.core.Point2D,world_sites)
                proxies.append(proxy)
                operands.append((body,occ.transform2 if occ else None))
                rows.append({"visible":proxy.isVisible,"worldVertexErrorMm":error,"placementPointsCm":local_sites,"observedWorldPointsMm":world_sites,"topologicalVertices":body.vertices.count,"path": path, "name": body.name, "revision": body.revisionId,
                    "bodyLight": body.isLightBulbOn, "occurrenceVisible": occ.isVisible if occ else True,
                    "worldTransform": transform, "boundsMm": [10*v for v in (*box.minPoint.asArray(), *box.maxPoint.asArray())]})
        if not rows or sha(archive) != native_hash:
            raise ValueError("No complete stable archive readback")
        loader=importlib.util.spec_from_file_location("frc_native_contacts",Path(__file__).with_name("fusion_issue_contacts.py"))
        contact=importlib.util.module_from_spec(loader);loader.loader.exec_module(contact)
        native=contact.measure(design,rows,proxies,operands,Path(checkpoint) if checkpoint else output.with_suffix(".progress.json"),
            [native_hash,pose,app.version,sha(Path(__file__)),sha(Path(contact.__file__))],batch,retry_pairs)
        if not native["complete"]:
            return {"complete":False,"completedPairs":len(native["pairs"]),"candidatePairs":native["candidatePairs"]}
        receipt = {"contacts":native,"pose":pose,"stageEvidence":stage_evidence,"documentId":opened.creationId,"rootComponentId":root.id,
            "rootRevision":root.revisionId,"dataVersion":opened.dataFile.versionNumber if opened.dataFile else None,
            "schema": "agent-frc/fusion-body-census@1", "archiveSha256": native_hash,
            "programSha256": sha(Path(__file__)), "fusionVersion": app.version,
            "bodies": rows, "otherGeometry": extra}
        with output.open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, indent=2, allow_nan=False)
        return {"complete":True,"completedPairs":len(native["pairs"]),"file":output.name,"unresolvedPairs":native["unresolvedPairs"]}
    finally:
        opened.close(False)
        if previous and previous.isValid:
            previous.activate()


def run(context):
    import adsk.core
    app = adsk.core.Application.get()
    select = app.userInterface.createFileDialog()
    select.title = "Choose the exact installed Fusion archive"
    select.filter = "Fusion archive (*.f3d;*.f3z)"
    if select.showOpen() != adsk.core.DialogResults.DialogOK:
        return
    output = app.userInterface.createFileDialog()
    output.title = "Save a new complete body census"
    output.filter = "JSON receipt (*.json)"
    if output.showSave() == adsk.core.DialogResults.DialogOK:
        capture(app, Path(select.filename), Path(output.filename))
