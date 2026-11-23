"""The readiness verdict rests on the registered evidence. No key, signature or environment variable takes part."""
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import zipfile

from mechanical_fixture import fixture, write, SCRIPTS
from mechanical_readiness import review
from readiness_study import scanned_study

RETIRED = ("FRC_NATIVE_WITNESS_PUBLIC_KEY", "FRC_OPERATING_REQUIREMENTS", "FRC_OPERATING_PROFILE")


class ReadinessWithoutKey(unittest.TestCase):
    def setUp(self):
        self.folder = TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.study = fixture(self.root)
        cleared = {k: v for k, v in os.environ.items() if k not in RETIRED}
        environment = patch.dict(os.environ, cleared, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

    def test_a_passing_study_passes_with_no_key_or_variable(self):
        # Before the signature was dropped this study ended open with the finding "trusted native witness".
        result = review(self.root, self.study)
        self.assertEqual((result["showcaseEligibility"], result["buildReadiness"], result["findings"]), ("pass", "pass", []))
        self.assertIsNone(result["iteration"])

    def test_a_failing_or_missing_duty_still_blocks(self):
        self.study["duties"][-1]["max"] = .7
        failed = review(self.root, self.study)
        self.assertEqual((failed["showcaseEligibility"], failed["buildReadiness"]), ("fail", "fail"))
        self.study["duties"].pop()
        self.assertNotEqual(review(self.root, self.study)["showcaseEligibility"], "pass")

    def test_a_missing_native_observation_still_blocks(self):
        self.study.pop("nativeCensus")
        try:
            verdict = review(self.root, self.study)["showcaseEligibility"]
        except (KeyError, ValueError):
            verdict = "refused"
        self.assertNotEqual(verdict, "pass")

    def test_an_archive_that_is_not_a_native_design_stays_open(self):
        other = TemporaryDirectory()
        self.addCleanup(other.cleanup)
        root = Path(other.name)
        with zipfile.ZipFile(root/"test.f3d", "w") as file:
            file.writestr("notes.txt", "Invented entry with no native design")
        result = review(root, fixture(root))
        self.assertEqual(result["showcaseEligibility"], "open")
        self.assertEqual([(f["domain"], f["subject"]) for f in result["findings"]], [("native", "native archive and design scope")])

    def test_an_old_record_carrying_a_signature_block_still_loads(self):
        # Records issued before the change kept a signature file beside each native observation.
        block = {"body": {"schema": "agent-frc/native-station-witness@1", "kind": "native-contacts", "recordSha256": "0"*64},
                 "signature": "aW52ZW50ZWQgc2lnbmF0dXJl"}
        for ref in (self.study["lineage"], self.study["nativeCensus"], self.study["jointAuthority"], *self.study["nativePoses"]):
            (self.root/ref["file"]).with_suffix(".native-signature.json").write_text(json.dumps(block), encoding="utf-8")
        result = review(self.root, self.study)
        self.assertEqual((result["showcaseEligibility"], result["findings"]), ("pass", []))

    def test_the_review_command_writes_a_passing_result_and_refuses_a_failing_one(self):
        self.study = scanned_study(self.root)
        study = write(self.root, "readiness-study.json", self.study)["file"]
        command = [sys.executable, "-B", str(SCRIPTS/"mechanical_readiness.py"), "review", str(self.root)]
        run = subprocess.run([*command, study, "--require-publication", "--output", str(self.root/"readiness-result.json")],
                             capture_output=True, text=True, env=dict(os.environ))
        self.assertEqual(run.returncode, 0, run.stderr)
        result = json.loads((self.root/"readiness-result.json").read_bytes())
        self.assertEqual((result["schema"], result["showcaseEligibility"]), ("agent-frc/mechanical-readiness-result@1", "pass"))
        self.study["duties"][-1]["max"] = .7
        blocked = write(self.root, "blocked-study.json", self.study)["file"]
        run = subprocess.run([*command, blocked, "--require-publication"], capture_output=True, text=True, env=dict(os.environ))
        self.assertEqual(run.returncode, 1, run.stderr)

    def test_no_installed_script_reads_a_retired_key_or_signature(self):
        for file in sorted([*SCRIPTS.glob("*.py"), *SCRIPTS.glob("*.mjs")]):
            text = file.read_text(encoding="utf-8")
            for retired in (*RETIRED[:2], "native-signature", "createPrivateKey", "createPublicKey"):
                self.assertNotIn(retired, text, file.name)
        self.assertFalse((SCRIPTS/"native_station_verify.py").exists())


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    unittest.main()
