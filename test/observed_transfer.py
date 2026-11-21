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
