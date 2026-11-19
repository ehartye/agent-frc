"""Read placed, installed Fusion solids including hidden occurrences. Coordinates are in mm."""
import math

import adsk.core
import adsk.fusion


def bounds_mm(body):
    box = body.preciseBoundingBox
    return [v * 10 for v in box.minPoint.asArray() + box.maxPoint.asArray()]


def identity(occurrence, body):
    return [occurrence.fullPathName if occurrence else "@root", body.name]


def catalog(root):
    instances = [(None, b) for b in root.bRepBodies]
    for occ in root.allOccurrences:
        instances.extend((occ, b) for b in occ.component.bRepBodies)
    found = {}
    for occurrence, body in instances:
        key = tuple(identity(occurrence, body))
        if key in found:
            raise ValueError("Ambiguous physical occurrence/body: " + repr(key))
        found[key] = (occurrence, body)
    return found


def visible(instance):
    occurrence, body = instance
    return {"bodyBulb": body.isLightBulbOn,
            "occurrenceBulb": occurrence.isLightBulbOn if occurrence else True,
            "occurrenceVisible": occurrence.isVisible if occurrence else True}


def placed(manager, instance):
    occurrence, body = instance
    copy = manager.copy(body)
    if not copy.isSolid:
        raise RuntimeError("The requested physical inventory contains a non-solid BRep")
    if occurrence and not manager.transform(copy, occurrence.transform2):
        raise RuntimeError("Occurrence placement failed")
    return copy


def common(manager, a, b):
    result = manager.copy(a)
    if not manager.booleanOperation(result, b, adsk.fusion.BooleanTypes.IntersectionBooleanType):
        raise RuntimeError("Boolean intersection failed")
    return result


def overlap_mm3(manager, a, b):
    result = common(manager, a, b)
    if result.faces.count == 0:
        return 0.0
    if not result.isSolid or not math.isfinite(result.volume) or result.volume <= 0:
        raise RuntimeError("Intersection has faces without measurable positive solid material")
    return result.volume * 1000


def exterior_plane(face):
    plane = adsk.core.Plane.cast(face.geometry)
    if not plane:
        return None
    normal = plane.normal.copy()
    if face.isParamReversed:
        normal.scaleBy(-1)
    return face.pointOnFace, normal


def bearing_mm2(manager, a, b, plane_tolerance_cm):
    # Intersect trimmed finite face sheets, including holes. Parallel planes alone have no area.
    area = 0.0
    for fa in a.faces:
        first = exterior_plane(fa)
        if first is None:
            continue
        point, normal = first
        for fb in b.faces:
            second = exterior_plane(fb)
            if second is None:
                continue
            other, outward = second
            if normal.dotProduct(outward) > -1 + 1e-10:
                continue
            if abs(point.vectorTo(other).dotProduct(normal)) > plane_tolerance_cm:
                continue
            intersection = common(manager, fa, manager.copy(fb))
            area += sum(face.area for face in intersection.faces) * 100
    return area


def box(manager, limits_mm):
    mid = [(limits_mm[i] + limits_mm[i + 3]) / 20 for i in range(3)]
    sizes = [(limits_mm[i + 3] - limits_mm[i]) / 10 for i in range(3)]
    frame = adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create(*mid),
        adsk.core.Vector3D.create(1, 0, 0), adsk.core.Vector3D.create(0, 1, 0), *sizes)
    return manager.createBox(frame)


def controls(manager):
    cube = box(manager, [0,0,0,2,2,2])
    crossed = box(manager, [1,1,1,3,3,3])
    separate = box(manager, [4,0,0,6,2,2])
    touching = box(manager, [2,1,0,4,3,2])
    coplanar_but_apart = box(manager, [2,4,0,4,6,2])
    return {"known1Mm3": overlap_mm3(manager, cube, crossed),
            "disjointMm3": overlap_mm3(manager, cube, separate),
            "known2Mm2": bearing_mm2(manager, cube, touching, 1e-7),
            "coplanarApartMm2": bearing_mm2(manager, cube, coplanar_but_apart, 1e-7)}


def inspect(design, support_id, bearing_ids):
    """Scan all physical bodies in this assembly against one installed support occurrence."""
    manager = adsk.fusion.TemporaryBRepManager.get()
    measure = adsk.core.Application.get().measureManager
    found = catalog(design.rootComponent)
    previous = {key: visible(instance) for key, instance in found.items()}
    result = {"controls": controls(manager), "physical": [], "pairs": []}
    copies = {key: placed(manager, instance) for key, instance in found.items()}
    support = copies.get(tuple(support_id))
    for key, copied in copies.items():
        result["physical"].append({"id": list(key), "boundsMm": bounds_mm(copied),
                                   "before": previous[key], "after": visible(found[key])})
        if key == tuple(support_id) or support is None:
            continue
        pair = {"other": list(key)}
        try:
            pair["intersectionMm3"] = overlap_mm3(manager, support, copied)
            pair["minimumDistanceMm"] = 10 * measure.measureMinimumDistance(support, copied).value
            if key in bearing_ids:
                pair["opposedPlanarTrimAreaMm2"] = bearing_mm2(manager, support, copied, 1e-7)
        except RuntimeError as error:
            pair["unknown"] = str(error)
        result["pairs"].append(pair)
    for row in result["physical"]:
        row["after"] = visible(found[tuple(row["id"])])
    return result
