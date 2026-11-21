"""Two opposed shutters support a free-falling block above a separate receiver."""
import copy
import json
import math
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import pin,write


class ObservedTransfer(unittest.TestCase):
    def test_observed_delivery_reset_and_disconnected_guidance(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        except ImportError:self.skipTest("Requires OpenCascade")
        import importlib.util
        from mechanical_fixture import SCRIPTS
        from loaded_transfer import replay
        fixture=SCRIPTS.parent/"examples/mechanical-readiness/observed-shutters.py"
        spec=importlib.util.spec_from_file_location("observed_shutters",fixture)
        issued=importlib.util.module_from_spec(spec);spec.loader.exec_module(issued)
        with TemporaryDirectory() as tmp:
            root,study,ledger=issued.generate(Path(tmp))
            with patch.dict(os.environ,{"FRC_TRANSFER_EXECUTIONS":str(ledger)}):
                result=replay(root,study)
                self.assertEqual(result["status"],"pass",[(c["executionReason"],c["corridorStatus"]) for c in result["cases"]])
                broken=copy.deepcopy(study)
                target=broken["cases"][0]
                original=json.loads((root/target["trace"]["file"]).read_text())
                original["frames"][1]["custody"]="guided";original["guide"]=json.loads((root/target["execution"]["file"]).read_text())["receiver"]
                original["trajectorySource"]=target["execution"];original["interpolationBasis"]="Proposed unsupported detour"
                target["trace"]=write(root,"unsupported.json",original)
                self.assertEqual(replay(root,broken)["cases"][0]["executionStatus"],"fail")

    def test_irregular_observations_cannot_hide_behind_a_supported_chord(self):
        import importlib.util
        from mechanical_fixture import SCRIPTS
        from transfer_mission import identity
        from transfer_trajectory import SERIES
        from loaded_transfer import replay
        fixture=SCRIPTS.parent/"examples/mechanical-readiness/observed-shutters.py"
        spec=importlib.util.spec_from_file_location("trajectory_fixture",fixture)
        issued=importlib.util.module_from_spec(spec);spec.loader.exec_module(issued)
        with TemporaryDirectory() as tmp:
            root,study,ledger=issued.generate(Path(tmp))
            case=study["cases"][1];raw=json.loads((root/case["execution"]["file"]).read_bytes())
            trace=json.loads((root/case["trace"]["file"]).read_bytes())
            authority=json.loads(ledger.read_bytes());witness=authority["observed"][case["execution"]["sha256"]]
            series={k:raw[k] for k in ("case","pieceId","stepSha256","pieceSha256")}
            series.update(schema=SERIES,windowS=[0,.049],samples=[
                dict(timeS=t,centerMm=[.5,.5,8.5],velocityMmS=[0,0,0]) for t in (0,.017,.049)])
            def verify():
                law=raw["trajectory"];law["series"]=[write(root,"fine.json",series)]
                case["execution"]=write(root,"executed.json",raw)
                trace["trajectorySha256"]=identity(law);case["trace"]=write(root,"trace.json",trace)
                authority["observed"][case["execution"]["sha256"]]=dict(witness,trajectorySha256=identity(law))
                ledger.write_text(json.dumps(authority))
                return replay(root,study)["cases"][1]
            with patch.dict(os.environ,{"FRC_TRANSFER_EXECUTIONS":str(ledger)}):
                self.assertEqual(verify()["status"],"pass")
                series["samples"][1]["centerMm"][0]+=.2
                self.assertIn("center position contradicts",verify()["executionReason"])
                series["samples"][1]["centerMm"][0]-=.2
                raw["trajectory"]["segments"][0]["center"]="unresolved spline"
                self.assertIn("unsupported law",verify()["executionReason"])
                raw["trajectory"]["segments"][0]["center"]="constant-velocity"
                raw["additionalDrive"]={"forceN":[0,0,1]}
                self.assertIn("Unsupported or unregistered",verify()["executionReason"])

    def test_velocity_jumps_across_unchanged_custody_and_new_recipient(self):
        from types import SimpleNamespace
        import numpy as np
        from transfer_momentum import verify_boundaries
        shape=SimpleNamespace(rates=[np.zeros(3),np.zeros(3)])
        mass=.000067
        def run(v0,v1,labels,angular=False):
            shape.rates[1]=np.array([0.,0.,1. if angular else 0.])
            rates=[(np.array([v,0,0]),np.zeros(3)) for v in (v0,v1)]
            frames=[dict(timeS=i*.05,custody=c) for i,c in enumerate(labels)]
            return verify_boundaries(None,rates,frames,[{} for _ in frames],shape,dict(massKg=mass,trajectory={}),{},None,None)
        for before,after,states in ((0,20,["held","held","guided"]),(20,15,["guided","received","received"])):
            with self.assertRaisesRegex(ValueError,"Momentum changes at 0.05"):
                run(before,after,states)
        self.assertEqual(len(run(15,15,["held","received","received"])),2)
        with self.assertRaisesRegex(ValueError,"angular momentum"):
            run(15,15,["held","received","received"],True)

    def test_capture_impulse_has_source_direction_and_application_point(self):
        import importlib.util
        from mechanical_fixture import SCRIPTS
        from transfer_mission import identity
        from loaded_transfer import replay
        script=SCRIPTS.parent/"examples/mechanical-readiness/observed-shutters.py"
        spec=importlib.util.spec_from_file_location("capture_fixture",script)
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        with TemporaryDirectory() as tmp:
            root,study,ledger=mod.generate(Path(tmp))
            c=study["cases"][0];raw=json.loads((root/c["execution"]["file"]).read_bytes())
            trace=json.loads((root/c["trace"]["file"]).read_bytes())
            register=json.loads(ledger.read_bytes());witness=register["observed"][c["execution"]["sha256"]]
            receipt=json.loads((root/raw["trajectory"]["impulses"][0]["file"]).read_bytes())
            def inspect(impact):
                law=raw["trajectory"];law["impulses"]=[write(root,"check.json",impact)] if impact else []
                c["execution"]=write(root,"raw.json",raw);trace["trajectorySha256"]=identity(law)
                c["trace"]=write(root,"trace.json",trace)
                register["observed"][c["execution"]["sha256"]]=dict(witness,impulseSources=[r["sha256"] for r in law["impulses"]],trajectorySha256=identity(law))
                ledger.write_text(json.dumps(register));return replay(root,study)["cases"][0]
            with patch.dict(os.environ,{"FRC_TRANSFER_EXECUTIONS":str(ledger)}):
                self.assertEqual(inspect(receipt)["status"],"pass")
                self.assertIn("without a qualified",inspect(None)["executionReason"])
                self.assertIn("equal-and-opposite",inspect(dict(receipt,impulseOnReceiverNs=[0,0,0]))["executionReason"])
                self.assertIn("Off-center",inspect(dict(receipt,pointMm=[.55,.5,0]))["executionReason"])
