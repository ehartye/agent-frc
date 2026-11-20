"""Compare the submitted visible triangle multiset to every freshly tessellated placed STEP solid."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory
from mechanical_readiness import digest, named, number, pinned, project_path, read, require
from showcase_geometry import Glb, IDENTITY, indexed, multiply, transform
from showcase_contacts import load_solids


def stl_triangles(raw):
    require(len(raw)>=84,"Incomplete binary STL")
    count=struct.unpack_from("<I",raw,80)[0]
    require(count>0 and len(raw)==84+50*count,"Incomplete STL facet inventory")
    for i in range(count):
        row=struct.unpack_from("<9f",raw,96+i*50)
        yield [row[j:j+3] for j in (0,3,6)]


def aggregate(triangles,resolution):
    result=Counter()
    for tri in triangles:
        require(all(math.isfinite(x) for point in tri for x in point),"Nonfinite mesh vertex")
        points=[tuple(round(x/resolution) for x in v) for v in tri]
        # Rotation of a triangle's starting vertex preserves orientation and multiplicity.
        key=min(tuple(points[j:]+points[:j]) for j in range(3))
        result[hashlib.sha256(struct.pack("<9q",*(x for p in key for x in p))).digest()]+=1
    return result


def pose_nodes(glb, pose):
    nodes=[dict(n) for n in glb.doc["nodes"]]
    if pose=="rest":
        return nodes
    require(isinstance(pose,dict) and named(pose.get("clip")) and number(pose.get("timeS")),"Specify a clip and clock time or rest")
    clips=[a for a in glb.doc.get("animations",[]) if a.get("name")==pose["clip"]]
    require(len(clips)==1,"Animation name must identify one clip")
    clip=clips[0];time=pose["timeS"];seen=set()
    for ch in clip["channels"]:
        target=ch["target"];key=target["path"];i=target["node"]
        require(key in ("translation","rotation","scale") and (i,key) not in seen,"Unsupported or conflicting animation target")
        seen.add((i,key));node=indexed(nodes,i,"animation node")
        require("matrix" not in node,"Animated TRS channel on a matrix node")
        s=indexed(clip["samplers"],ch["sampler"],"sampler")
        clocks=[r[0] for r in glb.accessor(s["input"],times=True)]
        require(all(math.isfinite(t) for t in clocks) and all(a<b for a,b in zip(clocks,clocks[1:])),"Invalid animation clock")
        entries=glb.accessor(s["output"],vector=4 if key=="rotation" else 3)
        require(len(entries)==len(clocks) and s.get("interpolation","LINEAR") in ("STEP","LINEAR"),"Unsupported animation interpolation")
        right=next((j for j,t in enumerate(clocks) if t>=time),len(clocks)-1)
        left=max(0,right-1)
        f=0 if left==right else min(1,max(0,(time-clocks[left])/(clocks[right]-clocks[left])))
        a,b=entries[left],entries[right]
        if s.get("interpolation")=="STEP":
            val=list(b if f==1 else a)
        elif key=="rotation":
            dot=sum(x*y for x,y in zip(a,b))
            if dot<0:
                b=tuple(-v for v in b);dot=-dot
            theta=math.acos(min(1,max(0,dot)))
            if theta>1e-7:
                val=[(x*math.sin((1-f)*theta)+y*math.sin(f*theta))/math.sin(theta) for x,y in zip(a,b)]
            else:
                val=[(1-f)*x+f*y for x,y in zip(a,b)]
            norm=math.hypot(*val);require(norm>0,"Degenerate animated rotation");val=[v/norm for v in val]
        else:
            val=[(1-f)*x+f*y for x,y in zip(a,b)]
        node[key]=val
    return nodes


def glb_triangles(glb, pose, registration):
    nodes=pose_nodes(glb,pose);seen=set()
    require(len(registration)==16 and all(number(x) for x in registration) and list(registration[12:])==[0,0,0,1],
        "Use a row-major rigid transform from glTF axes to the STEP frame, after units conversion")
    from component_shape import proper_rotation
    proper_rotation(registration)
    def visit(i,parent):
        require(i not in seen,"Repeated/cyclic occurrence in the selected scene")
        seen.add(i);n=indexed(nodes,i,"node");m=multiply(parent,transform(n))
        if "mesh" in n:
            require(not n.get("extensions"),"Custom or instanced node semantics must be resolved before visual qualification")
            require("skin" not in n and "weights" not in n,"Skinned or morphed mesh needs a baked registered physical pose")
            for prim in indexed(glb.doc["meshes"],n["mesh"],"mesh")["primitives"]:
                require(prim.get("mode",4)==4 and not prim.get("targets") and not prim.get("extensions"),"Unsupported deformation or geometry encoding")
                if "material" in prim:
                    material=indexed(glb.doc.get("materials",[]),prim["material"],"material")
                    require(material.get("alphaMode","OPAQUE")=="OPAQUE","Masked or translucent visible geometry needs a supported visibility witness")
                vertices=glb.accessor(prim["attributes"]["POSITION"],positions=True)
                indices=[v[0] for v in glb.accessor(prim["indices"])] if "indices" in prim else range(len(vertices))
                require(len(indices)>0 and len(indices)%3==0,"Incomplete glTF triangles")
                world=[]
                for x,y,z in vertices:
                    metres=[m[k]*x+m[4+k]*y+m[8+k]*z+m[12+k] for k in range(3)]
                    world.append(tuple(registration[4*k+3]+1000*sum(registration[4*k+j]*metres[j] for j in range(3)) for k in range(3)))
                for j in range(0,len(indices),3):
                    yield [indexed(world,indices[j+k],"vertex") for k in range(3)]
        for child in n.get("children",[]):
            yield from visit(child,m)
    scene=indexed(glb.doc["scenes"],glb.doc.get("scene",0),"scene")
    for node in scene["nodes"]:
        yield from visit(node,IDENTITY)


def compare(step, mesh, chord, angle, *, resolution=.0001, pose="rest", registration=None, surfaces=None, diagnostic=None):
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.StlAPI import StlAPI_Writer
    require(number(chord) and chord>0 and number(angle) and angle>0 and number(resolution) and 0<resolution<=.001,
        "Invalid tessellation settings or coordinate resolution")
    if mesh.name.lower().endswith((".glb",".gltf")):
        glb=Glb.from_project(mesh)
        triangles=glb_triangles(glb,pose,registration or IDENTITY)
    else:
        require(mesh.name.lower().endswith((".stl",".stl.gz")) and pose=="rest","Unsupported mesh format or pose")
        raw=mesh.read_bytes()
        triangles=stl_triangles(gzip.decompress(raw) if mesh.name.lower().endswith(".gz") else raw)
    displayed=list(triangles) if surfaces or diagnostic else None
    rendered=aggregate(displayed if displayed is not None else triangles,resolution)
    total=sum(rendered.values());shapes,other=load_solids(step)
    require(not other,"Unresolved non-solid STEP products in mesh comparison")
    missing=0;counts={};seen=set();surface_results={};reference_samples=[];reference_all=[]
    if surfaces:
        require(surfaces.get("basis") and set(surfaces.get("facets",{}))==set(shapes),"Surface registration must assign every installed solid")
    with TemporaryDirectory() as tmp:
        out=Path(tmp)/"part.stl"
        writer=StlAPI_Writer();writer.ASCIIMode=False
        for name,shape in shapes.items():
            require(BRepMesh_IncrementalMesh(shape,chord,False,angle,True).IsDone() and writer.Write(shape,str(out)),
                "Could not independently tessellate "+name)
            ref_triangles=list(stl_triangles(out.read_bytes()))
            expected=aggregate(ref_triangles,resolution)
            if diagnostic:
                reference_all.extend(ref_triangles)
                reference_samples.extend((name,tri) for tri in ref_triangles[::max(1,len(ref_triangles)//64)])
            if surfaces:
                from mesh_surface import compare_parts
                ids=[]
                for first,count in surfaces["facets"][name]:
                    require(type(first) is int and type(count) is int and count>0 and 0<=first<first+count<=total,"Invalid registered facet range")
                    ids.extend(range(first,first+count))
                require(ids and len(set(ids))==len(ids) and not seen.intersection(ids),"A display facet cannot qualify two physical articles")
                seen.update(ids)
                subset=[displayed[i] for i in ids]
                surface_results[name]=({"status":"pass","method":"equal oriented facets"} if aggregate(subset,resolution)==expected else
                    compare_parts(ref_triangles,subset,surfaces["toleranceMm"],surfaces.get("maxSamplesPerDirection",100000)))
            count=sum(expected.values());absent=sum((expected-rendered).values())
            for key,n in expected.items():
                left=rendered.get(key,0)-n
                if left>0:rendered[key]=left
                elif key in rendered:del rendered[key]
            missing+=absent;counts[name]={"facets":count,"unmatched":absent}
    extra=sum(rendered.values())
    status="pass" if missing==0 and extra==0 else "fail" if missing==0 or extra==0 else "open"
    if surfaces:
        require(len(seen)==total,"Unassigned display triangles")
        outcomes={r["status"] for r in surface_results.values()}
        status="fail" if "fail" in outcomes else "open" if "open" in outcomes else "pass"
    screening={}
    if diagnostic:
        from mesh_surface import sample_distances
        require(number(diagnostic.get("toleranceMm")) and diagnostic["toleranceMm"]>0 and diagnostic.get("basis"),
            "A historical unsorted mesh screen needs a declared tolerance and basis")
        screening={"sourceToDisplay":sample_distances(reference_samples,displayed),
            "displayToSource":sample_distances((("display",t) for t in displayed),reference_all),"basis":diagnostic["basis"]}
        if max(screening[k]["observedMaxMm"] for k in ("sourceToDisplay","displayToSource"))>diagnostic["toleranceMm"]:
            status="fail"
    return {"schema":"agent-frc/mesh-correspondence@1","stepSha256":digest(step),"meshSha256":digest(mesh),
        "pose":pose,"coordinateResolutionMm":resolution,"solids":len(counts),"triangles":total,"missingFacets":missing,
        "extraFacets":extra,"bodies":counts,"surfaceComparisons":surface_results,"sampledScreen":screening,"status":status}


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("project",type=Path);p.add_argument("study")
    a=p.parse_args()
    try:
        root=a.project.resolve();s=read(project_path(root,a.study))
        r=compare(pinned(root,s["step"]),pinned(root,s["mesh"]),s["chordMm"],s["angleRad"],
            resolution=s.get("coordinateResolutionMm",.0001),pose=s["pose"],registration=s.get("glbToCad"),surfaces=s.get("surfaces"),diagnostic=s.get("sampledScreen"))
        print(json.dumps(r,indent=2));sys.exit(int(r["status"]!="pass"))
    except (OSError,ValueError,KeyError,IndexError,TypeError,ImportError) as e:
        sys.exit(str(e))
