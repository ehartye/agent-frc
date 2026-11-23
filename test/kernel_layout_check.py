# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/review.py
# @subject scripts/kernel_layout/inputs.py
# @subject scripts/kernel_layout/judge.py
# @subject scripts/kernel_layout/attachment.py
# @subject scripts/kernel_layout/stages.py
# @subject examples/design-source/create.py
"""The layout check on the design library: it passes a clear invented layout and can fail in each way that matters.

Failure caught: the check passes a layout that interferes, floats or breaks a budget, or reads stale generated solids.
Each control below changes one input of the passing example and must be rejected or reported."""
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"


class KernelLayoutCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        starter = runpy.run_path(str(PLUGIN / "examples/design-source/create.py"))
        starter["create"](cls.root / RELEASE, "1.0", cls.root)
        cls.source = json.loads((cls.root / RELEASE / "design.json").read_text(encoding="utf-8"))
        cls.judgement = json.loads((cls.root / RELEASE / "judgement.json").read_text(encoding="utf-8"))
        cls.budgets = json.loads((cls.root / RELEASE / "budgets.json").read_text(encoding="utf-8"))
        cls.build()

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    @classmethod
    def build(cls):
        subprocess.run([sys.executable, "-m", "frc_design_kernel", "build", RELEASE + "/design.json", "--out", RELEASE + "/generated"],
                       cwd=cls.root, check=True, capture_output=True)

    def put(self, name, data):
        (self.root / RELEASE / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")

    def tearDown(self):
        # Each test leaves the passing example behind it.
        self.put("design.json", self.source)
        self.put("judgement.json", self.judgement)
        self.put("budgets.json", self.budgets)
        self.build()

    def check(self, *flags):
        run = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json", *flags],
                             capture_output=True, text=True)
        return run, json.loads(run.stdout) if run.stdout.strip() else None

    def copy(self, data):
        return json.loads(json.dumps(data))

    def test_clear_layout_is_checked_and_says_what_ran(self):
        run, receipt = self.check("--write-view", "--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(receipt["status"], "layout-checked")
        self.assertEqual([c["status"] for c in receipt["cases"]], ["pass"] * 5)
        self.assertEqual(receipt["control"]["witness"]["status"], "fail", "the displaced control is rejected")
        self.assertEqual(receipt["library"]["library"], "frc-design-kernel")
        self.assertTrue(receipt["view"]["verified"])
        self.assertEqual(receipt["step"]["file"], RELEASE + "/generated/design.step")
        self.assertEqual(receipt["attachment"]["floating"], [])
        self.assertEqual([r["solid"] for r in receipt["attachment"]["unmountedAllowances"]], ["rail"])
        self.assertEqual(receipt["attachment"]["onUnmountedAllowance"], ["gate"])
        self.assertRegex(run.stderr, r"\[time\] layout check of 5 case\(s\), the displaced control, attachment and budgets and the review view in \d+ s\. "
                                     r"Guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate\.")
        # A view-only rebuild measures nothing again and says so; a changed allowance refuses it.
        (self.root / RELEASE / "receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
        again, rebuilt = self.check("--view-only")
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(rebuilt["cases"], receipt["cases"])
        self.assertIn("[time] not run: the cases and the displaced control", again.stderr)
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["minGapMm"] = 2
        self.put("judgement.json", judgement)
        refused, _ = self.check("--view-only")
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Changed since that receipt: the stages", refused.stderr)

    def test_interference_blocks_the_layout(self):
        source = self.copy(self.source)
        # Control: the rail drawn inside the arc the loaded head sweeps.
        next(s for s in source["solids"] if s["name"] == "rail")["shape"].update(fromMm=[19, 20, 18], toMm=[24, 25, 23])
        self.put("design.json", source)
        self.build()
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertEqual(receipt["status"], "blocked")
        failing = {c["case"] for c in receipt["cases"] if c["status"] == "fail"}
        self.assertIn("loaded-turn", failing)
        self.assertEqual(receipt["decision"]["firstUnmet"]["kind"], "clearance")

    def test_floating_solid_is_reported_and_a_control_that_passes_is_named(self):
        judgement = self.copy(self.judgement)
        del judgement["attachment"]
        # Control of the control: an offset that leaves the rail clear cannot show that the check fails.
        judgement["control"]["offsetMm"] = [0, 5, 0]
        self.put("judgement.json", judgement)
        run, receipt = self.check("--physics-only")
        # The gate is mounted on the rail, so it floats with it.
        self.assertEqual([r["solid"] for r in receipt["attachment"]["floating"]], ["gate", "rail"])
        self.assertIn("[attachment] floating: rail (structure)", run.stderr)
        self.assertIsNone(receipt["control"]["witness"])
        self.assertIn("Matched displacement did not reject the commissioned pair", receipt["missingInputs"])
        self.assertEqual(receipt["status"], "provisional")

    def test_mass_over_the_limit_blocks_the_layout(self):
        budgets = self.copy(self.budgets)
        budgets["masses"][0]["kg"] = [4, 12]
        self.put("budgets.json", budgets)
        _, receipt = self.check("--physics-only")
        self.assertEqual(receipt["budgets"]["massStatus"], "fail")
        self.assertEqual(receipt["status"], "blocked")

    def test_stale_solids_and_geometry_in_the_judgement_are_refused(self):
        source = self.copy(self.source)
        source["parameters"]["slide"] = 11
        self.put("design.json", source)
        stale, _ = self.check("--physics-only")
        self.assertEqual(stale.returncode, 2)
        self.assertIn("The generated solids are of an earlier design source", stale.stderr)
        self.put("design.json", self.source)
        judgement = self.copy(self.judgement)
        judgement["groups"] = {"structure": {"role": "structure", "members": ["mount"]}}
        self.put("judgement.json", judgement)
        mixed, _ = self.check("--physics-only")
        self.assertEqual(mixed.returncode, 2)
        self.assertIn("The judgement file holds no geometry or motion. Move groups to the design source", mixed.stderr)

    def test_a_partial_run_is_marked_and_never_checked(self):
        run, receipt = self.check("--cases", "acquire,release", "--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertTrue(receipt["partial"])
        self.assertEqual(receipt["skippedCases"], ["loaded-turn", "park-loaded", "remove-carrier"])
        self.assertNotEqual(receipt["status"], "layout-checked")


if __name__ == "__main__":
    unittest.main()
