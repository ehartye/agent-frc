# @lane merge
# @subject scripts/layout_attachment.py
# @subject scripts/mechanical_readiness.py
# @subject scripts/preliminary_design.py
"""Report floating robot solids and field fixtures off the floor as information that never changes the result."""
from copy import deepcopy
import gzip
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, package_pin as pin, package_write as write
from constant_pose_pairs import named_step

VERDICT = ("status", "missingInputs", "reopen", "cases", "control", "budgets", "decision", "scope")


def box_distance(a, b):
    return sum(max(a[i] - b[i + 3], b[i] - a[i + 3], 0) ** 2 for i in range(3)) ** .5


class LayoutAttachment(unittest.TestCase):
    """Every solid, group and number here is invented."""

    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        cls.layout = cls.root / "layout"
        cls.stock = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)
        cls.plan = deepcopy(cls.stock)
        del cls.plan["attachment"]
        cls.unlabelled = cls.check(cls.plan, "--physics-only")
        cls.labelled = cls.check(cls.stock, "--physics-only")

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    @classmethod
    def check(cls, plan, *flags):
        write(cls.layout, "trial.json", plan)
        return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(cls.root), "layout/trial.json", *flags],
                              capture_output=True, text=True)

    def variant(self, edit, base=None):
        plan = deepcopy(self.plan if base is None else base)
        edit(plan)
        return plan

    def report(self, run):
        self.assertEqual(run.returncode, 0, run.stderr)
        return json.loads(run.stdout)["attachment"]

    def lines(self, run):
        return [line for line in run.stderr.splitlines() if line.startswith("[attachment] ")]

    def with_fixtures(self, boxes, name):
        """The plan with invented field solids registered as fixtures of every case."""
        named_step(self.layout / (name + ".step"), {key: dict(box=box) for key, box in boxes.items()})
        study = json.loads((self.layout / "paths.json").read_text())
        for case in study["cases"]:
            case["fixtures"] = [dict(id=key, solid=key, file=pin(self.layout, name + ".step"), basis="Invented field part") for key in boxes]
        plan = deepcopy(self.plan)
        plan["groups"]["field parts"] = dict(role="other", members=list(boxes))
        plan["motion"] = write(self.layout, "paths-" + name + ".json", study)
        return plan

    def test_a_floating_solid_is_named_with_its_nearest_attached_solid(self):
        report = self.report(self.unlabelled)
        self.assertTrue(report["informational"])
        self.assertEqual((report["case"], report["gapMm"], report["floorZMm"]), ("acquire", 3, 0))
        floating = {row["solid"]: row for row in report["floating"]}
        # The rail touches nothing, and the gate is mounted only on that rail.
        self.assertEqual(set(floating), {"rail", "gate"})
        self.assertEqual((floating["rail"]["group"], floating["rail"]["nearest"]), ("structure", "bumper"))
        self.assertAlmostEqual(floating["rail"]["gapMm"], (35 ** 2 + 50 ** 2 + 14 ** 2) ** .5, places=3)
        # The carried sample is a game piece: it is left out, not reported as floating.
        self.assertEqual(report["excluded"], dict(fieldFixtures=0, payloads=1, serviceAndGauges=0))
        self.assertEqual(report["robotSolids"], 7)
        lines = self.lines(self.unlabelled)
        self.assertIn("7 robot solids checked, 2 floating", lines[0])
        self.assertTrue(any(line.startswith("[attachment] floating: rail (structure); nearest attached solid bumper, 62.618 mm away") for line in lines), lines)
        self.assertIn("nothing floats", lines[-1])
        self.assertIn("does not change the result", lines[-1])
        # The section follows the motion cases, whose measured pairs it reuses.
        stderr = self.unlabelled.stderr.splitlines()
        self.assertGreater(stderr.index(lines[0]), max(i for i, line in enumerate(stderr) if line.startswith("[motion] ")))

    def test_the_report_changes_no_verdict_and_no_exit_code(self):
        before, after = json.loads(self.unlabelled.stdout), json.loads(self.labelled.stdout)
        for key in VERDICT:
            self.assertEqual(before[key], after[key], key)
        required = [self.check(plan, "--physics-only", "--require-checked") for plan in (self.plan, self.stock)]
        self.assertEqual(required[0].returncode, required[1].returncode)
        quiet = self.check(self.plan, "--physics-only", "--quiet")
        self.assertEqual(quiet.stderr, "")
        self.assertEqual(json.loads(quiet.stdout)["attachment"], json.loads(self.unlabelled.stdout)["attachment"])

    def test_a_solid_on_a_registered_mount_chain_is_not_reported(self):
        def mounted(plan):
            plan["mounts"].append(dict(group="structure", member="rail", on="mount", pointMm=[0, 0, 3], basis="Invented bracket to the mount block"))
        report = self.report(self.check(self.variant(mounted), "--physics-only"))
        self.assertEqual(report["floating"], [])
        # The rail hangs on its mount, the gate on the rail's group mount and the head on the carrier's.
        self.assertEqual(report["heldByMountOnly"], ["gate", "head", "rail"])
        self.assertEqual(report["frameSolids"], 7)

    def test_a_solid_that_touches_the_frame_is_attached_without_a_mount(self):
        report = self.report(self.unlabelled)
        attached = {"mount", "drive", "battery", "bumper"}
        self.assertFalse(attached & {row["solid"] for row in report["floating"]})
        self.assertFalse(attached & set(report["heldByMountOnly"]))
        # A tighter gap than the 2 mm between the drive block and the mount block leaves the drive and the bumper behind it apart.
        tight = self.report(self.check(self.variant(lambda plan: plan.update(attachment=dict(gapMm=1.5))), "--physics-only"))
        self.assertEqual({row["solid"] for row in tight["floating"]}, {"rail", "gate", "drive", "bumper"})
        self.assertEqual(tight["gapMm"], 1.5)

    def test_a_labelled_allowance_is_listed_apart_and_not_reported(self):
        report = self.report(self.labelled)
        self.assertEqual(report["floating"], [])
        self.assertEqual(report["unmountedAllowances"], [dict(solid="rail", group="structure", reason=self.stock["attachment"]["unmounted"]["rail"],
                                                              reachesFrame=False)])
        self.assertEqual(report["onUnmountedAllowance"], ["gate"])
        lines = self.lines(self.labelled)
        self.assertIn("0 floating", lines[0])
        self.assertIn("1 unmounted allowance", lines[0])
        self.assertTrue(any(line.startswith("[attachment] unmounted allowance: rail (structure): Synthetic teaching layout") for line in lines), lines)
        self.assertFalse(any("nothing floats" in line for line in lines))

    def test_a_gauge_is_left_out(self):
        def gauge(plan):
            plan["presentation"]["components"]["gate"]["volumeType"] = "gauge"
        report = self.report(self.check(self.variant(gauge), "--physics-only"))
        self.assertEqual([row["solid"] for row in report["floating"]], ["rail"])
        self.assertEqual(report["excluded"]["serviceAndGauges"], 1)
        self.assertEqual(report["robotSolids"], 6)

    def test_a_fixture_above_the_floor_is_flagged_unless_it_rests_on_one_or_is_suspended(self):
        plan = self.with_fixtures(dict(stand=([400, 400, 0], [420, 420, 30]), shelf=([400, 400, 30], [440, 420, 36]),
                                       lamp=([400, 500, 90], [420, 520, 110])), "field-parts")
        run = self.check(plan, "--physics-only")
        report = self.report(run)
        # The shelf rests on the stand, which reaches the floor. The lamp hangs in the air.
        self.assertEqual(report["fixturesOffFloor"], [dict(fixture="lamp", lowestAboveFloorMm=90)])
        self.assertEqual(report["excluded"]["fieldFixtures"], 3)
        # A field fixture is never a floating robot solid.
        self.assertEqual({row["solid"] for row in report["floating"]}, {"rail", "gate"})
        self.assertTrue(any(line.startswith("[attachment] field fixture off the floor: lamp, lowest point 90 mm above the floor at Z = 0 mm")
                            for line in self.lines(run)), run.stderr)
        hung = self.variant(lambda p: p.update(attachment=dict(suspended=dict(lamp="Invented lamp that hangs from the hall roof"))), plan)
        report = self.report(self.check(hung, "--physics-only"))
        self.assertEqual(report["fixturesOffFloor"], [])
        self.assertEqual(report["suspendedFixtures"], [dict(fixture="lamp", reason="Invented lamp that hangs from the hall roof", lowestAboveFloorMm=90)])
        raised = self.variant(lambda p: p.update(attachment=dict(floorZMm=88)), plan)
        self.assertEqual(self.report(self.check(raised, "--physics-only"))["fixturesOffFloor"], [])

    def test_fixtures_and_bumpers_take_their_documented_colours(self):
        plan = self.with_fixtures(dict(stand=([400, 400, 0], [420, 420, 30])), "field-stand")
        palette = self.root / "cad/component-palette.json"

        def scene(plan):
            run = self.check(plan, "--write-view")
            self.assertEqual(run.returncode, 0, run.stderr)
            return json.loads(gzip.decompress((self.layout / "review-scene.json.gz").read_bytes())), json.loads(run.stdout)
        shown, receipt = scene(plan)
        self.assertEqual((shown["bodies"]["stand"]["category"], shown["bodies"]["stand"]["color"]), ("field", "#a8a694"))
        self.assertEqual(shown["bodies"]["stand"]["role"], "other")
        self.assertEqual(shown["bodies"]["bumper"]["color"], "#285ba3")
        self.assertEqual(shown["bodies"]["mount"]["color"], "#496a81")
        # The scene carries the report the receipt records.
        self.assertEqual(shown["attachment"], receipt["attachment"])
        self.assertEqual(scene(self.variant(lambda p: p["presentation"].update(alliance="red"), plan))[0]["bodies"]["bumper"]["color"], "#c8102e")
        try:
            palette.parent.mkdir(exist_ok=True)
            palette.write_text(json.dumps(dict(schema="agent-frc/component-palette@1", colors={"bumper-blue": "#123456", "field": "#445566"})))
            shown = scene(plan)[0]
            self.assertEqual((shown["bodies"]["bumper"]["color"], shown["bodies"]["stand"]["color"]), ("#123456", "#445566"))
            # A project that names the bumper role itself overrides both alliances.
            palette.write_text(json.dumps(dict(schema="agent-frc/component-palette@1", colors={"bumper": "#0a0b0c"})))
            self.assertEqual(scene(plan)[0]["bodies"]["bumper"]["color"], "#0a0b0c")
        finally:
            palette.unlink(missing_ok=True)
        unknown = self.check(self.variant(lambda p: p["presentation"].update(alliance="green"), plan), "--write-view")
        self.assertEqual(unknown.returncode, 2)
        self.assertIn("presentation.alliance names an alliance", unknown.stderr)

    def test_malformed_labels_stop_before_any_case_runs(self):
        for edit, message in ((dict(unmounted=dict(rail="")), "attachment.unmounted maps a placed ID to the reason"),
                              (dict(unmounted=dict(ghost="Invented reason")), "attachment.unmounted maps a placed ID to the reason"),
                              (dict(suspended=["lamp"]), "attachment.suspended maps a placed ID to the reason"),
                              (dict(gapMm=-1), "attachment.gapMm"), (dict(gap=2), "Give attachment as an object with")):
            run = self.check(self.variant(lambda plan: plan.update(attachment=edit)), "--physics-only")
            self.assertEqual(run.returncode, 2, edit)
            self.assertIn(message, run.stderr)
            self.assertNotIn("[motion]", run.stderr)

    def test_the_report_reuses_measured_gaps_and_survives_a_pair_the_kernel_cannot_resolve(self):
        sys.path.insert(0, str(SCRIPTS))
        import layout_attachment
        groups = {"frame": dict(role="structure", members=["plate", "post"]), "arm": dict(role="mechanism", members=["arm"]),
                  "panel": dict(role="other", members=["panel"])}
        scene = dict(plate=[0, 0, 0, 100, 100, 5], post=[0, 0, 5, 10, 10, 60], arm=[11, 0, 50, 60, 10, 60], panel=[40, 40, 6, 60, 60, 20])
        calls = []

        def measure(a, b):
            calls.append((a, b))
            if scene["panel"] in (a, b):
                raise ValueError("Invented kernel failure")
            return box_distance(a, b)
        case = dict(id="opening")
        rows = [dict(pair=["plate", "post"], status="pass", witness=dict(t=0, gapMm=0, volumeMm3=0))]
        report, lines = layout_attachment.report({}, groups, [], case, scene, rows, set(), measure=measure, box=lambda s: s, exact_box=lambda s: s)
        # The plate and post gap came from the checked rows; only the arm and the panel were measured.
        self.assertNotIn((scene["plate"], scene["post"]), calls)
        self.assertEqual([row["solid"] for row in report["floating"]], ["panel"])
        self.assertEqual(report["floating"][0]["nearest"], None)
        self.assertTrue(any("could not be resolved" in line for line in lines))
        # A group mount holds the member nearest its registered point.
        mounts = [dict(group="panel", on="plate", pointMm=[50, 50, 5], basis="Invented panel stand-offs")]
        report, _ = layout_attachment.report({}, groups, mounts, case, scene, rows, set(), measure=measure, box=lambda s: s, exact_box=lambda s: s)
        self.assertEqual((report["floating"], report["heldByMountOnly"]), ([], ["panel"]))


if __name__ == "__main__":
    unittest.main()
