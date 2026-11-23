# @lane merge
import unittest
import json
from hashlib import sha256
from tempfile import TemporaryDirectory
from copy import deepcopy
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from fusion_checked_placement import PlacementPoseError,inspect_proposal,verify_fit,sibling

def transform(x,y):
    return [1,0,0,x,0,1,0,y,0,0,1,0,0,0,0,1]

def scene(x):
    poses={"Mount:1":transform(x,0),"Mount:1+Roller:1":transform(x,2),
           "Barrier:1":transform(3,0),"Barrier:1+Belt:1":transform(3,2)}
    solids=[]
    for path in ("Mount:1+Roller:1","Barrier:1+Belt:1"):
        m=poses[path];cx,cy=10*m[3],10*m[7]
        solids.append(dict(name="body",path=path,revision="solid-a",world=m,
                           boundsMm=[cx-5,cy-5,-5,cx+5,cy+5,5]))
    return dict(poses=poses,bodies=solids)

def decision(x,values,rule=None):
    a,b=scene(0),scene(x)
    pair=[[s["path"],s["name"]] for s in b["bodies"]]
    request=dict(occurrence="Mount:1",worldTransformCm=transform(x,0),
                 interfaces=[dict(bodies=pair,basis="Registered synthetic drawing",**rule)] if rule else [])
    if isinstance(values,Exception):
        def measure(i,j):raise values
    else:
        def measure(i,j,*spatial):return values
    return inspect_proposal(a,b,request,measure)

class Placements(unittest.TestCase):
    def test_worked_nested_callback_and_cold_material_witness(self):
        from importlib.util import module_from_spec, spec_from_file_location
        from types import SimpleNamespace as Obj
        from unittest.mock import Mock, patch
        file = Path(__file__).resolve().parents[1]/"examples/mechanical-readiness/root_frame_placement.py"
        spec = spec_from_file_location("worked_nested_placement", file)
        example = module_from_spec(spec)
        spec.loader.exec_module(example)
        parent_pose = [0,-1,0,10, 1,0,0,20, 0,0,1,0, 0,0,0,1]
        target = [0,-1,0,8, 1,0,0,21, 0,0,1,0, 0,0,0,1]
        desired = Obj(asArray=lambda: target)
        plan = dict(parent="Seat:1", occurrence="Seat:1+Plate:1", body="Plate", backing="Seat:1+Backing:1",
                    jointName="Plate clamp", jointMotion="adsk::fusion::RigidJointMotion",
                    parentWorldCm=parent_pose, worldTransformCm=target,
                    cornerLocalCm=[1,0,0], cornerWorldCm=[8,22,0])
        world = [8,22,0]
        vertex = Obj(geometry=Obj(asArray=lambda: [1,0,0]),
                     createForAssemblyContext=lambda occ: Obj(geometry=Obj(asArray=lambda: world)))
        body = Obj(isSolid=True, name="Plate", vertices=[vertex])
        backing = Obj(fullPathName=plan["backing"])
        child = Obj(fullPathName=plan["occurrence"], component=Obj(bRepBodies=[body]), transform2=desired)
        api = Obj(core=Obj(Point2D=None), fusion=Obj(FeatureHealthStates=Obj(HealthyFeatureHealthState=0)))
        health = Obj(isValid=True, isSuppressed=False, isRolledBack=False, healthState=0, errorOrWarningMessage="")
        parent = Obj(fullPathName=plan["parent"], component=Obj(), transform2=Obj(asArray=lambda: parent_pose))
        joint = Obj(name=plan["jointName"], jointMotion=Obj(objectType=plan["jointMotion"]), isSuppressed=False,
                    isValid=True, timelineObject=health, assemblyContext=parent, occurrenceOne=child, occurrenceTwo=backing)
        other = Obj(**{**vars(joint), "assemblyContext": Obj(fullPathName="Seat:2")})
        snapshots = Obj(hasPendingSnapshot=True, add=Mock())
        design = Obj(rootComponent=Obj(allOccurrences=[parent, child, backing], allAsBuiltJoints=[other, joint]),
                     snapshots=snapshots, computeAll=lambda: True)
        attach = Mock()
        with patch.object(example, "placement_witness", return_value=(0., [])):
            first = example.edit_nested(design, plan, desired, attach, api)
            self.assertFalse(first["wroteTransform"])
            snapshots.add.assert_not_called()
            child.transform2 = Obj(asArray=lambda: transform(1,2))
            moved = example.edit_nested(design, plan, desired, attach, api)
            self.assertTrue(moved["wroteTransform"])
            snapshots.add.assert_called_once()
            attach.assert_called_with(parent.component)
            with self.assertRaisesRegex(ValueError, "outside the selected child"):
                example.inspect_attachment(design, {**plan, "materialOccurrence": backing.fullPathName}, api)
            leaf = Obj(fullPathName=child.fullPathName + "+Corner:1", component=child.component)
            design.rootComponent.allOccurrences.append(leaf)
            witnessed = example.inspect_attachment(design, {**plan, "materialOccurrence": leaf.fullPathName}, api)
            self.assertEqual(witnessed["materialOccurrence"], leaf.fullPathName)
            # Re-resolve the path after a cold reopen rather than retaining its warm proxy.
            cold = deepcopy(design)
            self.assertEqual(example.inspect_attachment(cold, plan, api)["cornerErrorMm"], 0)
            world[0] += .4
            with self.assertRaisesRegex(ValueError, "material missed"):
                example.inspect_attachment(cold, plan, api)
            world[0] -= .4
            health.healthState = 1
            with self.assertRaisesRegex(ValueError, "healthy active timeline"):
                example.inspect_attachment(design, plan, api)
            health.healthState = 0
            joint.occurrenceTwo = joint.occurrenceOne
            with self.assertRaisesRegex(ValueError, "Wrong joint endpoints"):
                example.inspect_attachment(design, plan, api)
            joint.occurrenceTwo = backing
            design.rootComponent.allAsBuiltJoints.append(joint)
            with self.assertRaisesRegex(ValueError, "Expected one named as-built joint"):
                example.inspect_attachment(design, plan, api)
            design.rootComponent.allAsBuiltJoints = [other]
            with self.assertRaisesRegex(ValueError, "Expected one named as-built joint"):
                example.inspect_attachment(design, plan, api)

    def test_shared_forbidden_material_vetoes_even_when_one_native_volume_is_unknown(self):
        pair=[[s["path"],s["name"]] for s in scene(3)["bodies"]]
        probe={"centerMm":[1,1,-2],"radiusMm":.1}
        commission=dict(representation="external-thread/smooth-pilot",host=pair[1],bodies=pair,
                        expectedCommonMm3=[1,2],basis="Registered synthetic drawing",forbiddenProbes=[probe],
                        region=dict(startMm=[0,0,0],endMm=[0,0,3],pilotRadiusMm=1,majorRadiusMm=2,
                                    classificationSlackMm=.001))
        interface=dict(kind="fit",minCommonMm3=1,maxCommonMm3=2,evidence={},spatialFit=commission)
        values=dict(interferenceMm3=None,temporaryCommonMm3=1.5,
                    spatialFit=dict(commission=commission,methods={},forbidden=[dict(probe=probe,sharedInterior=True)]))
        result=decision(3,values,interface)
        self.assertEqual(result["status"],"blocked")
        self.assertIn("interior ball",result["measured"][0]["spatialReason"])
        other=dict(probe,centerMm=[2,0,-2])
        commission["forbiddenProbes"].append(other)
        self.assertEqual(decision(3,values,interface)["status"],"blocked")
        section=dict(totalMm3=1.5,outsideCylinderMm3=0,insideCoreMm3=0,permittedMm3=1.5,conservationErrorMm3=0)
        values.update(interferenceMm3=1.5,gapMm=0)
        spatial=values["spatialFit"]
        spatial.update(smoothPilot=True,maleThread={"matched":True},
                       methods={"fusionInterference":section,"fusionTransient":section})
        spatial["forbidden"]=[dict(probe=probe,sharedInterior=False),dict(probe=other,sharedInterior=False)]
        self.assertEqual(decision(3,values,interface)["status"],"pass")
        for invalid in (None,0,"false"):
            spatial["forbidden"][1]["sharedInterior"]=invalid
            self.assertEqual(decision(3,values,interface)["status"],"inconclusive")
        del spatial["forbidden"][1]["sharedInterior"]
        self.assertEqual(decision(3,values,interface)["status"],"inconclusive")

    def test_pose_veto_reports_the_missing_or_attained_occurrence_before_contact_queries(self):
        before, after = scene(0), scene(0)
        prior = deepcopy(before)
        target = "Mount:1+Roller:1"
        requested = transform(.32,2)
        source = "a"*64
        for reason in ("pose-mismatch","missing-occurrence"):
            if reason == "missing-occurrence":
                del after["poses"][target]
            with self.assertRaises(PlacementPoseError) as raised:
                inspect_proposal(before,after,dict(occurrence=target,worldTransformCm=requested),
                                 self.fail,accepted_sha256=source)
            observation = raised.exception.receipt
            self.assertEqual(json.loads(str(raised.exception)),observation)
            self.assertEqual(observation["reason"],reason)
            self.assertEqual(observation["occurrence"],target)
            self.assertEqual(observation["acceptedSha256"],source)
            self.assertEqual(observation["priorWorldTransformCm"],transform(0,2))
            self.assertEqual(observation["requestedWorldTransformCm"],requested)
            self.assertEqual(observation["observedWorldTransformCm"],after["poses"].get(target))
            self.assertEqual(before,prior)
        # A relative insertion combines the requested displacement with the reference's accepted pose.
        request = dict(occurrence="Copy:1",sourceOccurrence=target,worldDeltaFromSourceCm=transform(2,1))
        with self.assertRaises(PlacementPoseError) as raised:
            inspect_proposal(before,after,request,self.fail,accepted_sha256=source)
        self.assertEqual(raised.exception.receipt["requestedWorldTransformCm"],transform(2,3))
        self.assertIsNone(raised.exception.receipt["priorWorldTransformCm"])

    def test_pinned_native_helpers_leave_the_next_jobs_imports_intact(self):
        from unittest.mock import patch
        import types
        previous=types.ModuleType("fusion_issue_contacts")
        with patch.dict(sys.modules,{"fusion_issue_contacts":previous}):
            first=sibling("fusion_issue_contacts")
            second=sibling("fusion_issue_contacts")
            self.assertIsNot(first,second)
            self.assertIsNot(first,previous)
            self.assertIs(sys.modules["fusion_issue_contacts"],previous)
            self.assertNotIn("_placement_fusion_issue_contacts",sys.modules)

    def test_nested_placement_and_untouched_accepted_scene(self):
        self.assertEqual(decision(1,RuntimeError("Broad phase should clear"))["status"],"pass")
        v=dict(interferenceMm3=1000,temporaryCommonMm3=1000,gapMm=0)
        self.assertEqual(decision(3,v)["status"],"blocked")
        self.assertEqual(decision(2,dict(v,interferenceMm3=0,temporaryCommonMm3=0),dict(kind="bearing",maxGapMm=.01))["status"],"pass")
        self.assertEqual(decision(3,v,dict(kind="bearing",maxGapMm=.01))["status"],"blocked")
        with self.assertRaisesRegex(ValueError,"Unexpected"):
            decision(3,v,dict(kind="bearing",maxCommonMm3=5000,maxGapMm=.01))
        rule=dict(kind="fit",minCommonMm3=900,maxCommonMm3=1100,evidence=dict(file="fit.json",sha256="a"*64))
        self.assertEqual(decision(3,v,rule)["status"],"pass")
        self.assertEqual(decision(3,v,dict(rule,minCommonMm3=1001))["status"],"blocked")
        self.assertEqual(decision(2,dict(v,interferenceMm3=0,temporaryCommonMm3=0,gapMm=.01),
                                  dict(kind="clearance",minGapMm=.1))["status"],"blocked")
        for unknown in (RuntimeError("solver unavailable"),{},dict(v,temporaryCommonMm3=None),dict(v,interferenceMm3=0,temporaryCommonMm3=0,gapMm=float("nan"))):
            self.assertEqual(decision(3,unknown)["status"],"inconclusive")

    def test_moving_wrapper_cannot_leave_nested_body_behind_or_drag_a_neighbor(self):
        a,b=scene(0),scene(2)
        original=deepcopy(a)
        req=dict(occurrence="Mount:1",worldTransformCm=transform(2,0))
        b["bodies"][0]["world"]=transform(0,2)
        with self.assertRaisesRegex(ValueError,"descendant"):
            inspect_proposal(a,b,req,None)
        b=scene(2);b["bodies"][1]["world"]=transform(4,2)
        with self.assertRaisesRegex(ValueError,"Unrelated"):
            inspect_proposal(a,b,req,None)
        self.assertEqual(a,original)

    def test_rotating_a_nested_carrier_rotates_its_local_offset_into_the_root_frame(self):
        a=scene(0);b=scene(3)
        # Rotate a child at local (0,2) cm around its translated parent by +90 degrees.
        rotation=[0,-1,0,3,1,0,0,0,0,0,1,0,0,0,0,1]
        placed=rotation.copy();placed[3]=1
        b["poses"]["Mount:1"]=rotation
        b["poses"]["Mount:1+Roller:1"]=placed
        b["bodies"][0].update(world=placed,boundsMm=[5,-5,-5,15,5,5])
        req=dict(occurrence="Mount:1",worldTransformCm=rotation)
        self.assertEqual(inspect_proposal(a,b,req,None)["status"],"pass")
        b["bodies"][0]["world"]=transform(3,2)
        with self.assertRaisesRegex(ValueError,"descendant"):
            inspect_proposal(a,b,req,None)

    def test_fit_permission_is_bound_to_its_baseline_pair_and_engineered_interval(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            pair=[["nested:1+hub:1","bore"],["pin:1","round pin"]]
            source=dict(schema="agent-frc/placement-fit@1",acceptedSha256="a"*64,bodies=pair,
                        basis="Teaching interference fit drawing revision A",minCommonMm3=.5,maxCommonMm3=1)
            data=json.dumps(source).encode();(root/"fit.json").write_bytes(data)
            rule=dict(source,evidence=dict(file="fit.json",sha256=sha256(data).hexdigest()))
            verify_fit(root,rule,"a"*64)
            for wrong in (dict(rule,maxCommonMm3=100),dict(rule,bodies=[pair[0],["second:1","round pin"]])):
                with self.assertRaisesRegex(ValueError,"Commissioned"):
                    verify_fit(root,wrong,"a"*64)
            with self.assertRaisesRegex(ValueError,"Commissioned"):
                verify_fit(root,rule,"b"*64)
            # A fit record named by path, with no typed digest and no repeated archive digest, is accepted as read.
            plain=dict(source);plain.pop("acceptedSha256")
            (root/"plain-fit.json").write_bytes(json.dumps(plain).encode())
            verify_fit(root,dict(plain,evidence=dict(file="plain-fit.json")),"b"*64)
            with self.assertRaisesRegex(ValueError,"Commissioned"):
                verify_fit(root,dict(plain,maxCommonMm3=100,evidence=dict(file="plain-fit.json")),"b"*64)
            # A typed digest that no longer matches the record is still refused.
            with self.assertRaisesRegex(ValueError,"Changed commissioned fit evidence"):
                verify_fit(root,dict(plain,evidence=dict(file="plain-fit.json",sha256="0"*64)),"b"*64)

if __name__=="__main__":
    unittest.main()
