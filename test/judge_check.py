# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/run.py
# @subject scripts/kernel_layout/checks.py
# @subject scripts/kernel_layout/project.py
# @subject scripts/kernel_layout/journal.py
# @subject scripts/kernel_layout/measure.py
# @subject scripts/project-structure.mjs
# @subject examples/design-source/create.py
"""The judge on an invented project: cheapest first, one thing at a time, nothing decided from what changed, and a log that decides nothing.

Failure caught: a design judged with files missing; a cheap failure found only after the slow work; a run that measures
more, or less, than what was named; a selected or partial result taken for the whole; a saved result or the log deciding
a verdict. Every run here is in a real Git checkout made by project-layout.mjs init, and counts what the library is asked."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from time import perf_counter
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent / "fixtures"))
import judged_project as fixture  # noqa: E402
from judged_project import LOG, RELEASE, Judge, commit, counted, get, git, put, snapshot, solid, with_tray  # noqa: E402
import ready_example as tray  # noqa: E402

RAIL_IN_THE_ARC = dict(fromMm=[19, 20, 18], toMm=[24, 25, 23])


class Judge(Judge):
    """The starter with the invented tray: one adjustment, one interaction and one trial."""
    change = staticmethod(with_tray)


class FailFast(Judge):
    # Acceptance 4.
    def test_a_missing_file_never_builds_and_writes_nothing(self):
        (self.root / "cad/design-criteria.json").unlink()
        (self.root / RELEASE / "judgement.json").unlink()
        before = snapshot(self.root)
        with counted() as counts:
            said = self.refused()
        self.assertEqual((counts.built, counts.jobs), (0, []))
        self.assertIn("cad/design-criteria.json is missing", said)
        self.assertIn("judgement.json is missing", said, "every missing file is listed at once")
        self.assertEqual(snapshot(self.root), before)

    def test_an_unreadable_design_stops_before_anything_is_built_with_every_problem_listed(self):
        self.judgement(lambda j: (j["cycle"][0].update(phase="gather"), j["control"].update(motion="spin")))
        with counted() as counts:
            said = self.refused()
        self.assertEqual(counts.built, 0)
        self.assertIn("level 1", said)
        self.assertIn("cycle[0] names the phase gather", said)
        self.assertIn("The displaced control names a motion of this design", said)

    def test_a_joint_past_its_travel_stops_at_level_1(self):
        self.source(lambda s: s["motions"]["loaded-turn"]["drive"]["pivot"].update(to=120))
        with counted() as counts:
            said = self.refused()
        self.assertEqual(counts.built, 0)
        self.assertIn("outside its joint travel", said)

    def test_an_unweighed_solid_never_measures(self):
        self.source(lambda s: (solid(s, "gate").pop("massKg"), solid(s, "head").pop("massKg")))
        with counted() as counts:
            verdict = self.judge()
        self.assertEqual((counts.built, counts.jobs), (1, []))
        self.assertEqual(verdict["result"], "fail")
        self.assertIn("gate", verdict["firstUnmet"]["text"])
        self.assertIn("head", verdict["firstUnmet"]["text"], "every unweighed solid is listed")
        self.assertIn(("clearance", "loaded-turn"), {(r["check"], r["subject"]) for r in verdict["notJudged"]})

    def test_a_floating_part_sweeps_no_motion_and_a_level_lists_every_failure(self):
        self.judgement(lambda j: j.pop("attachment"))
        with counted() as counts:
            verdict = self.judge()
        self.assertEqual(counts.motions, [])
        self.assertEqual([r["solid"] for r in verdict["attachment"]["floating"]], ["gate", "gate motor", "rail"])
        self.assertEqual((verdict["status"], verdict["firstUnmet"]["kind"]), ("blocked", "attachment"))
        # Two weight limits over: both are listed before the level stops the run.
        fixture.restore(self.root)
        self.source(lambda s: solid(s, "head").update(massKg=40))
        with counted() as counts:
            heavy = self.judge()
        self.assertEqual({r["subject"] for r in heavy["rows"] if r["result"] in ("fail", "reopen")}, {"inspection", "with bumpers and battery", "robot-mass"})
        self.assertEqual([j["kind"] for j in counts.jobs], ["mass"], "no electrical load, attachment or motion is measured")

    def test_a_clearance_failure_runs_no_trial_and_stops_at_the_first_failing_motion(self):
        self.source(lambda s: solid(s, "rail")["shape"].update(RAIL_IN_THE_ARC))
        with counted() as counts:
            verdict = self.judge()
        self.assertEqual(counts.tried, [])
        self.assertEqual(counts.ends, [])
        self.assertEqual([m for m, r in verdict["motions"].items() if r["status"] == "fail"], ["loaded-turn"])
        self.assertNotIn("park-loaded", verdict["motions"], "the motions after the failing one are not judged")
        self.assertIn(("trial", tray.TRIAL), {(r["check"], r["subject"]) for r in verdict["notJudged"]})
        # Level 5 tries the motion that failed last time first.
        with counted() as counts:
            again = self.judge()
        self.assertEqual(list(again["motions"]), ["loaded-turn"])

    def test_all_runs_every_level_whatever_fails(self):
        self.source(lambda s: (solid(s, "rail")["shape"].update(RAIL_IN_THE_ARC), solid(s, "bumper").update(massKg=40)))
        self.judgement(lambda j: j.pop("attachment"))
        with counted() as counts:
            verdict = self.judge(all=True)
        self.assertEqual(counts.tried, [tray.TRIAL])
        self.assertEqual(len(counts.motions), 5)
        self.assertEqual(verdict["notJudged"], [])
        self.assertLessEqual({"weight", "attachment", "clearance"}, {r["check"] for r in verdict["rows"] if r["result"] == "fail"})
        self.assertEqual(verdict["result"], "fail")

    def test_a_whole_design_that_passes_is_layout_checked_and_the_cycle_and_the_decisions_left_stop_nothing(self):
        verdict = self.judge()
        self.assertEqual((verdict["result"], verdict["status"], verdict["firstUnmet"]), ("pass", "layout-checked", None), verdict["unmet"])
        self.assertEqual(verdict["notJudged"], [])
        # The cycle being joined up is its own check: broken, it is reported and everything else is still judged.
        self.source(lambda s: s["motions"]["park-loaded"].update({"from": "offered"}))
        broken = self.judge()
        self.assertEqual([r["result"] for r in broken["rows"] if r["check"] == "cycle"], ["fail"])
        self.assertEqual(broken["result"], "fail")
        self.assertIn("park-loaded", broken["motions"])
        self.assertEqual({r["result"] for r in broken["rows"] if r["check"] == "trial"}, {"pass"})
        # A decision nobody has made is listed and fails nothing but a full judgement, which refuses before it builds.
        fixture.restore(self.root)
        self.judgement(lambda j: (j.pop("interactions"), j["narrative"]["objectives"][1].update(disposition="open")))
        open_ = self.judge()
        self.assertEqual(open_["result"], "pass")
        self.assertIn("Open narrative objective: Park at the finish", open_["completeness"])
        self.assertTrue(any("interaction tray stop" in text for text in open_["completeness"]))
        with counted() as counts:
            said = self.refused(full=True)
        self.assertEqual(counts.built, 0)
        self.assertIn("Open narrative objective: Park at the finish", said)
        self.assertIn("full judgement", self.refused(full=True, motions=["release"]), "a full judgement takes no selection")


class Selection(Judge):
    # Acceptance 5.
    def test_one_motion_measures_only_that_motion_every_time_it_is_asked(self):
        for _ in range(2):
            with counted() as counts:
                verdict = self.judge(motions=["loaded-turn"])
            self.assertEqual(sorted(j["kind"] for j in counts.jobs), ["clearance", "electrical"])
            self.assertEqual({j["motion"] for j in counts.jobs}, {"loaded-turn"})
        self.assertEqual((verdict["result"], verdict["status"]), ("pass", None), "a selected run is never the design passing")
        left = {(r["check"], r["subject"]) for r in verdict["notJudged"]}
        self.assertIn(("weight", "inspection"), left)
        self.assertIn(("clearance", "release"), left)
        self.assertNotIn(("clearance", "loaded-turn"), left)
        run = fixture.judge(self.root, "1.0", "--motion", "loaded-turn", "--workers", "1")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("This is not the design passing.", run.stdout)
        self.assertRegex(run.stdout, r"Not judged: .*weight")
        self.assertNotIn("layout-checked", run.stdout)

    def test_one_check_one_level_and_one_thing_of_each_kind(self):
        with counted() as counts:
            self.judge(only=["weight"])
        self.assertEqual([j["kind"] for j in counts.jobs], ["mass"])
        with counted() as counts:
            self.judge(levels=[3])
        self.assertEqual(sorted(j["motion"] for j in counts.jobs), ["loaded-turn", "park-loaded", "release"])
        with counted() as counts:
            self.judge(levels=[5], only=["control"])
        self.assertEqual([j["displace"] for j in counts.jobs], [{"rail": [0, -50, 0]}])
        with counted() as counts:
            verdict = self.judge(trials=[tray.TRIAL])
        self.assertEqual((counts.tried, counts.jobs), ([tray.TRIAL], []))
        self.assertEqual([(r["check"], r["result"]) for r in verdict["rows"] if r["level"] == 6], [("trial", "pass")])
        with counted() as counts:
            verdict = self.judge(adjustments=["wall position"])
        self.assertEqual([r["subject"] for r in verdict["rows"] if r["check"] == "adjustment"], ["wall position"])
        self.assertEqual(counts.tried, [])
        # The levels a draft runs, named as a range: the layout's status is given, the design is not said to pass.
        with counted() as counts:
            draft = self.judge(levels=[0, 1, 2, 3, 4, 5])
        self.assertEqual((draft["status"], counts.tried), ("layout-checked", []))
        self.assertIn(("trial", tray.TRIAL), {(r["check"], r["subject"]) for r in draft["notJudged"]})

    def test_a_name_the_design_does_not_have_is_refused_with_the_names_it_has(self):
        self.assertIn("loaded-turn", self.refused(motions=["loaded turn"]))
        self.assertIn("head", self.refused(solids=["hed"]))
        self.assertIn(tray.TRIAL, self.refused(trials=["ball"]))
        self.assertIn("clearance", self.refused(only=["gap"]))
        self.assertIn("subsystem", self.refused(subsystems=["arm"]))
        run = fixture.judge(self.root, "cad/preliminary-design/releases/1.0/judgement.json")
        self.assertEqual(run.returncode, 2)
        self.assertIn("Name the release by its version", run.stderr)

    def test_the_pairs_of_one_solid_are_measured_alone_and_never_replace_a_full_result(self):
        # A full record of loaded-turn fails.
        self.source(lambda s: solid(s, "rail")["shape"].update(RAIL_IN_THE_ARC))
        full = self.judge(motions=["loaded-turn"])
        self.assertEqual(full["result"], "fail")
        record, row = self.record("clearance.motion.loaded-turn"), self.rows()[("clearance", "loaded-turn")]
        # The gate's own pairs pass: that is printed and logged under its own subject, twice measured when asked twice.
        for _ in range(2):
            with counted() as counts:
                verdict = self.judge(motions=["loaded-turn"], solids=["gate"])
            self.assertEqual(counts.focus, [["gate"]])
            self.assertEqual(counts.motions, ["loaded-turn"])
        self.assertEqual(verdict["result"], "pass")
        self.assertEqual([r["subject"] for r in verdict["rows"] if r["level"] == 5], ["loaded-turn, pairs with gate"])
        self.assertIsNone(verdict["status"])
        self.assertEqual(self.record("clearance.motion.loaded-turn"), record, "the failing full record stays on disk")
        self.assertEqual(self.rows()[("clearance", "loaded-turn")], row, "and in the log")
        self.assertEqual(self.rows()[("clearance", "loaded-turn, pairs with gate")]["result"], "pass")
        # Without a motion named, the solid's pairs are measured along every motion.
        with counted() as counts:
            self.judge(solids=["gate"], all=True)
        self.assertEqual(len(counts.motions), 5)
        # A partial run builds no page.
        self.assertIn("page", self.refused(solids=["gate"], page=True))

    def test_the_pairs_of_one_subsystem_are_those_of_its_solids(self):
        def split(source):
            own = ("groups", "solids", "mounts", "contacts", "drives", "motions", "poses", "adjustments", "interactions", "extraMass")
            parts = {"carrier": {"schema": "frc-design-kernel/subsystem@1", "groups": {"carrier": source["groups"].pop("carrier")},
                                 "solids": [s for s in source["solids"] if s["group"] == "carrier"]}}
            source["solids"] = [s for s in source["solids"] if s["group"] != "carrier"]
            parts["rest"] = {"schema": "frc-design-kernel/subsystem@1", **{key: source.pop(key) for key in own if key in source}}
            source["subsystems"] = [{"file": "subsystems/carrier.json"}, {"file": "subsystems/rest.json"}]
            for name, data in parts.items():
                put(self.root, RELEASE + "/subsystems/" + name + ".json", data)
        self.source(split)
        with counted() as counts:
            verdict = self.judge(motions=["release"], subsystems=["carrier"])
        self.assertEqual(counts.focus, [["ejector motor", "head"]])
        self.assertEqual([r["subject"] for r in verdict["rows"] if r["level"] == 5], ["release, pairs with subsystem carrier"])

    def test_an_unfinished_design_can_have_its_weight_or_one_motion_judged(self):
        self.judgement(lambda j: (j.pop("cycle"), j.pop("control"), j.update(interactions={"spin": {}}), j["missionCases"].append({"name": "x"})))
        (self.root / "kickoff/strategic-narrative.md").unlink()
        self.assertEqual(self.judge(only=["weight"])["result"], "pass")
        self.assertEqual(self.judge(motions=["release"])["result"], "pass")
        verdict = self.judge(motions=["release"])
        self.assertTrue(any("strategic-narrative.md is missing" in note for note in verdict["notes"]), "what is wrong elsewhere is still said")
        said = self.refused()
        self.assertIn("strategic-narrative.md is missing", said)
        # A problem in what the motion itself needs does stop it.
        self.judgement(lambda j: j["rules"].update(minGapMm=-1))
        self.assertIn("minGapMm", self.refused(motions=["release"]))
        self.assertEqual(self.judge(only=["weight"])["result"], "pass")
        # An exception of another motion is not needed by this one.
        self.judgement(lambda j: j["rules"].update(minGapMm=1, exceptions={"acquire": {"stroke": 3}}))
        self.assertEqual(self.judge(motions=["release"])["result"], "pass")
        self.assertIn("rules.exceptions.acquire holds stroke", self.refused(motions=["acquire"]))


class Structure(Judge):
    # Acceptance 3, the judge's half.
    def test_with_two_rules_folders_the_newest_is_used_named_and_logged(self):
        put(self.root, "kickoff/rules/2001-09-01/rules.json", {"weightLimits": [
            {"name": "inspection", "limit": {"value": 1, "unit": "kg"}, "excludesRoles": [], "factId": "invented"}]})
        verdict = self.judge(only=["weight"])
        self.assertEqual((verdict["result"], verdict["weight"]["rules"]), ("fail", "kickoff/rules/2001-09-01"))
        self.assertIn("kickoff/rules/2001-09-01", verdict["firstUnmet"]["text"])
        row = self.rows()[("weight", "inspection")]
        self.assertEqual((row["rules"], row["limit"]), ("kickoff/rules/2001-09-01", 1))

    def test_with_no_rules_folder_one_motion_is_judged_and_weight_and_a_full_judgement_name_case_study(self):
        shutil.rmtree(self.root / "kickoff/rules")
        commit(self.root)
        try:
            self.assertEqual(self.judge(motions=["release"])["result"], "pass")
            for said in (self.refused(only=["weight"]), self.refused(full=True), self.refused()):
                self.assertIn("Case study comes before this step", said)
        finally:
            git(self.root, "reset", "-q", "--hard", "HEAD~1")

    def test_rules_with_no_weight_limits_leave_weight_not_judged_and_a_full_judgement_refuses(self):
        self.edit("kickoff/rules/2001-01-06/rules.json", lambda r: r.pop("weightLimits"))
        verdict = self.judge()
        self.assertEqual([(r["result"], r["figure"] is not None) for r in verdict["rows"] if r["check"] == "weight"], [("not judged", True)])
        self.assertEqual((verdict["result"], verdict["status"]), ("pass", "provisional"))
        self.assertTrue(any("case study" in text.lower() for text in verdict["completeness"]))
        self.assertIn("case study", self.refused(full=True).lower())

    def test_outside_a_checkout_or_in_a_partial_copy_it_refuses_in_under_2_seconds_and_writes_nothing(self):
        with TemporaryDirectory() as folder:
            away = Path(folder) / "away"
            shutil.copytree(self.root / RELEASE, away / RELEASE)
            for partial in (False, True):
                if partial:
                    git(away, "init", "-q")
                before, began = snapshot(away), perf_counter()
                run = fixture.judge(away, "1.0")
                self.assertLess(perf_counter() - began, 2)
                self.assertEqual(run.returncode, 2)
                for text in ("kickoff/rules/<yyyy-mm-dd>/rules.json is missing", "kickoff/strategic-narrative.md is missing", "cad/design-criteria.json is missing"):
                    self.assertIn(text, run.stderr)
                self.assertEqual("not inside a Git checkout" in run.stderr, not partial)
                self.assertEqual(snapshot(away), before)

    def test_a_fresh_worktree_of_the_same_commit_judges(self):
        with TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            tree = Path(folder) / "tree"
            git(self.root, "worktree", "add", "-q", "--detach", str(tree))
            try:
                run = fixture.judge(tree, "1.0", "--level", "0-5", "--workers", "1")
                self.assertEqual(run.returncode, 0, run.stderr + run.stdout)
                # In the project's own folder or below it, the same checkout is judged.
                self.assertEqual(fixture.judge(tree / "cad", "1.0", "--only", "weight").returncode, 0)
            finally:
                git(self.root, "worktree", "remove", "--force", str(tree))

    def test_an_extra_file_stops_nothing_and_a_judgement_with_a_path_is_refused(self):
        (self.root / RELEASE / "notes.txt").write_text("invented", encoding="utf-8")
        verdict = self.judge(motions=["release"])
        self.assertEqual(verdict["result"], "pass")
        self.assertTrue(any("notes.txt is not a file the structure knows" in note for note in verdict["notes"]))
        for field, value in (("source", {"file": "design.json"}), ("records", {"folder": "records"}), ("requirements", {"file": "x"}), ("page", {"file": "page.json"}),
                             ("premises", [{"file": "x"}])):
            fixture.restore(self.root)
            self.judgement(lambda j: j.update({field: value}))
            self.assertIn("The judgement file holds no paths: remove " + field, self.refused())
        fixture.restore(self.root)
        self.judgement(lambda j: j["narrative"].update(file="kickoff/strategic-narrative.md"))
        self.assertIn("remove narrative.file", self.refused())

    def test_the_design_criteria_hold_the_minimum_bus_voltage_and_its_basis_and_nothing_else(self):
        self.edit("cad/design-criteria.json", lambda c: c.update(minBusV=12.5))
        verdict = self.judge(only=["electrical"])
        self.assertEqual((verdict["result"], verdict["electrical"]["minBusV"]), ("fail", 12.5))
        self.edit("cad/design-criteria.json", lambda c: c.update(weightLimits=[]))
        self.assertIn("design-criteria.json holds schema, minBusV and basis", self.refused(only=["electrical"]))
        self.assertEqual(self.judge(only=["weight"])["result"], "pass", "weight does not read it")


class NothingIsReused(Judge):
    # Acceptance 1, the plugin's half.
    def test_a_second_identical_run_measures_and_tries_everything_again_and_changes_no_record(self):
        with counted() as first:
            self.judge()
        records = snapshot(self.root / RELEASE / "results")
        with counted() as second:
            self.judge()
        self.assertEqual((len(second.jobs), second.ends, second.tried), (len(first.jobs), first.ends, first.tried))
        self.assertGreater(len(first.jobs), 10)
        after = snapshot(self.root / RELEASE / "results")
        self.assertEqual({k: v for k, v in after.items() if k != "progress.json"}, {k: v for k, v in records.items() if k != "progress.json"},
                         "the same figures change no file")

    def test_saved_results_and_the_log_decide_nothing(self):
        passing = self.judge()
        for path in (self.root / RELEASE / "results").rglob("*.json"):
            path.write_text(path.read_text(encoding="utf-8").replace("true", "false").replace("passed", "failed"), encoding="utf-8")
        self.edit(LOG, lambda log: [r.update(result="fail", time="2000-01-01T00:00:00Z") for r in log["rows"]])
        edited = self.judge()
        shutil.rmtree(self.root / RELEASE / "results")
        (self.root / LOG).unlink()
        gone = self.judge()
        (self.root / LOG).write_text("{not json", encoding="utf-8")
        broken = self.judge()
        for verdict in (edited, gone, broken):
            self.assertEqual((verdict["result"], verdict["status"], len(verdict["rows"])), (passing["result"], passing["status"], len(passing["rows"])))
        # Control: the design made to fail is refused whatever its saved results say.
        self.judge()
        self.source(lambda s: solid(s, "rail")["shape"].update(RAIL_IN_THE_ARC))
        self.assertEqual(self.judge()["result"], "fail")


class Log(Judge):
    # Acceptance 6.
    def test_a_row_is_replaced_and_says_what_ran_when_and_with_what_result(self):
        self.judge(motions=["loaded-turn"])
        first = get(self.root, LOG)
        self.judge(motions=["loaded-turn"])
        second = get(self.root, LOG)
        keys = [(r["check"], r["subject"]) for r in second["rows"]]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(sorted(keys), sorted((r["check"], r["subject"]) for r in first["rows"]))
        row = self.rows()[("electrical", "loaded-turn")]
        self.assertEqual(set(row) - {"unit"}, {"check", "subject", "time", "result", "figure", "limit", "seconds", "full", "commit"})
        self.assertEqual((row["result"], row["full"], row["limit"]), ("pass", False, 9))
        self.assertEqual(row["commit"], git(self.root, "log", "-1", "--format=%H", "--", RELEASE))
        self.assertRegex(row["time"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        # An uncommitted design is said to be one.
        self.source(lambda s: solid(s, "head").update(note="Invented"))
        self.judge(motions=["loaded-turn"])
        self.assertEqual(self.rows()[("electrical", "loaded-turn")]["commit"], "uncommitted")

    def test_a_full_run_drops_the_rows_whose_subject_is_gone(self):
        self.judge()
        self.judge(motions=["release"], solids=["gate motor"])
        self.assertIn(("clearance", "release, pairs with gate motor"), self.rows())
        self.assertTrue(self.rows()[("clearance", "acquire")]["full"])

        def drop(source):
            source["solids"] = [s for s in source["solids"] if s["name"] != "gate motor"]
            source["drives"]["gate"]["motorSolid"] = "pivot motor"
            source["motions"]["turn"] = source["motions"].pop("loaded-turn")
            source["motions"]["release"]["from"] = {"after": "turn"}
        self.source(drop)
        self.judgement(lambda j: (j["control"].update(motion="turn"), j["cycle"][2].update(motions=["turn"])))
        self.judge(motions=["turn"])
        self.assertIn(("clearance", "loaded-turn"), self.rows(), "a selected run drops nothing")
        self.judge()
        self.assertFalse([k for k in self.rows() if "loaded-turn" in k[1] or "gate motor" in k[1]])

    def test_the_log_is_shown_beside_the_last_commit_of_the_design_by_git_and_not_by_file_times(self):
        self.judge(motions=["release"])
        commit(self.root, "Invented results")
        shown = fixture.judge(self.root, "1.0", "--log")
        self.assertEqual(shown.returncode, 0, shown.stderr)
        self.assertRegex(shown.stdout, r"The design's own files were last committed at \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ")
        self.assertIn("They have no uncommitted edits.", shown.stdout)
        self.assertRegex(shown.stdout, r"(?m)^clearance +release +pass")
        with TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            tree = Path(folder) / "tree"
            git(self.root, "worktree", "add", "-q", "--detach", str(tree))
            try:
                fresh = fixture.judge(tree, "1.0", "--log").stdout
                self.assertEqual(fresh, shown.stdout, "a fresh checkout shows the same times")
                self.edit_in(tree, RELEASE + "/design.json")
                edited = fixture.judge(tree, "1.0", "--log").stdout
                self.assertIn("They have uncommitted edits: design.json", edited)
            finally:
                git(self.root, "worktree", "remove", "--force", str(tree))
        git(self.root, "reset", "-q", "--hard", "HEAD~1")

    def edit_in(self, root, name):
        data = get(root, name)
        data["frame"] += " "
        put(root, name, data)


class WeightLimits(Judge):
    def test_the_shared_cases_are_read_the_same_way(self):
        """The file belongs to the game rules' reader; both sides are tested against it, unchanged."""
        from kernel_layout import limits
        cases = json.loads((fixture.PLUGIN / "test/fixtures/weight-limits-cases.json").read_text(encoding="utf-8"))

        def problems(listed):
            found = []
            limits.weight_limits({"weightLimits": listed}, found)
            return found
        for case in cases["valid"]:
            self.assertEqual(problems(case["weightLimits"]), [], case["name"])
        for case in cases["refused"]:
            self.assertTrue(problems(case["weightLimits"]), case["name"])
        for case in cases["conversions"]:
            self.assertAlmostEqual(limits.kilograms(case["limit"]), case["kg"], places=12)
        one = dict(name="inspection", limit={"value": 100, "unit": "lb"}, excludesRoles=["bumper", "bumper"], factId="robot-mass")
        self.assertEqual(problems([one]), [], "a role repeated within one list is accepted")
        self.assertTrue(problems([dict(one, limit={"value": True, "unit": "lb"})]), "JSON true is not the number 1")
        self.assertIsNone(limits.weight_limits({}, []), "an absent key is not an empty list")


class OneRunAtATime(Judge):
    def test_a_second_run_on_the_same_release_is_refused_while_one_is_running(self):
        from kernel_layout import progress
        (self.root / RELEASE / "results").mkdir()
        held = progress.Lock(self.root / RELEASE / "results")
        try:
            run = fixture.judge(self.root, "1.0", "--only", "weight")
            self.assertEqual(run.returncode, 2)
            self.assertIn("already being judged", run.stderr)
            self.assertIn("--where", run.stderr)
        finally:
            held.release()
        self.assertEqual(fixture.judge(self.root, "1.0", "--only", "weight").returncode, 0)
        # The progress file and the lock are the only files of results/ Git does not keep.
        names = git(self.root, "status", "--porcelain", "-uall").splitlines()
        self.assertFalse([n for n in names if "progress.json" in n or "lock" in n], names)


class Gate(Judge):
    def test_the_gate_still_refuses_every_design_until_it_is_rebuilt_on_the_judge(self):
        """The stage gate, staging and publication are the next package. A design that passes everything is not marked effective meanwhile."""
        self.assertEqual(self.judge()["result"], "pass")
        site = "docs/preliminary-design/"
        put(self.root, site + "releases.json", {"releases": ["1.0"], "current": "1.0", "designs": {"1": {"name": "Turning carrier"}}, "designStatus": {"1.0": "in-progress"}})
        put(self.root, site + "releases/1.0/release.json", {"check": {"project": RELEASE}})
        commit(self.root, "Invented publication")
        try:
            before = snapshot(self.root)
            plugin = fixture.PLUGIN / "scripts"
            gate = subprocess.run(["node", str(plugin / "stage-gate.mjs"), "preliminary", ".", "--release", "1.0"], cwd=self.root, capture_output=True, text=True)
            self.assertEqual(gate.returncode, 1, gate.stdout)
            status = subprocess.run([sys.executable, "-B", str(plugin / "stage_preliminary_review.py"), "--set-status", "1.0", "effective"], cwd=self.root, capture_output=True, text=True)
            self.assertEqual(status.returncode, 1, status.stdout)
            self.assertEqual(snapshot(self.root), before, "no status is set and no gate.json is written")
        finally:
            git(self.root, "reset", "-q", "--hard", "HEAD~1")


if __name__ == "__main__":
    unittest.main()
