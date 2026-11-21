"""Measure complete placed STEP solid instances. OpenCascade is needed only for measurement."""
import math
from collections import Counter


def load_solids(path, identities=None):
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDF import TDF_Label
    from OCP.TDocStd import TDocStd_Document
    from OCP.TopAbs import TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopLoc import TopLoc_Location
    from OCP.XCAFDoc import XCAFDoc_DocumentTool
    try:
        from OCP.TDF import TDF_LabelSequence
    except ImportError:
        from OCP.collections import Sequence_TDF_Label as TDF_LabelSequence

    doc = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    table = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    reader = STEPCAFControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone or not reader.Transfer(doc):
        raise ValueError("Could not import the entire selected STEP")
    roots = TDF_LabelSequence()
    table.GetFreeShapes(roots)
    bodies, surfaces = [], []

    def label_name(label):
        attribute=TDataStd_Name()
        return attribute.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(),attribute) else ""

    def visit(label, location, indices, ancestry):
        children = TDF_LabelSequence()
        table.GetComponents_s(label, children)
        if children.Length():
            for i in range(1, children.Length()+1):
                child, definition = children.Value(i), TDF_Label()
                if not table.GetReferredShape_s(child, definition):
                    raise ValueError("Missing STEP occurrence definition")
                visit(definition, location.Multiplied(table.GetLocation_s(child)), indices+[i], ancestry+[label_name(child),label_name(definition)])
            return
        attribute = TDataStd_Name()
        name = attribute.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), attribute) else ""
        shape = table.GetShape_s(label).Moved(location)
        it = TopExp_Explorer(shape, TopAbs_SOLID)
        n = 0
        while it.More():
            n += 1
            bodies.append((name, ".".join(map(str,indices+[n])), it.Current(), ancestry))
            it.Next()
        if not n:
            surfaces.append(dict(name=name, occurrence=indices))
    for i in range(1,roots.Length()+1):
        visit(roots.Value(i), TopLoc_Location(), [i], [label_name(roots.Value(i))])
    if not bodies:
        raise ValueError("No STEP solid instances")
    counts = Counter(row[0] for row in bodies)
    names = [name if name and counts[name]==1 else f"{name or 'Solid'} [{occ}]" for name,occ,_,_ in bodies]
    if len(set(names)) != len(names):
        raise ValueError("Ambiguous solid occurrence identifiers")
    if identities is not None:
        identities.update({key:{"definition":row[0],"instance":row[1],"occurrencePath":row[3]} for key,row in zip(names,bodies)})
    return dict(zip(names,(row[2] for row in bodies))), surfaces


def box_gap(a,b):
    return math.hypot(*(max(a[i]-b[i+3], b[i]-a[i+3], 0) for i in range(3)))


def candidate_pairs(bodies,tolerance,extra):
    """Sweep the X bounds. AABB separations larger than the threshold certify a non-edge."""
    pairs = set(extra)
    ordered = sorted(bodies,key=lambda k:bodies[k][0])
    for i,a in enumerate(ordered):
        box = bodies[a]
        for j in range(i+1,len(ordered)):
            b = ordered[j]
            if bodies[b][0]-box[3]>tolerance+1e-7:
                break
            if box_gap(box,bodies[b])<=tolerance+1e-7:
                pairs.add(tuple(sorted((a,b))))
    return pairs


def repeated_interface_disagreements(shapes, pairs):
    """Compare repeated installed interfaces without equating names or copies of geometry."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from component_shape import boolean_measure

    # STEP instance paths and display names can differ. Retain the actual shared
    # OCCT definitions, orientation and exact relative rigid transform as the key.
    definitions = {}
    instances = {}
    for name, shape in shapes.items():
        placement = shape.Location()
        transform = placement.Transformation()
        if transform.IsNegative() or transform.ScaleFactor() != 1:
            continue
        token = (shape.TShape(), shape.Orientation())
        identity = definitions.setdefault(token, len(definitions))
        instances[name] = (identity, placement)

    counts = Counter(identity for identity, _ in instances.values())
    def matrix(location):
        tr = location.Transformation()
        return tuple(tr.Value(i, j) for i in range(1, 4) for j in range(1, 5))

    groups = {}
    for a, b, _, volume in pairs:
        if volume is None or a not in instances or b not in instances:
            continue
        left, lp = instances[a]
        right, rp = instances[b]
        if counts[left] < 2 or counts[right] < 2:
            continue
        if left > right:
            a, b, left, right, lp, rp = b, a, right, left, rp, lp
        relative = lp.Inverted().Multiplied(rp)
        frame = matrix(relative)
        if left == right and matrix(relative.Inverted()) < frame:
            a, b, frame = b, a, matrix(relative.Inverted())
        groups.setdefault((left, right, frame), []).append((a, b, volume))

    disagreements = []
    for group in groups.values():
        volumes = [v for _, _, v in group]
        if len(group) < 2 or math.isclose(min(volumes), max(volumes), rel_tol=1e-6, abs_tol=1e-8):
            continue
        a, b, _ = group[0]
        inverse = shapes[a].Location().Inverted()
        record = {"status": "open", "observations": [
            {"pair": sorted((x, y)), "worldCommonMm3": v} for x, y, v in group],
            "referencePair": [a, b]}
        try:
            value, valid = boolean_measure(shapes[a].Moved(inverse), shapes[b].Moved(inverse), BRepAlgoAPI_Common)
            record.update(referenceCommonMm3=value if math.isfinite(value) else None,
                          referenceTopologyValid=valid and math.isfinite(value) and value >= 0)
        except (ValueError, RuntimeError) as exc:
            record["referenceError"] = str(exc)
        disagreements.append(record)
    return disagreements


def measure(path,tolerance,probes, *, volumes=False, separation_axes=()):
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError("Use a nonnegative distance tolerance in millimeters")
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box
    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
    shapes, surfaces = load_solids(path)
    boxes = {}
    for name,shape in shapes.items():
        box=Bnd_Box()
        BRepBndLib.AddOptimal_s(shape,box,False,False)
        boxes[name]=[*box.CornerMin().Coord(),*box.CornerMax().Coord()]
    pairs=[]
    unresolved=[]
    body_volumes={}
    if volumes:
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
        from component_shape import boolean_measure, volume as solid_volume
    from placed_separation import projected_clearance, registered_axes
    requested=registered_axes(separation_axes,shapes)
    probes=set(probes)
    projections=[]
    for a,b in sorted(candidate_pairs(boxes,tolerance,probes | set(requested))):
        if a not in shapes or b not in shapes:
            raise ValueError("Unknown solid in distance probe: "+str((a,b)))
        projected=None
        if (a,b) in requested:
            projected=projected_clearance(shapes,(a,b),requested[(a,b)],tolerance)
            projections.append(projected)
            if projected["status"]=="separated" and (a,b) not in probes:
                # Only separation from the contact graph is required for this pair.
                # A commissioned connection below still receives its exact distance.
                row=[a,b,projected["clearanceLowerBoundMm"]]
                if volumes:
                    row.append(0.0)
                pairs.append(row)
                projected["pairDistanceKind"]="lower-bound"
                continue
            projected["pairDistanceKind"]="extrema"
        query=BRepExtrema_DistShapeShape(shapes[a],shapes[b])
        if not query.IsDone() or not math.isfinite(query.Value()) or query.Value()<0:
            raise ValueError("Unresolved STEP distance: "+str((a,b)))
        row = [a,b,query.Value()]
        if volumes:
            # A zero-thickness overlap of the enclosing boxes bounds common material to zero.
            widths = [min(boxes[a][i+3],boxes[b][i+3])-max(boxes[a][i],boxes[b][i]) for i in range(3)]
            volume = 0.0
            certified=projected is not None and projected["status"]=="separated"
            if certified and query.Value()+1e-7<projected["clearanceLowerBoundMm"]:
                unresolved.append({"pair":[a,b],"rawCommonMm3":None,"topologyValid":None,
                                   "reason":"Exact distance disagrees with the directional separation bound"})
                volume=None
            elif min(widths)>0 and not certified:
                diagnostic={"pair":[a,b],"rawCommonMm3":None,"topologyValid":None}
                try:
                    volume,valid=boolean_measure(shapes[a],shapes[b],BRepAlgoAPI_Common)
                    diagnostic.update(rawCommonMm3=volume if math.isfinite(volume) else None, topologyValid=valid)
                    if not valid:
                        raise ValueError("Computed common has invalid BRep topology")
                    if not math.isfinite(volume) or volume<0:
                        raise ValueError("Computed common has an invalid volume")
                    if volume>0:
                        for name in (a,b):
                            if name not in body_volumes:
                                body_volumes[name]=solid_volume(shapes[name])
                        bound=min(body_volumes[a],body_volumes[b])
                        if volume>bound and not math.isclose(volume,bound,rel_tol=1e-8,abs_tol=1e-8):
                            diagnostic["smallerOperandMm3"]=bound
                            raise ValueError("Computed common exceeds its smaller operand")
                except (ValueError,RuntimeError) as error:
                    diagnostic["reason"]=str(error)
                    unresolved.append(diagnostic)
                    volume=None
            row.append(volume)
        pairs.append(row)
    result={"schema":"agent-frc/step-solid-intersections@1" if volumes else "agent-frc/step-solid-distances@1","method":"placed-step-distance-and-common-volume" if volumes else "placed-step-solid-distance-v1","units":"mm",
            "toleranceMm":tolerance,"bodies":boxes,"nonSolidLeaves":surfaces,"pairs":pairs}
    if projections:
        result["projectedSeparations"]=projections
    if unresolved:
        result["unresolvedIntersections"]=unresolved
    if volumes:
        discrepancies=repeated_interface_disagreements(shapes,pairs)
        if discrepancies:
            result["repeatedInterfaceDisagreements"]=discrepancies
    return result
