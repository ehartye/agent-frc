"""Compare a placed smooth two-pulley band with the registered pitch path and inspect pulley sections."""
import argparse
import json
import math
from pathlib import Path

from mechanical_readiness import number, pinned, read, require
from placed_separation import direction
from stock_sections import entities, stock_difference


def pitch_loop(centers, radii):
    distance = math.dist(*centers)
    delta = abs(radii[0] - radii[1])
    require(distance > sum(radii), "The two parallel pitch circles must have external clearance")
    return 2 * math.sqrt(distance**2 - delta**2) + math.pi * sum(radii) + 2 * delta * math.asin(delta / distance)


def band_wire(centers, radii, axis):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire
    from OCP.GC import GC_MakeArcOfCircle
    from OCP.gp import gp_Pnt, gp_Vec

    c, d = [gp_Pnt(*p) for p in centers]
    u = gp_Vec(c, d).Normalized()
    side = gp_Vec(*axis).Crossed(u).Normalized()
    a = (radii[0] - radii[1]) / c.Distance(d)
    b = math.sqrt(1 - a*a)
    high, low = [u.Multiplied(a).Added(side.Multiplied(sign*b)) for sign in (1,-1)]
    cf, df = c.Translated(high.Multiplied(radii[0])), d.Translated(high.Multiplied(radii[1]))
    cb, db = c.Translated(low.Multiplied(radii[0])), d.Translated(low.Multiplied(radii[1]))
    def arc(start, middle, end):
        return BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(start, middle, end).Value()).Edge()
    wire = BRepBuilderAPI_MakeWire()
    for edge in [BRepBuilderAPI_MakeEdge(cf, df).Edge(), arc(df, d.Translated(u.Multiplied(radii[1])), db),
                 BRepBuilderAPI_MakeEdge(db, cb).Edge(), arc(cb, c.Translated(u.Multiplied(-radii[0])), cf)]:
        wire.Add(edge)
    require(wire.IsDone(), "Could not construct both tangent spans and wraps")
    return wire.Wire()


def reference_band(centers, radii, axis, inner, outer, width):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
    from OCP.gp import gp_Vec
    rim = band_wire(centers, [r+outer for r in radii], axis)
    bore = band_wire(centers, [r-inner for r in radii], axis)
    bore.Reverse()
    face = BRepBuilderAPI_MakeFace(rim, True)
    face.Add(bore)
    return BRepPrimAPI_MakePrism(face.Face(), gp_Vec(*axis).Multiplied(width)).Shape()


def tip_radius(shape, center, axis, offset):
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
    from OCP.GeomAbs import GeomAbs_Circle, GeomAbs_Line
    from OCP.TopAbs import TopAbs_EDGE
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Dir, gp_Pln, gp_Pnt, gp_Vec
    origin = gp_Pnt(*center).Translated(gp_Vec(*axis).Multiplied(offset))
    section = BRepAlgoAPI_Section(shape, gp_Pln(origin, gp_Dir(*axis)))
    require(section.IsDone() and not section.Shape().IsNull(), "Unresolved pulley cross-section")
    measured = []
    for edge in entities(section.Shape(), TopAbs_EDGE):
        curve = BRepAdaptor_Curve((getattr(TopoDS, "Edge_s", None) or TopoDS.Edge)(edge))
        start, end = curve.FirstParameter(), curve.LastParameter()
        times = [start, end]
        if curve.GetType() == GeomAbs_Circle:
            circle = curve.Circle()
            delta = gp_Vec(origin, circle.Location())
            frame = circle.Position()
            phase = math.atan2(delta.Dot(gp_Vec(frame.YDirection())), delta.Dot(gp_Vec(frame.XDirection())))
            t = phase + 2*math.pi*math.ceil((start-phase)/(2*math.pi))
            if start <= t <= end:
                times.append(t)
        else:
            require(curve.GetType() == GeomAbs_Line, "Unsupported edge in pulley section")
        measured.extend(origin.Distance(curve.Value(t)) for t in times)
    require(measured and all(number(v) for v in measured), "The named pulley has no finite section at this station")
    return max(measured)


def inspect(parts, plan):
    from collections import Counter
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.GeomAbs import GeomAbs_Cylinder
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS
    from component_shape import boolean_measure, volume
    from stock_sections import compare_limit
    axis = direction(plan["axisWorld"])
    rows, belt = plan["pulleys"], plan["belt"]
    require(len(rows) == 2 and len({belt, *(r["solid"] for r in rows)}) == 3, "Name the belt and two separate installed pulley solids")
    centers = [r["centerAtStartMm"] for r in rows]
    require(all(len(p) == 3 and all(number(v) for v in p) for p in centers), "Supply both finite pulley centers at the same belt end")
    require(abs(sum(n*(b-a) for n,a,b in zip(axis,*centers))) <= 1e-7, "Pulley centers must lie in one registered transverse plane")
    pitch, teeth = plan["pitchMm"], plan["beltTeeth"]
    require(number(pitch) and pitch > 0 and all(type(n) is int and n > 0 for n in [teeth, *(r["teeth"] for r in rows)]), "Register positive pitch and integer tooth counts")
    radii = [r["teeth"]*pitch/(2*math.pi) for r in rows]
    inside, outside, width = (plan[k] for k in ("pitchToInnerMm","pitchToOuterMm","widthMm"))
    require(all(number(n) and n > 0 for n in (inside,outside,width)) and inside < min(radii), "Register finite band thickness about the pitch line and axial width")
    stations = plan["stationsFromStartMm"]
    require(isinstance(stations,list) and stations and all(number(v) and 0 < v < width for v in stations) and len(set(stations)) == len(stations), "Register distinct transverse stations inside the band")
    loop = pitch_loop(centers, radii)
    tol, resolution = plan["pitchLengthToleranceMm"], plan["shapeResolutionMm3"]
    require(all(number(v) and v >= 0 for v in (tol,resolution)), "Supply justified length and volume comparison limits")
    reference = reference_band(centers, radii, axis, inside, outside, width)
    section = stock_difference(reference, parts[belt], axis)
    face_types, cylinders = Counter(), []
    for face in entities(parts[belt], TopAbs_FACE):
        surface = BRepAdaptor_Surface((getattr(TopoDS,"Face_s",None) or TopoDS.Face)(face))
        face_types[surface.GetType().name] += 1
        if surface.GetType() == GeomAbs_Cylinder:
            c = surface.Cylinder()
            cylinders.append(dict(axisPointMm=c.Location().Coord(), axis=c.Axis().Direction().Coord(), radiusMm=c.Radius()))
    mates = [row["solid"] for row in rows]
    others = plan.get("obstacles", [])
    require(isinstance(others,list) and len(set([belt,*mates,*others])) == 3+len(others)
            and all(name in parts for name in [belt,*mates,*others]), "Register distinct, installed pulley and obstacle identities")
    observations = []
    for name in mates + others:
        pair = dict(solids=[belt,name], role="registered-pulley" if name in mates else "other-installed-solid")
        try:
            raw, valid = boolean_measure(parts[belt], parts[name], BRepAlgoAPI_Common)
            pair.update(rawCommonMm3=raw, validResultTopology=valid)
            require(all(BRepCheck_Analyzer(parts[n]).IsValid() for n in (belt,name))
                    and valid and number(raw) and 0 <= raw <= min(volume(parts[belt]),volume(parts[name]))+1e-7,
                    "Invalid input, result topology or common volume")
            pair["measuredCommonMm3"] = raw
        except (ValueError, RuntimeError) as e:
            pair.update(measuredCommonMm3=None, reason=str(e))
        observations.append(pair)
    readings = []
    for row, c, r in zip(rows, centers, radii):
        valid_pulley = BRepCheck_Analyzer(parts[row["solid"]]).IsValid()
        for z in stations:
            item = dict(pulley=row["solid"], fromStartMm=z)
            try:
                require(valid_pulley, "Invalid pulley solid")
                radius = tip_radius(parts[row["solid"]], c, axis, z)
                item.update(maximumRadiusMm=radius, aboveInnerRadiusMm=radius-(r-inside), remainingToOuterRadiusMm=r+outside-radius)
            except (ValueError, RuntimeError, KeyError) as e:
                item.update(reason=str(e))
            readings.append(item)
    return dict(pitchLoopMm=loop, registeredPitchLengthMm=pitch*teeth, pitchLengthMatches=abs(loop-pitch*teeth) <= tol,
                beltFaces=dict(face_types), beltCylinders=cylinders, pairObservations=observations,
                smoothEnvelopeComparison=compare_limit(section,resolution), sectionDifference=section, sampledMetal=readings,
                matingAndLoad="open", scope="Fixed geometry and sampled radial extrema. Actual tooth engagement, tension, tracking, loading and unrelated pairs require separate evidence.")


def run(root, plan):
    from showcase_contacts import load_solids
    require(plan.get("schema") == "agent-frc/belt-envelope@1", "Expected a belt-envelope plan")
    step = pinned(root, plan["step"])
    dims = read(pinned(root, plan["dimensionSource"]))
    require(dims.get("schema") == "agent-frc/two-pulley-dimensions@1" and isinstance(dims.get("basis"),str)
            and dims["basis"].strip(), "Identify the dimensional source and whether it is a drawing or an engineering hypothesis")
    rows, counts = plan["pulleys"], dims["pulleyTeeth"]
    keys = ("pitchMm","beltTeeth","widthMm","pitchToInnerMm","pitchToOuterMm")
    require(not any(k in plan for k in keys) and all("teeth" not in r for r in rows)
            and len(counts) == len(rows) == 2, "Read purchased dimensions from the pinned register once")
    actual = dict(plan, **{k:dims[k] for k in keys})
    actual["pulleys"] = [dict(row,teeth=n) for row,n in zip(rows,counts)]
    result = inspect(load_solids(step)[0], actual)
    return dict(stepSha256=plan["step"]["sha256"], dimensionSource=plan["dimensionSource"], dimensionBasis=dims["basis"], **result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.project.resolve(),read(args.plan)), indent=2, allow_nan=False))

