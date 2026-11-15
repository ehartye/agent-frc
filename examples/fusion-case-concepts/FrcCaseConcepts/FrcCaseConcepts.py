# Original educational geometry. Requires Autodesk Fusion; no cloud save or robot IO.
import json
from pathlib import Path
import traceback
import adsk.core
import adsk.fusion

def run(context):
    app = adsk.core.Application.get()
    root_path = Path(__file__).resolve().parents[3]
    output = Path(__file__).resolve().parent / 'native-output'
    output.mkdir(exist_ok=True)
    records = []
    try:
        for year in (2024, 2025, 2026):
            data = json.loads((root_path / 'case-studies' / str(year) / 'case.json').read_text(encoding='utf-8'))
            dims = data['cad']
            doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
            design = adsk.fusion.Design.cast(app.activeProduct)
            component = design.rootComponent
            component.name = f'FRC {year} concept - NOT MANUFACTURE READY'
            design.userParameters.add('plateThickness', adsk.core.ValueInput.createByString(str(dims['thicknessMm'])+' mm'), 'mm', 'Original concept assumption')
            for index, offset in enumerate((0, dims['gapMm'] + dims['thicknessMm'])):
                plane_input = component.constructionPlanes.createInput()
                plane_input.setByOffset(component.xYConstructionPlane, adsk.core.ValueInput.createByString(str(offset)+' mm'))
                plane = component.constructionPlanes.add(plane_input)
                sketch = component.sketches.add(plane)
                sketch.name = 'Concept sideplate '+str(index+1)
                sketch.sketchCurves.sketchLines.addTwoPointRectangle(adsk.core.Point3D.create(0,0,0), adsk.core.Point3D.create(dims['lengthMm']/10,dims['heightMm']/10,0))
                for x,y in dims['axles']:
                    sketch.sketchCurves.sketchCircles.addByCenterRadius(adsk.core.Point3D.create(x/10,y/10,0),0.6)
                profiles = [sketch.profiles.item(i) for i in range(sketch.profiles.count)]
                profile = max(profiles, key=lambda q:q.areaProperties().area)
                feature = component.features.extrudeFeatures.addSimple(profile, adsk.core.ValueInput.createByString('plateThickness'), adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
                feature.bodies.item(0).name = 'Concept plate '+str(index+1)
            manager = design.exportManager
            f3d = output / f'case-{year}.f3d'
            step = output / f'case-{year}.step'
            if not manager.execute(manager.createFusionArchiveExportOptions(str(f3d))):
                raise RuntimeError('F3D export failed')
            if not manager.execute(manager.createSTEPExportOptions(str(step))):
                raise RuntimeError('STEP export failed')
            records.append({'season':year,'bodyCount':component.bRepBodies.count,'f3d':f3d.name,'step':step.name,'status':'created/exported; reopen and interference checks still required'})
            # Leave unsaved documents open for visual review; do not save to an Autodesk cloud project.
        (output / 'result.json').write_text(json.dumps({'applicationVersion':app.version,'cases':records,'limits':'Concept plates only; no joints, load analysis, whole-robot collision or manufacturing approval'},indent=2),encoding='utf-8')
        app.userInterface.messageBox('Created local concept exports in '+str(output))
    except Exception:
        (output / 'error.txt').write_text(traceback.format_exc(),encoding='utf-8')
        app.userInterface.messageBox('Concept generation failed; inspect local error.txt. No completed-CAD claim.')
