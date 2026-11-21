"""Locate common material within a bounded coaxial fit in assembly coordinates (mm)."""
import math
import hashlib
import json
from pathlib import Path


def verify_basis(root, evidence, commission, archive_sha):
    """Resolve the independent prediction and its actual source files in the project."""
    def resolve(ref):
        path = Path(ref["file"])
        target = (root / path).resolve()
        if path.is_absolute() or not target.is_relative_to(root) or not target.is_file():
            raise ValueError("Resolve the commissioned fit source within its project")
        with target.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        if actual != ref["sha256"]:
            raise ValueError("Changed spatial fit evidence: " + str(path))
        return target
    if set(evidence) != {"threadDrawing", "maleGeometry", "independentOverlap"}:
        raise ValueError("Pin the drawing, external model and independent expected overlap")
    for ref in evidence.values():
        resolve(ref)
    prediction = json.loads(resolve(evidence["independentOverlap"]).read_bytes())
    if (prediction.get("schema") != "agent-frc/spatial-fit-prediction@1" or
            prediction.get("archiveSha256") != archive_sha or prediction.get("commission") != commission or
            prediction.get("drawingSha256") != evidence["threadDrawing"]["sha256"] or
            prediction.get("maleGeometrySha256") != evidence["maleGeometry"]["sha256"]):
        raise ValueError("The independent prediction differs from the source, body pair, region or registered thread")
    calculation = prediction["calculation"]
    if calculation["sha256"] in {ref["sha256"] for ref in evidence.values()}:
        raise ValueError("Supply the distinct independent overlap calculation")
    resolve(calculation)


def annulus(region):
    if not isinstance(region, dict) or set(region) != {"startMm","endMm","pilotRadiusMm","majorRadiusMm","classificationSlackMm"}:
        raise ValueError("Specify both axial end points and both radial limits of the permitted fit")
    start, end = region["startMm"], region["endMm"]
    finite = lambda x: type(x) in (int,float) and math.isfinite(x)
    if not all(isinstance(p,list) and len(p)==3 and all(finite(x) for x in p) for p in (start,end)):
        raise ValueError("Expected two finite world points in mm")
    r, R, slack = (region[k] for k in ("pilotRadiusMm","majorRadiusMm","classificationSlackMm"))
    length = math.dist(start,end)
    if not (all(finite(x) for x in (r,R,slack)) and 0<r<R and length>0 and 0<=slack<min(r,R-r,length)/2):
        raise ValueError("Invalid radial or axial annulus dimensions or classification slack")
    axis = [(b-a)/length for a,b in zip(start,end)]
    return start,end,axis,length,r,R,slack


def section(common, region, cylinder, operation, volume):
    """Partition an actual common solid. Both adapters preserve inputs and validate Boolean topology."""
    start,end,axis,length,r,R,slack = annulus(region)
    low = [x-slack*u for x,u in zip(start,axis)]
    high = [x+slack*u for x,u in zip(end,axis)]
    outer, core = cylinder(low,high,R+slack), cylinder(low,high,r-slack)
    total = volume(common)
    if total == 0:
        return dict(totalMm3=0.,outsideCylinderMm3=0.,insideCoreMm3=0.,permittedMm3=0.,conservationErrorMm3=0.)
    outside = volume(operation(common,outer,"cut"))
    inside = operation(common,outer,"common")
    inside_volume = volume(inside)
    if inside_volume:
        forbidden = volume(operation(inside,core,"common"))
        allowed = volume(operation(inside,core,"cut"))
    else:
        forbidden = allowed = 0.
    return dict(totalMm3=total,outsideCylinderMm3=outside,insideCoreMm3=forbidden,permittedMm3=allowed,
                conservationErrorMm3=max(abs(total-outside-inside_volume),abs(inside_volume-forbidden-allowed)))


def assess(rows, expected, *, required_methods):
    """Only a resolved positive fit in every required method can earn a location pass."""
    if len(expected)!=2 or not all(type(x) in (int,float) and math.isfinite(x) for x in expected) or not 0<expected[0]<=expected[1]:
        raise ValueError("Commission a positive source-derived range for the represented fit")
    accepted = []
    errors = []
    for name in required_methods:
        row = rows.get(name) or {}
        keys=("totalMm3","outsideCylinderMm3","insideCoreMm3","permittedMm3","conservationErrorMm3")
        if any(type(row.get(k)) not in (int,float) or not math.isfinite(row[k]) or row[k]<0 for k in keys):
            errors.append(name+": missing or invalid intersection partition")
            continue
        total,outside,core,allowed,residual = (row[k] for k in keys)
        eps = max(1e-8,1e-8*total)
        if max(residual,abs(total-outside-core-allowed))>eps:
            errors.append(name+": nonconserving partition")
            continue
        accepted.append((total,outside,core,eps))
    if any(outside>eps or core>eps for _,outside,core,eps in accepted):
        return "fail","Measured common material outside the allowed annulus"
    if errors or len(accepted)!=len(required_methods):
        return "open","; ".join(errors) or "Incomplete spatial fit measurements"
    totals=[v[0] for v in accepted]
    if max(totals)-min(totals)>max(v[3] for v in accepted):
        return "open","Intersection methods disagree about represented material"
    if not all(expected[0]<=v<=expected[1] for v in totals):
        return "open","The expected positive modeled fit is unconfirmed"
    return "pass","Measured common material is confined to the commissioned annulus"


def placed_sections(shapes, pair, region):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common,BRepAlgoAPI_Cut
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCP.gp import gp_Ax2,gp_Dir,gp_Pnt
    from component_shape import volume
    def checked(s):
        if s.IsNull() or not BRepCheck_Analyzer(s).IsValid():
            raise ValueError("Invalid placed intersection topology")
        return s
    def operation(a,b,kind):
        result=(BRepAlgoAPI_Common if kind=="common" else BRepAlgoAPI_Cut)(a,b)
        if not result.IsDone():
            raise ValueError("Unresolved placed intersection")
        return checked(result.Shape())
    def cylinder(start,end,r):
        return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*start),gp_Dir(*[b-a for a,b in zip(start,end)])),r,math.dist(start,end)).Shape()
    a,b = (checked(shapes[k]) for k in pair)
    return section(operation(a,b,"common"),region,cylinder,operation,volume)


def smooth_host(shape, region):
    from OCP.gp import gp_Ax3,gp_Dir,gp_Pnt,gp_Trsf
    from OCP.TopLoc import TopLoc_Location
    from fastener_stack import thread_envelope
    start,_,axis,length,r,_,_ = annulus(region)
    tr=gp_Trsf()
    tr.SetTransformation(gp_Ax3(gp_Pnt(*start),gp_Dir(*axis)))
    return thread_envelope(shape.Moved(TopLoc_Location(tr)),0,length,[r,r],external=False)


def thread_witness(region, form, classify):
    """Check a registered single-start helix against material and void at two turns."""
    start, _, axis, length, inner, outer, _ = annulus(region)
    point = form["crestPointMm"]
    pitch = form["pitchMm"]
    hand = form["hand"]
    if (type(pitch) not in (int, float) or not math.isfinite(pitch) or pitch <= 0 or
            hand not in ("right", "left") or len(point) != 3 or
            any(type(x) not in (float, int) or not math.isfinite(x) for x in point)):
        raise ValueError("Invalid registered thread pitch, hand or material witness")
    delta = [p - s for p, s in zip(point, start)]
    height = sum(x * a for x, a in zip(delta, axis))
    radial = [x - height * a for x, a in zip(delta, axis)]
    if not inner < math.hypot(*radial) < outer or not 0 < height < length - (11 / 6 + .5) * pitch:
        raise ValueError("Register the crest witness between pilot and major radii within the full inspection span")
    tangent = [axis[1]*radial[2] - axis[2]*radial[1],
               axis[2]*radial[0] - axis[0]*radial[2],
               axis[0]*radial[1] - axis[1]*radial[0]]
    rows = []
    for station in range(12):
        turns = station / 6
        angle = math.tau * turns * (1 if hand == "right" else -1)
        crest = [s + a * (height + turns*pitch) + r*math.cos(angle) + t*math.sin(angle)
                 for s, a, r, t in zip(start, axis, radial, tangent)]
        trough = [p + a*pitch/2 for p, a in zip(crest, axis)]
        rows.append({"crestMm": crest, "crest": classify(crest), "troughMm": trough, "trough": classify(trough)})
    return {"matched": all(r["crest"] == "material" and r["trough"] == "void" for r in rows), "stations": rows}


def placed_thread(shape, commission):
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_IN, TopAbs_OUT
    from OCP.gp import gp_Pnt
    classifier = BRepClass3d_SolidClassifier(shape)
    def classify(point):
        classifier.Perform(gp_Pnt(*point), 1e-7)
        return {TopAbs_IN: "material", TopAbs_OUT: "void"}.get(classifier.State(), "indeterminate")
    return thread_witness(commission["region"], commission["threadForm"], classify)


def forbidden_probes(commission):
    """Each probe lies strictly beyond an end, beyond the OD or wholly inside the forbidden core."""
    start, _, axis, length, inner, outer, slack = annulus(commission["region"])
    probes = commission.get("forbiddenProbes", [])
    if not isinstance(probes, list):
        raise ValueError("Register forbidden material probes as individual balls")
    for probe in probes:
        center, radius = probe["centerMm"], probe["radiusMm"]
        if (not isinstance(center, list) or len(center)!=3 or
                any(type(v) not in (float,int) or not math.isfinite(v) for v in [*center,radius]) or radius <= 0):
            raise ValueError("Malformed forbidden material probe")
        offset = [p-s for p,s in zip(center,start)]
        height = sum(a*b for a,b in zip(offset,axis))
        radial = math.hypot(*(v-height*a for v,a in zip(offset,axis)))
        if not (height+radius < -slack or height-radius > length+slack or
                radial-radius > outer+slack or radial+radius < inner-slack):
            raise ValueError("A forbidden ball overlaps the commissioned annulus")
    return probes


def placed_forbidden(shapes, pair, commission):
    from interface_consistency import inscribed_balls
    results = []
    for probe in forbidden_probes(commission):
        try:
            balls, _ = inscribed_balls(shapes[pair[0]],shapes[pair[1]],[probe["centerMm"]],1e-5)
            results.append({"probe":probe,"sharedInterior":bool(balls and balls[0]["radiusMm"]>=probe["radiusMm"])})
        except (RuntimeError,ValueError,TypeError,KeyError) as error:
            results.append({"probe":probe,"sharedInterior":None,"error":str(error)})
    return results


def probe_result(commission, observations):
    probes=forbidden_probes(commission)
    if not isinstance(observations,list):
        return "open"
    verified=[]
    for observation in observations:
        if not isinstance(observation,dict) or observation.get("probe") not in probes:
            continue
        if not observation.get("error") and type(observation.get("sharedInterior")) is bool:
            if observation["sharedInterior"]:
                return "fail"
            verified.append(observation["probe"])
    if len(observations)!=len(probes) or len(verified)!=len(probes) or any(verified.count(p)!=1 for p in probes):
        return "open"
    return "pass"


def native_result(observation,commission):
    """Reconcile both measured native partitions to the ordinary pair readings."""
    if commission.get("representation")!="external-thread/smooth-pilot":
        return "open","Unqualified interface representation"
    spatial=observation.get("spatialFit",{})
    if spatial.get("commission")!=commission:
        return "open","Missing, mismatched or unresolved spatial observation"
    probe_status=probe_result(commission,spatial.get("forbidden",[]))
    if probe_status=="fail":
        return "fail","An independently checked interior ball lies in both solids outside the permitted annulus"
    rows=spatial.get("methods",{})
    names=("fusionInterference","fusionTransient")
    verified={}
    for name,scalar in zip(names,("interferenceMm3","temporaryCommonMm3")):
        total=rows.get(name,{}).get("totalMm3")
        raw=observation.get(scalar)
        if all(type(x) in (int,float) and math.isfinite(x) and x>=0 for x in (raw,total)) and abs(raw-total)<=max(1e-8,raw*1e-8):
            verified[name]=rows[name]
    status,reason=assess(verified,commission["expectedCommonMm3"],required_methods=names)
    if status=="pass" and probe_status!="pass":
        return "open","Incomplete or unresolved forbidden-region probe"
    if status=="pass" and (spatial.get("errors") or spatial.get("maleThread",{}).get("matched") is not True):
        return "open","The registered external thread form or required native operation is unresolved"
    if status=="pass" and spatial.get("smoothPilot") is not True:
        return "open","The host did not demonstrate a complete smooth cylindrical pilot"
    return status,reason


def review(root, cases, shapes, mapping, census, archive_sha, step_sha, configuration, allowance):
    from mechanical_readiness import digest, named, require
    if not isinstance(cases,list):
        raise ValueError("Register spatial fits as a list")
    results=[]
    seen=set()
    for case in cases:
        result={"status":"open","case":case.get("id") if isinstance(case,dict) else None}
        results.append(result)
        try:
            require(named(case["id"]) and case["id"] not in seen,"Ambiguous commissioned spatial fit")
            seen.add(case["id"])
            require(case["archiveSha256"]==archive_sha and case["stepSha256"]==step_sha and
                    case["configuration"]==configuration and case["pose"]=="saved","Wrong source, configuration or pose for the fit")
            commission=case["commission"]
            pair=case["solids"]
            identities=commission["bodies"]
            require(len(pair)==len(identities)==2 and pair[0]!=pair[1] and
                    all(mapping[tuple(k)][0]==p for k,p in zip(identities,pair)),
                    "Commission the actual two physical native bodies and their placed STEP identities")
            require(commission["host"]==identities[1] and named(commission["basis"]) and
                    commission["representation"]=="external-thread/smooth-pilot","Unsupported spatial fit representation or host")
            require(commission["expectedCommonMm3"][1]==allowance.get(tuple(sorted(pair))),
                    "The spatial allowance must agree with the qualified pair-specific fit")
            sources=case["evidence"]
            verify_basis(root,sources,commission,archive_sha)
            require(sources["maleGeometry"]["sha256"]==mapping[tuple(identities[0])][1].get("neutralSha256"),
                    "The registered modeled male does not match the exact installed article source")
            require(census["archiveSha256"]==archive_sha and census["pose"]["id"]=="saved" and
                    census["contacts"].get("complete") is True,"Unresolved cold native census on the commissioned park")
            ids={tuple(k) for k in identities}
            hits=[r for r in census["contacts"]["pairs"] if {tuple(k) for k in r.get("identities",[])}==ids]
            require(len(hits)==1 and
                    census["contacts"]["programSha256"]==digest(Path(__file__).with_name("fusion_issue_contacts.py")) and
                    census["pose"].get("spatialProgramSha256")==digest(Path(__file__)) and
                    commission in census["pose"].get("spatialFits",[]),"Missing current native observation on the commissioned pair")
            native=hits[0]
            spatial=native["spatialFit"]
            require(spatial["programSha256"]==digest(Path(__file__)),"Spatial observation uses another region evaluator")
            result["native"]=native
            status,reason=native_result(native,commission)
            result.update(status=status,reason=reason)
            region=commission["region"]
            annulus(region)
            errors={}
            for key,operation,args in (
                    ("stepForbidden",placed_forbidden,(shapes,pair,commission)),
                    ("step",placed_sections,(shapes,pair,region)),
                    ("stepSmoothPilot",smooth_host,(shapes[pair[1]],region)),
                    ("stepMaleThread",placed_thread,(shapes[pair[0]],commission))):
                try:
                    result[key]=operation(*args)
                except (KeyError,TypeError,ValueError,RuntimeError,IndexError,OSError) as error:
                    errors[key]=str(error)
            if errors: result["stepErrors"]=errors
            probe_status=probe_result(commission,result.get("stepForbidden",[]))
            if probe_status=="fail":
                result.update(status="fail",reason="Placed solids share independently witnessed material outside the permitted annulus")
                continue
            neutral={"placedStep":result.get("step")}
            step_status,step_reason=assess(neutral,commission["expectedCommonMm3"],required_methods=["placedStep"])
            if step_status=="fail":
                result.update(status=step_status,reason=step_reason)
            elif status=="pass":
                if errors or probe_status!="pass":
                    result.update(status="open",reason="Incomplete placed spatial observations")
                elif result["stepSmoothPilot"] is not True or not result["stepMaleThread"]["matched"]:
                    result.update(status="open",reason="Placed solids do not demonstrate the commissioned thread and smooth pilot")
                else:
                    combined,reason=assess({**spatial["methods"],**neutral},commission["expectedCommonMm3"],
                                           required_methods=("fusionInterference","fusionTransient","placedStep"))
                    result.update(status=combined,reason=reason)
        except (KeyError,TypeError,ValueError,RuntimeError,IndexError,OSError) as e:
            if result["status"]=="fail": result["additionalError"]=str(e)
            else: result.update(status="open",reason=str(e))
    return results
