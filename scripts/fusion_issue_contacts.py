"""Native interference measurements on a cold-open Fusion design. Called by fusion_issue_inventory."""
import hashlib
import itertools
import json
import math
from pathlib import Path


def native_spatial(model, region, manager, bodies):
    """Partition copies of Fusion assembly-world intersection bodies."""
    import adsk.core
    import adsk.fusion
    parts = {}
    def volume(shape):
        if not shape or not shape.isValid:
            raise ValueError("Invalid native fit partition")
        return 1000*shape.volume if shape.lumps.count else 0.
    def cylinder(low,high,r):
        p=lambda xyz:adsk.core.Point3D.create(*[v/10 for v in xyz])
        return manager.createCylinderOrCone(p(low),r/10,p(high),r/10)
    def boolean(a,b,kind):
        out=manager.copy(a)
        op=adsk.fusion.BooleanTypes
        if not out or not manager.booleanOperation(out, b, op.IntersectionBooleanType if kind=="common" else op.DifferenceBooleanType):
            raise ValueError("Unresolved native region partition")
        return out
    for body in bodies:
        for k,v in model.section(body,region,cylinder,boolean,volume).items():
            parts[k]=parts.get(k,0.)+v
    if not parts:
        parts={k:0. for k in ("totalMm3","outsideCylinderMm3","insideCoreMm3","permittedMm3","conservationErrorMm3")}
    return parts


def native_pilot(body, region, model):
    import adsk.core
    from math import hypot, pi
    start,_,axis,length,r,_,_=model.annulus(region)
    def axial(coords):
        diff=[10*x-s for x,s in zip(coords,start)]
        z=sum(x*u for x,u in zip(diff,axis))
        radial=[x-z*u for x,u in zip(diff,axis)]
        return z,radial
    spans=[]
    for face in body.faces:
        c=adsk.core.Cylinder.cast(face.geometry)
        if not c or abs(10*c.radius-r)>1e-5 or hypot(*axial(c.origin.asArray())[1])>1e-5:
            continue
        if abs(sum(a*b for a,b in zip(axis,c.axis.asArray())))<1-1e-9:
            continue
        p=face.pointOnFace
        ok,n=face.evaluator.getNormalAtPoint(p)
        # Use the face evaluator, oriented outward from the material into the bore.
        if not ok or sum(a*b for a,b in zip(n.asArray(),axial(p.asArray())[1]))>=0:
            continue
        heights=[]
        for edge in face.edges:
            circle=adsk.core.Circle3D.cast(edge.geometry)
            if circle and abs(10*circle.radius-r)<1e-5:
                z,radial=axial(circle.center.asArray())
                if hypot(*radial)<1e-5: heights.append(z)
        if len(heights)<2: continue
        low,high=min(heights),max(heights)
        expected=2*pi*r*(high-low)
        if expected>0 and abs(100*face.area-expected)<=max(1e-6,expected*1e-7):
            spans.append((low,high))
    stop=0.
    for low,high in sorted(spans):
        if low<=stop+1e-5: stop=max(stop,high)
    return stop>=length-1e-5


def spatial_module():
    import importlib.util
    path=Path(__file__).with_name("spatial_fit.py")
    code=path.read_bytes()
    module=importlib.util.module_from_spec(importlib.util.spec_from_file_location("_frc_spatial_fit",path))
    exec(compile(code,str(path),"exec"),module.__dict__)
    return module,hashlib.sha256(code).hexdigest()

def measure_pair(design, rows, proxies, solids, a, b, *, spatial_fit=None):
    """Measure the same placed pair with both Fusion kernels, recording unknown results."""
    import adsk.core
    import adsk.fusion
    manager = adsk.fusion.TemporaryBRepManager.get()
    row={"pair":[a,b],"identities":[[rows[i]["path"],rows[i]["name"]] for i in (a,b)]}
    spatial_errors={}
    if spatial_fit is not None:
        model,model_sha=spatial_module()
        region=spatial_fit["region"]
        if spatial_fit["host"] not in row["identities"]:
            raise ValueError("Spatial fit host is outside the exact pair")
        row["spatialFit"]={"commission":spatial_fit,"programSha256":model_sha,"methods":{}}
    def observe(key,bodies):
        if spatial_fit is None: return
        try:
            row["spatialFit"]["methods"][key]=native_spatial(model,region,manager,bodies)
        except Exception as e:
            spatial_errors[key]=str(e)
    def native():
        entities=adsk.core.ObjectCollection.create()
        entities.add(proxies[a]);entities.add(proxies[b])
        query=design.createInterferenceInput(entities);query.areCoincidentFacesIncluded=False
        result=design.analyzeInterference(query)
        if result is None:raise ValueError("Fusion returned no interference result")
        bodies=[r.interferenceBody for r in result]
        total=sum(1000*body.volume for body in bodies)
        observe("fusionInterference",bodies)
        return total
    def transient():
        def world(index):
            body,matrix=solids[index];shape=manager.copy(body)
            if not shape or (matrix and not manager.transform(shape,matrix)):
                raise ValueError("Native solid could not be copied to occurrence coordinates")
            return shape
        shape,other=world(a),world(b)
        if spatial_fit is not None:
            try:
                host=shape if row["identities"][0]==spatial_fit["host"] else other
                row["spatialFit"]["smoothPilot"]=native_pilot(host,region,model)
                male=other if host is shape else shape
                states=adsk.fusion.PointContainment
                def classify(point):
                    p=adsk.core.Point3D.create(*[x/10 for x in point])
                    return {states.PointInsidePointContainment:"material",states.PointOutsidePointContainment:"void"}.get(
                        male.pointContainment(p),"indeterminate")
                row["spatialFit"]["maleThread"]=model.thread_witness(region,spatial_fit["threadForm"],classify)
            except Exception as e:
                spatial_errors["representation"]=str(e)
        if not manager.booleanOperation(shape,other,adsk.fusion.BooleanTypes.IntersectionBooleanType):
            raise ValueError("Native transient intersection returned failure")
        if not shape.isValid:raise ValueError("Transient intersection body is invalid")
        total=1000*shape.volume if shape.lumps.count else 0
        observe("fusionTransient",[shape] if shape.lumps.count else [])
        return total
    errors={}
    for key,evaluate in (("interferenceMm3",native),("temporaryCommonMm3",transient)):
        try:
            value=evaluate()
            if not math.isfinite(value) or value<0:raise ValueError("Invalid intersection volume")
            row[key]=value
        except Exception as e:
            errors[key]=dict(type=type(e).__name__,message=str(e));row[key]=None
    row["status"]="unresolved" if errors else "measured"
    if errors:row["errors"]=errors
    if spatial_errors:row["spatialFit"]["errors"]=spatial_errors
    return row


def measure(design, rows, proxies, solids, checkpoint, fingerprint, batch, retry_pairs=()):
    pairs = []
    for a, b in itertools.combinations(range(len(rows)), 2):
        x, y = rows[a]["boundsMm"], rows[b]["boundsMm"]
        if min(min(x[k+3],y[k+3])-max(x[k],y[k]) for k in range(3)) >= -1e-6:
            pairs.append((a,b))
    inventory=[[r["path"],r["name"],r["boundsMm"],r["worldTransform"]] for r in rows]
    def signature(identity):
        return hashlib.sha256(json.dumps([identity,pairs,inventory],sort_keys=True,separators=(",",":")).encode()).hexdigest()
    spatial={}
    pose=fingerprint[1] if isinstance(fingerprint[1],dict) else {}
    for entry in pose.get("spatialFits",[]):
        identities=tuple(sorted(tuple(k) for k in entry["bodies"]))
        if len(identities)!=2 or identities[0]==identities[1] or identities in spatial:
            raise ValueError("Spatial fits require two distinct nonrepeated body identities")
        spatial[identities]=entry
    if spatial and pose.get("spatialProgramSha256")!=spatial_module()[1]:
        raise ValueError("Bind the registered native pose to the installed spatial evaluator")
    current=signature(fingerprint)
    progress={"schema":"agent-frc/fusion-interference-progress@1","study":current,"pairs":[]}
    if checkpoint.exists():
        prior=json.loads(checkpoint.read_text(encoding="utf-8"))
        # Same measured kernels and enumeration. The previous collector stopped
        # on a null response and only persisted successful numeric pairs.
        older=signature([*fingerprint[:3],"85fb31fc1040cdfb03eda414b3e67845ec26b8b09c6cabad202d49b7fc602fa9",
            "f3ea058c88481de80c6cd554cfff73758d2d77787e4a73f8cac9f6ec81b0465c"])
        previous=signature([*fingerprint[:4],"8a87902d4dddc0c6655febd21de781161866137532aa1bd807c3e565a271359e"])
        legacy=signature([*fingerprint[:4],"9a570e82486dbcf077d961a143cf6808666255dda1d17a0ac1a9b9bec0112dfe"])
        compatible=(current,) if spatial else (current,previous,older,legacy)
        if prior.get("study") not in compatible or any(r["pair"]!=list(pair) for r,pair in zip(prior["pairs"],pairs)):
            raise ValueError("Checkpoint belongs to another archive, native pose or scan")
        if prior["study"]==older and not all(all(isinstance(r.get(k),(float,int)) and math.isfinite(r[k]) and r[k]>=0
                for k in ("interferenceMm3","temporaryCommonMm3")) for r in prior["pairs"]):
            raise ValueError("Unrecognized legacy checkpoint outcomes")
        progress["pairs"]=prior["pairs"]
    def save():
        temp=checkpoint.with_suffix(".writing")
        temp.write_text(json.dumps(progress, separators=(",",":"),allow_nan=False),encoding="utf-8")
        temp.replace(checkpoint)
    if type(batch) is not int or batch<1:
        raise ValueError("Expected a positive native pair budget")
    offset=len(progress["pairs"])
    if offset>len(pairs):
        raise ValueError("Invalid resume position")
    retry={tuple(p) for p in retry_pairs}
    indices={tuple(row["pair"]):i for i,row in enumerate(progress["pairs"])}
    if any(p not in indices or progress["pairs"][indices[p]].get("status")!="unresolved" for p in retry):
        raise ValueError("Only a previously unresolved pair on the identical issue can be retried")
    if len(retry)>batch:raise ValueError("Retry set exceeds batch budget")
    def scan(pair):
        ids=tuple(sorted((rows[i]["path"],rows[i]["name"]) for i in pair))
        return measure_pair(design,rows,proxies,solids,*pair,spatial_fit=spatial.get(ids)) if ids in spatial else measure_pair(design,rows,proxies,solids,*pair)
    for pair in sorted(retry):
        progress["pairs"][indices[pair]]=scan(pair)
    for i in range(offset,min(len(pairs),offset+batch-len(retry))):
        progress["pairs"].append(scan(pairs[i]))
        if (i+1)%16==0:
            save()
    save()
    return {"method":"Fusion Design.analyzeInterference and placed temporary BRep intersection",
        "units":"mm3","candidatePairs":len(pairs),"unresolvedPairs":sum(r.get("status")=="unresolved" for r in progress["pairs"]),
        "complete":len(progress["pairs"])==len(pairs),
        "pairs":progress["pairs"],"programSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
