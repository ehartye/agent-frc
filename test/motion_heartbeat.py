"""Show life inside a long motion case and warn when a rotation cannot change a body's occupied volume."""
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, pin, write
from mechanical_motion import evaluate
from checker_progress_failfast import PROGRESS

HEARTBEAT = re.compile(r"^\[heartbeat\] motion (\d+)/(\d+) (\S+) pairs=(\d+)/(\d+) pair=(\S+)\|(\S+) depth=(\d+) "
                       r"samples=(\d+) case=\d+\.\d\ds total=\d+\.\d\ds$")


def solids_step(path, solids):
    """Write invented named boxes and cylinders in millimeters."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_AsIs
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_DocumentTool
    from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
    doc = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    table = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    for name, spec in solids.items():
        if "box" in spec:
            solid = BRepPrimAPI_MakeBox(gp_Pnt(*spec["box"][0]), gp_Pnt(*spec["box"][1])).Shape()
        else:
            base, axis, radius, height = spec["cylinder"]
            solid = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*base), gp_Dir(*axis)), radius, height).Shape()
        for lo, hi in spec.get("cut", []):
            solid = BRepAlgoAPI_Cut(solid, BRepPrimAPI_MakeBox(gp_Pnt(*lo), gp_Pnt(*hi)).Shape()).Shape()
        TDataStd_Name.Set_s(table.AddShape(solid, False), TCollection_ExtendedString(name))
    writer = STEPCAFControl_Writer()
    writer.Transfer(doc, STEPControl_AsIs)
    writer.Write(str(path))


def turn(origin, degrees, axis=(0, 0, 1)):
    return [dict(kind="rotation", axis=list(axis), originMm=list(origin), travelDeg=degrees)]


class MotionHeartbeat(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        # An invented roller and square post, each beside a wall close enough to need interval refinement.
        solids_step(cls.root / "scene.step", dict(
            wall=dict(box=([30, -40, 0], [34, 40, 40])),
            roller=dict(cylinder=([0, 0, 0], [0, 0, 1], 20, 30)),
            post=dict(box=([-80, -10, 0], [-60, 10, 30])),
            guard=dict(box=([-55, -40, 0], [-51, 40, 40])),
            # A roller with a square through-bore is not a solid of revolution, although its rim is.
            hub=dict(cylinder=([0, 100, 0], [0, 0, 1], 20, 30), cut=[([-5, 95, -1], [5, 105, 31])])))
        cls.cases = dict(
            spin=dict(id="spin", basis="Invented roller turning on its own axis", minGapMm=1, moves={"roller": turn([0, 0, 0], 90)}),
            orbit=dict(id="orbit", basis="Invented roller swinging about an offset pivot", minGapMm=1,
                       moves={"roller": turn([0, -5, 0], 40)}),
            bored=dict(id="bored", basis="Invented square-bored roller turning on its axis", minGapMm=1,
                       moves={"hub": turn([0, 100, 0], 90)}),
            still=dict(id="still", basis="Invented post with a zero rotation", minGapMm=1, moves={"post": turn([-70, 0, 0], 0)}),
            carried=dict(id="carried", basis="Invented roller turning and then rising", minGapMm=1,
                         moves={"roller": [*turn([0, 0, 0], 90), dict(kind="translation", travelMm=[0, 0, 5])]}),
            again=dict(id="again", basis="Invented repeat of the roller turn", minGapMm=1, moves={"roller": turn([0, 0, 0], 90)}),
            quarter=dict(id="quarter", basis="Invented square post turning a quarter turn on its center", minGapMm=1,
                         moves={"post": turn([-70, 0, 0], 90)}))

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def study(self, name, *cases, **extra):
        return write(self.root, name, dict(schema="agent-frc/mechanical-motion@1", step=pin(self.root, "scene.step"),
                                           cases=[self.cases[c] for c in cases], **extra))["file"]

    def run_study(self, file, **options):
        lines = []
        result = evaluate(self.root, json.loads((self.root / file).read_text()), progress=lines.append, **options)
        return result, lines

    def test_heartbeat_reports_the_active_pair_without_changing_the_result(self):
        file = self.study("orbit.json", "orbit")
        silent = evaluate(self.root, json.loads((self.root / file).read_text()))
        result, lines = self.run_study(file, heartbeat_seconds=0)
        self.assertEqual(json.dumps(result), json.dumps(silent))
        beats = [HEARTBEAT.match(l).groups() for l in lines if l.startswith("[heartbeat] ")]
        self.assertTrue(beats)
        self.assertTrue(all(b[:3] == ("1", "1", "orbit") and b[4] == "10" for b in beats))
        self.assertIn(("roller", "wall"), {(b[5], b[6]) for b in beats})
        refined = [b for b in beats if (b[5], b[6]) == ("roller", "wall")]
        self.assertGreater(max(int(b[8]) for b in refined), 2)
        self.assertEqual(sorted(int(b[3]) for b in beats), [int(b[3]) for b in beats])
        self.assertTrue(PROGRESS.match(lines[-1]))

    def test_default_interval_is_silent_on_a_quick_case(self):
        _, lines = self.run_study(self.study("quick.json", "orbit"))
        self.assertEqual([l for l in lines if l.startswith("[heartbeat]")], [])
        self.assertEqual(len(lines), 1)

    def test_cli_heartbeat_is_stderr_only(self):
        file = self.study("cli.json", "orbit")
        def run(*flags):
            return subprocess.run([sys.executable, "-B", str(SCRIPTS / "mechanical_motion.py"), str(self.root), file, *flags],
                                  capture_output=True, text=True)
        loud, quiet = run("--heartbeat", "0"), run("--quiet", "--heartbeat", "0")
        self.assertEqual(loud.returncode, 0, loud.stderr)
        self.assertEqual(loud.stdout, quiet.stdout)
        self.assertEqual(quiet.stderr, "")
        self.assertTrue(any(HEARTBEAT.match(l) for l in loud.stderr.splitlines()))
        self.assertNotEqual(run("--heartbeat", "-1").returncode, 0)

    def test_package_check_passes_the_interval_through(self):
        layout = self.root / "layout"
        plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](layout)
        write(layout, "trial.json", plan)
        def run(*flags):
            return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(self.root), "layout/trial.json", *flags],
                                  capture_output=True, text=True)
        loud, quiet = run("--heartbeat", "0"), run("--quiet")
        self.assertEqual(loud.returncode, 0, loud.stderr)
        self.assertEqual(loud.stdout, quiet.stdout)
        self.assertTrue(any(HEARTBEAT.match(l) for l in loud.stderr.splitlines()))
        self.assertEqual([l for l in loud.stderr.splitlines() if l.startswith("[heartbeat]") and not HEARTBEAT.match(l)], [])

    def test_rotation_of_a_solid_of_revolution_about_its_own_axis_warns(self):
        file = self.study("spin.json", "spin", "orbit", "quarter")
        silent = evaluate(self.root, json.loads((self.root / file).read_text()))
        result, lines = self.run_study(file)
        self.assertEqual(json.dumps(result), json.dumps(silent))
        warnings = [l for l in lines if l.startswith("[motion] warning ")]
        self.assertEqual(len(warnings), 1, warnings)
        self.assertTrue(warnings[0].startswith("[motion] warning spin roller: "), warnings[0])
        self.assertIn("cannot change its swept volume", warnings[0])
        self.assertLess(lines.index(warnings[0]), next(i for i, l in enumerate(lines) if PROGRESS.match(l)))
        self.assertEqual(len([l for l in lines if PROGRESS.match(l)]), 3)

    def test_declared_swept_envelope_must_be_invariant_under_its_rotation(self):
        file = self.study("declared.json", "quarter", "spin", sweptEnvelopes=["post", "roller"])
        result, lines = self.run_study(file)
        plain = evaluate(self.root, json.loads((self.root / self.study("plain.json", "quarter", "spin")).read_text()))
        self.assertEqual(json.dumps(result["cases"]), json.dumps(plain["cases"]))
        warnings = [l for l in lines if l.startswith("[motion] warning ")]
        self.assertEqual(len(warnings), 2, warnings)
        self.assertTrue(warnings[0].startswith("[motion] warning quarter post: "), warnings[0])
        self.assertIn("declared full swept envelope", warnings[0])
        self.assertTrue(warnings[1].startswith("[motion] warning spin roller: "))
        with self.assertRaises(ValueError):
            evaluate(self.root, dict(json.loads((self.root / file).read_text()), sweptEnvelopes="post"))

    def test_warnings_judge_only_what_they_can_and_say_it_once(self):
        file = self.study("edges.json", "bored", "still", "carried", "spin", "again", sweptEnvelopes=["post", "absent"])
        _, lines = self.run_study(file)
        warnings = [l for l in lines if l.startswith("[motion] warning ")]
        # The bored hub, the zero rotation and the turn that also rises draw nothing; the repeated turn is told once.
        self.assertEqual(len(warnings), 2, warnings)
        self.assertTrue(warnings[0].startswith("[motion] warning spin roller: "), warnings[0])
        self.assertEqual(warnings[1], "[motion] warning sweptEnvelopes names absent, which no case contains")

    def test_replaced_bodies_are_judged_and_scene_shapes_stay_unmeshed(self):
        from OCP.BRep import BRep_Tool
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Copy
        from OCP.TopAbs import TopAbs_FACE
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopLoc import TopLoc_Location
        from OCP.TopoDS import TopoDS
        seen = {}
        def replace(case, scene):
            scene["roller"] = BRepBuilderAPI_Copy(scene["roller"]).Shape()
            seen.update(scene)
        lines = []
        study = json.loads((self.root / self.study("replaced.json", "spin", "again")).read_text())
        evaluate(self.root, study, progress=lines.append, package_scene=replace)
        self.assertEqual(len([l for l in lines if l.startswith("[motion] warning ")]), 2)
        explorer = TopExp_Explorer(seen["roller"], TopAbs_FACE)
        while explorer.More():
            face = (getattr(TopoDS, "Face_s", None) or TopoDS.Face)(explorer.Current())
            self.assertIsNone(BRep_Tool.Triangulation_s(face, TopLoc_Location()))
            explorer.Next()


if __name__ == "__main__":
    unittest.main()
