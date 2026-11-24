# @lane merge
# @subject scripts/package_view.py
# @subject scripts/kernel_layout/view.py
# @subject scripts/kernel_layout/replays.py
# @subject scripts/review-scene.mjs
# @subject scripts/design.mjs
# @subject examples/design-source/create.py
"""The review page built from the design source, the judgement file, the page file and the library's records.

Failure caught: a page whose scene claims what the records do not hold, that needs a receipt, that measures, that a page
edit can change a verdict through, or that stays published after its records go stale. Each control below changes one
input of the invented example and must be refused or reported."""
import gzip
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"
sys.path.insert(0, str(PLUGIN / "scripts"))


def node(*args):
    return subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), *args], capture_output=True, text=True)


def verdict_of(root):
    run = node("preliminary-check", str(root), RELEASE + "/judgement.json", "--judge-only", "--json", "--quiet")
    assert run.returncode == 0, run.stderr
    found = json.loads(run.stdout)
    found.pop("seconds")
    return found


def scene_of(root):
    return json.loads(gzip.decompress((root / RELEASE / "review-scene.json.gz").read_bytes()))


class ReviewPage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        example = runpy.run_path(str(PLUGIN / "examples/design-source/create.py"))
        example["create"](cls.root / RELEASE, "1.0", cls.root)
        example["build_and_check"](cls.root, cls.root / RELEASE)
        cls.files = {p: p.read_bytes() for p in cls.root.rglob("*") if p.is_file()}

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def tearDown(self):
        for p in sorted(self.root.rglob("*"), reverse=True):
            if p.is_file() and p not in self.files:
                p.unlink()
        for p, data in self.files.items():
            p.write_bytes(data)

    def page(self, *flags):
        return node("preliminary-page", str(self.root), RELEASE + "/judgement.json", *flags)

    def edit(self, name, change):
        path = self.root / RELEASE / name
        data = json.loads(path.read_text(encoding="utf-8"))
        change(data)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    def validate(self, verdict):
        """The scene on disk against the schema, its cross-checks and the verdict, as the release check reads it."""
        with TemporaryDirectory() as temp:
            file = Path(temp) / "verdict.json"
            file.write_text(json.dumps(verdict), encoding="utf-8")
            run = subprocess.run(["node", str(PLUGIN / "scripts/review-scene.mjs"), "validate", str(self.root / RELEASE / "review-scene.json.gz"), "--verdict", str(file)],
                                 capture_output=True, text=True)
        return json.loads(run.stdout) if run.stdout.strip() else {"errors": [run.stderr]}

    # Acceptance 15: the page builds from the source, the judgement, the page file and the records, with no receipt, and its scene validates.
    def test_the_page_builds_from_the_records_and_its_scene_repeats_the_verdict(self):
        self.assertTrue((self.root / RELEASE / "page.json").is_file(), "the example has a page file")
        run = self.page()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("review-scene.json.gz", run.stdout)
        self.assertTrue((self.root / RELEASE / "review.html").is_file())
        self.assertFalse(list(self.root.rglob("receipt.json")), "no receipt is written or read")
        verdict, scene = verdict_of(self.root), scene_of(self.root)
        checked = self.validate(verdict)
        self.assertEqual(checked["errors"], [])
        self.assertEqual(scene["schema"], "agent-frc/preliminary-review-scene@2")
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
        self.assertEqual(scene["title"], json.loads((self.root / RELEASE / "page.json").read_text(encoding="utf-8"))["title"])
        # Each record the verdict judged is named with its digest.
        self.assertEqual([j["id"] for j in scene["records"]["jobs"]], [j["id"] for j in verdict["records"]["jobs"]])
        # Weight and power come from the records.
        self.assertEqual(scene["weight"]["rangeKg"], verdict["weight"]["rangeKg"])
        self.assertEqual(sorted(m["motion"] for m in scene["power"]["motions"]), sorted(verdict["electrical"]["motions"]))

    # The brief: each driven motion's readout shows its drives, joint values, currents and bus voltage from the electrical records.
    def test_a_driven_motion_reads_out_its_drives_joint_values_currents_and_bus_from_its_records(self):
        self.assertEqual(self.page().returncode, 0)
        scene = scene_of(self.root)
        turn = next(c for c in scene["cases"] if c["id"] == "loaded-turn")
        record = json.loads((self.root / RELEASE / "records/measurements/electrical.loaded-turn.json").read_text(encoding="utf-8"))["result"]
        frames = len(turn["measure"])
        self.assertEqual(frames, len(turn["bodies"]["head"]["matrices"]))
        self.assertIn("pivot 0.0°", turn["measure"][0])
        self.assertIn("pivot 90.0°", turn["measure"][-1])
        self.assertIn("gate 12.0 mm", turn["measure"][-1])
        self.assertIn("%.2f A" % record["drives"]["pivot"]["currentA"]["range"][1], turn["measure"][0])
        low, high = record["bus"]["volts"]["range"]
        self.assertIn("bus %.2f–%.2f V" % (low, high), turn["measure"][0])
        # The clock is the motion's own: its nominal duration on the triangle speed profile, from rest to rest.
        duration = json.loads((self.root / RELEASE / "design.json").read_text(encoding="utf-8"))["motions"]["loaded-turn"]["durationS"]["value"]
        self.assertAlmostEqual(turn["time"][-1], duration, places=9)
        self.assertAlmostEqual(turn["time"][(frames - 1) // 2], duration / 2, places=9)
        self.assertLess(turn["time"][1], duration / (frames - 1), "it starts from rest")
        power = next(m for m in scene["power"]["motions"] if m["motion"] == "loaded-turn")
        pivot = next(d for d in power["drives"] if d["drive"] == "pivot")
        self.assertEqual((pivot["motorSolid"], pivot["currentA"]), ("pivot motor", record["drives"]["pivot"]["currentA"]["range"]))
        self.assertEqual(scene["bodies"]["pivot motor"]["motorOf"], ["pivot"])
        # A motion no motor drives states its cause in place of a readout of drives.
        hand = next(c for c in scene["cases"] if c["id"] == "acquire")
        self.assertEqual(set(hand["measure"]), {"By hand: no motor drives this motion"})
        self.assertNotIn("time", hand)

    # Acceptance 13: the page file is outside the verdict.
    def test_editing_the_page_file_changes_no_verdict_and_measures_nothing(self):
        before = verdict_of(self.root)
        self.assertEqual(self.page().returncode, 0)
        first = scene_of(self.root)
        self.edit("page.json", lambda page: page.update(title="Invented: a new title", solids={"head": {"name": "Carrier head", "description": "Invented: renamed on the page"}}))
        from kernel_layout import measure
        import package_view
        calls, real = [], measure.record
        measure.record = lambda *args, **kwargs: calls.append(args) or real(*args, **kwargs)
        try:
            package_view.build(self.root, self.root / RELEASE / "judgement.json")
        finally:
            measure.record = real
        self.assertEqual(calls, [], "building the page never measures")
        after, second = verdict_of(self.root), scene_of(self.root)
        self.assertEqual(after, before, "a page edit changes no verdict")
        self.assertEqual((second["title"], second["bodies"]["head"]["name"], second["bodies"]["head"]["description"]),
                         ("Invented: a new title", "Carrier head", "Invented: renamed on the page"))
        self.assertEqual(second["decision"], first["decision"])
        # A solid with no page entry shows its source name, its group as its subsystem and its note.
        source = json.loads((self.root / RELEASE / "design.json").read_text(encoding="utf-8"))
        rail = next(s for s in source["solids"] if s["name"] == "rail")
        self.assertNotIn("rail", json.loads((self.root / RELEASE / "page.json").read_text(encoding="utf-8")).get("solids", {}))
        self.assertEqual((second["bodies"]["rail"]["name"], second["bodies"]["rail"]["subsystem"], second["bodies"]["rail"]["description"]),
                         ("rail", rail["group"], rail.get("note")))
        # A page file the page cannot read refuses the page, naming it, and still leaves the verdict alone.
        self.edit("page.json", lambda page: page.update(colour="teal"))
        bad = self.page()
        self.assertEqual(bad.returncode, 2)
        self.assertIn("page.json has no field colour", bad.stderr)
        self.assertEqual(verdict_of(self.root), before)
        # With no page file at all, every text comes from the source.
        self.edit("judgement.json", lambda judgement: judgement.pop("page"))
        self.assertEqual(self.page().returncode, 0)
        plain = scene_of(self.root)
        self.assertEqual((plain["title"], plain["bodies"]["head"]["name"]), (None, "head"))
        self.assertEqual(verdict_of(self.root), before)

    def test_a_stale_record_refuses_the_page_and_the_check_reports_a_page_built_from_other_records(self):
        self.assertEqual(self.page().returncode, 0)
        self.assertEqual(self.page("--check").returncode, 0, "the committed page is the one the records build")
        # A page edit not yet built is reported, and --check writes nothing.
        self.edit("page.json", lambda page: page.update(title="Invented: not built yet"))
        before = (self.root / RELEASE / "review-scene.json.gz").read_bytes()
        differs = self.page("--check")
        self.assertEqual(differs.returncode, 1)
        self.assertIn("is not the page built from the current records", differs.stdout + differs.stderr)
        self.assertEqual((self.root / RELEASE / "review-scene.json.gz").read_bytes(), before)
        # The design auditor reports the same committed scene, and nothing once the page is built again.
        def audit():
            run = subprocess.run(["node", str(PLUGIN / "scripts/design-audit.mjs"), str(self.root), "--json"], capture_output=True, text=True)
            return [f for f in json.loads(run.stdout)[0]["findings"] if f["form"] == "stale-scene"]
        [finding] = audit()
        self.assertEqual(finding["file"], RELEASE + "/review-scene.json.gz")
        self.assertIn("design preliminary-page", finding["detail"])
        self.assertEqual(self.page().returncode, 0)
        self.assertEqual(audit(), [], "control: the page built from the current records is not reported")
        self.edit("page.json", lambda page: page.update(title="Invented: not built yet"))
        before = (self.root / RELEASE / "review-scene.json.gz").read_bytes()
        # A moved solid makes a record stale: the page is refused and nothing is measured or written.
        self.edit("design.json", lambda source: next(s for s in source["solids"] if s["name"] == "rail")["shape"].update(fromMm=[19, 72, 18], toMm=[24, 77, 23]))
        stale = self.page()
        self.assertEqual(stale.returncode, 2)
        self.assertIn("clearance.motion.loaded-turn.json is stale", stale.stderr)
        self.assertEqual((self.root / RELEASE / "review-scene.json.gz").read_bytes(), before)
        # Control: measured again, the page builds.
        self.assertEqual(node("preliminary-check", str(self.root), RELEASE + "/judgement.json", "--quiet").returncode, 0)
        self.assertEqual(self.page().returncode, 0)

    # From PR 231: one replay per trial with a nominal trace, from trials.json, with no hand-made replay set.
    def test_each_trial_with_a_nominal_trace_is_replayed_from_the_trial_record(self):
        tray = runpy.run_path(str(PLUGIN / "test/fixtures/ready_example.py"))
        self.edit("design.json", tray["tray"])
        self.edit("judgement.json", tray["judged"])
        for args in (["build", RELEASE + "/design.json", "--out", RELEASE + "/generated"], ["try", RELEASE + "/design.json", "--out", RELEASE + "/records"],
                     ["measure", RELEASE + "/design.json", "--out", RELEASE + "/records", "--extremes", "--min-gap", "1"]):
            subprocess.run([sys.executable, "-m", "frc_design_kernel", *args], cwd=self.root, check=True, capture_output=True)
        self.assertEqual(node("preliminary-check", str(self.root), RELEASE + "/judgement.json", "--quiet").returncode, 0)
        run = self.page()
        self.assertEqual(run.returncode, 0, run.stderr)
        scene = scene_of(self.root)
        trace = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][tray["TRIAL"]]["nominal"]["trace"]
        [replay] = scene["replays"]
        self.assertEqual(replay["id"], "trial-ball-stays-at-the-wall")
        self.assertEqual(replay["time"], [row[0] for row in trace["rows"]], "the replay runs on the trial's own clock")
        self.assertEqual(replay["evidence"][0]["file"], RELEASE + "/records/trials.json")
        self.assertEqual(self.validate(verdict_of(self.root))["errors"], [])
        self.assertEqual([i["id"] for i in scene["interactions"]], ["tray stop"])


if __name__ == "__main__":
    unittest.main()
