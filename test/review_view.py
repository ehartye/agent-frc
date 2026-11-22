"""Review regions, fits and the compressed scene of the preliminary design player."""
import gzip
import hashlib
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from package_view import (CONTROL_ID, field_interactions, first_unmet, fit_views, motion_evidence,  # noqa: E402
                          review_header, scene_payload)

IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]


def box(lo, hi):
    return dict(vertices=[[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])],
                triangles=[[0, 1, 2]], volumeMm3=1.0, matrices=[IDENTITY])


def study():
    return [dict(id="turn", stage="operating", basis="Invented turn", minGapMm=1, moves={"arm": []}),
            dict(id="hold", stage="park", basis="Invented disabled hold", minGapMm=1, moves={"arm": []},
                 initialPose={"arm": []})]


def plan(**presentation):
    return dict(issue="synthetic-a", cycle=["turn", "hold"], datum=dict(name="Invented datum"),
                stages={"turn": dict(movingGroups=["arm group"], allowanceBasis="Invented reserve"),
                        "hold": dict(movingGroups=["arm group"], allowanceBasis="Invented reserve")},
                control=dict(case="turn", displaced="post", moving="arm", offsetMm=[0, -5, 0], basis="Move the post into the arc"),
                narrativeReview=dict(source=dict(file="n.md", sha256="a" * 64), objectives=[
                    dict(objective="Turn the article", disposition="represented", basis="turn"),
                    dict(objective="Climb", disposition="out-of-scope", basis="Not this layout")]),
                presentation=presentation)


PASS = [dict(case="turn", status="pass", pairs=[
            dict(pair=["base", "post"], status="pass", witness=dict(t=0, gapMm=1.0, volumeMm3=0)),
            dict(pair=["arm", "post"], status="pass", lowerBoundMm=4.2, samples=9)]),
        dict(case="hold", status="pass", pairs=[dict(pair=["arm", "base"], status="pass", witness=dict(t=0, gapMm=3.0, volumeMm3=0))])]
HIT = dict(pair=["arm", "post"], status="fail", witness=dict(t=.5, gapMm=0.0, volumeMm3=52.0))


class Regions(unittest.TestCase):
    def test_default_fit_frames_the_robot_on_the_floor_and_the_field_separately(self):
        scenes = [dict(id="turn", stage="operating", bodies={"arm": box([0, 0, 10], [10, 10, 20]),
                                                             "target": box([500, 0, 0], [520, 20, 40])})]
        fits = fit_views(scenes, {"target"})
        self.assertEqual(fits["robot"]["center"], [5, 5, 10], "the floor at Z = 0 is part of the robot fit")
        self.assertLess(fits["robot"]["extent"], 30)
        self.assertGreater(fits["field"]["extent"], 500)
        self.assertIsNone(fit_views([dict(scenes[0], bodies={"arm": scenes[0]["bodies"]["arm"]})], set())["field"])
        parked = dict(id="park", stage="park", bodies={"arm": box([0, 0, 10], [10, 10, 20])})
        later = fit_views([parked, scenes[0]], {"target"})
        self.assertEqual(later["robot"]["center"], [5, 5, 10])
        self.assertGreater(later["field"]["extent"], 500, "a fixture placed only in a later case still has a field fit")

    def test_motion_rows_include_a_playable_displaced_control_and_uncovered_cases(self):
        layout = plan(caseKinds={"hold": "inhibited"}, uncoveredCases=[dict(id="late-close", condition="Gate closes mid-turn", reason="Not modeled")])
        control = dict(case="turn", displaced="post", offsetMm=[0, -5, 0], witness=HIT)
        rows = motion_evidence(layout, study(), PASS, control, dict(case=CONTROL_ID, status="fail", pairs=[HIT]))
        by = {r["case"]: r for r in rows}
        self.assertEqual([r["case"] for r in rows][:3], ["turn", "hold", CONTROL_ID])
        turn = by["turn"]
        self.assertEqual(turn["limitingPair"], ["arm", "post"], "a stationary pair does not set the path limit")
        self.assertIsNone(turn["limitingTime"])
        self.assertEqual((turn["allowanceMm"], turn["allowanceBasis"], turn["groups"]), (1, "Invented reserve", ["arm group"]))
        self.assertIn("Interval bisection", turn["method"])
        self.assertEqual(turn["start"], "Installed STEP pose")
        self.assertEqual(by["hold"]["kind"], "inhibited")
        c = by[CONTROL_ID]
        self.assertEqual((c["kind"], c["result"], c["limitingTime"], c["playable"]), ("displaced control", "rejected as expected", .5, True))
        self.assertIn("post displaced [0, -5, 0] mm", c["start"])
        self.assertEqual(by["late-close"]["kind"], "uncovered")
        self.assertEqual(by["objective: Climb"]["result"], "out-of-scope")
        missed = motion_evidence(layout, study(), PASS, dict(control, witness=None), dict(case=CONTROL_ID, status="pass", pairs=[]))
        self.assertEqual(missed[2]["result"], "not rejected")
        with self.assertRaises(ValueError):
            motion_evidence(plan(caseKinds={"turn": "hopeful"}), study(), PASS)
        self.assertEqual(motion_evidence(plan(), study(), PASS, None, None)[2]["result"], "skipped")

    def test_header_reports_the_decision_and_first_unmet_requirement(self):
        layout = plan(architecture="Invented pivot arm")
        clear = dict(cases=PASS, budgets=dict(massStatus="pass", electricalCases=[]), control=dict(witness=HIT), missingInputs=[])
        header = review_header(layout, clear)
        self.assertEqual((header["architecture"], header["issue"], header["datum"]), ("Invented pivot arm", "synthetic-a", "Invented datum"))
        self.assertEqual(header["narrative"]["file"], "n.md")
        self.assertIn("Millimetres", header["units"])
        self.assertEqual((header["status"], header["firstUnmet"]), ("pending receipt", None))
        failing = dict(clear, cases=[dict(case="turn", status="fail", pairs=[HIT])])
        self.assertEqual(review_header(layout, failing)["status"], "blocked")
        self.assertEqual(first_unmet(failing)["text"], "turn: arm and post overlap 52.0 mm³ at t 0.500")
        weak = dict(clear, budgets=dict(massStatus="pass", electricalCases=[dict(case="turn-weak", status="fail", loadedBusV=[8.8, 9], requiredMinV=9.2, marginV=-.4)]))
        self.assertEqual(first_unmet(weak)["kind"], "voltage")
        self.assertIn("8.80 V against 9.20 V", first_unmet(weak)["text"])
        self.assertEqual(first_unmet(dict(clear, missingInputs=["Missing component rationale: arm"]))["text"], "Missing component rationale: arm")
        self.assertEqual(first_unmet(dict(clear, control=dict(displaced="post", witness=None)))["kind"], "control")

    def test_field_interactions_render_season_owned_players(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "trial.json").write_text("{}")
            pin = dict(file="trial.json", sha256=hashlib.sha256(b"{}").hexdigest())
            layout = plan(fieldInteractions=[dict(title="Invented lane", href="../../lab/lane.html", objective="Turn the article", evidence=pin, embed=True),
                                             dict(title="Invented physics", href="https://example.org/sim", objective="Unlisted", evidence="Measured trial 3")])
            rows = field_interactions(root, layout)
            self.assertEqual([(r["title"], r["embed"], r["objectiveKnown"]) for r in rows],
                             [("Invented lane", True, True), ("Invented physics", False, False)])
            self.assertEqual(rows[0]["evidence"], pin)
            self.assertEqual(field_interactions(root, plan()), [])
            for href in ("javascript:alert(1)", "\tjavascript:alert(1)", "java\nscript:alert(1)", " ../x.html",
                         "../a\\b.html", "/absolute", "//host/x", "http://insecure", "https:no-host", "data:text/html,x"):
                with self.assertRaises(ValueError, msg=href):
                    field_interactions(root, plan(fieldInteractions=[dict(title="x", href=href, objective="o", evidence="e")]))
            (root / "trial.json").write_text("changed")
            with self.assertRaises(ValueError):
                field_interactions(root, layout)

    def test_scene_stores_each_mesh_once(self):
        arm = box([0, 0, 0], [1, 1, 1])
        scene = scene_payload([dict(id=k, stage="operating", bodies={"arm": arm, "twin": dict(arm)}) for k in ("a", "b")])
        self.assertEqual(len(scene["meshes"]), 1)
        self.assertEqual({b["mesh"] for c in scene["cases"] for b in c["bodies"].values()}, {0})


class CompressedScene(unittest.TestCase):
    def test_receipt_pins_the_served_scene_and_refuses_changed_content(self):
        from preliminary_design import review
        build = Path(__file__).resolve().parents[1] / "examples/preliminary-design/create.py"
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "layout"
            plan = runpy.run_path(str(build))["create"](folder, release_id="layout-test")
            file = folder / "layout.json"
            good = review(folder, file)
            self.assertEqual(good["status"], "layout-checked")
            self.assertEqual(good["decision"], dict(status="layout-checked", firstUnmet=None))
            scene = good["view"]["geometry"]
            served = folder / scene["file"]
            self.assertEqual(scene["file"], "package-motion.geometry.json.gz")
            self.assertEqual(hashlib.sha256(served.read_bytes()).hexdigest(), scene["sha256"])
            content = gzip.decompress(served.read_bytes())
            self.assertEqual(hashlib.sha256(content).hexdigest(), scene["contentSha256"])
            html = (folder / plan["view"]).read_text(encoding="utf-8")
            embedded = json.loads(html.split('id="data">', 1)[1].split("</script>", 1)[0])
            self.assertEqual(embedded["geometry"]["contentSha256"], scene["contentSha256"])
            self.assertNotIn("vertices", json.dumps(embedded), "geometry lives only in the compressed scene")
            self.assertIn(CONTROL_ID, [c["id"] for c in embedded["cases"]], "the displaced control is playable")
            self.assertEqual(embedded["header"]["architecture"], plan["presentation"]["architecture"])
            self.assertEqual([r["kind"] for r in embedded["motionEvidence"]].count("displaced control"), 1)
            self.assertEqual(embedded["fieldInteractions"][0]["title"], "Synthetic release-lane interaction")
            self.assertIsNotNone(embedded["fit"]["robot"])
            original = served.read_bytes()
            served.write_bytes(gzip.compress(content, compresslevel=1, mtime=7))
            recompressed = review(folder, file)
            self.assertTrue(recompressed["view"]["verified"], "the same content under another compression still verifies")
            self.assertNotEqual(recompressed["view"]["geometry"]["sha256"], scene["sha256"], "the digest follows the served bytes")
            served.write_bytes(gzip.compress(content.replace(b'"stage"', b'"stagE"', 1), mtime=0))
            tampered = review(folder, file)
            self.assertFalse(tampered["view"]["verified"])
            self.assertEqual(tampered["status"], "provisional")
            served.write_bytes(original[:-9] + b"corrupted")
            self.assertFalse(review(folder, file)["view"]["verified"], "a corrupt stream fails verification instead of crashing")
            served.unlink()
            self.assertFalse(review(folder, file)["view"]["verified"])
            review(folder, file, write_view=True)
            self.assertEqual(served.read_bytes(), original, "a missing scene regenerates byte for byte")


if __name__ == "__main__":
    unittest.main()
