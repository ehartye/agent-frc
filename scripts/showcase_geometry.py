"""Inspect placed triangles in the selected GLB scene or project-authored STL range."""

import gzip
import json
import math
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def numbers(values, count):
    return isinstance(values, list) and len(values) == count and all(
        type(value) in (int, float) and math.isfinite(value) for value in values
    )


IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def multiply(a, b):
    # glTF stores affine matrices column-major.
    return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]


def transform(node):
    if "matrix" in node:
        m = node["matrix"]
        require(numbers(m, 16) and all(m[i] == v for i, v in zip((3,7,11,15),(0,0,0,1)))
                and not any(k in node for k in ("rotation","translation","scale")), "Unsupported node matrix")
        return m
    t = node.get("translation", [0,0,0])
    q = node.get("rotation", [0,0,0,1])
    s = node.get("scale", [1,1,1])
    require(numbers(t,3) and numbers(q,4) and numbers(s,3) and abs(sum(v*v for v in q)-1)<1e-4,
            "Invalid node rotation, translation or scale")
    x,y,z,w=q
    rotation=[1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y),0,
              2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x),0,
              2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y),0,*t,1]
    for c in range(3):
        for r in range(3):
            rotation[c*4+r]*=s[c]
    return rotation


def determinant(m):
    return m[0]*(m[5]*m[10]-m[6]*m[9])-m[4]*(m[1]*m[10]-m[2]*m[9])+m[8]*(m[1]*m[6]-m[2]*m[5])


def triangle_area(a,b,c):
    u=[v-w for v,w in zip(b,a)]
    v=[r-s for r,s in zip(c,a)]
    return sum((u[i]*v[(i+1)%3]-u[(i+1)%3]*v[i])**2 for i in range(3))


def indexed(collection, index, label):
    require(type(index) is int and 0 <= index < len(collection), "Invalid "+label+" index")
    return collection[index]


def bounds(points):
    minimum=[math.inf]*3
    maximum=[-math.inf]*3
    for point in points:
        for i,value in enumerate(point):
            require(math.isfinite(value),"Non-finite rendered vertex")
            minimum[i]=min(minimum[i],value)
            maximum[i]=max(maximum[i],value)
    require(all(math.isfinite(v) for v in minimum),"No rendered triangles")
    return minimum+maximum


class Glb:
    def __init__(self, raw):
        require(len(raw)>=28 and struct.unpack_from("<4sII",raw)==(b"glTF",2,len(raw)),"Invalid GLB header")
        length,kind=struct.unpack_from("<I4s",raw,12)
        require(kind==b"JSON" and 28+length<=len(raw),"Missing GLB JSON")
        self.doc=json.loads(raw[20:20+length])
        require(self.doc.get("asset",{}).get("version")=="2.0","Expected glTF 2.0 assets")
        size,kind=struct.unpack_from("<I4s",raw,20+length)
        self.data=memoryview(raw)[28+length:]
        buffers=self.doc.get("buffers",[])
        require(kind==b"BIN\0" and len(self.data)==size and len(buffers)==1 and "uri" not in buffers[0]
                and 0<=size-buffers[0]["byteLength"]<=3 and not self.doc.get("extensionsRequired"),
                "Expected a self-contained, uncompressed GLB")
        self.nodes={}
        seen=set()
        def visit(n,parent):
            node=indexed(self.doc["nodes"],n,"node")
            require(n not in seen,"Repeated or cyclic GLB node")
            seen.add(n)
            m=multiply(parent,transform(node))
            if "mesh" in node and "name" in node:
                self.nodes.setdefault(node["name"],[]).append((node,m))
            for child in node.get("children",[]): visit(child,m)
        scene=indexed(self.doc["scenes"],self.doc.get("scene",0),"scene")
        for root in scene["nodes"]: visit(root,IDENTITY)

    def accessor(self, index, *, positions):
        a=indexed(self.doc["accessors"],index,"accessor")
        view=indexed(self.doc["bufferViews"],a["bufferView"],"buffer view")
        require(view["buffer"]==0 and not a.get("sparse") and not a.get("normalized"),
                "Unsupported accessor storage")
        formats={5126:"<fff"} if positions else {5121:"<B",5123:"<H",5125:"<I"}
        require(a.get("type")==("VEC3" if positions else "SCALAR") and a.get("componentType") in formats,
                "Unsupported position or triangle index")
        record=struct.Struct(formats[a["componentType"]])
        count=a["count"];stride=view.get("byteStride",record.size)
        offset=a.get("byteOffset",0);base=view.get("byteOffset",0);length=view["byteLength"]
        require(all(type(v) is int for v in (count,stride,offset,base,length)) and count>0 and
                stride>=record.size and offset>=0 and base>=0 and base+length<=self.doc["buffers"][0]["byteLength"]
                and offset+(count-1)*stride+record.size<=length,"Accessor outside bound buffer view")
        return [record.unpack_from(self.data,base+offset+i*stride) for i in range(count)]

    def measure(self, name):
        rows=self.nodes.get(name,[])
        require(len(rows)==1,"Missing or ambiguous reachable mesh node: "+str(name))
        node,m=rows[0]
        require("skin" not in node and not node.get("weights") and not node.get("extensions"),
                "Unsupported skinned, instanced or morphed node")
        mesh=indexed(self.doc["meshes"],node["mesh"],"mesh")
        def vertices():
            for primitive in mesh["primitives"]:
                require(primitive.get("mode",4)==4 and not primitive.get("targets") and not primitive.get("extensions"),
                        "Expected uncompressed static triangle geometry")
                if "material" in primitive:
                    material=indexed(self.doc["materials"],primitive["material"],"material")
                    require(material.get("alphaMode","OPAQUE")=="OPAQUE",
                            "Alpha-masked or blended geometry needs an independent visibility check")
                points=self.accessor(primitive["attributes"]["POSITION"],positions=True)
                if "indices" in primitive:
                    ids=[v[0] for v in self.accessor(primitive["indices"],positions=False)]
                else: ids=range(len(points))
                require(len(ids)>0 and len(ids)%3==0,"Incomplete triangle list")
                require(any(triangle_area(*[indexed(points,i,"vertex") for i in ids[j:j+3]]) > 0
                            for j in range(0,len(ids),3)), "No nondegenerate source triangles")
                require(abs(determinant(m))>0, "Singular occurrence collapses source geometry")
                for i in set(ids):
                    x,y,z=indexed(points,i,"vertex")
                    yield [1000*(m[r]*x+m[4+r]*y+m[8+r]*z+m[12+r]) for r in range(3)]
        return bounds(vertices())


class Stl:
    def __init__(self,path,raw):
        self.data=gzip.decompress(raw) if path.name.endswith(".gz") else raw
        require(len(self.data)>=84,"Incomplete binary STL")
        self.count=struct.unpack_from("<I",self.data,80)[0]
        require(len(self.data)==84+50*self.count,"Incomplete binary STL facets")
        self.used=[]

    def measure(self, span):
        require(isinstance(span,list) and len(span)==2 and all(type(n) is int for n in span),
                "Expected [first facet, count]")
        first,count=span;end=first+count
        require(0<=first<end<=self.count,"STL range outside mesh")
        require(all(end<=a or b<=first for a,b in self.used),"STL articles reuse a rendered facet")
        self.used.append((first,end))
        def vertices():
            has_area=False
            for i in range(first,end):
                tri=[struct.unpack_from("<fff",self.data,84+i*50+12+j*12) for j in range(3)]
                if not has_area:
                    has_area=triangle_area(*tri)>0
                yield from tri
            require(has_area,"No nondegenerate facets in the supplied range")
        return bounds(vertices())
