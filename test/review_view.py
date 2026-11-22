"""Review regions, fits and the compressed scene of the preliminary design player."""
import gzip
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from package_view import (CONTROL_ID, PAGE, component_inspector, field_interactions, first_unmet, motion_evidence,  # noqa: E402
                          parked_assembly, review_header, scene_payload)

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
    def test_parked_assembly_lists_positive_and_unresolved_pairs_at_the_step_pose(self):
        cases = study()
        observed = [dict(case="turn", pairs=[dict(pair=["post", "base"], status="fail", witness=dict(t=0, gapMm=0, volumeMm3=12.5)),
                                             dict(pair=["arm", "post"], status="fail", witness=dict(t=.5, gapMm=0, volumeMm3=40)),
                                             dict(pair=["base", "rail"], status="open", witness=[0, 1])]),
                    dict(case="hold", pairs=[dict(pair=["base", "post"], status="fail", witness=dict(t=0, gapMm=0, volumeMm3=13.0))])]
        parked = parked_assembly(observed, cases, {"arm", "base", "post", "rail"})
        self.assertEqual(parked["screenedPairs"], 3, "only pairs examined with both bodies still are screened")
        self.assertEqual(parked["positive"], [dict(pair=["base", "post"], volumeMm3=13.0)], "a moving pair is not a parked finding")
        self.assertEqual(parked["unresolved"], [["base", "rail"]])

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

    def test_inspector_fields_come_from_presentation_and_budgets(self):
        layout = plan(components={
            "arm": dict(name="Pivot arm", category="mechanism", subsystem="Transfer", material="Aluminum", volumeType="material",
                        purpose="Carry the article.", rationale="One pivot reaches both stations."),
            "post": dict(rationale="Supports the gate.", material="Steel")})
        layout["groups"] = {"arm group": dict(role="mechanism", members=["arm"]), "frame": dict(role="structure", members=["post", "base"]),
                            "article": dict(role="payload", members=["piece"])}
        scenes = [dict(id="turn", stage="operating", bodies={"arm": box([0, 0, 0], [1, 1, 1]), "post": box([5, 0, 0], [6, 1, 1])})]
        lines = [dict(id="mechanisms", members=["arm", "post"], kg=[1, 1.2], basis="Invented subtotal")]
        rows = component_inspector(layout, scenes, study(), lines, {"pivot motor": ["arm"]}, set())
        arm = rows["arm"]
        self.assertEqual((arm["name"], arm["category"], arm["subsystem"], arm["motionGroup"]), ("Pivot arm", "mechanism", "Transfer", "arm group"))
        self.assertEqual((arm["material"], arm["volumeMm3"], arm["volumeType"]), ("Aluminum", 1.0, "material"))
        self.assertEqual(arm["mass"][0]["sharedWith"], ["post"])
        self.assertIn("unallocated until the line is split", arm["mass"][0]["note"])
        self.assertEqual((arm["loads"], arm["movesIn"], arm["missing"]), (["pivot motor"], ["turn", "hold"], []))
        post = rows["post"]
        self.assertEqual(post["motionGroup"], "frame")
        self.assertEqual(post["movesIn"], [])
        self.assertEqual(set(post["missing"]), {"purpose", "subsystem", "volume type"}, "missing purpose is reported, not hidden")
        self.assertIn("mass line", rows["base"]["missing"])
        self.assertIsNone(rows["base"]["volumeMm3"])
        self.assertIn("volume", rows["base"]["missing"])
        gauge = dict(layout, presentation={"components": {"base": dict(volumeType="gauge")}})
        self.assertIn("mass line", component_inspector(gauge, scenes, study(), lines)["base"]["missing"],
                      "a gauge without a mass line is a gap, as in the budget")
        drift = [dict(scenes[0], bodies={**scenes[0]["bodies"], "arm": dict(scenes[0]["bodies"]["arm"], volumeMm3=1.0000004)})]
        self.assertEqual(component_inspector(layout, drift, study(), lines)["arm"]["volumeMm3"], 1.0, "volume is rounded like the geometry")
        late = [dict(id="park", stage="park", bodies={"arm": dict(box([0, 0, 0], [1, 1, 1]), volumeMm3=None)}), scenes[0]]
        self.assertEqual(component_inspector(layout, late, study(), lines)["arm"]["volumeMm3"], 1.0)
        self.assertIn("payload", rows["piece"]["massExcluded"])
        self.assertNotIn("mass line", rows["piece"]["missing"])
        with self.assertRaises(ValueError):
            component_inspector(dict(layout, presentation={"components": {"arm": dict(volumeType="solid-ish")}}), scenes, study())

    def test_scene_stores_each_mesh_once(self):
        arm = box([0, 0, 0], [1, 1, 1])
        scene = scene_payload([dict(id=k, stage="operating", bodies={"arm": arm, "twin": dict(arm)}) for k in ("a", "b")])
        self.assertEqual(len(scene["meshes"]), 1)
        self.assertEqual(set(scene["meshes"][0]), {"v", "f"})
        self.assertEqual({b["mesh"] for c in scene["cases"] for b in c["bodies"].values()}, {0})


class CompressedScene(unittest.TestCase):
    def test_receipt_pins_the_served_scene_and_refuses_changed_content(self):
        from preliminary_design import review
        build = Path(__file__).resolve().parents[1] / "examples/preliminary-design/create.py"
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "layout"
            plan = runpy.run_path(str(build))["create"](folder, release_id="layout-test")
            file = folder / "layout.json"
            good = review(folder.parent, file)
            self.assertEqual(good["status"], "layout-checked")
            self.assertEqual(good["decision"], dict(status="layout-checked", firstUnmet=None))
            self.assertEqual(good["parked"], dict(screenedPairs=21, positive=[], unresolved=[]), "pairs examined with both bodies still in some case")
            scene = good["view"]["scene"]
            served = folder.parent / scene["file"]
            self.assertEqual(scene["file"], "layout/review-scene.json.gz")
            self.assertEqual(hashlib.sha256(served.read_bytes()).hexdigest(), scene["sha256"])
            content = gzip.decompress(served.read_bytes())
            self.assertEqual((hashlib.sha256(content).hexdigest(), len(content)), (scene["contentSha256"], scene["bytes"]))
            self.assertEqual((folder.parent / plan["view"]).read_bytes(), PAGE.read_bytes().replace(b"\r\n", b"\n"),
                             "the page is the stock template; every value comes from the scene")
            data = json.loads(content)
            self.assertEqual(data["schema"], "agent-frc/preliminary-review-scene@1")
            control = next(c for c in data["cases"] if c["id"] == CONTROL_ID)
            self.assertEqual((control["kind"], control["status"]), ("displaced control", "fail"), "the displaced control is playable")
            self.assertEqual(data["architecture"], plan["presentation"]["architecture"])
            self.assertEqual([r["kind"] for r in data["motionEvidence"]].count("displaced control"), 1)
            self.assertEqual(data["fieldInteractions"][0]["title"], "Synthetic release-lane interaction")
            replay = data["replays"][0]
            self.assertEqual((replay["id"], len(replay["time"]), replay["bodies"]["lane"]["group"], replay["tubes"][0]["name"]),
                             ("release-lane-run", 61, None, "Supply hose"), "the recorded run joins the scene as a replay, not a case")
            self.assertNotIn("release-lane-run", [c["id"] for c in data["cases"]])
            self.assertEqual(data["mass"]["runningAdditions"], [dict(name="carried sample", kg=[0.2, 0.5], members=["sample"])])
            self.assertEqual(data["required"], [dict(role="propulsion", ids=["drive"]), dict(role="supply", ids=["battery"])])
            head = data["bodies"]["head"]
            self.assertEqual((head["subsystem"], head["motionGroup"], head["missing"]), ("Carrier", "carrier", []))
            self.assertIn("Pivot on the mount block", head["support"])
            turn = next(c for c in data["cases"] if c["id"] == "loaded-turn")
            self.assertEqual((len(turn["time"]), turn["measure"][-1]), (25, "Head at 90° of the turn"))
            duty = data["power"][0]
            self.assertEqual({l["name"]: l["members"] for l in duty["lines"]}["carrier"], ["head"])
            checked = subprocess.run(["node", str(Path(__file__).resolve().parents[1] / "scripts/review-scene.mjs"), "validate",
                                      str(served), "--receipt", str(folder / "receipt.json")], capture_output=True, text=True)
            # The receipt on disk is the create() run's; this review() run must produce the same scene.
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            self.assertEqual(json.loads(checked.stdout)["errors"], [])
            original = served.read_bytes()
            served.write_bytes(gzip.compress(content, compresslevel=1, mtime=7))
            recompressed = review(folder.parent, file)
            self.assertTrue(recompressed["view"]["verified"], "the same content under another compression still verifies")
            self.assertNotEqual(recompressed["view"]["scene"]["sha256"], scene["sha256"], "the digest follows the served bytes")
            served.write_bytes(gzip.compress(content.replace(b'"stage"', b'"stagE"', 1), mtime=0))
            tampered = review(folder.parent, file)
            self.assertFalse(tampered["view"]["verified"])
            self.assertEqual(tampered["status"], "provisional")
            served.write_bytes(original[:-9] + b"corrupted")
            self.assertFalse(review(folder.parent, file)["view"]["verified"], "a corrupt stream fails verification instead of crashing")
            served.unlink()
            self.assertFalse(review(folder.parent, file)["view"]["verified"])
            review(folder.parent, file, write_view=True)
            self.assertEqual(served.read_bytes(), original, "a missing scene regenerates byte for byte")


if __name__ == "__main__":
    unittest.main()
