"""Let one pinned evidence file qualify several intended interfaces, each bound to the STEP, its case and its pair."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import pin, write
from constant_pose_pairs import lift, named_step

STALE = "Interface qualification is stale or incomplete"


class InterfaceEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        # An invented peg seated in a block (shared material), a pad pressed on the block, and a slider that moves clear.
        named_step(cls.root / "scene.step", dict(block=dict(box=([0, 0, 0], [10, 10, 10])), peg=dict(box=([8, 2, 2], [14, 8, 8])),
                                                 pad=dict(box=([2, 2, 9], [6, 6, 12])), slider=dict(box=([0, 200, 0], [5, 205, 5]))))
        cls.step = pin(cls.root, "scene.step")

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def run_cases(self, evidence, pairs=(("block", "peg"), ("pad", "block")), cases=("stroke-1", "stroke-2")):
        from mechanical_motion import evaluate
        study = dict(schema="agent-frc/mechanical-motion@1", step=self.step, cases=[
            dict(id=case, basis="Invented lift", minGapMm=1, moves={"slider": lift(5)},
                 intendedInterfaces=[dict(pair=list(pair), basis="Invented seated fit", qualifiedBy=evidence) for pair in pairs])
            for case in cases])
        return evaluate(self.root, study, package_scene=lambda case, scene: None)["cases"]

    def rows(self, cases=("stroke-1", "stroke-2"), pairs=(("peg", "block"), ("block", "pad")), status="pass"):
        return [dict(case=case, pair=list(pair), status=status) for case in cases for pair in pairs]

    def test_one_file_qualifies_every_listed_case_and_pair(self):
        evidence = write(self.root, "contacts.json", dict(stepSha256=self.step["sha256"], basis="Invented contact trial",
                                                          interfaces=self.rows()))
        results = self.run_cases(evidence)
        self.assertEqual([c["status"] for c in results], ["pass", "pass"])

    def test_without_the_qualification_the_seated_pairs_fail(self):
        from mechanical_motion import evaluate
        study = dict(schema="agent-frc/mechanical-motion@1", step=self.step,
                     cases=[dict(id="stroke-1", basis="Invented lift", minGapMm=1, moves={"slider": lift(5)})])
        self.assertEqual(evaluate(self.root, study, package_scene=lambda case, scene: None)["cases"][0]["status"], "fail")

    def test_a_single_record_still_qualifies_its_own_case_and_pair(self):
        evidence = write(self.root, "single.json", dict(stepSha256=self.step["sha256"], case="stroke-1", pair=["block", "peg"], status="pass"))
        self.assertEqual(len(self.run_cases(evidence, pairs=(("peg", "block"),), cases=("stroke-1",))), 1)
        with self.assertRaisesRegex(ValueError, STALE):
            self.run_cases(evidence, pairs=(("peg", "block"),), cases=("stroke-2",))

    def test_an_unlisted_case_or_pair_another_step_or_an_open_row_is_refused(self):
        digest = self.step["sha256"]
        controls = dict(
            missing_case=dict(stepSha256=digest, interfaces=self.rows(cases=("stroke-1",))),
            missing_pair=dict(stepSha256=digest, interfaces=self.rows(pairs=(("peg", "block"),))),
            other_step=dict(stepSha256="0" * 64, interfaces=self.rows()),
            no_step=dict(interfaces=self.rows()),
            open_row=dict(stepSha256=digest, interfaces=self.rows(status="open")),
            row_step_only=dict(interfaces=[dict(row, stepSha256=digest) for row in self.rows()]),
            not_a_list=dict(stepSha256=digest, interfaces={"stroke-1": self.rows()}),
            string_pair=dict(stepSha256=digest, interfaces=[dict(case=c, pair="blockpeg", status="pass") for c in ("stroke-1", "stroke-2")]),
        )
        for tag, record in controls.items():
            evidence = write(self.root, tag + ".json", record)
            with self.assertRaisesRegex(ValueError, STALE, msg=tag):
                self.run_cases(evidence)


if __name__ == "__main__":
    unittest.main()
