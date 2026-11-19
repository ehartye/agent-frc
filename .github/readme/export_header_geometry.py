"""Run as a Fusion script in a checkout. Select an empty output folder for the STEP and census."""
import hashlib
import json
from pathlib import Path

import adsk.core
import adsk.fusion


def run(context):
    source = Path(__file__).resolve().parents[2] / "examples/swerve/independent-swerve.f3d"
    app = adsk.core.Application.get()
    folder = app.userInterface.createFolderDialog()
    folder.title = "Choose an empty folder for the teaching module export"
    if folder.showDialog() != adsk.core.DialogResults.DialogOK:
        return
    target = Path(folder.folder)
    if any(target.iterdir()):
        raise ValueError("An empty output folder is required")
    prior = app.activeDocument
    manager = app.importManager
    doc = manager.importToNewDocument(manager.createFusionArchiveImportOptions(str(source)))
    try:
        design = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        root = design.rootComponent
        bodies = []
        for occ in root.allOccurrences:
            for body in occ.bRepBodies:
                bounds = body.boundingBox
                corners = bounds.minPoint.asArray() + bounds.maxPoint.asArray()
                bodies.append({"body": body.name, "boundsMm": [v * 10 for v in corners]})
        if root.bRepBodies.count or len(bodies) != 19:
            raise ValueError("Unexpected teaching assembly")
        step = target / "teaching-module.step"
        export = design.exportManager
        if not export.execute(export.createSTEPExportOptions(str(step), root)):
            raise RuntimeError("Fusion could not export the teaching module")
        census = {"sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                  "exportSha256": hashlib.sha256(step.read_bytes()).hexdigest(), "bodies": bodies}
        (target / "teaching-module-native.json").write_text(json.dumps(census, indent=2), encoding="utf-8")
    finally:
        doc.close(False)
        if prior:
            prior.activate()
