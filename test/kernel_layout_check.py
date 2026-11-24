# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/verdict.py
# @subject scripts/kernel_layout/inputs.py
# @subject scripts/kernel_layout/rules.py
# @subject scripts/kernel_layout/jobs.py
# @subject scripts/kernel_layout/judge.py
# @subject scripts/kernel_layout/limits.py
# @subject scripts/kernel_layout/attachment.py
# @subject scripts/kernel_layout/stages.py
# @subject scripts/kernel_layout/premises.py
# @subject examples/design-source/create.py
"""The layout check on the design library's records: it passes a clear invented layout and can fail in each way that matters.

Failure caught: the check passes a layout that interferes, floats, is too heavy or sags the bus; judges a record that is
stale; measures before it has read every input; or writes a file of its own for a draft. Each control below changes
one input of the passing example and must be rejected or reported."""
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
from time import perf_counter
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"
REQUIREMENTS = "cad/preliminary-design/requirements.json"
sys.path.insert(0, str(PLUGIN / "scripts"))


def slide(v):
    return [dict(kind="translation", travelMm=v)]


def snapshot(folder):
    """Every file under a folder with its bytes: what `git status` would compare."""
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file()}


class KernelLayoutCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        runpy.run_path(str(PLUGIN / "examples/design-source/create.py"))["create"](cls.root / RELEASE, "1.0", cls.root)
        cls.source = cls.load("design.json")
        cls.judgement = cls.load("judgement.json")
        cls.requirements = json.loads((cls.root / REQUIREMENTS).read_text(encoding="utf-8"))
        cls.files = snapshot(cls.root)

    @classmethod
    def load(cls, name):
        return json.loads((cls.root / RELEASE / name).read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def put(self, name, data):
        path = self.root / name if "/" in name and not name.startswith("premises/") else self.root / RELEASE / name
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")

    def tearDown(self):
        # Each test leaves the passing example behind it, with no records: the files the starter wrote, and nothing else.
        for f in sorted(self.root.rglob("*"), reverse=True):
            rel = f.relative_to(self.root).as_posix()
            if f.is_file() and rel not in self.files:
                f.unlink()
            elif f.is_dir() and not any(f.iterdir()):
                f.rmdir()
        for name, data in self.files.items():
            (self.root / name).parent.mkdir(parents=True, exist_ok=True)
            (self.root / name).write_bytes(data)

    def check(self, *flags):
        """Run preliminary-check; returns (process, verdict or None)."""
        run = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json", "--json", *flags],
                             capture_output=True, text=True)
        return run, json.loads(run.stdout) if run.stdout.strip() else None

    def copy(self, data):
        return json.loads(json.dumps(data))

    def jobs(self):
        folder = self.root / RELEASE / "records/measurements"
        return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))}

    # Acceptance 4 and 8: measuring writes the library's job records; judging them again writes nothing and is fast.
    def test_a_clear_layout_is_measured_as_library_jobs_and_judged_again_writing_nothing(self):
        run, verdict = self.check("--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(verdict["status"], "layout-checked", verdict["unmet"])
        self.assertIsNone(verdict["firstUnmet"])
        self.assertEqual([verdict["motions"][m]["status"] for m in verdict["motions"]], ["pass"] * 5)
        self.assertTrue(verdict["control"]["rejected"], "the displaced control is rejected")
        self.assertEqual(verdict["attachment"]["floating"], [])
        self.assertEqual([r["solid"] for r in verdict["attachment"]["unmountedAllowances"]], ["rail"])
        self.assertEqual(verdict["attachment"]["onUnmountedAllowance"], ["gate", "gate motor"])
        jobs = self.jobs()
        for motion in ("acquire", "loaded-turn", "release", "park-loaded", "remove-carrier"):
            self.assertIn("clearance.motion." + motion, jobs)
        for name in ("clearance.motion.loaded-turn.displaced.rail", "withdrawal.remove-carrier", "attachment.pose.offered", "mass.drawn",
                     "electrical.loaded-turn", "electrical.release", "electrical.park-loaded"):
            self.assertIn(name, jobs)
        # A motion no motor drives states its cause and has no electrical job.
        self.assertNotIn("electrical.acquire", jobs)
        for name, record in jobs.items():
            self.assertIn("rules", record["inputs"], name)
            # No file holds a row for a pair the broad phase settled far apart.
            for row in (record["result"].get("pairs") or []) if record["job"]["kind"] == "clearance" else []:
                self.assertTrue(row["closerThanMinGap"] or not row["proven"] or row["lowerBoundMm"] < record["job"]["minGapMm"] + record["job"].get("nearMm", 0), name)
        self.assertEqual(verdict["records"]["folder"], RELEASE + "/records")
        # Judging the committed records again measures nothing and writes nothing.
        before, began = snapshot(self.root), perf_counter()
        again, judged = self.check("--judge-only")
        took = perf_counter() - began
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertLess(took, 10)
        self.assertEqual(snapshot(self.root), before, "a draft judgement writes nothing")
        self.assertEqual((judged["status"], judged["firstUnmet"]), ("layout-checked", None))
        self.assertEqual({row["action"] for row in judged["records"]["jobs"]}, {"current"})
        # Without --json it says the verdict and the first unmet requirement in words.
        words = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json", "--judge-only"],
                               capture_output=True, text=True)
        self.assertEqual(words.returncode, 0, words.stderr)
        self.assertIn("verdict: layout-checked", words.stdout)
        self.assertIn("firstUnmet: none", words.stdout)
        self.assertRegex(words.stderr, r"\[time\] judged \d+ record\(s\) in \d+ s, status \d+(\.\d+)? s of it")
        # A draft check again carries every current job and measures none.
        carried, _ = self.check()
        self.assertIn("[records] 0 measured, " + str(len(jobs)) + " carried", carried.stderr)

    # Acceptance 5: a stale record is refused, naming the record and what changed.
    def test_judging_a_stale_record_is_refused_naming_it_and_the_moved_solid(self):
        self.assertEqual(self.check()[0].returncode, 0)
        source = self.copy(self.source)
        next(s for s in source["solids"] if s["name"] == "rail")["shape"].update(fromMm=[19, 72, 18], toMm=[24, 77, 23])
        self.put("design.json", source)
        run, verdict = self.check("--judge-only")
        self.assertEqual(run.returncode, 2)
        self.assertIsNone(verdict)
        self.assertIn("measurements/clearance.motion.loaded-turn.json is stale", run.stderr)
        self.assertIn('solid "rail" changed', run.stderr)
        # A record the judgement asks for that was never measured is refused too.
        (self.root / RELEASE / "records/measurements/withdrawal.remove-carrier.json").unlink()
        self.put("design.json", self.source)
        missing, _ = self.check("--judge-only")
        self.assertEqual(missing.returncode, 2)
        self.assertIn("measurements/withdrawal.remove-carrier.json is missing", missing.stderr)
        # Control: measuring again makes it current, carrying what is unchanged.
        self.assertEqual(self.check()[0].returncode, 0)
        self.assertEqual(self.check("--judge-only")[0].returncode, 0)

    # Acceptance 6: a missing input stops the check in seconds, before anything is measured, with the whole list.
    def test_a_missing_input_is_refused_before_measuring_with_every_one_listed(self):
        (self.root / REQUIREMENTS).unlink()
        (self.root / RELEASE / "premises/robot-mass.json").unlink()
        began = perf_counter()
        run, _ = self.check()
        self.assertLess(perf_counter() - began, 5)
        self.assertEqual(run.returncode, 2)
        self.assertIn("Unresolved project file: " + REQUIREMENTS, run.stderr)
        self.assertIn("Unresolved project file: " + RELEASE + "/premises/robot-mass.json", run.stderr)
        self.assertFalse((self.root / RELEASE / "records").exists(), "nothing was measured")
        from kernel_layout import measure, verdict
        calls = []
        real = measure.record

        def counted(*args, **kwargs):
            calls.append(args)
            return real(*args, **kwargs)
        measure.record = counted
        try:
            with self.assertRaises(ValueError):
                verdict.judge(self.root, self.root / RELEASE / "judgement.json")
            self.assertEqual(calls, [], "the library's measuring entry point is never called")
            # Control: with the files restored, the same call measures.
            self.tearDown()
            verdict.judge(self.root, self.root / RELEASE / "judgement.json")
            self.assertEqual(len(calls), 1)
        finally:
            measure.record = real

    def test_a_file_reference_holds_no_digest_and_the_judgement_holds_no_geometry(self):
        judgement = self.copy(self.judgement)
        judgement["source"]["sha256"] = "0" * 64
        judgement["groups"] = {"structure": {"role": "structure"}}
        self.put("judgement.json", judgement)
        run, _ = self.check()
        self.assertEqual(run.returncode, 2)
        self.assertIn("A file reference is {file}: source holds sha256", run.stderr)
        self.assertIn("The judgement file holds no geometry or motion. Move groups to the design source", run.stderr)

    # Acceptance 10, the plugin half: weight from the source, against each named limit with its exclusions.
    def test_weight_comes_from_the_source_and_each_limit_leaves_out_its_groups(self):
        run, verdict = self.check()
        self.assertEqual(run.returncode, 0, run.stderr)
        weight = verdict["weight"]
        mass = self.jobs()["mass.drawn"]["result"]
        self.assertEqual((weight["totalKg"], weight["rangeKg"]), (mass["totalKg"], mass["rangeKg"]))
        inspection = next(row for row in weight["limits"] if row["name"] == "inspection")
        left = sum(mass["groups"][g]["rangeKg"][1] for g in ("bumper", "battery", "carried article"))
        self.assertAlmostEqual(inspection["rangeKg"][1], mass["rangeKg"][1] - left, places=9)
        self.assertEqual(inspection["status"], "pass")
        # A heavy battery is left out of the inspection weight: that limit passes and the other one fails.
        source = self.copy(self.source)
        next(s for s in source["solids"] if s["name"] == "battery")["massKg"] = 12
        self.put("design.json", source)
        _, heavy = self.check()
        rows = {row["name"]: row["status"] for row in heavy["weight"]["limits"]}
        self.assertEqual(rows, {"inspection": "pass", "with bumpers and battery": "fail"})
        self.assertEqual((heavy["status"], heavy["firstUnmet"]["kind"]), ("blocked", "weight"))
        self.assertIn("with bumpers and battery", heavy["firstUnmet"]["text"])
        # Control: the same inspection limit without its exclusion fails.
        requirements = self.copy(self.requirements)
        requirements["weightLimits"][0]["excludesGroups"] = []
        self.put(REQUIREMENTS, requirements)
        _, unexcluded = self.check()
        self.assertEqual(next(row["status"] for row in unexcluded["weight"]["limits"] if row["name"] == "inspection"), "fail")
        # A robot solid with no weight is refused before measuring, by name; an excluded group that is not in the design is refused.
        del next(s for s in source["solids"] if s["name"] == "gate")["massKg"]
        self.put("design.json", source)
        requirements["weightLimits"][0]["excludesGroups"] = ["ballast"]
        self.put(REQUIREMENTS, requirements)
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Unweighed robot solid: gate", refused.stderr)
        self.assertIn("Weight limit inspection excludes ballast, which is not a group of the design", refused.stderr)

    # Acceptance 11, the plugin half: the bus voltage of each motion, worked out from its running drives.
    def test_each_motion_is_judged_for_bus_voltage_and_current_from_its_running_drives(self):
        run, verdict = self.check()
        self.assertEqual(run.returncode, 0, run.stderr)
        electrical = verdict["electrical"]
        self.assertEqual(electrical["minBusV"], 9)
        self.assertEqual(sorted(electrical["motions"]), ["loaded-turn", "park-loaded", "release"])
        turn = electrical["motions"]["loaded-turn"]
        record = self.jobs()["electrical.loaded-turn"]["result"]
        self.assertEqual(turn["busV"], record["bus"]["volts"]["range"])
        self.assertEqual(turn["requiredV"], max(9, *(d["motorV"]["range"][1] for d in record["drives"].values())))
        self.assertEqual(turn["status"], "pass")
        # The drivetrain running at its limit beside the turn sags the weak pack below the floor: the motion fails.
        source = self.copy(self.source)
        source["motions"]["loaded-turn"]["alsoRunning"] = [{"drive": "drivetrain", "atLimit": True}]
        self.put("design.json", source)
        _, sagged = self.check()
        row = sagged["electrical"]["motions"]["loaded-turn"]
        self.assertEqual((row["status"], sagged["status"], sagged["firstUnmet"]["kind"]), ("fail", "blocked", "voltage"))
        self.assertLess(row["marginV"], 0)
        self.assertIn("loaded-turn", sagged["firstUnmet"]["text"])
        self.assertIn("minBusV", sagged["firstUnmet"]["text"])
        self.assertEqual(sagged["electrical"]["motions"]["release"]["status"], "pass", "only the motion that runs the drivetrain fails")
        # A drive whose motor must turn faster than the bus can drive it fails, naming the drive.
        source = self.copy(self.source)
        source["drives"]["pivot"]["gear"] = 400
        self.put("design.json", source)
        _, fast = self.check()
        self.assertEqual(fast["electrical"]["motions"]["loaded-turn"]["status"], "fail")
        self.assertEqual(fast["electrical"]["motions"]["loaded-turn"]["governs"], "pivot")
        self.assertIn("pivot", fast["firstUnmet"]["text"])
        # A heavy carrier needs more current than the pivot's limit: the drive is clamped and the motion fails; a lighter one passes.
        source = self.copy(self.source)
        source["groups"]["carrier"]["massKg"] = 400
        for solid in source["solids"]:
            if solid["group"] == "carrier":
                del solid["massKg"]
        self.put("design.json", source)
        _, clamped = self.check()
        self.assertEqual(clamped["electrical"]["motions"]["loaded-turn"]["clamped"], ["pivot"])
        self.assertEqual(clamped["status"], "blocked")
        source["groups"]["carrier"]["massKg"] = 0.6
        self.put("design.json", source)
        _, light = self.check()
        self.assertEqual(light["electrical"]["motions"]["loaded-turn"]["status"], "pass")
        # A design with powered motions and no battery is refused before measuring.
        del source["battery"]
        self.put("design.json", source)
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Give the design source a battery: loaded-turn, park-loaded and release draw from it", refused.stderr)

    # Acceptance 12: the rules are stated once, and an exception changes only its motion.
    def test_the_rules_are_stated_once_and_an_exception_changes_one_motion(self):
        self.assertNotIn("motions", self.judgement, "the example judges every motion on the defaults")
        run, verdict = self.check()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual({verdict["motions"][m]["allowanceMm"] for m in verdict["motions"]}, {1})
        first = self.jobs()
        judgement = self.copy(self.judgement)
        judgement["rules"]["exceptions"] = {"release": {"minGapMm": 0.5, "allowanceBasis": "Invented: the ejector runs in a guide"}}
        self.put("judgement.json", judgement)
        run, verdict = self.check()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual({m: verdict["motions"][m]["allowanceMm"] for m in verdict["motions"]},
                         {"acquire": 1, "loaded-turn": 1, "release": 0.5, "park-loaded": 1, "remove-carrier": 1})
        measured = {row["id"] for row in verdict["records"]["jobs"] if row["action"] == "measured"}
        self.assertEqual(measured, {"clearance.motion.release"})
        self.assertEqual(self.jobs()["clearance.motion.acquire"], first["clearance.motion.acquire"])
        # An exception names a motion of the source and a rule the judgement knows.
        judgement["rules"]["exceptions"] = {"spin": {"minGapMm": 0.5}, "release": {"stroke": 3}}
        self.put("judgement.json", judgement)
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("rules.exceptions names spin, which is not a motion of the design source", refused.stderr)
        self.assertIn("rules.exceptions.release holds stroke", refused.stderr)

    def test_interference_blocks_the_layout(self):
        source = self.copy(self.source)
        # Control: the rail drawn inside the arc the loaded head sweeps.
        next(s for s in source["solids"] if s["name"] == "rail")["shape"].update(fromMm=[19, 20, 18], toMm=[24, 25, 23])
        self.put("design.json", source)
        run, verdict = self.check("--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertEqual(verdict["status"], "blocked")
        self.assertEqual(verdict["motions"]["loaded-turn"]["status"], "fail")
        self.assertIn(["head", "rail"], [sorted(row["pair"]) for row in verdict["motions"]["loaded-turn"]["failing"]])
        self.assertEqual(verdict["firstUnmet"]["kind"], "clearance")
        self.assertIn("preliminary-design", [r["phase"] for r in verdict["reopen"]])

    def test_a_floating_solid_fails_the_layout_and_the_same_solid_mounted_passes(self):
        judgement = self.copy(self.judgement)
        # The rail's allowance taken away: nothing drawn holds it, and the gate and its motor hang on it, so all float.
        del judgement["attachment"]
        self.put("judgement.json", judgement)
        run, verdict = self.check("--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertEqual([r["solid"] for r in verdict["attachment"]["floating"]], ["gate", "gate motor", "rail"])
        self.assertEqual((verdict["status"], verdict["firstUnmet"]["kind"]), ("blocked", "floating"))
        self.assertIn("rail", verdict["firstUnmet"]["text"])
        self.assertEqual([verdict["motions"][m]["status"] for m in verdict["motions"]], ["pass"] * 5, "nothing but the floating solids is wrong")
        self.assertIn("[attachment] floating: rail (structure)", run.stderr)
        # Control: the same rail on a post and a beam that reach the mount block is attached. Each stands 2 mm off the
        # next: within the 3 mm touching gap, and clear of the 1 mm allowance.
        source = self.copy(self.source)
        source["solids"] += [dict(name="rail beam", group="structure", shape=dict(kind="box", fromMm=[-8, 17, 0], toMm=[24, 75, 6]), massKg=0.3),
                             dict(name="rail post", group="structure", shape=dict(kind="box", fromMm=[19, 70, 8], toMm=[24, 75, 16]), massKg=0.1)]
        self.put("design.json", source)
        mounted, checked = self.check("--require-checked")
        self.assertEqual(mounted.returncode, 0, mounted.stderr + json.dumps((checked or {}).get("unmet")))
        self.assertEqual((checked["status"], checked["attachment"]["floating"]), ("layout-checked", []))

    def test_a_displaced_control_that_is_not_rejected_is_named(self):
        judgement = self.copy(self.judgement)
        # An offset that leaves the rail clear cannot show that the check fails.
        judgement["control"]["offsetMm"] = [0, 5, 0]
        self.put("judgement.json", judgement)
        _, verdict = self.check()
        self.assertFalse(verdict["control"]["rejected"])
        self.assertEqual((verdict["status"], verdict["firstUnmet"]["kind"]), ("provisional", "control"))

    def test_an_open_objective_and_a_premise_outside_its_acceptance_are_judged(self):
        judgement = self.copy(self.judgement)
        judgement["narrative"]["objectives"][1]["disposition"] = "open"
        self.put("judgement.json", judgement)
        _, verdict = self.check()
        self.assertEqual(verdict["status"], "provisional")
        self.assertIn("Open narrative objective: Park at the finish", [row["text"] for row in verdict["unmet"]])
        self.put("judgement.json", self.judgement)
        # The observed mass is computed from the library's mass record: a premise of at most 9 kg is left, and reopens conceptual design.
        premise = self.load("premises/robot-mass.json")
        _, within = self.check()
        row = within["premises"][0]
        self.assertEqual((row["id"], row["status"], row["value"]), ("robot-mass", "within", self.jobs()["mass.drawn"]["result"]["rangeKg"]))
        self.put("premises/robot-mass.json", dict(premise, criterion={"range": [0, 9]}))
        _, reopened = self.check()
        self.assertEqual(reopened["status"], "reopen")
        self.assertEqual([(r["phase"], r["reason"]) for r in reopened["reopen"]], [("conceptual-design", "robot-mass")])
        # A premise names a fact the library states; a premise without observes is not observed.
        self.put("premises/robot-mass.json", dict(premise, observes="mass.colour"))
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Premise robot-mass observes mass.colour", refused.stderr)

    def test_a_carried_payload_that_leaves_its_carrier_stops_the_check(self):
        source, judgement = self.copy(self.source), self.copy(self.judgement)
        del source["groups"]["carried article"]["carriedBy"]
        judgement["motions"] = {"remove-carrier": {"carriedWith": {"carried article": "carrier"}}}
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        run, _ = self.check()
        self.assertEqual(run.returncode, 2)
        self.assertIn("The attached payload diverges from its carrier in remove-carrier", run.stderr)

    def test_only_a_mechanism_transports_and_a_named_trial_must_have_a_record(self):
        judgement = self.copy(self.judgement)
        judgement["motions"] = {"acquire": {"transportedBy": {"carried article": dict(
            mechanisms=["structure"], basis="Invented: rollers pull the article in", trial="invented pull-in")}}}
        self.put("judgement.json", judgement)
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Only mechanism groups transport a payload, each with a declared drive: carried article in acquire", refused.stderr)
        self.assertIn("transportedBy names trial invented pull-in, which the design source does not define", refused.stderr)

    def test_scope_guidelines_are_said_aloud_and_an_agreed_budget_is_recorded(self):
        judgement = self.copy(self.judgement)
        budget = dict(detail="Invented: the carrier drawn in four parts", question="Invented: does the head clear the gate",
                      allowance="Invented: ten more solids", stopsWhen="Invented: the head clears by 1 mm")
        judgement["scopeGuidelines"] = dict(solids=5, extendedBudget=budget)
        self.put("judgement.json", judgement)
        run, verdict = self.check("--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr)
        scope = verdict["scope"]
        self.assertEqual((scope["passed"], scope["guideline"]["source"], scope["extendedBudget"]), (["solids"], "judgement file", budget))
        self.assertIn("The judgement file records an agreed extended budget: Invented: the carrier drawn in four parts", run.stderr)
        judgement["scopeGuidelines"] = dict(solids=-1)
        self.put("judgement.json", judgement)
        bad, _ = self.check()
        self.assertEqual(bad.returncode, 2)
        self.assertIn("Give scopeGuidelines.solids as a positive number", bad.stderr)

    def test_a_touching_solid_is_attached_and_a_service_gauge_is_left_out(self):
        source = self.copy(self.source)
        # A cleat that only touches the mount block is attached; a service gauge standing apart is not a robot part.
        source["groups"]["gauges"] = {"role": "service"}
        source["solids"] += [dict(name="cleat", group="structure", shape=dict(kind="box", fromMm=[-4, -8, 7], toMm=[4, -4, 9]), massKg=0.05),
                             dict(name="reach gauge", group="gauges", shape=dict(kind="box", fromMm=[-60, -4, 0], toMm=[-56, 4, 4]))]
        self.put("design.json", source)
        run, verdict = self.check()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(verdict["attachment"]["floating"], [])
        self.assertEqual(verdict["attachment"]["excluded"]["serviceAndGauges"], 1)
        # Control: moved 5 mm off the block, past the touching gap, the cleat floats.
        next(s for s in source["solids"] if s["name"] == "cleat")["shape"].update(fromMm=[-4, -8, 12], toMm=[4, -4, 14])
        self.put("design.json", source)
        _, apart = self.check()
        self.assertEqual([r["solid"] for r in apart["attachment"]["floating"]], ["cleat"])

    def test_the_cycle_is_one_ordered_list_of_phases_and_runs_continuously(self):
        run, verdict = self.check()
        self.assertEqual([row["phase"] for row in verdict["cycle"]], ["acquire", "retain", "transfer", "deliver", "reset", "endgame", "park", "service"])
        judgement = self.copy(self.judgement)
        judgement["cycle"] = [row for row in judgement["cycle"] if row["phase"] != "deliver"]
        self.put("judgement.json", judgement)
        _, partial = self.check()
        self.assertIn("The cycle does not list release", [row["text"] for row in partial["unmet"]])
        self.assertEqual(partial["status"], "provisional")
        # A motion that does not start where the one before it ended breaks the cycle.
        source = self.copy(self.source)
        source["motions"]["park-loaded"]["from"] = "offered"
        self.put("design.json", source)
        self.put("judgement.json", self.judgement)
        _, broken = self.check()
        self.assertIn("Discontinuous cycle: carried article between release and park-loaded", [row["text"] for row in broken["unmet"]])
        # A phase word the cycle does not know, and a park motion in another phase, are refused.
        judgement = self.copy(self.judgement)
        judgement["cycle"][0]["phase"] = "gather"
        judgement["cycle"][6]["motions"] = []
        judgement["cycle"][7]["motions"] = ["remove-carrier", "park-loaded"]
        self.put("judgement.json", judgement)
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("cycle[0] names the phase gather", refused.stderr)
        self.assertIn("park-loaded is a park motion and is listed under service", refused.stderr)

    def test_a_motion_through_poses_and_a_hanging_fixture_are_judged(self):
        source, judgement = self.copy(self.source), self.copy(self.judgement)
        source["poses"]["parked"] = {}
        source["poses"]["turned"] = {"carrier": [dict(kind="rotation", originMm=[0, 0, 20], axis=[0, 0, 1], travelDeg=90)], "neighbor": slide([0, 12, 0])}
        source["motions"]["loaded-turn"] = {"through": ["parked", "turned"], "by": "hand"}
        source["motions"]["release"]["from"] = "turned"
        source["groups"]["field"] = {"role": "fixture"}
        source["fixtures"] = [dict(name="lane", group="field", shape=dict(kind="box", fromMm=[80, -20, 30], toMm=[120, 20, 34]))]
        self.put("design.json", source)
        off, floating = self.check("--require-checked")
        self.assertEqual(off.returncode, 1)
        self.assertEqual([r["fixture"] for r in floating["attachment"]["fixturesOffFloor"]], ["lane"])
        self.assertIn("[attachment] field fixture off the floor: lane", off.stderr)
        self.assertEqual((floating["status"], floating["firstUnmet"]["kind"]), ("blocked", "floating"))
        judgement["attachment"]["suspended"] = {"lane": "Invented: hung from a frame that is not drawn."}
        self.put("judgement.json", judgement)
        run, verdict = self.check("--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr + json.dumps((verdict or {}).get("unmet")))
        self.assertEqual(verdict["motions"]["loaded-turn"]["movingGroups"], ["carried article", "carrier", "neighbor"])
        self.assertEqual([r["fixture"] for r in verdict["attachment"]["suspendedFixtures"]], ["lane"])

    def test_a_squeezed_game_piece_is_judged_by_its_depth_and_only_its_jobs_are_measured_again(self):
        source, judgement = self.copy(self.source), self.copy(self.judgement)
        # A ball in place of the box, and a pad under it that presses 0.5 mm into its bottom where it is drawn.
        next(s for s in source["solids"] if s["name"] == "sample")["shape"] = dict(kind="sphere", centerMm=[38, 0, 20], radiusMm=2)
        source["solids"].append(dict(name="pad", group="structure", shape=dict(kind="box", fromMm=[36, -2, 16], toMm=[40, 2, 18.5]), massKg=0.01))
        source["contacts"] = [dict(pair=["sample", "pad"], note="The pad squeezes the ball in the pocket")]
        judgement["attachment"]["unmounted"]["pad"] = "Invented: the pad bracket is not drawn."
        rule = dict(payload="sample", contact="pad", maxDepthMm=1, basis="Invented one-sided squeeze allowance")
        judgement["rules"]["payloadCompression"] = [rule]
        judgement["rules"]["exceptions"] = {"release": {"payloadCompression": []}}
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        run, verdict = self.check("--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr + json.dumps((verdict or {}).get("unmet")))
        row = verdict["motions"]["acquire"]["compression"][0]
        self.assertEqual((row["status"], round(row["deepestMm"], 3)), ("pass", 0.5))
        self.assertLessEqual(row["upperBoundMm"], 1)
        self.assertEqual(verdict["motions"]["release"]["compression"], [], "the exception takes the rule off one motion")
        squeezes = sorted(name for name in self.jobs() if name.startswith("indentation."))
        self.assertEqual(squeezes, ["indentation.acquire.sample.pad", "indentation.loaded-turn.sample.pad", "indentation.park-loaded.sample.pad",
                                    "indentation.remove-carrier.sample.pad"])
        # Only the squeeze rule's depth changed: only the squeeze jobs are measured again, and the tighter allowance blocks.
        rule["maxDepthMm"] = 0.3
        self.put("judgement.json", judgement)
        tight, blocked = self.check("--require-checked")
        self.assertEqual(tight.returncode, 1)
        self.assertEqual(sorted(r["id"] for r in blocked["records"]["jobs"] if r["action"] == "measured"), squeezes)
        self.assertEqual((blocked["motions"]["acquire"]["status"], blocked["motions"]["acquire"]["compression"][0]["status"], blocked["status"]),
                         ("fail", "fail", "blocked"))
        # A squeezed pair the source does not declare as a contact stops the check with what to do.
        source["contacts"] = []
        self.put("design.json", source)
        undeclared, _ = self.check()
        self.assertEqual(undeclared.returncode, 2)
        self.assertIn("Declare sample and pad as a contact in the design source", undeclared.stderr)

    def test_missions_and_risks_are_stated_in_the_judgement(self):
        judgement = self.copy(self.judgement)
        judgement["missionCases"] = [dict(name="deliver", trial="invented throw", accomplishes="delivered", objective="Acquire, turn and release")]
        judgement["risks"].append(dict(id="evidence", risk="Invented", closedBy={"file": RELEASE + "/narrative.md"}))
        self.put("judgement.json", judgement)
        refused, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Mission case deliver names trial invented throw, which the design source does not define", refused.stderr)
        self.assertIn("Risk evidence: closedBy names a trial, interaction, adjustment or measured job, or is a sentence; a file is not allowed", refused.stderr)


if __name__ == "__main__":
    unittest.main()
