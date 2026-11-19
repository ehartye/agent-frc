"""Original Fusion study. All dimensions are centimetres in the native API."""
import hashlib
import json
import math
from pathlib import Path
import tempfile

import adsk.core
import adsk.fusion


def point(x, y, z=0):
    return adsk.core.Point3D.create(x, y, z)


def vector(x, y, z):
    return adsk.core.Vector3D.create(x, y, z)


def real(value):
    return adsk.core.ValueInput.createByReal(value)


def bounds(body):
    box = body.preciseBoundingBox
    return [*box.minPoint.asArray(), *box.maxPoint.asArray()]


def measurements(body):
    accuracy = adsk.fusion.CalculationAccuracy.VeryHighCalculationAccuracy
    return {"solid": body.isSolid, "boundsCm": bounds(body),
            "directCm3": body.volume,
            "veryHighCm3": body.getPhysicalProperties(accuracy).volume}


def slab(root, name, z):
    plane = root.xYConstructionPlane
    if z:
        offset = root.constructionPlanes.createInput()
        offset.setByOffset(plane, real(z))
        plane = root.constructionPlanes.add(offset)
    sketch = root.sketches.add(plane)
    sketch.sketchCurves.sketchLines.addTwoPointRectangle(point(0, 0), point(6, 4))
    extrudes = root.features.extrudeFeatures
    feature = extrudes.addSimple(sketch.profiles.item(0), real(1),
                                 adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    body = feature.bodies.item(0)
    body.name = name
    return body


def box(manager, center, lengths):
    shape = adsk.core.OrientedBoundingBox3D.create(point(*center), vector(1, 0, 0),
                                                   vector(0, 1, 0), *lengths)
    return manager.createBox(shape)


def intersection(manager, placed, tool):
    result_body = manager.copy(placed)
    result = {"toolBoundsCm": bounds(tool)}
    try:
        ok = manager.booleanOperation(result_body, tool,
                                      adsk.fusion.BooleanTypes.IntersectionBooleanType)
    except RuntimeError as error:
        result.update(returned=None, error=str(error))
        return result
    result["returned"] = ok
    if ok and result_body.isValid:
        result["faceCount"] = result_body.faces.count
        if result["faceCount"]:
            result["measurement"] = measurements(result_body)
    return result


def primitive_study(body):
    manager = adsk.fusion.TemporaryBRepManager.get()
    placed = manager.copy(body)
    original = measurements(placed)
    transform = adsk.core.Matrix3D.create()
    transform.setToRotation(math.pi / 2, vector(0, 0, 1), point(0, 0))
    transform.translation = vector(10, 8, 5)
    if not manager.transform(placed, transform):
        raise RuntimeError("Temporary transform failed")
    return {"native": measurements(body), "untransformedCopy": original,
            "transformedCopy": measurements(placed), "matrixCm": transform.asArray(),
            "overlap": intersection(manager, placed, box(manager, (10, 11, 5.5), (2, 2, 1))),
            "separate": intersection(manager, placed, box(manager, (13, 11, 5.5), (2, 2, 1)))}


def drill(root, target, restrict):
    hole = root.sketches.add(root.xYConstructionPlane)
    hole.sketchCurves.sketchCircles.addByCenterRadius(point(3, 2), 0.5)
    extrudes = root.features.extrudeFeatures
    spec = extrudes.createInput(hole.profiles.item(0), adsk.fusion.FeatureOperations.CutFeatureOperation)
    spec.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(real(4)),
                          adsk.fusion.ExtentDirections.PositiveExtentDirection)
    if restrict:
        spec.participantBodies = [target]
    cut = extrudes.add(spec)
    if cut.healthState != adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:
        raise RuntimeError(cut.errorOrWarningMessage)


def inventory(root):
    bodies = list(root.bRepBodies)
    if sorted(b.name for b in bodies) != ["neighbor", "target"]:
        raise RuntimeError("Unexpected plate inventory")
    return {body.name: measurements(body) for body in bodies}


def design_of(doc):
    return adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))


def one_case(app, directory, restricted):
    case = "targetOnly" if restricted else "allParticipants"
    archive = directory / (case + ".f3d")
    doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    try:
        design = design_of(doc)
        root = design.rootComponent
        target = slab(root, "target", 0)
        slab(root, "neighbor", 2)
        result = {"before": inventory(root)}
        if restricted:
            result["primitive"] = primitive_study(target)
        drill(root, target, restricted)
        result["afterCut"] = inventory(root)
        exporter = design.exportManager
        if not exporter.execute(exporter.createFusionArchiveExportOptions(str(archive))):
            raise RuntimeError("Local Fusion archive export failed")
    finally:
        doc.close(False)
    result["archiveSha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
    options = app.importManager.createFusionArchiveImportOptions(str(archive))
    inspected = app.importManager.importToNewDocument(options)
    try:
        result["reopened"] = inventory(design_of(inspected).rootComponent)
    finally:
        inspected.close(False)
    return result


def run_study(app, output_parent):
    directory = Path(tempfile.mkdtemp(prefix="fusion-volume-", dir=str(output_parent)))
    original = app.activeDocument
    try:
        receipt = {"schema": "fusion-volume-example@1", "fusionVersion": app.version,
                   "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                   "lengthUnits": "cm", "volumeUnits": "cm3"}
        for case, restricted in (("allParticipants", False), ("targetOnly", True)):
            receipt[case] = one_case(app, directory, restricted)
            (directory / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    finally:
        if original and original.isValid:
            original.activate()
    return directory


def run(context):
    app = adsk.core.Application.get()
    folder = app.userInterface.createFolderDialog()
    folder.title = "Choose a parent directory for a new disposable volume study"
    if folder.showDialog() == adsk.core.DialogResults.DialogOK:
        location = run_study(app, folder.folder)
        app.userInterface.messageBox("Study files saved to " + str(location))
