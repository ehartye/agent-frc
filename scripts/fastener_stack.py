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
            actual = plane.Location().Z()
            if normal * nz > .999999999 and z[0]-1e-5 <= actual <= z[1]+1e-5:
                yield face, actual
        it.Next()


def contact_patch(a, b, zone, radius, minimum_z):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeWire
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.gp import gp_Ax2, gp_Circ, gp_Dir, gp_Pnt
    require(number(radius) and radius > 0, "Register a positive local bearing inspection radius")
    areas = {}
    targets = list(planar_faces(b,zone,-1))
    for face, z in planar_faces(a,zone,1):
        if z < minimum_z:
            continue
        circle = gp_Circ(gp_Ax2(gp_Pnt(0,0,z),gp_Dir(0,0,1)),radius)
        disc = BRepBuilderAPI_MakeFace(BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(circle).Edge()).Wire()).Face()
        for other, h in targets:
            if abs(z-h) > 1e-7 or distance(face,other) > 1e-7:
                continue
            shared = BRepAlgoAPI_Common(face,other)
            require(shared.IsDone() and not shared.Shape().IsNull() and BRepCheck_Analyzer(shared.Shape()).IsValid(),
                    "Unresolved bearing intersection between consecutive layers")
            areas[z] = areas.get(z,0) + common(shared.Shape(),disc,True)
    actual = [z for z,area in areas.items() if area>1e-7]
    require(len(actual)<=1,"Multiple bearing planes make the stack datum ambiguous")
    return (actual[0],areas[actual[0]]) if actual else (None,0.)


def circular_partition(arcs):
    """Cover the circle once in world angles, including sectors that cross zero."""
    intervals = []
    for start, width in arcs:
        start %= math.tau
        if width <= 0 or width > math.tau + 1e-7:
            return False
        end = start + min(width, math.tau)
        intervals.append((start, min(end, math.tau)))
        if end > math.tau:
            intervals.append((0., end-math.tau))
    reached = 0.
    for lo, hi in sorted(intervals):
        if abs(lo-reached) > 1e-7:
            return False
        reached = hi
    return abs(reached-math.tau) <= 1e-7


def shared_ring(walls, neighbors, z, radius):
    """Use actual shared topological arcs, all belonging to the same measured rim."""
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GeomAbs import GeomAbs_Circle
    from OCP.TopAbs import TopAbs_EDGE
    from OCP.TopoDS import TopoDS
    from stock_sections import entities
    other = [edge for face in neighbors for edge in entities(face, TopAbs_EDGE)]
    arcs = []
    for face in walls:
        for edge in entities(face, TopAbs_EDGE):
            if not any(edge.IsSame(n) for n in other):
                continue
            curve = BRepAdaptor_Curve(TopoDS.Edge(edge))
            if curve.GetType() != GeomAbs_Circle:
                continue
            circle = curve.Circle()
            center = circle.Location()
            sense = circle.Axis().Direction().Z()
            if (math.hypot(center.X(), center.Y()) > 1e-5 or abs(center.Z()-z) > 1e-5
                    or abs(circle.Radius()-radius) > 1e-5 or abs(sense) < .999999999):
                continue
            lo, hi = curve.FirstParameter(), curve.LastParameter()
            start = curve.Value(lo if sense > 0 else hi)
            arcs.append((math.atan2(start.Y()-center.Y(),start.X()-center.X()),hi-lo))
    return circular_partition(arcs)


def complete_wall(faces, lo, hi, r0, r1):
    """Prove rectangular angular trims on the finite analytic surface, with no hole or overlap."""
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.GeomAbs import GeomAbs_Circle, GeomAbs_Line, GeomAbs_Cylinder
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_WIRE
    from OCP.TopoDS import TopoDS
    from stock_sections import entities
    arcs = []
    for face in faces:
        if len(list(entities(face, TopAbs_WIRE))) != 1:
            return False
        surf = BRepAdaptor_Surface(face)
        u0, u1 = surf.FirstUParameter(), surf.LastUParameter()
        v = (surf.FirstVParameter()+surf.LastVParameter())/2
        begin = surf.Value(u0,v)
        axis = (surf.Cylinder() if surf.GetType() == GeomAbs_Cylinder else surf.Cone()).Axis()
        center = axis.Location()
        bx, by = begin.X()-center.X(), begin.Y()-center.Y()
        angle = math.atan2(by,bx)
        # Use an interior increment so a full revolution has an unambiguous sense.
        near = surf.Value(u0+min(.1,(u1-u0)/2),v)
        sense = bx*(near.Y()-center.Y())-by*(near.X()-center.X())
        if abs(sense) < 1e-12:
            return False
        arcs.append((angle if sense>0 else angle-(u1-u0), u1-u0))
        for e in entities(face,TopAbs_EDGE):
            edge = TopoDS.Edge(e)
            if r1 == 0 and BRep_Tool.Degenerated_s(edge):
                continue  # A closed drill cone has a degenerate edge at its apex.
            curve = BRepAdaptor_Curve(edge)
            if curve.GetType() == GeomAbs_Circle:
                c = curve.Circle()
                h = c.Location()
                if not (math.hypot(h.X(),h.Y()) <= 1e-5 and abs(c.Axis().Direction().Z()) > .999999999
                        and any(abs(h.Z()-z)<=1e-5 and abs(c.Radius()-r)<=1e-5 for z,r in ((lo,r0),(hi,r1)))):
                    return False
            elif curve.GetType() == GeomAbs_Line:
                ends = [curve.Value(t) for t in (curve.FirstParameter(),curve.LastParameter())]
                if not (abs(min(p.Z() for p in ends)-lo)<=1e-5 and abs(max(p.Z() for p in ends)-hi)<=1e-5):
                    return False
            else:
                return False
        area = GProp_GProps()
        BRepGProp.SurfaceProperties_s(face,area)
        expected = (u1-u0)*(r0+r1)/2*math.hypot(hi-lo,r1-r0)
        if abs(area.Mass()-expected) > max(1e-6,expected*1e-7):
            return False
    return circular_partition(arcs)


def trace_bore(host, radius, grip, *, through=False):
    """Trace the original joined faces from the clamp plane through a complete cylindrical wall."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Cone
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopoDS import TopoDS
    from stock_sections import entities
    cylinders, cones, entrances, shoulders = {}, {}, {}, []
    for part in entities(host,TopAbs_FACE):
        face = TopoDS.Face(part)
        surface = BRepAdaptor_Surface(face)
        kind = surface.GetType()
        if kind not in (GeomAbs_Cylinder, GeomAbs_Cone) or face.Orientation() != TopAbs_REVERSED:
            continue
        s = surface.Cylinder() if kind == GeomAbs_Cylinder else surface.Cone()
        axis = s.Axis()
        p = axis.Location()
        if abs(axis.Direction().Z()) <= .999999999 or math.hypot(p.X(),p.Y()) > 1e-5:
            continue
        box = bounds(face)
        lo, hi = round(box[2],7), round(box[5],7)
        if kind == GeomAbs_Cylinder:
            r = round(s.Radius(),7)
            if radius[0]-1e-5 <= r <= radius[1]+1e-5:
                cylinders.setdefault((lo,hi,r),[]).append(face)
            else:
                shoulders.append((hi,r))
        else:
            apex = s.Apex().Z()
            slope = abs(math.tan(s.SemiAngle()))
            if abs(apex-hi)<=1e-5:
                cones.setdefault((lo,round(apex,7),round((apex-lo)*slope,7)),[]).append(face)
            elif apex>hi and grip[0]-1e-5<=lo<=grip[1]+1e-5:
                key = (lo,hi,round((apex-lo)*slope,7),round((apex-hi)*slope,7))
                entrances.setdefault(key,[]).append(face)

    def planes(z, normal):
        return [face for face,_ in planar_faces(host,[z,z],normal)]

    starts = []
    for key,faces in cylinders.items():
        lo, hi, r = key
        if (grip[0]-1e-5 <= lo <= grip[1]+1e-5 and not any(abs(z-lo)<=1e-5 and other>r for z,other in shoulders)
                and shared_ring(faces,planes(lo,-1),lo,r)):
            starts.append((lo,key))
    for (mouth,pilot,outer,inner),faces in entrances.items():
        starts = [(m,k) for m,k in starts if not mouth-1e-5<=m<=pilot+1e-5]
        if complete_wall(faces,mouth,pilot,outer,inner) and shared_ring(faces,planes(mouth,-1),mouth,outer):
            for key,walls in cylinders.items():
                if abs(key[0]-pilot)<=1e-5 and abs(key[2]-inner)<=1e-5 and shared_ring(faces,walls,pilot,inner):
                    starts.append((mouth,key))
    require(len(starts)==1,"Cannot uniquely trace the bore from the commissioned mouth to its cylindrical wall")
    mouth,key = starts[0]
    pilot = key[0]
    while True:
        lo,end,r = key
        walls = cylinders[key]
        require(end>lo and complete_wall(walls,lo,end,r,r),"Incomplete or interrupted cylindrical bore wall")
        adjacent = [k for k in cylinders if k[0]>lo and abs(k[0]-end)<=1e-5 and abs(k[2]-r)<=1e-5]
        if not adjacent:
            break
        require(len(adjacent)==1 and shared_ring(walls,cylinders[adjacent[0]],end,r),
                "Unresolved junction between successive cylindrical wall bands")
        key = adjacent[0]
    if through:
        require(shared_ring(walls,planes(end,1),end,r),"No complete through exit shared with the measured wall")
    tips = [tip for (base,tip,outer),faces in cones.items() if abs(base-end)<=1e-5 and abs(outer-r)<=1e-5
            and shared_ring(walls,faces,end,r) and complete_wall(faces,base,tip,outer,0)]
    return mouth,pilot,end,tips,r,walls


def bore_profile(host, radius, grip, *, through=False):
    return trace_bore(host,radius,grip,through=through)[:4]


def closed_flat_floor(host, walls, end, radius):
    """A connected planar cap must have the pilot rim as its entire free boundary."""
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.TopAbs import TopAbs_EDGE
    from stock_sections import entities
    candidates = [face for face,_ in planar_faces(host,[end,end],-1)]
    edges_seen = []
    def edge_id(edge):
        for index,previous in enumerate(edges_seen):
            if edge.IsSame(previous):
                return index
        edges_seen.append(edge)
        return len(edges_seen)-1

    wall_edges = {edge_id(edge) for f in walls for edge in entities(f,TopAbs_EDGE)}
    face_edges = [[edge_id(edge) for edge in entities(f,TopAbs_EDGE)] for f in candidates]
    owners = {}
    for i,edges in enumerate(face_edges):
        for edge in edges:
            owners.setdefault(edge,[]).append(i)
    # Include interior patches connected to a rim patch through actual shared seams.
    selected = set()
    pending = [i for i,edges in enumerate(face_edges) if wall_edges.intersection(edges)]
    while pending:
        i = pending.pop()
        if i in selected:
            continue
        selected.add(i)
        for edge in face_edges[i]:
            pending.extend(j for j in owners[edge] if j not in selected)
    patches = [candidates[i] for i in selected]
    if not shared_ring(walls,patches,end,radius):
        return False
    for edge in {e for i in selected for e in face_edges[i]}:
        count = len(owners[edge])
        if (edge in wall_edges and count != 1) or (edge not in wall_edges and count != 2):
            return False
    area = 0.
    for face in patches:
        props = GProp_GProps()
        BRepGProp.SurfaceProperties_s(face,props)
        area += props.Mass()
    expected = math.pi*radius*radius
    return abs(area-expected)<=max(1e-6,expected*1e-7)


def bore_faces(host, radius, grip):
    """Return the mouth, end and drill terminations for existing dimensional probes."""
    mouth, _, end, tips = bore_profile(host,radius,grip)
    return mouth,end,tips


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
    mouth, pilot, end, apex, wall_radius, walls = trace_bore(host_shape, radius, grip, through=kind=="through")
    observed.update(tipFromSeatMm=tip, gripMm=mouth, pilotStartFromSeatMm=pilot,
                    entranceChamferDepthMm=pilot-mouth, cylinderWallLengthMm=end-pilot, cylindricalDepthMm=end-mouth)
    # A local witness makes the actual finite intersection independent of a zero common-volume query.
    if kind == "blind":
        if apex:
            require(max(apex)-min(apex) < 1e-5, "Conflicting drill terminations")
            floor = min(apex)
        else:
            if not closed_flat_floor(host_shape,walls,end,wall_radius):
                return dict(observed, status="open", reason="Missing a closed flat or conical blind-hole termination")
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
        require(not apex and any(planar_faces(host_shape, [end,end], 1)), "No registered through exit at the far face")
        c = BRepClass3d_SolidClassifier(host_shape)
        for z in (end-1e-4, end+1e-4):
            c.Perform(gp_Pnt(0, 0, z), 1e-7)
            require(c.State() == TopAbs_OUT, "Through-hole centerline is closed at the exit")
        observed["tipBeyondExitMm"] = tip-end

    # Preserve a discovered physical bottom even when no thread drawing has been qualified.
    if reasons:
        return dict(observed, status="fail", reasons=reasons)
    if not (named(drawing.get("screwThread")) and drawing["screwThread"] == drawing.get("hostThread")
            and named(drawing.get("threadFitBasis"))):
        return dict(observed, status="open", reason="Supply matching screw/host thread specification and fit evidence")
    chamfer = drawing.get("entranceChamferDepthMm")
    if pilot-mouth > 1e-5 and chamfer is None:
        return dict(observed, status="open", reason="Qualify the measured entrance chamfer depth in the host drawing")
    chamfer_range = interval(drawing,"entranceChamferDepthMm") if chamfer is not None else [0,0]
    if not chamfer_range[0]-1e-5 <= pilot-mouth <= chamfer_range[1]+1e-5:
        return dict(observed,status="fail",reasons=["Observed entrance chamfer depth differs from the drawing"])
    layers = case["grippedLayers"]
    require(isinstance(layers,list),"Commission the ordered gripped layers, including an empty list for direct seating")
    ids = [row["solid"] for row in layers]
    require(len(set(ids)) == len(ids) and not set(ids).intersection((screw,host))
            and seat == (ids[0] if ids else host),"Gripped layer order does not connect the named head seat to this host")
    _, area = contact_patch(screw_shape,seat_shape,[0,0],drawing["headBearingRadiusMm"],-1e-6)
    require(number(drawing["minSeatAreaMm2"]) and drawing["minSeatAreaMm2"] > 0, "Register minimum under-head bearing area")
    if area < drawing["minSeatAreaMm2"]:
        reasons.append("Under-head contact misses the commissioned seat")
    contacts=[]
    previous_z=0
    for i,(name,layer) in enumerate(zip(ids,layers)):
        following=(ids+[host])[i+1]
        require(number(layer["minBearingAreaMm2"]) and layer["minBearingAreaMm2"]>0,"Require positive local contact at every layer")
        zone=interval(layer,"exitFromSeatMm")
        z, contact=contact_patch(shapes[name].Moved(loc),shapes[following].Moved(loc),zone,layer["bearingRadiusMm"],previous_z+1e-6)
        contacts.append(dict(pair=[name,following],zMm=z,areaMm2=contact))
        if contact < layer["minBearingAreaMm2"]:
            reasons.append("Missing local bearing contact from "+name+" to "+following)
        if z is not None:
            previous_z=z
    if abs(previous_z-mouth)>1e-5:
        reasons.append("The clamped material stack does not reach the measured host mouth")
    observed.update(layerContacts=contacts,seatAreaMm2=area)
    if not length[0]-1e-5 <= tip <= length[1]+1e-5:
        reasons.append("Installed length differs from the screw drawing")
    if reasons:
        return dict(observed, status="fail", reasons=reasons)
    depth = interval(drawing, "cylindricalDepthMm")
    if not depth[0]-1e-5 <= end-mouth <= depth[1]+1e-5:
        return dict(observed,status="fail",reasons=["Observed bore depth differs from its drawing"])
    male_start = interval(drawing, "maleThreadStartFromSeatMm")
    male_tip_loss = interval(drawing, "maleTipRunoutMm")
    female_start = interval(drawing, "femaleLeadMm")
    female_end = interval(drawing, "lastFullThreadDepthMm")
    if female_start[0] < chamfer_range[1]-1e-5:
        return dict(observed, status="open", reason="The registered full female thread can start within the entrance chamfer")
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
    observed["minimumFullEngagementMm"]=engagement
    if reasons:
        return dict(observed, status="fail", reasons=reasons)
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
