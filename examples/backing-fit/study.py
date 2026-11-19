"""Run the included fixture in Fusion. All archives stay in a new local directory."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile

import adsk.core
import adsk.fusion


def load_geometry():
    spec = importlib.util.spec_from_file_location("backing_geometry", Path(__file__).with_name("geometry.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def add_part(root, manager, geometry, name, body_name, limits, *, cut=None, hidden=False):
    # Each instance carries an actual translation; local stock coordinates differ from its assembly location.
    offset = [30, -15, 12]
    matrix = adsk.core.Matrix3D.create()
    matrix.translation = adsk.core.Vector3D.create(*(v / 10 for v in offset))
    occ = root.occurrences.addNewComponent(matrix)
    occ.component.name = name
    def local(bounds):
        return [v - offset[i % 3] for i, v in enumerate(bounds)]
    shape = geometry.box(manager, local(limits))
    if cut:
        if not manager.booleanOperation(shape, geometry.box(manager, local(cut)),
                                        adsk.fusion.BooleanTypes.DifferenceBooleanType):
            raise RuntimeError("Stock cut failed")
    stock = occ.component.bRepBodies.add(shape)
    stock.name = body_name
    occ.isLightBulbOn = not hidden


def create(root, old_support, geometry):
    manager = adsk.fusion.TemporaryBRepManager.get()
    add_part(root, manager, geometry, "cover", "cloth", [-111,-71,0,111,71,60],
             cut=[-110,-70,-1,110,70,61])
    add_part(root, manager, geometry, "front", "wood", [100,-60,0,110,60,60],
             cut=[99,-10,20,111,10,40], hidden=True)
    add_part(root, manager, geometry, "rear", "wood", [-110,-60,0,-100,60,60], hidden=True)
    add_part(root, manager, geometry, "left", "wood", [-110,60,0,110,70,60], hidden=True)
    add_part(root, manager, geometry, "right", "wood", [-110,-70,0,110,-60,60], hidden=True)
    add_part(root, manager, geometry, "plate", "support", [90,-40,10,100,40,50])
    if old_support:
        add_part(root, manager, geometry, "old", "support", [95,-20,10,100,20,30])


def case(app, work, name, geometry, plan):
    archive = work / (name + ".f3d")
    author = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    try:
        design = adsk.fusion.Design.cast(author.products.itemByProductType("DesignProductType"))
        design.designType = adsk.fusion.DesignTypes.DirectDesignType
        create(design.rootComponent, name == "candidate", geometry)
        exporter = design.exportManager
        if not exporter.execute(exporter.createFusionArchiveExportOptions(str(archive))):
            raise RuntimeError("Archive export failed")
    finally:
        author.close(False)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    opened = app.importManager.importToNewDocument(app.importManager.createFusionArchiveImportOptions(str(archive)))
    try:
        design = adsk.fusion.Design.cast(opened.products.itemByProductType("DesignProductType"))
        observed = geometry.inspect(design, plan["support"], {tuple(x["id"]) for x in plan["bearing"]})
        reopened_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        observed.update(archiveSha256=reopened_digest, reopened=True)
        return digest, observed
    finally:
        opened.close(False)


def run_study(app, output_parent):
    work = Path(tempfile.mkdtemp(prefix="backing-fit-", dir=str(output_parent)))
    source = Path(__file__).parent
    plan = json.loads((source / "expected.json").read_bytes())
    geometry = load_geometry()
    active = app.activeDocument
    try:
        observed = {"schema": "backing-fit-observations@1", "fusionVersion": app.version,
                    "sourceSha256": {key: hashlib.sha256((source / key).read_bytes()).hexdigest()
                                     for key in ("study.py", "geometry.py")}}
        plan["archives"] = {}
        for name in ("candidate", "successor"):
            plan["archives"][name], observed[name] = case(app, work, name, geometry, plan)
            (work / "observed.json").write_text(json.dumps(observed, indent=2) + "\n", encoding="utf8")
        (work / "expected.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf8")
    finally:
        if active and active.isValid:
            active.activate()
    return work


def run(context):
    app = adsk.core.Application.get()
    dialog = app.userInterface.createFolderDialog()
    dialog.title = "Choose an output parent for the hidden backing study"
    if dialog.showDialog() == adsk.core.DialogResults.DialogOK:
        work = run_study(app, dialog.folder)
        app.userInterface.messageBox("Study saved to " + str(work))
