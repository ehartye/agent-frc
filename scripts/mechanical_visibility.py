"""Inspect finite camera targets and intervening installed solids at the registered pose."""
import math

from mechanical_readiness import number,named,pinned,read,require


def observe(root,goal,scene,moves,transform):
    from OCP.gp import gp_Pnt
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge,BRepBuilderAPI_MakeVertex
    from OCP.BRep import BRep_Tool
    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
    from OCP.TopoDS import TopoDS
    def normalized(v):
        length=math.hypot(*v);require(length>0,"Invalid optical axis")
        return [x/length for x in v]
    def cross(a,b):
        return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    dot=lambda a,b:sum(x*y for x,y in zip(a,b))
    def difference(a,b):return [x-y for x,y in zip(a,b)]
    def world(v,owner):
        require(len(v)==3 and all(number(x) for x in v),"Invalid optical point")
        shape=BRepBuilderAPI_MakeVertex(gp_Pnt(*v)).Vertex()
        actual=transform(shape,moves.get(owner,[]),goal["t"])
        return list(BRep_Tool.Pnt_s((getattr(TopoDS,'Vertex_s',None) or TopoDS.Vertex)(actual)).Coord())
    t=goal["t"];require(number(t) and 0<=t<=1,"Optical time outside the registered stroke")
    mount=goal["camera"];target=goal["target"]
    require(mount in scene and target in scene and mount!=target,"Missing physical camera or finite target")
    calibration=read(pinned(root,goal["calibration"]))
    require(calibration.get("id")==goal["cameraId"] and sorted(calibration.get("imageSizePx",[])) and
            len(calibration["imageSizePx"])==2,"Calibration not bound to the selected camera")
    intrinsic=calibration["intrinsics"];fx,fy,cx,cy=[intrinsic[k] for k in ("fx","fy","cx","cy")]
    width,height=calibration["imageSizePx"]
    require(all(number(v) for v in (fx,fy,cx,cy,width,height)) and min(fx,fy,width,height)>0,"Invalid rectified camera intrinsics")
    eye=world(goal["eyeMm"],mount);front=normalized(difference(world(goal["forwardPointMm"],mount),eye))
    side=normalized(cross(front,difference(world(goal["upPointMm"],mount),eye)));up=normalized(cross(side,front))
    require(len(goal["targetCornersMm"])>=3,"Use a finite target footprint")
    observed=[];blocked=set();inside=True;corners=[]
    from mechanical_motion import distance
    target_body=transform(scene[target],moves.get(target,[]),t)
    tolerance=goal.get("cornerToleranceMm",.001)
    require(number(tolerance) and tolerance>=0,"Invalid target registration tolerance")
    for corner in goal["targetCornersMm"]:
        q=world(corner,target);corners.append(q)
        require(distance(BRepBuilderAPI_MakeVertex(gp_Pnt(*q)).Vertex(),target_body)<=tolerance,
            "Registered optical target corner falls outside its actual placed geometry")
        v=difference(q,eye);depth=dot(v,front)
        if depth<=0:
            inside=False;observed.append(None);continue
        px=cx+fx*dot(v,side)/depth;py=cy-fy*dot(v,up)/depth
        inside=inside and 0<=px<width and 0<=py<height;observed.append([px,py])
        ray=BRepBuilderAPI_MakeEdge(gp_Pnt(*eye),gp_Pnt(*q)).Edge()
        for n,body in scene.items():
            if n in (mount,target):continue
            dist=BRepExtrema_DistShapeShape(ray,transform(body,moves.get(n,[]),t))
            require(dist.IsDone(),"Unresolved occlusion")
            if dist.Value()<=1e-7:blocked.add(n)
    if inside:
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon
        from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
        poly=BRepBuilderAPI_MakePolygon()
        for q in corners:poly.Add(gp_Pnt(*q))
        poly.Close()
        hull=BRepOffsetAPI_ThruSections(True,True)
        hull.AddVertex(BRepBuilderAPI_MakeVertex(gp_Pnt(*eye)).Vertex());hull.AddWire(poly.Wire());hull.Build()
        require(hull.IsDone(),"Could not bound the target's optical volume")
        for n,body in scene.items():
            if n not in (mount,target) and distance(hull.Shape(),transform(body,moves.get(n,[]),t))<=1e-7:
                blocked.add(n)
    result=dict(id=goal["id"],camera=mount,target=target,t=t,projectedCornersPx=observed,blockedBy=sorted(blocked))
    if not inside or blocked:
        return {**result,"status":"fail","basis":"Target clipped or occluded at this sampled pose."}
    receipt=goal.get("frame")
    if not receipt:return {**result,"status":"open","basis":"Projection clear; no registered sensor packet."}
    packet=read(pinned(root,receipt));minimum=goal["minBrightness"];maximum=goal["maxAgeS"]
    require(number(minimum) and number(maximum) and maximum>=0,"Supply the registered detector limits")
    require(packet.get("cameraId")==goal["cameraId"] and packet.get("poseFraction")==t and packet.get("target")==target and
            packet.get("calibrationSha256")==goal["calibration"]["sha256"] and named(packet.get("method")),"Sensor receipt applies to a different camera or pose")
    valid=packet.get("received") is True and packet.get("detectedId")==goal["expectedId"] and number(packet.get("brightness")) and packet["brightness"]>=minimum and number(packet.get("ageS")) and 0<=packet["ageS"]<=maximum
    return {**result,"status":"pass" if valid else "fail","basis":"Project detector observation at the sampled instant."}
