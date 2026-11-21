"""Measure directed changes in placed, piecewise-extruded solid stock."""
import argparse
import json
import math
from pathlib import Path

from mechanical_readiness import number, pinned, read, require
from placed_separation import direction


def entities(shape, kind):
    from OCP.TopExp import TopExp_Explorer
    it = TopExp_Explorer(shape, kind)
    while it.More():
        yield it.Current()
        it.Next()


def stations(shape):
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder
    from OCP.TopAbs import TopAbs_FACE, TopAbs_VERTEX, TopAbs_SOLID
    from OCP.TopoDS import TopoDS

    require(len(list(entities(shape, TopAbs_SOLID))) == 1 and BRepCheck_Analyzer(shape).IsValid(),
            "Select a single valid solid")
    for face in entities(shape, TopAbs_FACE):
        s = BRepAdaptor_Surface((getattr(TopoDS, "Face_s", None) or TopoDS.Face)(face))
        if s.GetType() == GeomAbs_Plane:
            n = s.Plane().Axis().Direction()
            if min(abs(n.Z()), math.hypot(n.X(), n.Y())) <= 1e-13:
                continue
        elif s.GetType() == GeomAbs_Cylinder:
            a = s.Cylinder().Axis().Direction()
            if math.hypot(a.X(), a.Y()) <= 1e-13:
                continue
        raise ValueError("Every face must be a transverse or longitudinal plane or an axis-parallel cylinder")
    vertex = getattr(TopoDS, "Vertex_s", None) or TopoDS.Vertex
    values = [BRep_Tool.Pnt_s(vertex(v)).Z() for v in entities(shape, TopAbs_VERTEX)]
    require(len(set(values)) >= 2 and all(map(math.isfinite, values)), "Missing finite stock elevations")
    return values


def section_operation(a, b, operation):
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopAbs import TopAbs_FACE
    from support_equilibrium import properties
    tool = operation(a, b)
    require(tool.IsDone() and not tool.Shape().IsNull(), "Unresolved planar operation")
    shape = tool.Shape()
    require(BRepCheck_Analyzer(shape).IsValid(), "Invalid planar result topology")
    areas = [properties(face)[0] for face in entities(shape, TopAbs_FACE)]
    require(all(number(area) and area > 0 for area in areas), "A retained face has invalid area")
    return shape, math.fsum(areas)


def boundary_reserve(shape, tolerance):
    """Enclose the tolerance band at every trimmed section edge, including its ends."""
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.TopAbs import TopAbs_EDGE
    prop = GProp_GProps()
    area = 0.
    for edge in entities(shape, TopAbs_EDGE):
        BRepGProp.LinearProperties_s(edge, prop)
        length = prop.Mass()
        require(number(length) and length >= 0, "Unresolved section boundary length")
        area += 2 * tolerance * length + math.pi * tolerance**2
    return area


def stock_difference(before, after, axis):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common, BRepAlgoAPI_Cut
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.TopLoc import TopLoc_Location
    from OCP.gp import gp_Ax3, gp_Dir, gp_Pln, gp_Pnt, gp_Trsf
    from component_shape import volume
    from mechanical_motion import bounds
    rows = []
    result = {"axisWorld": list(direction(axis)), "status": "open", "slabs": rows}
    try:
        frame = gp_Trsf()
        frame.SetTransformation(gp_Ax3(gp_Pnt(), gp_Dir(*result["axisWorld"])))
        shapes = [s.Moved(TopLoc_Location(frame)) for s in (before, after)]
        levels = sorted(set(stations(shapes[0]) + stations(shapes[1])))
        boxes = [bounds(s) for s in shapes]
        x0, y0 = (min(box[i] for box in boxes) for i in (0, 1))
        x1, y1 = (max(box[i] for box in boxes) for i in (3, 4))
        footprint = (x1 - x0) * (y1 - y0)
        require(number(footprint) and footprint > 0, "Unbounded planar footprint")
        # A midpoint nearer its event faces than the model tolerance can snap to an end.
        # Charge the entire enclosing footprint for every unresolved thin interval.
        from OCP.ShapeAnalysis import ShapeAnalysis_ShapeTolerance
        from OCP.TopAbs import TopAbs_SHAPE
        model_tol = max(1e-7, *(ShapeAnalysis_ShapeTolerance().Tolerance(s, 1, TopAbs_SHAPE) for s in shapes))
        span = max(1., *(abs(x) for box in boxes for x in box))
        tol = 8 * (model_tol + 1e-13 * span + math.ulp(span))
        uncertain = boundary_error = 0.
        integrals = [0.] * 4
        for lo, hi in zip(levels, levels[1:]):
            h = hi - lo
            z = lo + h / 2
            row = {"rangeMm": [lo, hi]}
            rows.append(row)
            if h <= tol:
                row["unresolvedVolumeUpperMm3"] = h * footprint
                uncertain += h * footprint
                continue
            plane = BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0, 0, z), gp_Dir(0, 0, 1)),
                                            x0 - 1, x1 + 1, y0 - 1, y1 + 1).Face()
            (a, sa), (b, sb) = [section_operation(s, plane, BRepAlgoAPI_Common) for s in shapes]
            _, shared = section_operation(a, b, BRepAlgoAPI_Common)
            _, absent = section_operation(a, b, BRepAlgoAPI_Cut)
            _, extra = section_operation(b, a, BRepAlgoAPI_Cut)
            reserve = boundary_reserve(a, tol) + boundary_reserve(b, tol)
            row.update(midMm=z, beforeMm2=sa, afterMm2=sb, commonMm2=shared,
                       absentMm2=absent, extraMm2=extra, boundaryReserveMm2=reserve)
            eps = max(1e-8, 1e-9 * max(sa, sb))
            require(abs(sa - shared - absent) <= eps and abs(sb - shared - extra) <= eps,
                    "Directed planar cuts disagree with the measured common area")
            boundary_error += h * (reserve + eps)
            for i, area in enumerate([sa, sb, absent, extra]):
                integrals[i] += h * area
        volumes = [volume(s) for s in shapes]
        result.update(operandVolumesMm3=volumes, integratedOperandMm3=integrals[:2],
                      unresolvedVolumeUpperMm3=uncertain, boundaryReserveMm3=boundary_error,
                      topologyToleranceMm=model_tol, boundaryToleranceMm=tol)
        for measured, reported in zip(integrals, volumes):
            eps = max(1e-8, 1e-9 * reported)
            require(number(reported) and reported > 0 and measured > 0 and measured - eps <= reported <= measured + uncertain + eps,
                    "Integrated section areas disagree with the whole operand volume")
        def interval(value):
            return [max(0., value - boundary_error), value + boundary_error + uncertain]
        result.update(status="measured", absentMm3=integrals[2], extraMm3=integrals[3],
                      absentRangeMm3=interval(integrals[2]), extraRangeMm3=interval(integrals[3]))
    except (RuntimeError, ValueError) as exc:
        result["reason"] = str(exc)
    return result


def compare_limit(section, resolution):
    require(number(resolution) and resolution >= 0, "Specify a nonnegative shape comparison resolution")
    if not isinstance(section, dict) or section.get("status") != "measured":
        return "open"
    intervals = [section.get("absentRangeMm3"), section.get("extraRangeMm3")]
    if not all(isinstance(v, list) and len(v) == 2 and all(number(x) for x in v) and 0 <= v[0] <= v[1] for v in intervals):
        return "open"
    if any(low > resolution for low, high in intervals):
        return "fail"
    if section.get("directed3dDisagreement") or any(high > resolution for _, high in intervals):
        return "open"
    return "pass"


def run(root, plan):
    from component_shape import compare_components
    require(plan["schema"] == "agent-frc/stock-sections@1", "Invalid stock comparison plan")
    before, after = (pinned(root, plan[key]) for key in ("before", "after"))
    rows = plan["comparisons"]
    require(isinstance(rows, list) and rows and len({r["afterSolid"] for r in rows}) == len(rows),
            "Select unique installed solids")
    requests = [(r["afterSolid"], before, r["beforeSolid"], r["worldTransform"]) for r in rows]
    axes = {r["afterSolid"]: r["axisWorld"] for r in rows}
    comparisons = compare_components(after, requests, section_axes=axes)
    for row in rows:
        result = comparisons[row["afterSolid"]]
        resolution = row["resolutionMm3"]
        verdict = compare_limit(result["stockSections"], resolution)
        if result.get("measurementStatus") != "open" and max(result["absentMm3"], result["extraMm3"]) > resolution:
            verdict = "fail"
        elif verdict == "pass" and result.get("measurementStatus") == "open":
            verdict = "open"
        result["sourceMatch"] = verdict
    return {"beforeSha256": plan["before"]["sha256"], "afterSha256": plan["after"]["sha256"],
            "placements": rows, "comparisons": comparisons}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    report = run(args.project.resolve(), read(args.plan))
    print(json.dumps(report, indent=2, allow_nan=False))
    raise SystemExit(int(any(r["sourceMatch"] != "pass" for r in report["comparisons"].values())))
