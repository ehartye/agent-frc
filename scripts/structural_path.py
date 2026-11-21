"""Check a commissioned route from loaded hardware to a structural anchor under a named load."""
import argparse
import json
import math
from pathlib import Path
import sys

from mechanical_readiness import named,number,pinned,project_path,read,require
from showcase_contacts import box_gap


def route_exists(route,edges):
    permitted=set(route["members"]);src=route["loaded"];dest=route["chassis"]
    require(src!=dest and {src,dest}<=permitted and len(permitted)==len(route["members"]),
            "Name the distinct loaded and chassis members of this structural load path")
    neighbors={k:set() for k in permitted}
    for a,b in edges:
        if a in permitted and b in permitted:
            neighbors[a].add(b);neighbors[b].add(a)
    path={src:None};pending=[src]
    while pending:
        previous=pending.pop(0)
        if previous==dest:
            chain=[dest]
            while path[chain[-1]] is not None:chain.append(path[chain[-1]])
            return list(reversed(chain))
        for member in sorted(neighbors[previous]-path.keys()):
            path[member]=previous;pending.append(member)
    return []


def potential(route,boxes):
    require(set(route["members"])<=boxes.keys(),"Structural scope names missing native solids")
    from itertools import combinations
    return route_exists(route,[(a,b) for a,b in combinations(route["members"],2) if box_gap(boxes[a],boxes[b])<=1e-7])


def evaluate(root,route,shapes,approved,anchor,archive,step,*,masses=None):
    from support_equilibrium import applied,bearing_cells,properties,solve
    import numpy as np
    permitted={"archiveSha256","stepSha256","configuration","case","loaded","chassis","members","direction","loadN","interfaces","appliedForces","appliedMomentsNmm","gravityMmS2","loadStates","historyLaw"}
    require(set(route)<=permitted,"Unrecognized structural operating condition or load model")
    from mechanical_motion import bearing_area,common,distance,vec
    require(route["archiveSha256"]==archive and route["stepSha256"]==step and route["chassis"]==anchor
            and set(route["members"])<=shapes.keys() and named(route["case"]),"Structural load route names another native issue, body or anchor")
    norm=route["direction"];demand=route["loadN"]
    require(len(norm)==3 and all(number(v) for v in norm) and abs(math.hypot(*norm)-1)<1e-8 and number(demand) and demand>=0,
            "Freeze a signed unit load direction and a positive installed design load")
    applied_rows=route.get("appliedForces",[])
    resultant=np.sum([vec(r["forceN"]) for r in applied_rows],axis=0) if applied_rows else np.zeros(3)
    require(np.linalg.norm(resultant-demand*np.asarray(norm))<=1e-7,
            "The declared reference load differs from the combined applied forces before gravity")
    possible=[];limits=[];contacts=[];seen=set()
    for item in route["interfaces"]:
        a,b=item["from"],item["to"]
        require(a in route["members"] and b in route["members"] and a!=b,"Structural interface names a nonstructural or unknown route member")
        direction=vec(item.get("direction",norm))
        key=(a,b,tuple(direction)) if a<b else (b,a,tuple(-x for x in direction))
        require(key not in seen,"Duplicated structural bearing direction and contact area")
        seen.add(key)
        if frozenset([a,b]) not in approved:continue
        possible.append((a,b))
        ref=read(pinned(root,item["capacitySource"]))
        require(all(ref[k]==v for k,v in (("archiveSha256",archive),("stepSha256",step),("case",route["case"]),
                    ("direction",direction),("from",a),("to",b))) and named(ref["basis"]),"Structural allowable belongs to another load case, direction or pair")
        if ref["kind"]=="bearing-compression":
            pressure=ref["allowablePressureMPa"]
            require(number(pressure) and pressure>0,"Missing reviewed allowable contact pressure")
            patches=bearing_cells(shapes[a],shapes[b],direction,pressure) if distance(shapes[a],shapes[b])<=1e-7 and common(shapes[a],shapes[b])==0 else []
            capacity=sum(c["capacityN"] for c in patches)
            contacts.extend(dict(c,**{"from":a,"to":b}) for c in patches)
        else:
            require(ref["kind"]=="installed-joint-allowable" and ref["status"]=="pass" and ref.get("sources"),"Missing installed joint qualification")
            from joint_sources import verify
            verify(root,ref["sources"],[a,b],archive,step,route["configuration"],True)
            capacity=ref["allowableN"];require(number(capacity) and capacity>=0,"Missing joint allowable in the installed direction")
            point=vec(ref["reactionPointMm"])
            from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
            from OCP.gp import gp_Pnt
            vertex=BRepBuilderAPI_MakeVertex(gp_Pnt(*point)).Vertex()
            require(all(distance(vertex,shapes[k])<=1e-7 for k in (a,b)),"Reaction location is outside installed joint solids")
            contacts.append(dict(pointMm=point,direction=(-np.array(direction)).tolist(),capacityN=capacity,**{"from":a,"to":b}))
        limits.append(dict(pair=[a,b],allowableN=capacity))
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCP.gp import gp_Pnt
    for state in [route,*route.get("loadStates",[])]:
        for f in state["appliedForces"]:
            name=f.get("body",route["loaded"])
            require(name in route["members"] and distance(BRepBuilderAPI_MakeVertex(gp_Pnt(*vec(f["pointMm"]))).Vertex(),shapes[name])<=1e-7,
                    "Applied load point is outside its commissioned installed solid")
    mass_centers={n:(masses[n],properties(shapes[n],True)[1]) for n in route["members"] if n in (masses or {})}
    cases=applied(route,route["members"],mass_centers)
    system=[]
    for time,forces,moments in cases:
        # These case loads all act simultaneously on their named bodies.
        result=solve(route["members"],anchor,contacts,forces,moments)
        system.append(dict(time=time,**result))
    path=route_exists(route,possible)
    status="fail" if not path or not contacts or any(r["status"]=="fail" for r in system) else "pass" if all(r["status"]=="pass" for r in system) else "open"
    return dict(status=status,
                qualifiedPath=path,interfaceCapacities=limits,reactionPatches=contacts,loadCases=system,
                retainedPathWithinStructuralMembers=route_exists(route,approved),case=route["case"])


def screen(root,study):
    if study.get("schema")=="agent-frc/observed-supports@1":
        from support_equilibrium import observed_supports
        return observed_supports(root,study)
    census=read(pinned(root,study["nativeCensus"]));route=study["route"]
    require(census["contacts"]["complete"] and census["archiveSha256"]==study["archiveSha256"] and census["pose"]==study["pose"],
            "Missing complete exact native inventory at the selected pose")
    source={(r["path"],r["name"]):r["boundsMm"] for r in census["bodies"]}
    require(len(source)==len(census["bodies"]),"Ambiguous native body identifiers")
    boxes={k:source[tuple(v)] for k,v in study["nativeBodies"].items()}
    chain=potential(route,boxes)
    return dict(status="open" if chain else "fail",possibleRoute=chain,candidatePairs=census["contacts"]["candidatePairs"],
                scope="Potential contact within nominated structural members. A possible route still requires installed capacity.")


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("root",type=Path);p.add_argument("study");a=p.parse_args()
    try:
        root=a.root.resolve();result=screen(root,read(project_path(root,a.study)))
        print(json.dumps(result,indent=2));sys.exit(int(result["status"]!="pass"))
    except (KeyError,ValueError,OSError,TypeError) as e:sys.exit(str(e))
