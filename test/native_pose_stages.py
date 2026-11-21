"""A synthetic journal that moves immediately, resets on rebuild, or holds a captured position."""
import unittest
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from mechanical_fixture import fixture, write
from mechanical_readiness import read, evaluate_inputs, scope_digest
from fusion_issue_inventory import inspect_pose


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
        design = SimpleNamespace(rootComponent=SimpleNamespace(allJoints=[joint]), snapshots=snaps, computeAll=rebuild)
        command = dict(group="slide", type="joint", name="slide", occurrence="@root", coordinate="slideValue", nativeValue=1.)
        for stage, expected in (("command-response",1.),("after-recompute",0.),("captured-recompute",1.)):
            motion.slideValue = snaps.position = 0.
            result = inspect_pose(design, dict(id="end", joints=[command],stage=stage),lambda:None)
            self.assertEqual(result,dict(stage=stage,coordinates={"slide":{"before":0.,"observed":expected}}))
        with self.assertRaisesRegex(ValueError,"untouched"):
            inspect_pose(design, dict(id="saved", joints=[command]),lambda:None)

    def test_normal_engineering_review_requires_a_measured_stage(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            study = fixture(root)
            baseline = read(root/study["nativePoses"][0]["file"])
            def run(claim, actual, adjust=lambda r:None):
                s = deepcopy(study)
                req = read(root/study["operatingRequirements"]["file"])
                req["operatingIntent"]["poseStages"] = {"saved":"archive-rest","extension":claim}
                s["operatingRequirements"] = {**write(root,"requirements-case.json",req),"pointer":"/operatingIntent"}
                obs = deepcopy(baseline)
                obs["pose"]["stage"] = claim
                reopen = read(root/study["reopen"]["file"])
                reopen["inspectionPoses"][1] = deepcopy(obs["pose"])
                s["reopen"] = write(root,"reopen-case.json",reopen)
                obs["stageEvidence"]["stage"] = actual
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
            reset = run("after-recompute","after-recompute",lambda r:r["stageEvidence"]["coordinates"]["slide"].update(observed=0))
            self.assertTrue(any(f["status"]=="fail" and "observed 0" in f["reason"] for f in reset["findings"]))
            drift = run("command-response","command-response",lambda r:r["bodies"][0]["observedWorldPointsMm"][0].__setitem__(0,.5))
            self.assertNotEqual(drift["showcaseEligibility"],"pass")
            def legacy(r):
                r.pop("stageEvidence")
                r["programSha256"] = "eb807942e574514ac2aaba5408c7dfbeadd342f6883fa69637733d660081d58c"
            self.assertNotEqual(run("after-recompute","after-recompute",legacy)["showcaseEligibility"],"pass")
