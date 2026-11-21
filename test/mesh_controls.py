"""Original repeated cube geometry checks for local STL/glTF rendering."""
from pathlib import Path
import json
import struct
from tempfile import TemporaryDirectory
import unittest


class MeshComparisons(unittest.TestCase):
    def test_instanced_scene_animation_oriented_facet_multiplicity_and_external_buffers(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        except ImportError:
            self.skipTest("Requires OpenCascade")
        from OCP.BRepMesh import BRepMesh_IncrementalMesh
        from OCP.StlAPI import StlAPI_Writer
        from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
        from OCP.gp import gp_Pnt
        from mesh_correspondence import compare,stl_triangles
        from showcase_contacts import load_solids
        with TemporaryDirectory() as folder:
            root=Path(folder);step=root/"pair.step";s=STEPControl_Writer()
            for x in (0,20):
                s.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(x,0,0),10.,10.,10.).Shape(),STEPControl_AsIs)
            s.Write(str(step));cube=BRepPrimAPI_MakeBox(10.,10.,10.).Shape()
            BRepMesh_IncrementalMesh(cube,.1,False,.5,True)
            writer=StlAPI_Writer();writer.ASCIIMode=False;writer.Write(cube,str(root/"base.stl"))
            triangles=list(stl_triangles((root/"base.stl").read_bytes()))
            points=b"".join(struct.pack("<3f",*(v/1000 for v in point)) for tri in triangles for point in tri)
            clocks=struct.pack("<2f",0,1);trajectory=struct.pack("<6f",.02,0,0,.03,0,0)
            blob=points+clocks+trajectory;(root/"mesh.bin").write_bytes(blob)
            gltf=dict(asset={"version":"2.0"},buffers=[dict(uri="mesh.bin",byteLength=len(blob))],bufferViews=[
                dict(buffer=0,byteLength=len(points)),dict(buffer=0,byteOffset=len(points),byteLength=8),
                dict(buffer=0,byteOffset=len(points)+8,byteLength=24)],accessors=[
                dict(type="VEC3",componentType=5126,bufferView=0,count=len(points)//12),
                dict(type="SCALAR",componentType=5126,bufferView=1,count=2),dict(type="VEC3",componentType=5126,bufferView=2,count=2)],
                meshes=[dict(primitives=[dict(attributes={"POSITION":0})])],
                nodes=[dict(mesh=0),dict(children=[2]),dict(mesh=0,translation=[.02,0,0])],
                scene=0,scenes=[dict(nodes=[0,1])],animations=[dict(name="service",samplers=[dict(input=1,output=2,interpolation="LINEAR")],
                    channels=[dict(sampler=0,target=dict(node=2,path="translation"))])])
            file=root/"view.gltf"
            def actual(**options):
                file.write_text(json.dumps(gltf))
                return compare(step,file,.1,.5,**options)
            self.assertEqual(actual()["status"],"pass")
            self.assertEqual(actual(pose={"clip":"service","timeS":0})["status"],"pass")
            self.assertNotEqual(actual(pose={"clip":"service","timeS":.5})["status"],"pass")
            names=list(load_solids(step)[0])
            spec=dict(facets={names[0]:[[0,12]],names[1]:[[12,12]]},toleranceMm=.02,basis="Original part ranges")
            self.assertEqual(actual(surfaces=spec)["status"],"pass")
            # The private issuer must account for the playable channel as well as rest.
            from release_animation import verify
            from mechanical_fixture import write,pin
            from showcase_geometry import IDENTITY
            import numpy as np
            native=[dict(path=n,name=n,worldTransform=IDENTITY) for n in names]
            model=dict(archive={},step=pin(root,step.name),
                nativeCensus=write(root,"saved.json",dict(bodies=native)),nativePoses=[])
            def native_pose(kind,delta,value=1):
                changed=[dict(r) for r in native]
                changed[1]=dict(native[1],worldTransform=np.asarray(delta).reshape(16).tolist())
                model["reopen"]=write(root,"mapped.json",dict(movingGroups=["shaft"],installedOccurrences=[
                    dict(path=n,nativeBodyNames={n:n}) for n in names]))
                model["nativePoses"]=[write(root,"end.json",dict(bodies=changed,pose=dict(id="end",joints=[
                    dict(group="shaft",coordinate=kind,nativeValue=value)]))),
                    write(root,"zero.json",dict(bodies=native,pose=dict(id="zero",joints=[dict(group="shaft",coordinate=kind,nativeValue=0)])))]
            delta=np.eye(4);delta[0,3]=10
            native_pose("slideValue",delta)
            released=dict(surfaces=spec,pose="rest",animations={"service":dict(keyPoses=[dict(timeS=0,pose="saved"),dict(timeS=1,pose="end")],
                channels={"2":dict(group="shaft",baselinePose="zero",calibrationPose="end",timeS=1)})})
            verify(root,model,released,file)
            with self.assertRaisesRegex(ValueError,"clip"):
                verify(root,model,dict(released,animations={}),file)
            delta[0,3]=5;native_pose("slideValue",delta)
            with self.assertRaisesRegex(ValueError,"transform"):verify(root,model,released,file)
            # A genuine revolute local channel rotates the whole second cube about its registered shaft.
            import math
            angle=math.pi/3
            c,sine=math.cos(angle),math.sin(angle)
            rotated=np.eye(4);rotated[:2,:2]=[[c,-sine],[sine,c]]
            origin=np.array([20,0,0]);rotated[:3,3]=origin-rotated[:3,:3]@origin
            native_pose("rotationValue",rotated,angle)
            rotation=struct.pack("<8f",0,0,0,1,0,0,math.sin(angle/2),math.cos(angle/2))
            (root/"mesh.bin").write_bytes(points+clocks+rotation)
            gltf["buffers"][0]["byteLength"]=len(points)+len(clocks)+len(rotation)
            gltf["bufferViews"][2]["byteLength"]=len(rotation)
            gltf["accessors"][2]["type"]="VEC4"
            gltf["animations"][0]["channels"][0]["target"]["path"]="rotation"
            file.write_text(json.dumps(gltf))
            verify(root,model,released,file)
            # The moving child slides while its parent pivots. Calibration poses
            # exercise each individual joint plus the actual coordinated final pose.
            import base64
            clocks4=struct.pack("<4f",0,1,2,3)
            quat0=[0,0,0,1];quat1=[0,0,math.sin(angle/2),math.cos(angle/2)]
            turns=struct.pack("<16f",*(quat0+quat1+quat0+quat1))
            slides=struct.pack("<12f",.02,0,0,.02,0,0,.025,0,0,.025,0,0)
            d=points+clocks4+turns+slides
            gltf["buffers"]=[dict(uri="data:application/octet-stream;base64,"+base64.b64encode(d).decode(),byteLength=len(d))]
            gltf["bufferViews"][1:]=[dict(buffer=0,byteOffset=len(points),byteLength=16),
                dict(buffer=0,byteOffset=len(points)+16,byteLength=64),dict(buffer=0,byteOffset=len(points)+80,byteLength=48)]
            gltf["accessors"][1]["count"]=4;gltf["accessors"][2]["count"]=4
            gltf["accessors"].append(dict(type="VEC3",componentType=5126,bufferView=3,count=4))
            clip=gltf["animations"][0];clip["channels"][0]["target"]["node"]=1
            clip["samplers"].append(dict(input=1,output=3,interpolation="LINEAR"))
            clip["channels"].append(dict(sampler=1,target=dict(node=2,path="translation")))
            file.write_text(json.dumps(gltf))
            model["reopen"]=write(root,"mapped.json",dict(movingGroups=["pivot","slide"],installedOccurrences=[
                dict(path=n,nativeBodyNames={n:n}) for n in names]))
            seen=[]
            for tag,turn,slide in (("zero",0,0),("pivoted",angle,0),("extended",0,5),("combined",angle,5)):
                m=np.eye(4)
                m[:2,:2]=[[math.cos(turn),-math.sin(turn)],[math.sin(turn),math.cos(turn)]]
                m[:3,3]=m[:3,:3]@np.array([slide,0,0])
                placed=[dict(r) for r in native];placed[1]=dict(placed[1],worldTransform=m.reshape(16).tolist())
                joint_values=[]
                if tag!="extended":joint_values.append(dict(group="pivot",coordinate="rotationValue",nativeValue=turn))
                if tag!="pivoted":joint_values.append(dict(group="slide",coordinate="slideValue",nativeValue=slide/10))
                seen.append(write(root,tag+".json",dict(bodies=placed,pose=dict(id=tag,joints=joint_values))))
            model["nativePoses"]=seen
            compound=dict(surfaces=spec,pose="rest",animations={"service":dict(
                keyPoses=[dict(timeS=t,pose=name) for t,name in enumerate(["zero","pivoted","extended","combined"])],
                channels={"1":dict(group="pivot",baselinePose="zero",calibrationPose="pivoted",timeS=1),
                    "2":dict(group="slide",baselinePose="zero",calibrationPose="extended",timeS=2)})})
            verify(root,model,compound,file)
            spec["facets"][names[1]]=[[0,12]]
            with self.assertRaisesRegex(ValueError,"two physical articles"):actual(surfaces=spec)
            gltf["scenes"][0]["nodes"]=[0]
            r=actual();self.assertEqual(r["status"],"fail");self.assertEqual(r["missingFacets"],12)

    def test_reproduce_full_two_part_pixels_and_viewpoint(self):
        try:
            import vtk
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        except ImportError:self.skipTest("Requires VTK and OpenCascade")
        import importlib.util
        from PIL import Image,ImageOps
        from OCP.gp import gp_Pnt
        from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
        from mechanical_fixture import SCRIPTS,pin
        from release_projection import verify
        module=importlib.util.spec_from_file_location("original_export",SCRIPTS/"export-showcase-cad.py")
        exporter=importlib.util.module_from_spec(module);module.loader.exec_module(exporter)
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name,count in (("full",2),("partial",1)):
                box=STEPControl_Writer()
                for j in range(count):
                    solid=BRepPrimAPI_MakeBox(gp_Pnt(j*4,0,j),2.,2.,1.+j).Shape()
                    box.Transfer(solid,STEPControl_AsIs)
                box.Write(str(root/(name+".step")))
                exporter.export(root,{"source":name+".step"},root/name)
            folder=root/"full";img=folder/"assembly.png";mesh=folder/"assembly.stl.gz"
            receipt=json.loads((folder/"receipt.json").read_text())
            case={"step":pin(root,"full.step")}
            verify(root,case,receipt,mesh,img)
            with Image.open(img) as rendered:
                ImageOps.mirror(rendered).save(root/"mirrored.png")
                Image.new("RGB",rendered.size,(30,40,50)).save(root/"blank.png")
            for path in (root/"partial/assembly.png",root/"mirrored.png",root/"blank.png"):
                with self.subTest(path=path.name),self.assertRaisesRegex(ValueError,"pixels"):
                    verify(root,case,receipt,mesh,path)

    def test_different_diagonal_complete_surface_and_shift(self):
        try:
            import vtk
        except ImportError:self.skipTest("Requires VTK surface locator")
        from mesh_surface import compare_parts
        a=(0,0,0);b=(2,0,0);c=(2,2,0);d=(0,2,0)
        front=[(a,b,c),(a,c,d)];reverse=[(a,b,d),(b,c,d)]
        self.assertEqual(compare_parts(front,reverse,.2,20000)["status"],"pass")
        raised=[tuple((x,y,z+1) for x,y,z in tri) for tri in reverse]
        self.assertEqual(compare_parts(front,raised,.2,20000)["status"],"fail")


    def test_empty_fixture_and_release_do_not_substitute_for_loaded_path_or_recovery(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        except ImportError:self.skipTest("Requires OpenCascade")
        import math
        from mechanical_fixture import pin,write
        from mechanical_motion import bounds
        from loaded_transfer import replay
        from showcase_contacts import load_solids
        from OCP.gp import gp_Pnt
        from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
        with TemporaryDirectory() as folder:
            root=Path(folder)
            def geometry(name,blocks):
                w=STEPControl_Writer()
                for point,size in blocks:
                    w.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(*point),*size).Shape(),STEPControl_AsIs)
                w.Write(str(root/name))
                return pin(root,name),load_solids(root/name)[0]
            piece,source=geometry("object.step",[([2.1,0,10],[1.,1.,1.])])
            for offset,outcome in ((2,"fail"),(10,"pass")):
                step,parts=geometry("installed.step",[([0,0,0],[2.,2.,12.]),([offset,0,5],[2.,2.,1.])])
                holder=min(parts,key=lambda n:bounds(parts[n])[0])
                study={"schema":"agent-frc/loaded-transfer@1","id":"downward","basis":"Real geometry and stipulated downward stroke",
                    "step":step,"gravityMmS2":9806.65,"traceToleranceMm":.000001,"piece":dict(id="sample",file=piece,solid=next(iter(source))),"cases":[]}
                for duty in ("delivery","jam-reset"):
                    terminal="received" if duty=="delivery" else "recovery"
                    rows=[{"timeS":0,"custody":"held","offsetsMm":{"sample":[0,0,0]}},
                        {"timeS":.1,"custody":"free" if duty=="delivery" else "jammed","offsetsMm":{"sample":[0,0,0]}},
                        {"timeS":.1+math.sqrt(16/9806.65),"custody":terminal,"offsetsMm":{"sample":[0,0,-8 if duty=="delivery" else 0]}}]
                    tr=write(root,duty+".json",dict(stepSha256=step["sha256"],pieceSha256=piece["sha256"],pieceId="sample",
                        case=duty,holder=holder,source="Synthetic clocked task",frames=rows,resetObserved=True,stockIds=[]))
                    low=2 if duty=="delivery" else 10
                    study["cases"].append(dict(id=duty,duty=duty,trace=tr,windowS=[0,rows[-1]["timeS"]],
                        admissionGapMm=.11,readyOffsetsMm={},terminalBoundsMm=[2,0,low,4,2,low+2],minGapMm=.01))
                result=replay(root,study)
                self.assertEqual(result["cases"][0]["corridorStatus"],outcome)
                self.assertEqual(result["status"],"fail" if outcome=="fail" else "open")
                self.assertEqual(result["cases"][1]["status"],"open")
                if outcome=="fail":self.assertTrue(any(q["status"]=="fail" for q in result["cases"][0]["stages"]))


    def test_registered_motion_replays_identical_criterion_on_failing_and_clear_cases(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        except ImportError:self.skipTest("Requires OpenCascade")
        from mechanical_methods import run
        from mechanical_fixture import write,pin
        from mechanical_motion import bounds
        from showcase_contacts import load_solids
        from OCP.gp import gp_Pnt
        from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
        with TemporaryDirectory() as folder:
            root=Path(folder);writer=STEPControl_Writer()
            for x in (0,12):
                writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(x,0,0),4.,4.,4.).Shape(),STEPControl_AsIs)
            writer.Write(str(root/"carrier.step"))
            (root/"model.f3d").write_bytes(b"release not requested")
            step=pin(root,"carrier.step");shapes=load_solids(root/"carrier.step")[0]
            member=min(shapes,key=lambda k:bounds(shapes[k])[0]);cases={}
            for scope,vec in (("negative",[20,0,0]),("candidate",[0,20,0])):
                data={"schema":"agent-frc/mechanical-motion@1","step":step,"cases":[dict(id="access",basis="Measured finite part",minGapMm=.1,
                    moves={member:[dict(kind="translation",travelMm=vec)]})]}
                s=write(root,scope+".json",data)
                cases[scope]=dict(inputs={"study":s},geometryBindings=[dict(file=s,pointer="/step/sha256",kind="step")])
            issue=dict(id="restricted-travel",finding="Actual moving solid strikes the neighbor",method="motion-and-contact",
                criterion=dict(pointer="/cases/0/status",equals="pass"),**cases)
            r=run(root,dict(schema="agent-frc/mechanical-issues@1",step=step,archive=pin(root,"model.f3d"),issues=[issue]))
            self.assertEqual(r["status"],"pass")
