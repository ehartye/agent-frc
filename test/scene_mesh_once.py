"""Tessellate each body once: a case's start pose lives in its frame matrices, and the drawn positions do not change."""
import gzip
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS
from mechanical_motion import evaluate, transforms
import package_view
from package_view import capture, scene_payload


def posed_capture(case, scene):
    """The earlier capture, kept as the reference: tessellate every solid again in each case's start pose."""
    from OCP.gp import gp_Trsf
    from package_mesh import surface_mesh
    bodies = {}
    for name, solid in sorted(scene.items()):
        matrices = []
        moves = case["moves"].get(name, [])
        for i in range(25 if moves else 1):
            combined = gp_Trsf()
            for operation in transforms(moves, i / 24):
                combined.PreMultiply(operation)
            matrices.append([combined.Value(r, c) for r in (1, 2, 3) for c in (1, 2, 3, 4)])
        bodies[name] = dict(**surface_mesh(solid), matrices=matrices)
    return dict(id=case["id"], stage=case["stage"], bodies=bodies)


def world(payload, case, name, frame):
    """The drawn points of one body at one frame, as the stock page computes them."""
    body = case["bodies"][name]
    m = body["matrices"][min(frame, len(body["matrices"]) - 1)]
    return [tuple(m[4 * r] * v[0] + m[4 * r + 1] * v[1] + m[4 * r + 2] * v[2] + m[4 * r + 3] for r in range(3))
            for v in payload["meshes"][body["mesh"]]["v"]]


class SceneMeshOnce(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        cls.study = json.loads((cls.root.parent / cls.plan["motion"]["file"]).read_text())
        cls.before, cls.after, cache = [], [], {}
        def both(case, scene):
            cls.before.append(posed_capture(case, scene))
            cls.after.append(capture(case, scene, cache))
        evaluate(cls.root.parent, cls.study, package_scene=both)
        cls.old, cls.new = scene_payload(cls.before), scene_payload(cls.after)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_the_example_poses_bodies_at_the_start_of_some_cases(self):
        self.assertTrue(any(case.get("initialPose") for case in self.study["cases"]))

    def test_every_body_is_drawn_where_it_was(self):
        for old, new in zip(self.old["cases"], self.new["cases"]):
            self.assertEqual((old["id"], sorted(old["bodies"])), (new["id"], sorted(new["bodies"])))
            for name in old["bodies"]:
                frames = max(len(old["bodies"][name]["matrices"]), len(new["bodies"][name]["matrices"]))
                for frame in sorted({0, frames // 2, frames - 1}):
                    a, b = world(self.old, old, name, frame), world(self.new, new, name, frame)
                    self.assertEqual(len(a), len(b), (old["id"], name))
                    worst = max(max(abs(x - y) for x, y in zip(p, q)) for p, q in zip(a, b))
                    self.assertLess(worst, 1e-3, (old["id"], name, frame))

    def test_each_body_keeps_one_mesh_across_cases(self):
        used = {}
        for case in self.new["cases"]:
            for name, body in case["bodies"].items():
                used.setdefault(name, set()).add(body["mesh"])
        self.assertEqual({name: len(indexes) for name, indexes in used.items() if len(indexes) != 1}, {})
        self.assertLessEqual(len(self.new["meshes"]), len(used))
        # The posed reference stored a body again for every distinct start pose.
        self.assertLess(len(self.new["meshes"]), len(self.old["meshes"]))
        size = lambda payload: len(json.dumps(payload, separators=(",", ":")))
        self.assertLess(size(self.new), size(self.old))

    def test_a_body_that_only_starts_displaced_carries_its_pose_as_one_matrix(self):
        identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
        cases = {case["id"]: case for case in self.study["cases"]}
        seen = 0
        for case in self.new["cases"]:
            source = cases[case["id"]]
            for name, body in case["bodies"].items():
                posed, moving = bool(source.get("initialPose", {}).get(name)), bool(source["moves"].get(name))
                self.assertEqual(len(body["matrices"]), 25 if moving else 1, (case["id"], name))
                if not posed and not moving:
                    self.assertEqual(body["matrices"], [identity], (case["id"], name))
                if posed and not moving:
                    self.assertNotEqual(body["matrices"], [identity], (case["id"], name))
                    seen += 1
        self.assertGreater(seen, 0)

    def test_a_shared_cache_tessellates_each_body_once(self):
        import package_mesh
        calls, cache = [], {}
        real = package_mesh.surface_mesh
        def counted(solid):
            calls.append(1)
            return real(solid)
        with patch.object(package_mesh, "surface_mesh", counted):
            evaluate(self.root.parent, self.study, package_scene=lambda case, scene: capture(case, scene, cache))
        bodies = {name for case in self.new["cases"] for name in case["bodies"]}
        self.assertEqual(len(calls), len(bodies))

    def test_another_solid_under_the_same_id_is_tessellated_again(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.TopLoc import TopLoc_Location
        from OCP.gp import gp_Pnt, gp_Trsf, gp_Vec
        case = dict(id="invented", stage="operating", moves={}, initialPose={"block": [dict(kind="translation", travelMm=[5, 0, 0])]})
        small = BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), gp_Pnt(10, 10, 10)).Shape()
        shift = gp_Trsf()
        shift.SetTranslation(gp_Vec(5, 0, 0))
        cache = {}
        first = capture(case, {"block": small.Moved(TopLoc_Location(shift))}, cache)
        self.assertEqual(first["bodies"]["block"]["matrices"], [[1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0]])
        self.assertEqual(max(v[0] for v in first["bodies"]["block"]["vertices"]), 10, "the mesh is in the placed pose, before the start pose")
        large = BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), gp_Pnt(30, 10, 10)).Shape()
        second = capture(dict(case, initialPose={}), {"block": large}, cache)
        self.assertEqual(max(v[0] for v in second["bodies"]["block"]["vertices"]), 30)
        # The same solid placed elsewhere without a declared start pose is a different placed pose.
        third = capture(dict(case, initialPose={}), {"block": large.Moved(TopLoc_Location(shift))}, cache)
        self.assertEqual(max(v[0] for v in third["bodies"]["block"]["vertices"]), 35)

    def test_the_generated_scene_still_validates_and_the_check_still_passes(self):
        from preliminary_design import review
        (self.root / package_view.SCENE_FILE).unlink()
        result = review(self.root.parent, self.root / "layout.json", write_view=True)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        scene = json.loads(gzip.decompress((self.root / package_view.SCENE_FILE).read_bytes()))
        bodies = {name for case in scene["cases"] for name in case["bodies"]}
        self.assertLessEqual(len(scene["meshes"]), len(bodies))


if __name__ == "__main__":
    unittest.main()
