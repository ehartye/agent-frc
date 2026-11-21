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
        def measure(i,j):return values
    return inspect_proposal(a,b,request,measure)

class Placements(unittest.TestCase):
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

if __name__=="__main__":
    unittest.main()
