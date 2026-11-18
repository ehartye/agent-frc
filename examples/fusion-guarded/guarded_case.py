"""Original guarded disposable Fusion recipe, version 1.0.0.
Client injects CONFIG. No cloud save, hardware, automatic retry or arbitrary target.
"""
import json, hashlib, math, re
from pathlib import Path
VERSION = '1.0.0'
GROUP = 'agent-frc-disposable-v1'

def fingerprint(config):
    return hashlib.sha256(json.dumps(config, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def authorize(config, actual_id, actual_job, revision, previous):
    if config['expectedDocumentId'] != actual_id or config['jobId'] != actual_job:
        raise ValueError('Document identity mismatch')
    if previous:
        if previous['fingerprint'] != fingerprint(config):
            raise ValueError('Request ID reused with different payload')
        if previous['state'] != 'complete':
            raise ValueError('Unknown/incomplete operation: inspect, do not replay')
        return previous
    if config['expectedRevision'] != revision:
        raise ValueError('Revision mismatch')
    return None

def read_attr(root, name, default=None):
    attr = root.attributes.itemByName(GROUP, name)
    return json.loads(attr.value) if attr else default

def write_attr(root, name, value):
    if not root.attributes.add(GROUP, name, json.dumps(value, sort_keys=True)):
        raise RuntimeError('Attribute write failed')

def inspect(design):
    import adsk.core, adsk.fusion
    parametric = design.designType == adsk.fusion.DesignTypes.ParametricDesignType
    bodies = []
    for body in design.rootComponent.bRepBodies:
        box = body.boundingBox
        holes = []
        for face in body.faces:
            cylinder = adsk.core.Cylinder.cast(face.geometry)
            if cylinder:
                holes.append([cylinder.origin.x*10,cylinder.origin.y*10,cylinder.radius*10])
        bodies.append({'solid':body.isSolid,'boundsMm':[(box.maxPoint.x-box.minPoint.x)*10,(box.maxPoint.y-box.minPoint.y)*10,(box.maxPoint.z-box.minPoint.z)*10], 'zMinMm':box.minPoint.z*10,'volumeMm3':body.volume*1000,'holesXYRadiusMm':sorted(holes)})
    health = []
    if parametric:
        for item in design.timeline:
            health.append({'name':item.name,'healthy':item.healthState == adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState,'message':item.errorOrWarningMessage})
    thickness = design.userParameters.itemByName('plateThickness') if parametric else None
    return {'documentId':design.parentDocument.creationId,'parametric':parametric,'bodies':bodies,'timeline':health,'thicknessMm':thickness.value*10 if thickness else None}

def verify(report, dims, thickness, history=True):
    if len(report['bodies']) != 2: raise ValueError('Expected two plates')
    wanted_holes = sorted([[x,y,6] for x,y in dims['axles']])
    for body, z in zip(sorted(report['bodies'],key=lambda b:b['zMinMm']),[0,dims['gapMm']+dims['thicknessMm']]):
        if not body['solid']: raise ValueError('Non-solid plate')
        if any(abs(a-b)>1e-5 for a,b in zip(body['boundsMm'],[dims['lengthMm'],dims['heightMm'],thickness])): raise ValueError('Bounds mismatch')
        if abs(body['zMinMm']-z)>1e-5: raise ValueError('Plate position mismatch')
        volume=(dims['lengthMm']*dims['heightMm']-2*math.pi*6**2)*thickness
        if abs(body['volumeMm3']-volume)>0.01: raise ValueError('Volume mismatch')
        if len(body['holesXYRadiusMm'])!=2 or any(abs(a-b)>1e-5 for hole,wanted in zip(body['holesXYRadiusMm'],wanted_holes) for a,b in zip(hole,wanted)): raise ValueError('Hole mismatch')
    if history and (not report['parametric'] or abs(report['thicknessMm']-thickness)>1e-6 or len(report['timeline'])!=6): raise ValueError('History mismatch')
    if any(not entry['healthy'] for entry in report['timeline']): raise ValueError('Unhealthy feature')

def run(_context: str):
    import adsk.core, adsk.fusion
    app = adsk.core.Application.get()
    c = CONFIG
    for key in ('jobId','requestId'):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', c[key]): raise ValueError('Invalid identifier')
    if c['recipeVersion']!=VERSION: raise ValueError('Recipe version mismatch')
    stage=c['stage']; original=app.activeDocument
    def design_for(doc): return adsk.fusion.Design.cast(doc.products.itemByProductType('DesignProductType'))
    if stage=='baseline':
        print(json.dumps({'version':app.version,'activeDocumentId':original.creationId if original else None,'documents':[{'id':d.creationId,'modified':d.isModified,'geometry':inspect(design_for(d))} for d in app.documents]}))
        return
    target=None; design=None
    if stage=='create':
        if (original.creationId if original else None)!=c['expectedActiveDocumentId']: raise ValueError('Active document changed')
        for doc in app.documents:
            candidate=design_for(doc)
            if candidate and read_attr(candidate.rootComponent,'job')==c['jobId']:
                raise ValueError('Job already exists: inspect by document ID; do not recreate')
    else:
        matches=[doc for doc in app.documents if doc.creationId==c['expectedDocumentId']]
        if len(matches)!=1: raise ValueError('Document identity missing or ambiguous')
        target=matches[0]
        design=design_for(target); root=design.rootComponent
        if stage=='inspect':
            if read_attr(root,'job')!=c['jobId']: raise ValueError('Document identity mismatch')
            query=c.get('inspectRequestId',c['requestId'])
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',query): raise ValueError('Invalid receipt query')
            print(json.dumps({'revision':read_attr(root,'revision'),'geometry':inspect(design),'operationReceipt':read_attr(root,'request-'+query)})); return
        prior=authorize(c,target.creationId,read_attr(root,'job'),read_attr(root,'revision'),read_attr(root,'request-'+c['requestId']))
        if prior:
            print(json.dumps({'duplicate':True,'receipt':prior})); return
        if fingerprint(inspect(design))!=c['expectedGeometrySha256']:
            raise ValueError('Geometry changed outside expected operation')
    if stage not in ('create','update','export','reopen'): raise ValueError('Unsupported operation')
    try:
        if stage=='create':
            target=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
            target.name='Disposable guarded sideplates'
            design=adsk.fusion.Design.cast(app.activeProduct)
            design.designType=adsk.fusion.DesignTypes.ParametricDesignType
            root=design.rootComponent
            write_attr(root,'job',c['jobId']); write_attr(root,'revision',0)
        else: target.activate()
        receipt={'state':'in-flight','fingerprint':fingerprint(c),'recipeVersion':VERSION,'documentId':target.creationId,'requestId':c['requestId']}
        write_attr(root,'request-'+c['requestId'],receipt)
        dims=c['dimensionsMm']
        if stage=='create':
            units=design.unitsManager
            mm=lambda value:units.evaluateExpression(str(value)+' mm','mm')
            if abs(mm(10)-1)>1e-9: raise ValueError('Unit conversion failed')
            design.userParameters.add('plateThickness',adsk.core.ValueInput.createByString(str(dims['thicknessMm'])+' mm'),'mm','Assumed concept dimension; not fabrication approval')
            for index,offset in enumerate([0,dims['gapMm']+dims['thicknessMm']]):
                pi=root.constructionPlanes.createInput()
                pi.setByOffset(root.xYConstructionPlane,adsk.core.ValueInput.createByString(str(offset)+' mm'))
                sketch=root.sketches.add(root.constructionPlanes.add(pi))
                sketch.name='Concept plate '+str(index+1)
                lines=sketch.sketchCurves.sketchLines.addTwoPointRectangle(adsk.core.Point3D.create(0,0,0),adsk.core.Point3D.create(mm(dims['lengthMm']),mm(dims['heightMm']),0))
                for line in lines: line.isFixed=True
                for x,y in dims['axles']:
                    circle=sketch.sketchCurves.sketchCircles.addByCenterRadius(adsk.core.Point3D.create(mm(x),mm(y),0),mm(6)); circle.isFixed=True
                profile=max(list(sketch.profiles),key=lambda p:p.areaProperties().area)
                root.features.extrudeFeatures.addSimple(profile,adsk.core.ValueInput.createByString('plateThickness'),adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
        if stage=='update':
            if not 1<=c['thicknessMm']<=10: raise ValueError('Disposable thickness range exceeded')
            design.userParameters.itemByName('plateThickness').expression=str(c['thicknessMm'])+' mm'
        if stage in ('create','update') and not design.computeAll(): raise ValueError('Compute failed')
        geometry=inspect(design); verify(geometry,dims,c['thicknessMm'])
        receipt['geometry']=geometry
        if stage=='export':
            output=Path(c['outputDirectory'])
            output.mkdir(parents=True,exist_ok=False)
            files=[]
            for extension in ('f3d','step'):
                file=output/('sideplates.'+extension)
                manager=design.exportManager
                options=manager.createFusionArchiveExportOptions(str(file)) if extension=='f3d' else manager.createSTEPExportOptions(str(file))
                if not manager.execute(options): raise RuntimeError('Export failed')
                files.append({'name':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
            receipt['files']=files
        if stage=='reopen':
            reopened=[]
            for extension in ('f3d','step'):
                files=list(Path(c['outputDirectory']).glob('*.'+extension))
                if len(files)!=1: raise ValueError('Expected one archive per format in the export directory')
                file=files[0]
                if hashlib.sha256(file.read_bytes()).hexdigest()!=c['expectedHashes'][extension]: raise ValueError('Export changed')
                manager=app.importManager
                options=manager.createFusionArchiveImportOptions(str(file)) if extension=='f3d' else manager.createSTEPImportOptions(str(file))
                doc=manager.importToNewDocument(options)
                try:
                    report=inspect(design_for(doc)); verify(report,dims,c['thicknessMm'],history=extension=='f3d')
                    reopened.append({'format':extension,'geometry':report})
                finally:
                    doc.close(False)
            receipt['reopened']=reopened
        revision=read_attr(root,'revision')+1
        write_attr(root,'revision',revision)
        receipt.update(state='complete',revision=revision)
        write_attr(root,'request-'+c['requestId'],receipt)
        print(json.dumps({'duplicate':False,'receipt':receipt}))
    finally:
        if original and original.isValid: original.activate()
