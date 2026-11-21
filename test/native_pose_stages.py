"""A synthetic journal that moves immediately, resets on rebuild, or holds a captured position."""
import sys
import unittest
from unittest.mock import patch
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from mechanical_fixture import fixture, write
from mechanical_readiness import read, evaluate_inputs, scope_digest
from fusion_issue_inventory import inspect_pose


FEATURE = {"name":"Milled pocket","type":"test::Feature","entityType":None,"health":"healthy"}
HEALTH = {k+"FeatureHealthState":i for i,k in enumerate(("Healthy","Warning","Error","Suppressed","RolledBack","Unknown"))}


class PoseStages(unittest.TestCase):
    def test_station_stages_observe_the_actual_joint(self):
        motion = SimpleNamespace(slideValue=0.)
        joint = SimpleNamespace(name="slide", assemblyContext=None, jointMotion=motion)
        class Snapshots:
            @property
            def hasPendingSnapshot(self):
                return motion.slideValue != self.position
            position = 0.
            def add(self):
                self.position = motion.slideValue
                return self
        snaps = Snapshots()
        def rebuild():
            motion.slideValue = snaps.position
            return True
        feature = SimpleNamespace(name=FEATURE["name"], objectType=FEATURE["type"], healthState=0, entity=None, errorOrWarningMessage="Lost profile")
        timeline = SimpleNamespace(count=1,item=lambda i:feature)
        design = SimpleNamespace(rootComponent=SimpleNamespace(allJoints=[joint]), snapshots=snaps, computeAll=rebuild, timeline=timeline)
        fusion = SimpleNamespace(FeatureHealthStates=SimpleNamespace(**HEALTH))
        modules = patch.dict(sys.modules, {"adsk":SimpleNamespace(fusion=fusion), "adsk.fusion":fusion})
        modules.start()
        self.addCleanup(modules.stop)
        command = dict(group="slide", type="joint", name="slide", occurrence="@root", coordinate="slideValue", nativeValue=1.)
        for stage, expected in (("command-response",1.),("after-recompute",0.),("captured-recompute",1.)):
            motion.slideValue = snaps.position = 0.
            result = inspect_pose(design, dict(id="end", joints=[command],stage=stage),lambda:None)
            self.assertEqual(result["coordinates"],{"slide":{"before":0.,"observed":expected}})
            self.assertEqual(result.get("timeline"), None if stage=="command-response" else {"count":1,"items":[FEATURE]})
        feature.healthState = HEALTH["ErrorFeatureHealthState"]
        motion.slideValue = snaps.position = 0.
        errored = inspect_pose(design,dict(id="extend",joints=[command],stage="captured-recompute"),lambda:None)
        self.assertEqual(errored["coordinates"]["slide"]["observed"],1.)
        self.assertEqual(errored["timeline"]["items"][0]["health"],"error")
        with self.assertRaisesRegex(ValueError,"untouched"):
            inspect_pose(design, dict(id="saved", joints=[command]),lambda:None)

    def test_unrelated_follower_cannot_stand_in_for_the_commanded_slider(self):
        from native_contact_review import verify
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            study = fixture(root)
            reopen = read(root/study["reopen"]["file"])
            parked = read(root/study["nativeCensus"]["file"])
            extended = read(root/study["nativePoses"][0]["file"])

            def witness_at(body, x, name):
                copy = deepcopy(body)
                shift = x-copy["worldTransform"][3]
                copy["path"] = copy["name"] = name
                copy["worldTransform"][3] += shift
                for i in (0,3):
                    copy["boundsMm"][i] += shift
                for site in copy["observedWorldPointsMm"]:
                    site[0] += shift
                return copy

            parked["bodies"].append(witness_at(parked["bodies"][1],40,"other"))
            extended["bodies"].append(deepcopy(parked["bodies"][-1]))
            roster = {(b["path"],b["name"]):(b["name"],) for b in parked["bodies"]}
            def findings():
                study["nativePoses"] = [write(root,"slider-pose.json",extended)]
                errors = []
                verify(root, study, reopen, parked, roster, lambda *args: errors.append(args[-1]),
                       lambda *args: errors.append(args[-1]))
                return errors
            self.assertEqual(findings(),[])
            # All world witnesses remain consistent. Only the unrelated second slider moves.
            extended["bodies"][1] = deepcopy(parked["bodies"][1])
            extended["bodies"][2] = witness_at(parked["bodies"][2],50,"other")
            extended["contacts"] = deepcopy(parked["contacts"])
            self.assertEqual(findings(),["Joint slide changed without relative travel of registered members block / frame"])

    def test_normal_engineering_review_requires_a_measured_stage(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            study = fixture(root)
            baseline = read(root/study["nativePoses"][0]["file"])
            def run(claim, actual, adjust=lambda r:None, commissioned=True):
                s = deepcopy(study)
                req = read(root/study["operatingRequirements"]["file"])
                req["operatingIntent"]["poseStages"] = {"saved":"archive-rest","extension":claim}
                if not commissioned:
                    del req["operatingIntent"]["poseStages"]
                s["operatingRequirements"] = {**write(root,"requirements-case.json",req),"pointer":"/operatingIntent"}
                obs = deepcopy(baseline)
                obs["pose"]["stage"] = claim
                reopen = read(root/study["reopen"]["file"])
                reopen["inspectionPoses"][1] = deepcopy(obs["pose"])
                s["reopen"] = write(root,"reopen-case.json",reopen)
                obs["stageEvidence"]["stage"] = actual
                if actual.endswith("recompute"):
                    obs["stageEvidence"]["coldTimeline"] = {"count":1,"items":[dict(FEATURE)]}
                    obs["stageEvidence"]["timeline"] = {"count":1,"items":[dict(FEATURE)]}
                adjust(obs)
                s["nativePoses"] = [write(root,"pose-case.json",obs)]
                coverage = read(root/study["coverage"]["engineering"]["file"])
                for row in coverage["observations"].values():
                    row["criteriaSha256"] = scope_digest(s)
                s["coverage"] = {k:{**write(root,"scope-case.json",coverage),"id":k} for k in study["coverage"]}
                return evaluate_inputs(root,s)
            for stage in ("command-response","after-recompute","captured-recompute"):
                self.assertEqual(run(stage,stage)["showcaseEligibility"],"pass")
            self.assertNotEqual(run("after-recompute","command-response")["showcaseEligibility"],"pass")
            self.assertNotEqual(run("after-recompute","captured-recompute")["showcaseEligibility"],"pass")
            self.assertNotEqual(run("archive-rest","archive-rest")["showcaseEligibility"],"pass")
            dropped = run("after-recompute","after-recompute",commissioned=False)
            self.assertNotEqual(dropped["showcaseEligibility"],"pass")
            error = run("captured-recompute","captured-recompute",lambda r:r["stageEvidence"]["timeline"]["items"][0].update(health="error",message="Lost profile"))
            self.assertTrue(any(f["status"]=="fail" and "Milled pocket" in f["reason"] for f in error["findings"]))
            def inactive(r):
                for stream in ("coldTimeline","timeline"):
                    group = r["stageEvidence"][stream]
                    group["count"] += 1
                    group["items"].append({"name":"Alternatives","type":"test::TimelineGroup","children":{
                        "count":1,"items":[dict(FEATURE,health="suppressed")]}})
                group = r["stageEvidence"]["timeline"]
                group["count"] += 1
                group["items"].append(dict(FEATURE,name="Captured position",entityType="adsk::fusion::Snapshot"))
            self.assertEqual(run("captured-recompute","captured-recompute",inactive)["showcaseEligibility"],"pass")
            def unrelated_cut(r):
                inactive(r)
                r["stageEvidence"]["timeline"]["items"][-1].update(name="Mounting hole",entityType="adsk::fusion::HoleFeature")
            cut = run("captured-recompute","captured-recompute",unrelated_cut)
            self.assertNotEqual(cut["showcaseEligibility"],"pass")
            self.assertTrue(any("Unexpected timeline addition" in f["reason"] for f in cut["findings"]))
            suppressed = run("after-recompute","after-recompute",lambda r:r["stageEvidence"]["timeline"]["items"][0].update(health="suppressed"))
            self.assertNotEqual(suppressed["showcaseEligibility"],"pass")
            reset = run("after-recompute","after-recompute",lambda r:r["stageEvidence"]["coordinates"]["slide"].update(observed=0))
            self.assertTrue(any(f["status"]=="fail" and "observed 0" in f["reason"] for f in reset["findings"]))
            drift = run("command-response","command-response",lambda r:r["bodies"][0]["observedWorldPointsMm"][0].__setitem__(0,.5))
            self.assertNotEqual(drift["showcaseEligibility"],"pass")
            def legacy(r):
                r.pop("stageEvidence")
                r["programSha256"] = "eb807942e574514ac2aaba5408c7dfbeadd342f6883fa69637733d660081d58c"
            self.assertNotEqual(run("after-recompute","after-recompute",legacy)["showcaseEligibility"],"pass")
