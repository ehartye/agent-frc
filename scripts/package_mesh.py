"""Tessellate a valid placed package solid for display. Keep the source BRep for clearance."""
from OCP.BRep import BRep_Tool
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS


def surface_mesh(solid):
    BRepMesh_IncrementalMesh(solid, 0.08, False, 0.15, False)
    vertices = []
    indices = {}
    triangles = []
    faces = TopExp_Explorer(solid, TopAbs_FACE)
    while faces.More():
        face = (getattr(TopoDS, "Face_s", None) or TopoDS.Face)(faces.Current())
        location = TopLoc_Location()
        mesh = BRep_Tool.Triangulation_s(face, location)
        if mesh is None:
            raise ValueError("Package face has no display triangulation")
        placement = location.Transformation()
        face_indices = []
        for i in range(1, mesh.NbNodes() + 1):
            point = mesh.Node(i).Transformed(placement).Coord()
            if point not in indices:
                indices[point] = len(vertices)
                vertices.append(point)
            face_indices.append(indices[point])
        for i in range(1, mesh.NbTriangles() + 1):
            triangle = [face_indices[j - 1] for j in mesh.Triangle(i).Get()]
            if face.Orientation() == TopAbs_REVERSED:
                triangle.reverse()
            triangles.append(triangle)
        faces.Next()
    if not triangles:
        raise ValueError("Empty package mesh")
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(solid, props, True)
    return {"vertices": vertices, "triangles": triangles, "volumeMm3": props.Mass()}
