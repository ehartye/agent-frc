"""Create a disposable original Fusion interference control and verify the saved native archive with the released collector."""
import importlib.util
import json
from pathlib import Path
import adsk.core
import adsk.fusion


def exercise(app, output, scripts):
    output.mkdir(parents=True, exist_ok=True)
    archive=output/"control.f3d";receipt=output/"control.json"
    if archive.exists() or receipt.exists():
        raise ValueError("Use a new exercise directory")
    old=app.activeDocument
    count=app.documents.count
    doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    manager=adsk.fusion.TemporaryBRepManager.get()
    def point(x,y,z):
        return adsk.core.Point3D.create(x,y,z)
    def box(center,dims):
        return manager.createBox(adsk.core.OrientedBoundingBox3D.create(point(*center),
            adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),*dims))
    try:
        product=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        product.designType=adsk.fusion.DesignTypes.DirectDesignType
        root=product.rootComponent
        def add(name,shape):
            occ=root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
            occ.component.name=name
            body=occ.component.bRepBodies.add(shape);body.name=name
        add("Purchased motor witness",manager.createCylinderOrCone(point(0,0,0),.5,point(0,0,2),.5))
        leg=box((.45,0,.5),(.3,.6,1))
        if not manager.booleanOperation(leg,box((.65,.27,.5),(.7,.06,1)),adsk.fusion.BooleanTypes.UnionBooleanType):
            raise ValueError("Could not construct the synthetic L bracket")
        add("Legacy frame bridge",leg)
        add("Clear stock",box((.475,.475,.15),(.09,.09,.1)))
        exporter=product.exportManager
        if not exporter.execute(exporter.createFusionArchiveExportOptions(str(archive))) or not exporter.execute(
                exporter.createSTEPExportOptions(str(output/"control.step"),root)):
            raise ValueError("Original native archive/export failed")
    finally:
        doc.close(False)
        if old and old.isValid:
            old.activate()
    loader=importlib.util.spec_from_file_location("frc_census",scripts/"fusion_issue_inventory.py")
    module=importlib.util.module_from_spec(loader);loader.loader.exec_module(module)
    for _ in range(4):
        part=module.capture(app,archive,receipt,batch=1)
        if part["complete"]:
            break
    result=json.loads(receipt.read_text(encoding="utf-8"))
    answers={}
    for hit in result["contacts"]["pairs"]:
        pair=frozenset(result["bodies"][i]["name"] for i in hit["pair"])
        answers[pair]=(hit["interferenceMm3"],hit["temporaryCommonMm3"])
    clash=answers[frozenset(("Legacy frame bridge","Purchased motor witness"))]
    clear=answers[frozenset(("Clear stock","Purchased motor witness"))]
    if min(clash)<=0 or max(clear)>0 or app.documents.count!=count or old and app.activeDocument.creationId!=old.creationId:
        raise ValueError("Native fault/clear control or original document state did not reconcile")
    return {"negativeMm3":clash,"clearMm3":clear,"native":result["archiveSha256"],"pairs":len(answers),"documentsRestored":True}
