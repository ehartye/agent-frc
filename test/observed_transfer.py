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
