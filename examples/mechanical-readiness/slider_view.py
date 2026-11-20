"""Write the two placed STEP solids as distinct GLB nodes and animate the observed native slide."""
import json
from pathlib import Path
import struct
from tempfile import TemporaryDirectory
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
from mesh_correspondence import stl_triangles
from mechanical_readiness import digest


def write_view(root,shapes,slider,travel_mm,filename):
    binary=bytearray();views=[];accessors=[];nodes=[];meshes=[];facets={};offset=0
    def accessor(data,kind,width):
        packed=struct.pack("<"+"f"*len(data),*data)
        views.append(dict(buffer=0,byteOffset=len(binary),byteLength=len(packed)));binary.extend(packed)
        accessors.append(dict(bufferView=len(views)-1,componentType=5126,count=len(data)//width,type=kind,
            min=[min(data[i::width]) for i in range(width)],max=[max(data[i::width]) for i in range(width)]))
        return len(accessors)-1
    with TemporaryDirectory() as tmp:
        out=Path(tmp)/"component.stl"
        writer=StlAPI_Writer();writer.ASCIIMode=False
        for name,shape in shapes.items():
            if not BRepMesh_IncrementalMesh(shape,.18,False,.18,True).IsDone() or not writer.Write(shape,str(out)):
                raise ValueError("Failed to tessellate original part")
            triangles=list(stl_triangles(out.read_bytes()))
            points=[x/1000 for tri in triangles for vertex in tri for x in vertex]
            positions=accessor(points,"VEC3",3)
            facets[name]=[[offset,len(triangles)]];offset+=len(triangles)
            nodes.append(dict(name=name,mesh=len(meshes)));meshes.append(dict(primitives=[dict(attributes={"POSITION":positions})]))
    active=list(shapes).index(slider);time=accessor([0,1],"SCALAR",1)
    position=accessor([0,0,0,travel_mm/1000,0,0],"VEC3",3)
    name="Inspect the carriage stroke"
    doc=dict(asset={"version":"2.0"},scene=0,scenes=[dict(nodes=list(range(len(nodes))))],nodes=nodes,meshes=meshes,
        buffers=[dict(byteLength=len(binary))],bufferViews=views,accessors=accessors,
        animations=[dict(name=name,samplers=[dict(input=time,output=position,interpolation="LINEAR")],
            channels=[dict(sampler=0,target=dict(node=active,path="translation"))])])
    payload=json.dumps(doc,separators=(",",":")).encode()
    payload+=b" "*(-len(payload)%4)
    file=root/filename
    file.write_bytes(struct.pack("<4sII",b"glTF",2,28+len(payload)+len(binary))+
        struct.pack("<I4s",len(payload),b"JSON")+payload+struct.pack("<I4s",len(binary),b"BIN\0")+binary)
    return dict(mesh=dict(file=filename,sha256=digest(file)),chordMm=.18,angleRad=.18,pose="rest",
        surfaces=dict(facets=facets,basis="Directly registered facets for every original solid",toleranceMm=.01),
        animations={name:dict(keyPoses=[dict(timeS=0,pose="home"),dict(timeS=1,pose="extended")],
            channels={str(active):dict(group="carriage",baselinePose="home",calibrationPose="extended",timeS=1)})})
