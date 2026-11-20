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
            spec["facets"][names[1]]=[[0,12]]
            with self.assertRaisesRegex(ValueError,"two physical articles"):actual(surfaces=spec)
            gltf["scenes"][0]["nodes"]=[0]
            r=actual();self.assertEqual(r["status"],"fail");self.assertEqual(r["missingFacets"],12)

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
                self.assertEqual(result["status"],outcome)
                self.assertEqual(result["cases"][1]["status"],"pass")
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
