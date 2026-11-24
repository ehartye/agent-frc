# @lane merge
# @subject scripts/package_view.py
# @subject scripts/kernel_layout/view.py
# @subject scripts/kernel_layout/replays.py
# @subject scripts/review-scene.mjs
# @subject scripts/design.mjs
# @subject examples/design-source/create.py
"""The review page built from what a run judged, with the words of the page file put over it.

Failure caught: a page whose scene claims what the judge did not find, that hides when a result ran, that a page edit can
change a verdict through, or that a partial result reaches. Each control below changes one input of the invented example
and must be refused or reported."""
import gzip
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent / "fixtures"))
import judged_project as fixture  # noqa: E402
from judged_project import LOG, PLUGIN, RELEASE, Judge, commit, counted, get, solid  # noqa: E402
import ready_example as tray  # noqa: E402

PAGE, SCENE = RELEASE + "/results/review.html", RELEASE + "/results/review-scene.json.gz"


def scene_of(root):
    return json.loads(gzip.decompress((root / SCENE).read_bytes()))


class ReviewPage(Judge):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # The design is judged and its page built once, as an agent does, and committed: each test starts from that.
        run = fixture.judge(cls.root, "1.0", "--page", "--workers", "1", "--json")
        assert run.returncode == 0, run.stderr
        cls.said, cls.verdict = run.stderr, fixture.verdict_of(run)
        commit(cls.root)

    def words(self):
        """Put the page file's words into the page that was built. Judges nothing."""
        return fixture.judge(self.root, "1.0", "--page-only")

    def validate(self, verdict):
        """The scene on disk against the schema, its cross-checks and the verdict, as the release check reads it."""
        with TemporaryDirectory() as temp:
            file = Path(temp) / "verdict.json"
            file.write_text(json.dumps(verdict), encoding="utf-8")
            run = subprocess.run(["node", str(PLUGIN / "scripts/review-scene.mjs"), "validate", str(self.root / SCENE), "--verdict", str(file)],
                                 capture_output=True, text=True)
        return json.loads(run.stdout) if run.stdout.strip() else {"errors": [run.stderr]}

    # Acceptance 15 of the data model: the page builds from the run, with no receipt, and its scene validates.
    def test_the_page_builds_from_the_run_and_its_scene_repeats_the_verdict(self):
        self.assertTrue((self.root / RELEASE / "page.json").is_file(), "the example has a page file")
        self.assertIn("results/review-scene.json.gz", self.said)
        self.assertTrue((self.root / PAGE).is_file())
        self.assertFalse(list(self.root.rglob("receipt.json")), "no receipt is written or read")
        verdict, scene = self.verdict, scene_of(self.root)
        checked = self.validate(verdict)
        self.assertEqual(checked["errors"], [])
        self.assertEqual(scene["schema"], "agent-frc/preliminary-review-scene@3")
        self.assertEqual((scene["decision"]["status"], scene["decision"]["firstUnmet"]), (verdict["status"], verdict["firstUnmet"]))
        motions = [c["id"] for c in scene["cases"] if c["kind"] != "displaced control"]
        self.assertEqual(sorted(motions), sorted(verdict["motions"]))
        self.assertEqual({c["id"]: c["status"] for c in scene["cases"] if c["id"] in verdict["motions"]}, {m: r["status"] for m, r in verdict["motions"].items()})
        control = next(c for c in scene["cases"] if c["kind"] == "displaced control")
        self.assertEqual(control["status"], "fail", "the displaced control is shown rejected")
        self.assertEqual(sorted(c for a in scene["animations"] for c in a["cases"]), sorted(motions), "every motion is played once")
        # The animations follow the cycle; a phase takes its title from the page file.
        self.assertEqual([a["id"] for a in scene["animations"]], ["acquire", "transfer", "deliver", "park", "service"])
        self.assertEqual(scene["animations"][1]["title"], "Turn the loaded carrier past the gate")
        self.assertEqual(scene["title"], get(self.root, RELEASE + "/page.json")["title"])
        # Each record the verdict judged is named, and nothing on the page is a digest.
        self.assertEqual([j["id"] for j in scene["records"]["jobs"]], [j["id"] for j in verdict["records"]["jobs"]])
        self.assertNotIn("sha256", json.dumps({k: v for k, v in scene.items() if k != "meshes"}))
        # Decision 10: the page shows when each result ran.
        rows = {(x["check"], x["subject"]): x["time"] for x in get(self.root, LOG)["rows"]}
        self.assertEqual({c["id"]: c["ran"] for c in scene["cases"] if c["kind"] == "nominal"}, {m: rows[("clearance", m)] for m in verdict["motions"]})
        self.assertEqual(scene["weight"]["ran"], rows[("weight", "inspection")])
        self.assertEqual({m["motion"]: m["ran"] for m in scene["power"]["motions"]}, {m: rows[("electrical", m)] for m in verdict["electrical"]["motions"]})
        self.assertEqual(scene["attachment"]["ran"], rows[("attachment", "design")])
        # Weight and power come from the records.
        self.assertEqual(scene["weight"]["rangeKg"], verdict["weight"]["rangeKg"])
        self.assertEqual(sorted(m["motion"] for m in scene["power"]["motions"]), sorted(verdict["electrical"]["motions"]))

    # The brief: each driven motion's readout shows its drives, joint values, currents and bus voltage from the electrical records.
    def test_a_driven_motion_reads_out_its_drives_joint_values_currents_and_bus_from_its_records(self):
        scene = scene_of(self.root)
        turn = next(c for c in scene["cases"] if c["id"] == "loaded-turn")
        record = self.record("electrical.loaded-turn")["result"]
        frames = len(turn["measure"])
        self.assertEqual(frames, len(turn["bodies"]["head"]["matrices"]))
        self.assertIn("pivot 0.0°", turn["measure"][0])
        self.assertIn("pivot 90.0°", turn["measure"][-1])
        self.assertIn("gate 12.0 mm", turn["measure"][-1])
        self.assertIn("%.2f A" % record["drives"]["pivot"]["currentA"]["range"][1], turn["measure"][0])
        low, high = record["bus"]["volts"]["range"]
        self.assertIn("bus %.2f–%.2f V" % (low, high), turn["measure"][0])
        # A motion that starts where another ends reads its joints from there.
        park = next(c for c in scene["cases"] if c["id"] == "park-loaded")
        self.assertIn("pivot 90.0°", park["measure"][0])
        self.assertIn("gate 12.0 mm", park["measure"][0])
        # The clock is the motion's own: its nominal duration on the triangle speed profile, from rest to rest.
        duration = get(self.root, RELEASE + "/design.json")["motions"]["loaded-turn"]["durationS"]["value"]
        self.assertAlmostEqual(turn["time"][-1], duration, places=9)
        self.assertAlmostEqual(turn["time"][(frames - 1) // 2], duration / 2, places=9)
        self.assertGreater(turn["time"][1], duration / (frames - 1), "it starts from rest, so its first step of stroke takes longer than an even share")
        power = next(m for m in scene["power"]["motions"] if m["motion"] == "loaded-turn")
        pivot = next(d for d in power["drives"] if d["drive"] == "pivot")
        self.assertEqual((pivot["motorSolid"], pivot["currentA"]), ("pivot motor", record["drives"]["pivot"]["currentA"]["range"]))
        self.assertEqual(scene["bodies"]["pivot motor"]["motorOf"], ["pivot"])
        # A motion no motor drives states its cause in place of a readout of drives.
        hand = next(c for c in scene["cases"] if c["id"] == "acquire")
        self.assertEqual(set(hand["measure"]), {"By hand: no motor drives this motion"})
        self.assertNotIn("time", hand)

    # Acceptance 13 of the data model: the page file is outside the verdict.
    def test_editing_the_page_file_judges_nothing_and_changes_no_result(self):
        first, log = scene_of(self.root), (self.root / LOG).read_bytes()
        self.edit(RELEASE + "/page.json", lambda page: page.update(title="Invented: a new title", solids={"head": {"name": "Carrier head", "description": "Invented: renamed on the page"}}))
        import package_view
        with counted() as counts:
            package_view.words_only(self.root, "1.0")
        self.assertEqual((counts.built, counts.jobs, counts.tried), (0, [], []), "putting the words in builds, measures and tries nothing")
        second = scene_of(self.root)
        self.assertEqual((second["title"], second["bodies"]["head"]["name"], second["bodies"]["head"]["description"]),
                         ("Invented: a new title", "Carrier head", "Invented: renamed on the page"))
        for part in ("decision", "cases", "weight", "power", "interactions", "adjustments", "attachment", "records", "unmet"):
            self.assertEqual(second[part], first[part], part)
        self.assertEqual((self.root / LOG).read_bytes(), log)
        # A solid with no page entry shows its source name, its group as its subsystem and its note.
        rail = solid(get(self.root, RELEASE + "/design.json"), "rail")
        self.assertEqual((second["bodies"]["rail"]["name"], second["bodies"]["rail"]["subsystem"], second["bodies"]["rail"]["description"]),
                         ("rail", rail["group"], rail.get("note")))
        # A page file the page cannot use is refused, naming it, and stops no judging.
        self.edit(RELEASE + "/page.json", lambda page: page.update(colour="teal"))
        bad = self.words()
        self.assertEqual(bad.returncode, 2)
        self.assertIn("page.json has no field colour", bad.stderr)
        self.assertEqual(self.judge(motions=["release"])["result"], "pass")
        # With no page file at all, every text comes from the source.
        (self.root / RELEASE / "page.json").unlink()
        self.assertEqual(self.words().returncode, 0)
        plain = scene_of(self.root)
        self.assertEqual((plain["title"], plain["bodies"]["head"]["name"]), (None, "head"))

    # Acceptance 5: a page is built only from a run that judged every motion, and no partial result reaches it.
    def test_a_partial_result_never_reaches_the_page_and_a_stopped_run_builds_none(self):
        before = (self.root / SCENE).read_bytes()
        self.source(lambda s: solid(s, "rail")["shape"].update(fromMm=[19, 20, 18], toMm=[24, 25, 23]))
        stopped = fixture.judge(self.root, "1.0", "--page", "--workers", "1")
        self.assertEqual(stopped.returncode, 1)
        self.assertIn("No page was built", stopped.stdout)
        self.assertEqual((self.root / SCENE).read_bytes(), before)
        whole = fixture.judge(self.root, "1.0", "--all", "--page", "--workers", "1")
        self.assertEqual(whole.returncode, 1, whole.stderr)
        failing = scene_of(self.root)
        self.assertEqual((failing["decision"]["status"], {c["id"]: c["status"] for c in failing["cases"]}["loaded-turn"]), ("blocked", "fail"))
        # The gate's own pairs pass; the failing full result of the motion stays on the page.
        partial = fixture.judge(self.root, "1.0", "--motion", "loaded-turn", "--solid", "gate", "--workers", "1")
        self.assertEqual(partial.returncode, 0, partial.stdout)
        self.assertEqual(self.words().returncode, 0)
        self.assertEqual(scene_of(self.root)["cases"], failing["cases"])
        refused = fixture.judge(self.root, "1.0", "--motion", "loaded-turn", "--page")
        self.assertEqual(refused.returncode, 2)
        self.assertIn("A page is built from a run that judges levels 0 to 5", refused.stderr)

    def test_the_page_check_refuses_a_scene_that_does_not_repeat_the_verdict(self):
        self.assertEqual(self.validate(self.verdict)["errors"], [])
        other = json.loads(json.dumps(self.verdict))
        other["motions"]["release"]["status"] = "fail"
        self.assertIn("Scene motion results differ from the verdict", self.validate(other)["errors"])

    # From PR 231: one replay per trial with a nominal trace, from trials.json, with no hand-made replay set.
    def test_each_trial_with_a_nominal_trace_is_replayed_from_the_trial_record(self):
        self.source(tray.tray)
        self.judgement(tray.judged)
        # The trial is run on its own; the levels of a draft, judged later, show it with the time it ran.
        self.assertEqual(self.judge(trials=[tray.TRIAL])["result"], "pass")
        ran = self.rows()[("trial", tray.TRIAL)]["time"]
        verdict = self.judge(levels=[0, 1, 2, 3, 4, 5], page=True)
        self.assertEqual(verdict["status"], "layout-checked", verdict["unmet"])
        scene = scene_of(self.root)
        trace = get(self.root, RELEASE + "/results/trials.json")["trials"][tray.TRIAL]["nominal"]["trace"]
        [replay] = scene["replays"]
        self.assertEqual((replay["id"], replay["ran"]), ("trial-ball-stays-at-the-wall", ran))
        self.assertEqual(replay["time"], [row[0] for row in trace["rows"]], "the replay runs on the trial's own clock")
        self.assertEqual(replay["evidence"][0]["file"], RELEASE + "/results/trials.json")
        self.assertEqual(self.validate(verdict)["errors"], [])
        [row] = scene["interactions"]
        self.assertEqual((row["id"], row["trial"]["ran"]), ("tray stop", ran))


if __name__ == "__main__":
    unittest.main()
