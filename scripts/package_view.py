"""Build a local wireframe player from the exact rigid trajectories being checked."""
import hashlib
import json
from pathlib import Path

from mechanical_motion import transforms
from mechanical_readiness import require


def capture(case, scene):
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.GeomAbs import GeomAbs_Line, GeomAbs_Plane
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
    from OCP.TopExp import TopExp, TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Trsf
    bodies = {}
    for name, solid in sorted(scene.items()):
        require(BRepCheck_Analyzer(solid).IsValid(), "Invalid package solid: " + name)
        faces = TopExp_Explorer(solid, TopAbs_FACE)
        while faces.More():
            face = (getattr(TopoDS,'Face_s',None) or TopoDS.Face)(faces.Current())
            require(BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane, "Use a planar blocking solid: " + name)
            faces.Next()
        edges = TopExp_Explorer(solid, TopAbs_EDGE)
        segments = set()
        while edges.More():
            edge = (getattr(TopoDS,'Edge_s',None) or TopoDS.Edge)(edges.Current())
            require(BRepAdaptor_Curve(edge).GetType() == GeomAbs_Line, "Use straight blocking edges: " + name)
            pair = [BRep_Tool.Pnt_s(getter(edge)).Coord() for getter in (TopExp.FirstVertex_s, TopExp.LastVertex_s)]
            segments.add(tuple(sorted(pair)))
            edges.Next()
        require(segments, "No visible block edges: " + name)
        matrices = []
        moves = case["moves"].get(name, [])
        for i in range(25 if moves else 1):
            combined = gp_Trsf()
            for operation in transforms(moves, i / 24):
                combined.PreMultiply(operation)
            matrices.append([combined.Value(r, c) for r in (1, 2, 3) for c in (1, 2, 3, 4)])
        bodies[name] = dict(edges=sorted(segments), matrices=matrices)
    return dict(id=case["id"], stage=case["stage"], bodies=bodies)


def verify_view(root, plan, scenes, write):
    name = plan.get("view")
    if not name:
        return None
    path = (root / name).resolve()
    require(not Path(name).is_absolute() and path.is_relative_to(root) and path.suffix.lower() == ".html",
            "Select a project-relative HTML view")
    template = Path(__file__).with_name("package-view.html").read_text(encoding="utf-8")
    series = dict(issue=plan["issue"], step=plan["step"], motion=plan["motion"], groups=plan["groups"], cases=scenes)
    data = json.dumps(series, allow_nan=False, sort_keys=True, separators=(",", ":")).replace("<", "\\u003c")
    expected = template.replace("PACKAGE_DATA", data).encode("utf-8")
    if write and not path.exists():
        with path.open("xb") as output:
            output.write(expected)
    return dict(file=name, sha256=hashlib.sha256(expected).hexdigest(),
                verified=path.is_file() and path.read_bytes() == expected)
