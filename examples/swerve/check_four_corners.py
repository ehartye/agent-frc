"""Build and reopen a disposable repeated-module assembly in Autodesk Fusion."""
import hashlib
import json
import math
from pathlib import Path

import adsk.core
import adsk.fusion


# Robot frame in mm, positive yaw counterclockwise about +Z.
STATIONS = [(235, 210, 0), (235, -210, 90), (-235, 210, -90), (-235, -210, 180)]


def placement(x, y, degrees):
    result = adsk.core.Matrix3D.create()
    result.setToRotation(math.radians(degrees), adsk.core.Vector3D.create(0, 0, 1),
                         adsk.core.Point3D.create(0, 0, 0))
    result.translation = adsk.core.Vector3D.create(x / 10, y / 10, 0)
    return result


def inspect(root, paths):
    leaves = list(root.allOccurrences)
    maker = adsk.fusion.TemporaryBRepManager.get()
    rows = []
    for station, (x, y, yaw) in zip(paths, STATIONS, strict=True):
        parts = {}
        total = 0
        for leaf in leaves:
            if not leaf.fullPathName.startswith(station + '+'):
                continue
            for body in leaf.component.bRepBodies:
                if not body.isSolid:
                    continue
                total += 1
                if body.name not in ('Tread annulus', 'Azimuth motor envelope'):
                    continue
                if body.name in parts:
                    raise ValueError('Duplicate witness body in ' + station)
                # Work in assembly context once. A nominal parent placement can hide child overrides.
                shape = maker.copy(body)
                if not maker.transform(shape, leaf.transform2):
                    raise ValueError('Failed to transform native witness: ' + leaf.fullPathName)
                box = shape.preciseBoundingBox
                low, high = ([10*v for v in point.asArray()] for point in (box.minPoint, box.maxPoint))
                if not all(math.isfinite(a) and math.isfinite(b) and b > a for a,b in zip(low,high)):
                    raise ValueError('Degenerate witness: ' + leaf.fullPathName)
                parts[body.name] = dict(path=leaf.fullPathName, lowMm=low, highMm=high,
                                        centerMm=[(a+b)/2 for a,b in zip(low,high)])
        if total != 19 or set(parts) != {'Tread annulus', 'Azimuth motor envelope'}:
            raise ValueError('Incomplete teaching module at ' + station)
        tread, housing = parts['Tread annulus'], parts['Azimuth motor envelope']
        expected_motor = (x+51*math.cos(math.radians(yaw)), y+51*math.sin(math.radians(yaw)), 165)
        error = max(math.dist(tread['centerMm'], (x,y,50)), abs(tread['lowMm'][2]),
                    math.dist(housing['centerMm'], expected_motor))
        rows.append(dict(path=station, solids=total, tread=tread, housing=housing, maxErrorMm=error))
    return rows


def exercise(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file() or output.suffix.lower() != '.f3d' or output.exists():
        raise ValueError('Select the teaching archive and a new output F3D path.')
    app = adsk.core.Application.get()
    manager = app.importManager
    previous = app.activeDocument
    created = []
    try:
        doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        created.append(doc)
        design = adsk.fusion.Design.cast(app.activeProduct)
        design.designIntent = adsk.fusion.DesignIntentTypes.HybridDesignIntentType
        root = design.rootComponent
        first = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        first.component.name = 'Classroom pod'
        manager.importToTarget2(manager.createFusionArchiveImportOptions(str(source)),first.component)
        first.isGrounded = False
        first.transform2 = placement(*STATIONS[0])
        pods = [first] + [root.occurrences.addExistingComponent(first.component,placement(*p)) for p in STATIONS[1:]]
        paths = [pod.fullPathName for pod in pods]
        if len(set(paths)) != 4:
            raise ValueError('Expected four distinct physical instances.')
        if design.snapshots.hasPendingSnapshot:
            design.snapshots.add()
        if not design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(str(output))):
            raise ValueError('Fusion archive export failed.')
        reopened = manager.importToNewDocument(manager.createFusionArchiveImportOptions(str(output)))
        created.append(reopened)
        design = adsk.fusion.Design.cast(reopened.products.itemByProductType('DesignProductType'))
        root = design.rootComponent
        baseline = inspect(root,paths)
        if max(row['maxErrorMm'] for row in baseline) > .02:
            raise ValueError('Reopened component misses its expected physical station: ' + json.dumps(baseline))
        changed = root.occurrences.itemByName(paths[1])
        original = changed.transform2
        controls = {}
        for label, pose in [('coincident',STATIONS[0]), ('rotated',(STATIONS[1][0],STATIONS[1][1],180))]:
            changed.transform2 = placement(*pose)
            adsk.doEvents()
            observed = inspect(root,paths)[1]
            if observed['maxErrorMm'] <= .02:
                raise ValueError('Missed negative control: ' + label)
            controls[label] = observed
        changed.transform2 = original
        adsk.doEvents()
        if max(row['maxErrorMm'] for row in inspect(root,paths)) > .02:
            raise ValueError('Restored placement disagrees with saved state.')
        return dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    archiveSha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                    fusionVersion=app.version, stationsMmDeg=STATIONS, observed=baseline, rejected=controls)
    finally:
        for doc in reversed(created):
            if doc and doc.isValid:
                doc.close(False)
        if previous and previous.isValid:
            previous.activate()


def run(context):
    ui = adsk.core.Application.get().userInterface
    source = ui.createFileDialog()
    source.title = "Choose the independent-axis teaching module"
    source.filter = "Fusion archive (*.f3d)"
    if source.showOpen() != adsk.core.DialogResults.DialogOK:
        return
    target = ui.createFileDialog()
    target.title = "Save a new four-corner exercise archive"
    target.filter = source.filter
    if target.showSave() != adsk.core.DialogResults.DialogOK:
        return
    receipt = Path(target.filename).with_suffix('.placement.json')
    if receipt.exists():
        raise ValueError('Choose a new receipt location.')
    result = exercise(source.filename,target.filename)
    with receipt.open('x', encoding='utf8') as stream:
        json.dump(result,stream,indent=2)
    ui.messageBox('Four physical stations checked. Receipt saved beside the new archive.')
