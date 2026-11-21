"""Check installed screw seating, usable thread engagement and bottom clearance in millimeters."""
import argparse
import json
import math
from pathlib import Path

from interface_consistency import inscribed_balls
from mechanical_motion import bounds, common, distance, vec
from mechanical_readiness import digest, named, number, pinned, read, require
from placed_separation import direction


def interval(row, key):
    values = row[key]
    require(isinstance(values, list) and len(values) == 2 and all(number(v) for v in values)
            and 0 <= values[0] <= values[1], "Missing or invalid drawing range: " + key)
    return values


def planar_faces(shape, z, normal):
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    it = TopExp_Explorer(shape, TopAbs_FACE)
    while it.More():
        face = TopoDS.Face(it.Current())
        surface = BRepAdaptor_Surface(face)
        if surface.GetType() == GeomAbs_Plane:
            plane = surface.Plane()
            nz = plane.Axis().Direction().Z() * (-1 if face.Orientation() == TopAbs_REVERSED else 1)
            if normal * nz > .999999999 and abs(plane.Location().Z() - z) <= 1e-5:
                yield face
        it.Next()


def bore_faces(host, radius, grip):
    """Select coaxial cylindrical wall segments at this mouth and their physical blind end."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Cone
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    cylinders, cones = [], []
    it = TopExp_Explorer(host, TopAbs_FACE)
    while it.More():
        face = TopoDS.Face(it.Current())
        surface = BRepAdaptor_Surface(face)
        kind = surface.GetType()
        if kind in (GeomAbs_Cylinder, GeomAbs_Cone):
            s = surface.Cylinder() if kind == GeomAbs_Cylinder else surface.Cone()
            axis = s.Axis()
            p = axis.Location()
            if abs(axis.Direction().Z()) > .999999999 and math.hypot(p.X(), p.Y()) <= 1e-5:
                box = bounds(face)
                if kind == GeomAbs_Cylinder and face.Orientation() == TopAbs_REVERSED and radius[0]-1e-5 <= s.Radius() <= radius[1]+1e-5:
                    cylinders.append((box[2], box[5]))
                elif kind == GeomAbs_Cone:
                    apex = s.Apex().Z()
                    if abs(apex-box[5]) <= 1e-5:
                        cones.append((box[2], apex))
        it.Next()
    starts = [lo for lo, hi in cylinders if grip[0]-1e-5 <= lo <= grip[1]+1e-5]
    require(starts, "No coaxial internal cylindrical wall starts at the commissioned mouth")
    mouth = min(starts)
    end = mouth
    for lo, hi in sorted(cylinders):
        if lo <= end + 1e-5 and hi > end:
            end = hi
    require(end > mouth, "No finite bore wall at the mouth")
    return mouth, end, [tip for lo, tip in cones if abs(lo-end) <= 1e-5]

def thread_envelope(shape, first, last, radii, *, external):
    """Certify uninterrupted cylindrical patches across the full registered axial band."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.GeomAbs import GeomAbs_Cylinder
    from OCP.TopAbs import TopAbs_FACE, TopAbs_FORWARD, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    spans = {}
    it = TopExp_Explorer(shape, TopAbs_FACE)
    while it.More():
        face = TopoDS.Face(it.Current())
        surface = BRepAdaptor_Surface(face)
        if surface.GetType() == GeomAbs_Cylinder and face.Orientation() == (TopAbs_FORWARD if external else TopAbs_REVERSED):
            cylinder = surface.Cylinder()
            axis, radius = cylinder.Axis(), cylinder.Radius()
            if (abs(axis.Direction().Z()) > .999999999 and math.hypot(axis.Location().X(), axis.Location().Y()) < 1e-5
                    and radii[0] - 1e-6 <= radius <= radii[1] + 1e-6):
                box = bounds(face)
                props = GProp_GProps()
                BRepGProp.SurfaceProperties_s(face, props)
                # Coincident seam halves on one valid solid may jointly cover the cylinder.
                span = (round(box[2],7), round(box[5],7), round(radius,7))
                spans[span] = spans.get(span,0) + props.Mass()
        it.Next()
    reach = first
    for (z0,z1,radius),area in sorted(spans.items()):
        full = 2 * math.pi * radius * (z1-z0)
        if z0 <= reach+1e-6 and abs(area-full) <= max(1e-6,full*1e-7):
            reach = max(reach,z1)
    return reach >= last-1e-6


def profiles(drawing):
    models = []
    for field in ("externalProfile", "internalProfile"):
        record = drawing[field]
        require(record["representation"] in ("minor","pitch","major"),
                "This check supports source-qualified cylindrical minor, pitch or major diameter representations")
        dimensions = {k:interval(record,k+"DiameterMm") for k in ("minor","pitch","major")}
        require(0 < dimensions["minor"][0] and dimensions["minor"][1] < dimensions["pitch"][0]
                and dimensions["pitch"][1] < dimensions["major"][0], "Invalid qualified thread diameters")
        require(number(record["pitchMm"]) and record["pitchMm"]>0 and record["hand"] in ("right","left")
                and named(record["form"]), "Qualify the thread pitch, hand and form")
        models.append((record,dimensions))
    (male,m),(female,f) = models
    require(all(male[k]==female[k] for k in ("pitchMm","hand","form")), "Mismatched thread pitch, hand or form")
    require(all(m[k][1] <= f[k][0] for k in ("minor","pitch","major")) and m["major"][0] > f["minor"][1],
            "Tolerance ranges do not establish compatible diameters and positive thread overlap")
    return [[d/2 for d in dims[record["representation"]]] for record,dims in models]


def measure(shapes, case, drawing):
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopLoc import TopLoc_Location
    from OCP.gp import gp_Ax3, gp_Dir, gp_Pnt, gp_Trsf
    kind = case["kind"]
    screw, host, seat = (case[k] for k in ("screw", "host", "seat"))
    require(kind in ("blind", "through") and screw != host and screw != seat, "Choose distinct installed screw and host/seat")
    origin, axis = vec(case["underHeadCenterMm"]), direction(case["axisIntoHost"])
    tr = gp_Trsf()
    tr.SetTransformation(gp_Ax3(gp_Pnt(*origin), gp_Dir(*axis)))
    loc = TopLoc_Location(tr)
    screw_shape, host_shape, seat_shape = (shapes[k].Moved(loc) for k in (screw, host, seat))
    require(all(BRepCheck_Analyzer(s).IsValid() for s in (screw_shape, host_shape, seat_shape)), "An operand has invalid topology")
    observed = {"screw": screw, "host": host, "kind": kind}
    reasons = []
    tip = bounds(screw_shape)[5]
    length = interval(drawing, "underHeadLengthMm")
    grip = interval(drawing, "gripMm")
    radius = interval(drawing, "boreRadiusMm")
    require(radius[0] > 0 and length[0] > 0, "A screw and bore require positive dimensions")
    mouth, end, apex = bore_faces(host_shape, radius, grip)
    observed.update(tipFromSeatMm=tip, gripMm=mouth, cylindricalDepthMm=end-mouth)
    # A local witness makes the actual finite intersection independent of a zero common-volume query.
    if kind == "blind":
        if apex:
            require(max(apex)-min(apex) < 1e-5, "Conflicting drill terminations")
            floor = min(apex)
        else:
            from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
            center = BRepBuilderAPI_MakeVertex(gp_Pnt(0, 0, end)).Vertex()
            require(any(distance(center, face) <= 1e-6 for face in planar_faces(host_shape, end, -1)),
                    "Missing a closed flat or conical blind-hole termination")
            floor = end
        observed.update(drillPointDepthMm=floor-mouth, tipToDrillPointMm=floor-tip)
        if tip > floor + 1e-5:
            mid = (tip + floor)/2
            center = [o+mid*v for o, v in zip(origin, axis)]
            balls, lower = inscribed_balls(shapes[screw], shapes[host], [center], 1e-5)
            observed.update(interiorBalls=balls, sharedLowerBoundMm3=lower)
            if lower <= 0:
                return dict(observed, status="open", reason="A projected tip passes the drill floor; no independent shared interior was located")
            reasons.append("The installed screw shares solid material with the host beyond its drill floor")
    else:
        from OCP.BRepClass3d import BRepClass3d_SolidClassifier
        from OCP.TopAbs import TopAbs_OUT
        require(not apex and any(planar_faces(host_shape, end, 1)), "No registered through exit at the far face")
        c = BRepClass3d_SolidClassifier(host_shape)
        for z in (end-1e-4, end+1e-4):
            c.Perform(gp_Pnt(0, 0, z), 1e-7)
            require(c.State() == TopAbs_OUT, "Through-hole centerline is closed at the exit")
        observed["tipBeyondExitMm"] = tip-end

    # Preserve a discovered physical bottom even when no thread drawing has been qualified.
    if reasons:
        return dict(observed, status="fail", reasons=reasons)
    require(named(drawing.get("screwThread")) and drawing["screwThread"] == drawing.get("hostThread")
            and named(drawing.get("threadFitBasis")), "Supply matching screw/host thread specification and fit evidence")
    seats = list(planar_faces(seat_shape, 0., -1))
    area = sum(common(f, g, True) for f in planar_faces(screw_shape, 0., 1) for g in seats if distance(f, g) <= 1e-6)
    require(number(drawing["minSeatAreaMm2"]) and drawing["minSeatAreaMm2"] > 0, "Register minimum under-head bearing area")
    if area < drawing["minSeatAreaMm2"]:
        reasons.append("Under-head contact misses the commissioned seat")
    if not length[0]-1e-5 <= tip <= length[1]+1e-5:
        reasons.append("Installed length differs from the screw drawing")
    depth = interval(drawing, "cylindricalDepthMm")
    if not depth[0]-1e-5 <= end-mouth <= depth[1]+1e-5:
        reasons.append("Observed bore depth differs from its drawing")
    male_start = interval(drawing, "maleThreadStartFromSeatMm")
    male_tip_loss = interval(drawing, "maleTipRunoutMm")
    female_start = interval(drawing, "femaleLeadMm")
    female_end = interval(drawing, "lastFullThreadDepthMm")
    require(female_end[1] <= depth[1] and female_start[1] <= female_end[0]
            and male_start[1]+male_tip_loss[1] <= length[0], "Full threads extend outside the drawing stack")
    male_radius, female_radius = profiles(drawing)
    if not thread_envelope(screw_shape, male_start[1], tip-male_tip_loss[1], male_radius, external=True):
        return dict(observed, status="open", reason="Actual screw does not establish its full commissioned thread diameter and axial span")
    if not thread_envelope(host_shape, mouth+female_start[1], mouth+female_end[0], female_radius, external=False):
        return dict(observed, status="open", reason="Actual host does not establish its full commissioned thread diameter and axial span")
    # Evaluate both limits of grip. Translating the host moves BOTH ends of its usable thread interval together.
    def engaged(g):
        return max(0, min(length[0]-male_tip_loss[1], g+min(female_end[0], depth[0]))
                      - max(male_start[1], g+female_start[1]))
    engagement = min(engaged(g) for g in grip)
    minimum = drawing["minEngagementMm"]
    require(number(minimum) and minimum > 0, "Register a positive minimum full-thread engagement")
    if engagement < minimum:
        reasons.append("Worst-case full-thread engagement is too short")
    observed.update(seatAreaMm2=area, minimumFullEngagementMm=engagement)
    if kind == "blind":
        drill = interval(drawing, "drillPointDepthMm")
        require(depth[0] <= drill[0] and depth[1] <= drill[1], "Drill tip depth cannot precede the cylindrical bore")
        if not drill[0]-1e-5 <= floor-mouth <= drill[1]+1e-5:
            reasons.append("Observed drill termination differs from its drawing")
        clearance = grip[0]+depth[0]-length[1]
        minimum = drawing["minBottomClearanceMm"]
        require(number(minimum) and minimum > 0, "Register positive minimum bottom clearance")
        observed["minimumFullBoreTipClearanceMm"] = clearance
        if clearance < minimum:
            reasons.append("Deepest screw tip lacks full-bore clearance at tolerance")
    else:
        minimum = drawing["minThroughProjectionMm"]
        require(number(minimum) and minimum >= 0, "Register the through-exit projection requirement")
        projection = length[0]-grip[1]-depth[1]
        observed["minimumThroughProjectionMm"] = projection
        if projection < minimum:
            reasons.append("Shortest screw lacks the required projection through the host")
    return dict(observed, status="fail" if reasons else "pass", reasons=reasons)


def review(root, inventory, shapes, step_sha, *, owners=None):
    require(isinstance(inventory, dict) and inventory.get("stepSha256") == step_sha,
            "Commission the screw-stack roster on this exact placed issue")
    others, rows = inventory["nonScrewSolids"], inventory["stacks"]
    require(isinstance(others, list) and isinstance(rows, list), "List all installed solids and screw stacks")
    for outside in inventory.get("outsideScope", []):
        require(named(outside["solid"]) and outside["solid"] not in shapes and named(outside["basis"]),
                "An installed solid cannot be excluded as outside the selected issue")
    names = others + [row["screw"] for row in rows]
    require(len(names) == len(set(names)) and set(names) == set(shapes), "Unclassified, duplicate or absent installed solid in fastener roster")
    results = []
    for row in rows:
        try:
            if owners is not None:
                require(owners[row["screw"]] == row["screwArticle"] and owners[row["host"]] == row["hostArticle"],
                        "Commission the screw and host articles actually installed at both locations")
            source = read(pinned(root, row["drawing"]))
            require(source.get("screwArticle") == row["screwArticle"] and source.get("hostArticle") == row["hostArticle"]
                    and all(named(row[k]) for k in ("screwArticle","hostArticle")), "Drawing identifies another screw or host")
            for ref in source["sources"]:
                pinned(root, ref)
            require(source["sources"], "Pin the original dimensioned sources")
            results.append(measure(shapes, row, source))
        except (KeyError, ValueError, TypeError, RuntimeError, OSError) as error:
            results.append(dict(screw=row["screw"], status="open", reason=str(error)))
    return results


if __name__ == "__main__":
    from showcase_contacts import load_solids
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("step", type=Path)
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    try:
        rows = review(args.root, read(args.plan), load_solids(args.step)[0], digest(args.step))
        print(json.dumps(rows, indent=2, allow_nan=False))
        raise SystemExit(0 if all(r["status"] == "pass" for r in rows) else 1)
    except (ValueError, KeyError, OSError, TypeError, RuntimeError) as err:
        raise SystemExit(str(err))
