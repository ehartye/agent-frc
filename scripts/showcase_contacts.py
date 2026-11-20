"""Measure complete placed STEP solid instances. OpenCascade is needed only for measurement."""
import math
from collections import Counter


def load_solids(path):
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

    def visit(label, location, indices):
        children = TDF_LabelSequence()
        table.GetComponents_s(label, children)
        if children.Length():
            for i in range(1, children.Length()+1):
                child, definition = children.Value(i), TDF_Label()
                if not table.GetReferredShape_s(child, definition):
                    raise ValueError("Missing STEP occurrence definition")
                visit(definition, location.Multiplied(table.GetLocation_s(child)), indices+[i])
            return
        attribute = TDataStd_Name()
        name = attribute.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), attribute) else ""
        shape = table.GetShape_s(label).Moved(location)
        it = TopExp_Explorer(shape, TopAbs_SOLID)
        n = 0
        while it.More():
            n += 1
            bodies.append((name, ".".join(map(str,indices+[n])), it.Current()))
            it.Next()
        if not n:
            surfaces.append(dict(name=name, occurrence=indices))
    for i in range(1,roots.Length()+1):
        visit(roots.Value(i), TopLoc_Location(), [i])
    if not bodies:
        raise ValueError("No STEP solid instances")
    counts = Counter(row[0] for row in bodies)
    names = [name if name and counts[name]==1 else f"{name or 'Solid'} [{occ}]" for name,occ,_ in bodies]
    if len(set(names)) != len(names):
        raise ValueError("Ambiguous solid occurrence identifiers")
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


def measure(path,tolerance,probes):
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
    for a,b in sorted(candidate_pairs(boxes,tolerance,probes)):
        if a not in shapes or b not in shapes:
            raise ValueError("Unknown solid in distance probe: "+str((a,b)))
        query=BRepExtrema_DistShapeShape(shapes[a],shapes[b])
        if not query.IsDone() or not math.isfinite(query.Value()) or query.Value()<0:
            raise ValueError("Unresolved STEP distance: "+str((a,b)))
        pairs.append([a,b,query.Value()])
    return {"schema":"agent-frc/step-solid-distances@1","method":"placed-step-solid-distance-v1","units":"mm",
            "toleranceMm":tolerance,"bodies":boxes,"nonSolidLeaves":surfaces,"pairs":pairs}
