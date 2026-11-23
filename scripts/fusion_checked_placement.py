"""Check a proposed rigid placement in a disposable copy before emitting a new native archive."""
from hashlib import sha256
from itertools import chain, combinations, product as pairs_between
import math
import os
import json
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory


def require(ok, message):
    if not ok:
        raise ValueError(message)


def nonnegative(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def identity(body):
    return body["path"], body["name"]


def product(a, b):
    return [sum(a[4*i+k]*b[4*k+j] for k in range(4)) for i in range(4) for j in range(4)]


def rigid(m):
    require(len(m)==16 and all(type(v) in (int,float) and math.isfinite(v) for v in m), "Invalid world transform")
    x,y,z=[m[i:i+3] for i in (0,4,8)]
    det=sum(x[i]*(y[(i+1)%3]*z[(i+2)%3]-y[(i+2)%3]*z[(i+1)%3]) for i in range(3))
    require(abs(det-1)<1e-8 and all(abs(sum(a*b for a,b in zip(r,s))-int(i==j))<1e-8
        for i,r in enumerate((x,y,z)) for j,s in enumerate((x,y,z))) and list(m[12:])==[0,0,0,1],
        "Expected a right-handed rigid world pose")
    return m


def inverse(m):
    r=[m[j*4+i] if i<3 and j<3 else int(i==j) for i in range(4) for j in range(4)]
    for i in range(3):
        r[i*4+3]=-sum(r[i*4+k]*m[k*4+3] for k in range(3))
    return r


def close(a,b):
    return len(a)==len(b) and all(abs(x-y)<=1e-7 for x,y in zip(a,b))


class PlacementPoseError(ValueError):
    """A requested occurrence was missing or attained a different assembly pose after recompute."""

    def __init__(self, receipt):
        self.receipt = receipt
        super().__init__(json.dumps(receipt, allow_nan=False))


def under(path, parent):
    return path==parent or path.startswith(parent+"+")


def sibling(name):
    # Fusion's Python interpreter outlives a script and a plugin installation.
    path=Path(__file__).resolve().with_name(name+".py")
    spec=importlib.util.spec_from_file_location("_placement_"+name,path)
    module=importlib.util.module_from_spec(spec)
    exec(compile(path.read_bytes(),str(path),"exec"),module.__dict__)
    return module


def verify_fit(root, interface, accepted_sha256):
    ref=interface["evidence"]
    basis=(root/ref["file"]).resolve()
    require(not Path(ref["file"]).is_absolute() and basis.is_relative_to(root) and basis.is_file(),
            "Resolve the approved fit inside the project's evidence directory")
    data=basis.read_bytes()
    # A SHA-256 typed beside the fit record, or the accepted archive digest repeated inside it, is verified when present.
    require(ref.get("sha256") in (None,sha256(data).hexdigest()), "Changed commissioned fit evidence")
    record=json.loads(data)
    require(record.get("schema")=="agent-frc/placement-fit@1" and record.get("acceptedSha256") in (None,accepted_sha256)
            and sorted(record["bodies"])==sorted(interface["bodies"])
            and record.get("spatialFit")==interface.get("spatialFit")
            and all(record[k]==interface[k] for k in ("minCommonMm3","maxCommonMm3","basis")),
            "Commissioned fit differs from this baseline, body pair, basis or limits")
    if "spatialFit" in interface:
        sibling("spatial_fit").verify_basis(root,record["sources"],interface["spatialFit"],accepted_sha256)


def inspect_proposal(before, after, request, measure, same_shape=None, *, accepted_sha256=None):
    """Root-world matrices use Fusion cm. Distances and volumes in the report use mm and mm³."""
    target=request["occurrence"]
    if "worldDeltaFromSourceCm" in request:
        source=request.get("sourceOccurrence")
        require("worldTransformCm" not in request and source in before["poses"] and target not in before["poses"],
                "Relative insertions need a single target and an existing reference occurrence")
        pose=product(rigid(request["worldDeltaFromSourceCm"]),before["poses"][source])
    else:
        pose=rigid(request["worldTransformCm"])
    require(isinstance(target,str) and target and target!="@root", "Name the proposed occurrence in the root assembly")
    actual = after["poses"].get(target)
    if actual is None or not close(actual,pose):
        raise PlacementPoseError({
            "schema": "agent-frc/placement-pose-veto@1",
            "reason": "missing-occurrence" if actual is None else "pose-mismatch",
            "message": "Target missing after recompute" if actual is None else "Target did not attain its requested world pose",
            "occurrence": target,
            "acceptedSha256": accepted_sha256,
            "sourceOccurrence": request.get("sourceOccurrence"),
            "priorWorldTransformCm": before["poses"].get(target),
            "requestedWorldTransformCm": pose,
            "observedWorldTransformCm": actual,
        })
    old={identity(b):b for b in before["bodies"]}
    rows=after["bodies"]
    now={identity(b):b for b in rows}
    require(len(now)==len(rows) and len(old)==len(before["bodies"]), "Ambiguous physical body identity")
    moving={k for k in now if under(k[0],target)}
    require(moving, "Proposed installation has no physical solids")
    insertion=target not in before["poses"]
    require(all(k in now for k in old) and (set(now)-set(old)==moving if insertion else set(now)==set(old)),
            "Proposal removed, replaced or created unrelated material")
    require(set(before["poses"]) <= set(after["poses"]) and all(insertion and under(k,target) for k in after["poses"].keys()-before["poses"].keys()),
            "Proposal altered the occurrence census outside its target")
    reference=request.get("sourceOccurrence") if insertion else target
    if reference:
        require(reference in before["poses"], "Missing reference assembly for the rigid placement")
        prior=before["poses"][reference]
        delta=product(pose,inverse(prior))
        original={k for k in old if under(k[0],reference)}
        require({(target+k[0][len(reference):],k[1]) for k in original}==moving,
                "Moved or repeated subtree differs from its reference inventory")
    def unchanged(original,current):
        return original["revision"]==current["revision"] or (same_shape and same_shape(original,current))
    for k in set(now)-moving:
        require(unchanged(old[k],now[k]),"Unrelated installed solid geometry changed: "+repr(k))
        for field in ("world","boundsMm"):
            prior,current=old[k][field],now[k][field]
            require(close(prior,current),
                    f"Unrelated installed solid changed: {k} {field} {prior} -> {current}")
    for k in moving:
        if reference:
            original=old[(reference+k[0][len(target):],k[1])]
            require(unchanged(original,now[k]) and close(product(delta,original["world"]),now[k]["world"]),
                    "A target descendant did not follow the commissioned rigid placement: "+repr(k))
    rules={}
    for item in request.get("interfaces",[]):
        pair=tuple(sorted(tuple(v) for v in item["bodies"]))
        kind=item["kind"]
        require(len(pair)==2 and pair[0]!=pair[1] and all(v in now for v in pair) and any(v in moving for v in pair)
                and pair not in rules and isinstance(item.get("basis"),str) and item["basis"].strip(),"Unbound or ambiguous placement interface")
        require(kind in ("clearance","bearing","fit"),"Unknown interface disposition")
        limits={"clearance":{"minGapMm"},"bearing":{"maxGapMm"},"fit":{"minCommonMm3","maxCommonMm3"}}[kind]
        spatial=item.get("spatialFit")
        if spatial is not None:
            require(kind=="fit" and spatial["bodies"]==item["bodies"] and spatial["host"]==spatial["bodies"][1]
                    and spatial["expectedCommonMm3"]==[item["minCommonMm3"],item["maxCommonMm3"]]
                    and spatial["representation"]=="external-thread/smooth-pilot" and spatial["basis"]==item["basis"],
                    "Spatial fit must commission the exact modeled male, smooth pilot, limits and basis")
        require(set(item)=={"kind","basis","bodies",*limits,*(["evidence"] if kind=="fit" else []),*(["spatialFit"] if spatial is not None else [])}
                and all(nonnegative(item[k]) for k in limits),"Unexpected or missing pair-specific limit")
        if kind=="clearance":
            require(item["minGapMm"]>0,"Specify the required positive clearance")
        if kind=="fit":
            require(0<item["minCommonMm3"]<=item["maxCommonMm3"],"Specify a positive engineered fit interval")
        rules[pair]=item
    report={"occurrence":target,"worldTransformCm":pose,"status":"pass","broadPhaseClear":0,
            "operation":"insert" if insertion else "move","referenceOccurrence":reference,
            "movingSolids":len(moving),"stationarySolids":len(now)-len(moving),
            "unchangedInternalPairs":0,"measured":[]}
    moving_indices=[i for i,row in enumerate(rows) if identity(row) in moving]
    stationary_indices=[i for i,row in enumerate(rows) if identity(row) not in moving]
    for a,b in chain(pairs_between(moving_indices,stationary_indices),combinations(moving_indices,2)):
        left,right=rows[a],rows[b]
        pair=tuple(sorted((identity(left),identity(right))))
        rule=rules.get(pair,{})
        if reference and all(k in moving for k in pair) and not rule:
            report["unchangedInternalPairs"]+=1
            continue
        x,y=left["boundsMm"],right["boundsMm"]
        lower_bound=math.hypot(*(max(0,x[i]-y[i+3],y[i]-x[i+3]) for i in range(3)))
        if lower_bound>max(1e-6,rule.get("minGapMm",0)) and rule.get("kind") not in ("bearing","fit"):
            report["broadPhaseClear"]+=1
            continue
        record={"bodies":pair,"interface":rule.get("kind","nonmating"),"rule":rule}
        spatial_status=None
        try:
            values=measure(a,b,rule["spatialFit"]) if "spatialFit" in rule else measure(a,b)
            record.update(values)
            if "spatialFit" in rule:
                spatial_status,record["spatialReason"]=sibling("spatial_fit").native_result(values,rule["spatialFit"])
            v,w=values["interferenceMm3"],values["temporaryCommonMm3"]
            require(nonnegative(v) and nonnegative(w),"Missing or invalid intersection measurement")
            is_fit=rule.get("kind")=="fit"
            limit=rule["maxCommonMm3"] if is_fit else 0
            if max(v,w)>limit or (is_fit and min(v,w)<rule["minCommonMm3"]):
                status="blocked"
            else:
                require(abs(v-w)<=max(1e-7,1e-7*max(v,w)), "Native intersection methods disagree")
                distance=values["gapMm"]
                require(nonnegative(distance),"Missing or invalid separation measurement")
                status="pass" if rule.get("minGapMm",0)<=distance<=rule.get("maxGapMm",math.inf) else "blocked"
        except (RuntimeError,ValueError,KeyError,TypeError) as error:
            status="inconclusive"
            record["error"]=str(error)
        if spatial_status=="fail": status="blocked"
        elif spatial_status=="open" and status=="pass": status="inconclusive"
        record["status"]=status
        report["measured"].append(record)
        if status=="blocked" or (status=="inconclusive" and report["status"]=="pass"):
            report["status"]=status
    return report


def capture(design, placement_witness):
    import adsk.core
    import adsk.fusion
    root=design.rootComponent
    rows=[];proxies=[];solids=[];poses={};geometry={}
    manager=adsk.fusion.TemporaryBRepManager.get()
    for occ in [None,*root.allOccurrences]:
        comp=occ.component if occ else root
        path=occ.fullPathName if occ else "@root"
        matrix=occ.transform2 if occ else adsk.core.Matrix3D.create()
        world=rigid(list(matrix.asArray()))
        require(path not in poses and not comp.meshBodies.count, "Ambiguous occurrence or unresolved mesh: "+path)
        poses[path]=world
        for body in comp.bRepBodies:
            require(body.isSolid, "Unresolved non-solid body: "+path+"/"+body.name)
            placement_witness(body,occ,adsk.core.Point2D)
            proxy=body.createForAssemblyContext(occ) if occ else body
            box=proxy.preciseBoundingBox
            bounds=[10*v for p in (box.minPoint,box.maxPoint) for v in p.asArray()]
            require(all(math.isfinite(v) for v in bounds), "Unresolved placed bounds: "+path+"/"+body.name)
            require(all(bounds[i]<=bounds[i+3] for i in range(3)), "Inverted placed bounds: "+path+"/"+body.name)
            key=(comp.id,body.name)
            if key not in geometry:
                geometry[key]=manager.copy(body)
                require(geometry[key] is not None,"Unable to retain source geometry: "+path+"/"+body.name)
            rows.append(dict(path=path,name=body.name,boundsMm=bounds,world=world,revision=body.revisionId,geometryKey=key))
            proxies.append(proxy);solids.append((body,matrix if occ else None))
    return dict(bodies=rows,poses=poses,proxies=proxies,solids=solids,geometry=geometry)


def checked_placement(app, accepted_archive, accepted_sha256, output_archive, request, edit, *, evidence_root=None):
    """Run edit(design) only on an isolated copy. Publish a fresh archive exclusively after acceptance."""
    import adsk
    import adsk.fusion
    measure_pair=sibling("fusion_issue_contacts").measure_pair
    placement_witness=sibling("fusion_issue_inventory").placement_witness
    source=Path(accepted_archive).resolve()
    output=Path(output_archive).resolve()
    request=json.loads(json.dumps(request,allow_nan=False))
    # Pass None for the accepted digest to use the archive as read; a digest that is given must match it.
    if accepted_sha256 is None:
        require(source.is_file(),"Supply an accepted self-contained F3D and a fresh successor F3D")
        accepted_sha256=sha256(source.read_bytes()).hexdigest()
    for interface in request.get("interfaces",[]):
        if interface.get("kind")=="fit":
            root=Path(evidence_root or source.parent).resolve()
            verify_fit(root,interface,accepted_sha256)
    require(source.suffix.lower()==".f3d" and output.suffix.lower()==".f3d" and source!=output and not output.exists(),
            "Supply an accepted self-contained F3D and a fresh successor F3D")
    prior=app.activeDocument
    with TemporaryDirectory(dir=output.parent) as scratch:
        working=Path(scratch)/"retained.f3d"
        data=source.read_bytes()
        require(sha256(data).hexdigest()==accepted_sha256,"Accepted source bytes changed")
        working.write_bytes(data)
        doc=app.importManager.importToNewDocument(app.importManager.createFusionArchiveImportOptions(str(working)))
        try:
            design=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
            require(not doc.documentReferences.count and not any(o.isReferencedComponent for o in design.rootComponent.allOccurrences),
                    "Use a registered self-contained proposal copy; external component versions require their own authority check")
            before=capture(design,placement_witness)
            edit(design)
            adsk.doEvents()
            require(design.computeAll(),"Fusion could not recompute the proposal")
            require(not doc.documentReferences.count and not any(o.isReferencedComponent for o in design.rootComponent.allOccurrences),
                    "The proposed self-contained placement introduced an external reference")
            after=capture(design,placement_witness)
            def measure(a,b,spatial_fit=None):
                row=measure_pair(design,after["bodies"],after["proxies"],after["solids"],a,b,spatial_fit=spatial_fit)
                if row["status"]=="measured":
                    objects=after["proxies"]
                    try:
                        row["gapMm"]=10*app.measureManager.measureMinimumDistance(objects[a],objects[b]).value
                    except RuntimeError as error:
                        row["gapError"]=str(error)
                return row
            compared={}
            def same_shape(prior,current):
                key=prior["geometryKey"],current["geometryKey"]
                if key not in compared:
                    manager=adsk.fusion.TemporaryBRepManager.get()
                    shapes=before["geometry"][key[0]],after["geometry"][key[1]]
                    for left,right in (shapes,shapes[::-1]):
                        delta=manager.copy(left)
                        require(delta and manager.booleanOperation(delta,manager.copy(right),
                                adsk.fusion.BooleanTypes.DifferenceBooleanType),"Undetermined local shape difference")
                        if not delta.isValid or delta.lumps.count:
                            compared[key]=False
                            break
                    else:
                        compared[key]=True
                return compared[key]
            report=inspect_proposal(before,after,request,measure,same_shape,accepted_sha256=accepted_sha256)
            report["acceptedSha256"]=accepted_sha256
            if report["status"]=="pass":
                export=Path(scratch)/"candidate.f3d"
                require(design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(str(export))),
                        "Fusion failed to export the checked placement")
                require(sha256(source.read_bytes()).hexdigest()==accepted_sha256,"Accepted archive changed during placement")
                report["successorSha256"]=sha256(export.read_bytes()).hexdigest()
        finally:
            doc.close(False)
            if prior and prior.isValid:prior.activate()
        if report["status"]=="pass":
            os.link(export,output)
        return report
