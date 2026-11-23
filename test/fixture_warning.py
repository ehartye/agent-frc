# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/preliminary_design.py
"""Say on stderr when a review links field interactions but no case registers a field fixture."""
import json
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, package_pin as pin, package_write as write
from constant_pose_pairs import named_step

WARNING = "[view] warning: field interactions are linked but no case registers a field fixture"


class FixtureWarning(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.layout = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)
        trial = write(cls.layout, "lane-trial.json", dict(case="release", basis="Invented trial"))
        cls.interactions = [dict(title="Invented lane", href="field/lane.html", objective="Invented objective", evidence=trial)]

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def check(self, plan, *flags):
        write(self.layout, "trial.json", plan)
        return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(self.layout.parent), self.layout.name + "/trial.json", *flags],
                              capture_output=True, text=True)

    def linked(self):
        plan = json.loads(json.dumps(self.plan))
        plan.setdefault("presentation", {})["fieldInteractions"] = self.interactions
        return plan

    def test_linked_interactions_without_a_fixture_warn_on_stderr_only(self):
        plain = self.check(self.plan)
        self.assertNotIn(WARNING, plain.stderr)
        loud, quiet = self.check(self.linked()), self.check(self.linked(), "--quiet")
        self.assertEqual(loud.stdout, quiet.stdout)
        self.assertEqual(quiet.stderr, "")
        self.assertEqual(sum(l.startswith(WARNING) for l in loud.stderr.splitlines()), 1, loud.stderr)

    def test_a_registered_fixture_clears_the_warning(self):
        named_step(self.layout / "lane.step", dict(lane=dict(box=([400, 400, 0], [420, 420, 20]))))
        study = json.loads((self.layout / "paths.json").read_text())
        study["cases"][0]["fixtures"] = [dict(id="lane", solid="lane", file=pin(self.layout, "lane.step"), basis="Invented field lane")]
        plan = self.linked()
        plan["groups"]["field lane"] = dict(role="other", members=["lane"])
        plan["motion"] = write(self.layout, "paths-with-lane.json", study)
        run = self.check(plan)
        self.assertNotIn(WARNING, run.stderr)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("[budgets] done", run.stderr)

    def test_a_case_fixture_that_no_group_lists_is_named_before_any_case_runs(self):
        named_step(self.layout / "gate-post.step", dict(post=dict(box=([400, 440, 0], [420, 460, 20]))))
        study = json.loads((self.layout / "paths.json").read_text())
        study["cases"][0]["fixtures"] = [dict(id="post", solid="post", file=pin(self.layout, "gate-post.step"), basis="Invented field post")]
        plan = json.loads(json.dumps(self.plan))
        plan["motion"] = write(self.layout, "paths-with-post.json", study)
        run = self.check(plan)
        self.assertEqual(run.returncode, 2, run.stderr)
        self.assertIn("List each case fixture in a plan group. No group lists: post", run.stderr)
        self.assertNotIn("review scene", run.stderr)
        self.assertNotIn("[motion]", run.stderr, "the plan error is reported before the motion cases run")
        self.assertEqual(run.stdout, "")
        # Grouping the fixture clears it.
        plan["groups"]["field post"] = dict(role="other", members=["post"])
        self.assertNotIn("No group lists", self.check(plan).stderr)


if __name__ == "__main__":
    unittest.main()
