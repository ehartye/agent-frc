"""Bound indentation into a spherical or round-section toroidal payload during a rigid motion."""
import math

from mechanical_readiness import named, number, pinned, read, require


def section(shape):
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeVertex
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepGProp import BRepGProp
    from OCP.GeomAbs import GeomAbs_Sphere, GeomAbs_Torus
    from OCP.GProp import GProp_GProps
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Circ

    require(shape.ShapeType() == TopAbs_SOLID and BRepCheck_Analyzer(shape).IsValid(),
            "Compression requires one valid solid payload")
    faces = TopExp_Explorer(shape, TopAbs_FACE)
    require(faces.More(), "Payload has no surface")
    as_face = getattr(TopoDS, "Face_s", None) or TopoDS.Face
    surface = BRepAdaptor_Surface(as_face(faces.Current()))
    faces.Next()
    require(not faces.More(), "Compression requires one complete analytic payload surface")
    if surface.GetType() == GeomAbs_Sphere:
        sphere = surface.Sphere()
        radius = sphere.Radius()
        center = BRepBuilderAPI_MakeVertex(sphere.Location()).Vertex()
        volume = 4 * math.pi * radius**3 / 3
    else:
        require(surface.GetType() == GeomAbs_Torus, "Expected spherical or toroidal game piece")
        torus = surface.Torus()
        radius = torus.MinorRadius()
        require(torus.MajorRadius() > radius, "Expected a torus with an open center")
        circle = gp_Circ(torus.Position().Ax2(), torus.MajorRadius())
        center = BRepBuilderAPI_MakeEdge(circle).Edge()
        volume = 2 * math.pi**2 * torus.MajorRadius() * radius**2
    properties = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, properties, True)
    require(math.isclose(properties.Mass(), volume, rel_tol=1e-6), "Payload differs from the full analytic solid")
    return center, radius


def trial_pin(root, rule):
    """Check the optional pinned trial behind a rule's allowance: the trial record's named field must hold the depth."""
    evidence = rule.get("evidence")
    if evidence is None:
        return
    require(root is not None and isinstance(evidence, dict) and set(evidence) == {"file", "sha256", "field"}
            and named(evidence["field"]), "Pin a compression trial by file, sha256 and field, the record field that holds the depth")
    record = read(pinned(root, dict(file=evidence["file"], sha256=evidence["sha256"])))
    value = record.get(evidence["field"]) if isinstance(record, dict) else None
    require(number(value) and value == rule["maxDepthMm"],
            "Compression allowance for " + rule["payload"] + " on " + rule["contact"] + " differs from " + evidence["field"]
            + " in its pinned trial")


def interfaces(case, scene, excluded, root=None):
    entries = {}
    sections = {}
    for rule in case.get("payloadCompression", []):
        payload, contact = rule["payload"], rule["contact"]
        pair = tuple(sorted((payload, contact)))
        require(payload in scene and contact in scene and payload != contact and pair not in entries
                and pair not in excluded and named(rule.get("basis")), "Name one distinct compliant payload interface and its basis")
        if payload not in sections:
            sections[payload] = section(scene[payload])
        center, radius = sections[payload]
        limit = rule["maxDepthMm"]
        require(number(limit) and 0 < limit < radius, "Compression allowance must be within the piece section radius")
        trial_pin(root, rule)
        entries[pair] = (rule, center, radius)
    return entries


def sweep(entry, scene, moves, rates, depth, transform, distance):
    rule, center, radius = entry
    piece, contact = rule["payload"], rule["contact"]
    speed = rates.get(piece, 0) + rates.get(contact, 0)
    piece_ops, contact_ops = moves.get(piece, []), moves.get(contact, [])
    if piece_ops == contact_ops:
        speed = 0
    limit = rule["maxDepthMm"]
    result = dict(pair=[piece, contact], method="payload section indentation", basis=rule["basis"],
                  limitMm=limit, maxObservedDepthMm=0., status="pass")
    if rule.get("evidence") is not None:
        result["evidence"] = dict(rule["evidence"])
    samples = {}

    def separation(t):
        if t not in samples:
            samples[t] = distance(transform(center, piece_ops, t), transform(scene[contact], contact_ops, t))
            indentation = max(0., radius - samples[t])
            if indentation > result["maxObservedDepthMm"]:
                result.update(maxObservedDepthMm=indentation, witnessTime=t)
        return samples[t]

    pending = [(0., 1., 0)]
    certified = 0.
    separation(0.)
    separation(1.)
    while pending and result["maxObservedDepthMm"] <= limit:
        lo, hi, level = pending.pop()
        mid = (lo + hi) / 2
        lower = separation(mid) - speed * (hi - lo) / 2
        upper = max(0., radius - lower)
        if upper <= limit:
            certified = max(certified, upper)
        elif level == depth:
            result.setdefault("unresolvedInterval", [lo, hi])
        else:
            pending.extend([(lo, mid, level + 1), (mid, hi, level + 1)])
    if result["maxObservedDepthMm"] > limit:
        result["status"] = "fail"
    elif "unresolvedInterval" in result:
        result["status"] = "open"
    else:
        result["upperBoundMm"] = certified
    result["samples"] = len(samples)
    return result
