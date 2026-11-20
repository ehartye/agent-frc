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


def capture(app, archive, output, *, batch=256, pose=None):
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
        if not pose.get("id") or not isinstance(pose.get("joints"),list):
            raise ValueError("Identify the inspected joint pose")
        for item in pose["joints"]:
            collection=root.allJoints if item.get("type")=="joint" else root.allAsBuiltJoints
            matching=[j for j in collection if j.name==item["name"] and
                    (j.assemblyContext.fullPathName if j.assemblyContext else "@root")==item["occurrence"]]
            if len(matching)!=1 or item["coordinate"] not in ("slideValue","rotationValue"):
                raise ValueError("Ambiguous or unsupported native joint")
            native_value=item["nativeValue"]
            if not math.isfinite(native_value):
                raise ValueError("Nonfinite requested native joint coordinate")
            setattr(matching[0].jointMotion,item["coordinate"],native_value)
            adsk.doEvents()
            if abs(getattr(matching[0].jointMotion,item["coordinate"])-native_value)>1e-8:
                raise ValueError("Native joint did not reach the requested pose")
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
                errors=[]
                for index in sorted({0,body.vertices.count//2,body.vertices.count-1}):
                    if index<0 or not body.vertices.count:
                        continue
                    vertex=body.vertices.item(index)
                    point=vertex.geometry
                    if occ:
                        point.transformBy(occ.transform2)
                    measured=vertex.createForAssemblyContext(occ) if occ else vertex
                    errors.append(10*point.distanceTo(measured.geometry))
                if not errors or not all(math.isfinite(e) for e in errors):
                    raise ValueError("No usable native world placement witness")
                proxies.append(proxy)
                operands.append((body,occ.transform2 if occ else None))
                rows.append({"visible":proxy.isVisible,"worldVertexErrorMm":max(errors),"path": path, "name": body.name, "revision": body.revisionId,
                    "bodyLight": body.isLightBulbOn, "occurrenceVisible": occ.isVisible if occ else True,
                    "worldTransform": transform, "boundsMm": [10*v for v in (*box.minPoint.asArray(), *box.maxPoint.asArray())]})
        if not rows or sha(archive) != native_hash:
            raise ValueError("No complete stable archive readback")
        loader=importlib.util.spec_from_file_location("frc_native_contacts",Path(__file__).with_name("fusion_issue_contacts.py"))
        contact=importlib.util.module_from_spec(loader);loader.loader.exec_module(contact)
        native=contact.measure(design,rows,proxies,operands,output.with_suffix(".progress.json"),
            [native_hash,pose,app.version,sha(Path(__file__)),sha(Path(contact.__file__))],batch)
        if not native["complete"]:
            return {"complete":False,"completedPairs":len(native["pairs"]),"candidatePairs":native["candidatePairs"]}
        receipt = {"contacts":native,"pose":pose,"documentId":opened.creationId,"rootComponentId":root.id,
            "rootRevision":root.revisionId,"dataVersion":opened.dataFile.versionNumber if opened.dataFile else None,
            "schema": "agent-frc/fusion-body-census@1", "archiveSha256": native_hash,
            "programSha256": sha(Path(__file__)), "fusionVersion": app.version,
            "bodies": rows, "otherGeometry": extra}
        with output.open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, indent=2, allow_nan=False)
        return {"complete":True,"completedPairs":len(native["pairs"]),"file":output.name}
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
