"""Screen radial location by a seated, nominally coaxial circular pilot in millimeters."""
import math
from hashlib import sha256

from component_shape import boolean_measure
from fastener_stack import planar_faces, thread_envelope
from mechanical_motion import common, vec
from mechanical_readiness import digest, named, number, pinned, read, require
from showcase_contacts import load_solids


def datum_frame(origin, axis):
    from OCP.gp import gp_Ax3, gp_Dir, gp_Pnt, gp_Trsf
    from OCP.TopLoc import TopLoc_Location

    require(abs(math.hypot(*axis) - 1) <= 1e-9, "Register a unit vector along the parallel pilot axes")
    transform = gp_Trsf()
    transform.SetTransformation(gp_Ax3(gp_Pnt(*origin), gp_Dir(*axis)))
    return TopLoc_Location(transform)


def seated_state(host, member, plane, sign):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common

    measures = [boolean_measure(a, b, BRepAlgoAPI_Common) for a, b in ((host, member), (member, host))]
    host_faces = list(planar_faces(host, [plane, plane], sign))
    member_faces = list(planar_faces(member, [plane, plane], -sign))
    area = sum(common(a, b, area=True) for a, _ in host_faces for b, _ in member_faces)
    require(math.isfinite(area) and area >= 0, "Invalid planar seat area")
    return dict(commonMm3=[m[0] for m in measures], valid=[m[1] for m in measures], seatMm2=area)


def measure(host, member, case, budget):
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopLoc import TopLoc_Location
    from OCP.gp import gp_Trsf, gp_Vec

    for shape in (host, member):
        require(BRepCheck_Analyzer(shape).IsValid(), "Invalid installed pilot or receiver topology")
    frame = datum_frame(vec(case["originMm"]), vec(case["axis"]))
    host, member = (s.Moved(frame) for s in (host, member))
    start, end = case["engagedBandMm"]
    plane, sign = case["seatPlaneMm"], case["hostNormalSign"]
    bore, pilot = case["boreRadiusMm"], case["pilotRadiusMm"]
    area = case["minimumSeatMm2"]
    require(all(number(v) for v in (start,end,plane,bore,pilot,area)) and end-start > .001
            and bore > pilot > 0 and area > 0 and sign in (-1,1), "Invalid seated pilot commission")
    play = bore - pilot
    # This is a nominal analytic STEP screen. The complete patches must cover the same axial band.
    lands = [thread_envelope(s, start, end, [radius,radius], external=outer)
             for s,radius,outer in ((host,bore,False), (member,pilot,True))]
    require(all(lands), "Missing complete coaxial cylindrical land across the registered band")
    offsets = [case["clearDisplacementMm"], case["blockedDisplacementMm"]]
    require(all(number(v) for v in offsets) and 0 < abs(offsets[0]) < play < abs(offsets[1]),
            "Place one transverse control inside radial play and one outside")
    direction = vec(case["displacementDirectionWorld"])
    require(abs(math.hypot(*direction)-1)<1e-9
            and abs(sum(a*b for a,b in zip(direction,case["axis"])))<1e-9, "Use a unit transverse control direction")
    local = gp_Vec(*direction).Transformed(frame.Transformation())
    observations = []
    for offset in (0, *offsets):
        tr = gp_Trsf()
        tr.SetTranslation(local.Multiplied(offset))
        observations.append(seated_state(host,member.Moved(TopLoc_Location(tr)),plane,sign))
    result = dict(status="open", nominalRadialPlayMm=play, controls=observations, offsetsMm=[0,*offsets])
    for i,obs in enumerate(observations):
        v,w=obs["commonMm3"]
        require(all(number(t) and t>=0 for t in (v,w)), "Unresolved common measure")
        if (not all(obs["valid"]) or abs(v-w)>max(1e-6,1e-5*max(v,w))
                or (i<2 and (max(v,w)>1e-8 or obs["seatMm2"]<area))
                or (i==2 and min(v,w)<=1e-8)):
            return {**result, "reason":"Seated, free and obstructed controls did not agree"}
    if budget is None:
        return {**result, "reason":"Nominal pilot play measured. Finished dimensions, datum chain or limit unqualified"}
    require(named(budget["basis"]) and budget["kind"] in ("conditional","qualified"),
            "Identify the source and qualification of the complete radial budget")
    keys=("largestFinishedBoreRadiusMm","smallestFinishedPilotRadiusMm","shaftToPilotRadialMm",
          "targetToBoreRadialMm","otherParallelErrorMm","allowableParallelOffsetMm")
    values=[budget[k] for k in keys]
    require(all(number(v) and v>=0 for v in values), "Supply each finite radial allowance")
    big,small,shaft,datum,other,limit=values
    require(big>=bore and 0<small<=pilot and limit>0, "Drawing bounds must include the nominal models")
    upper=big-small+shaft+datum+other
    result.update(upperParallelOffsetMm=upper, remainingMm=limit-upper, budgetKind=budget["kind"])
    if abs(upper-limit)<=1e-4:
        return {**result,"reason":"Budget is within the numerical comparison margin of the allowable"}
    if upper>limit:
        return {**result,"reason":"Worst-case budget exceeds the limit. A realizable violating assembly remains to be shown"}
    return {**result, "status":"within-budget" if budget["kind"]=="qualified" else "conditional",
            "reason":"Parallel-axis budget under the specified fully seated condition"}


def commission_hash(study):
    from placed_pair_cache import encoded
    return sha256(encoded({key:value for key,value in study.items() if key!="budget"})).hexdigest()


def review(root, study):
    require(study["schema"]=="agent-frc/seated-pilot@1", "Unknown circular pilot study")
    require(named(study["serviceOperation"]) and named(study["shaftAxis"]) and named(study["targetAxis"]),
            "Commission the disturbed service interface, shaft axis and target axis")
    scope=commission_hash(study)
    budget=read(pinned(root,study["budget"])) if study.get("budget") else None
    if budget is not None:
        require(budget["commissionSha256"]==scope, "Radial budget belongs to a different service or datum commission")
    path=pinned(root,study["step"])
    ids={}
    shapes,_=load_solids(path,ids)
    selected=[]
    for role in ("host","member"):
        ref=study[role]
        name=ref["solid"]
        require(name in shapes and ids[name]==ref["identity"], "Wrong installed occurrence for "+role)
        selected.append(shapes[name])
    require(study["host"]["solid"]!=study["member"]["solid"], "Select two distinct solids")
    output=measure(*selected,study,budget)
    require(digest(path)==study["step"]["sha256"], "Geometry changed during measurement")
    return {**output, "step":study["step"], "host":study["host"], "member":study["member"],
            "budget":study.get("budget"), "commissionSha256":scope,
            "scope":"Selected circular pilot pair, full axial seating, parallel rigid axes"}
