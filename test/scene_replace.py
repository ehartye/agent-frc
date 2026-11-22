"""Replace a stale review scene whole with --write-view, keep the page create-only and advise on partly registered mounts."""
from copy import deepcopy
import gzip
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS, write
import atomic_file


class SceneReplace(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        from package_view import SCENE_FILE
        cls.scene = cls.root / SCENE_FILE
        cls.page = cls.root / cls.plan["view"]
        cls.stock_scene, cls.stock_page = cls.scene.read_bytes(), cls.page.read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        self.scene.write_bytes(self.stock_scene)
        self.page.write_bytes(self.stock_page)

    def review(self, plan=None, **options):
        from preliminary_design import review
        write(self.root, "layout.json", plan or self.plan)
        return review(self.root, self.root / "layout.json", **options)

    def stale(self):
        content = gzip.decompress(self.stock_scene).replace(b'"stage"', b'"stagE"', 1)
        self.scene.write_bytes(gzip.compress(content, mtime=0))
        return self.scene.read_bytes()

    def test_write_view_replaces_a_stale_scene(self):
        self.stale()
        self.assertFalse(self.review()["view"]["verified"], "without --write-view a stale scene is only reported")
        self.assertNotEqual(self.scene.read_bytes(), self.stock_scene)
        result = self.review(write_view=True)
        self.assertTrue(result["view"]["verified"])
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(self.scene.read_bytes(), self.stock_scene)
        self.assertEqual([p.name for p in self.root.iterdir() if p.name.endswith(".tmp")], [])

    def test_a_corrupt_scene_is_replaced_too(self):
        self.scene.write_bytes(self.stock_scene[:-9] + b"corrupted")
        self.assertTrue(self.review(write_view=True)["view"]["verified"])
        self.assertEqual(self.scene.read_bytes(), self.stock_scene)

    def test_a_current_scene_is_left_alone(self):
        # The same content under another compression already verifies; its bytes are what the receipt pins.
        other = gzip.compress(gzip.decompress(self.stock_scene), compresslevel=1, mtime=7)
        self.scene.write_bytes(other)
        with patch("package_view.write_atomic", side_effect=AssertionError("nothing to write")):
            self.assertTrue(self.review(write_view=True)["view"]["verified"])
        self.assertEqual(self.scene.read_bytes(), other)

    def test_an_existing_page_is_never_overwritten(self):
        custom = self.stock_page + b"<!-- an invented project edit -->\n"
        self.page.write_bytes(custom)
        self.stale()
        result = self.review(write_view=True)
        self.assertEqual(self.page.read_bytes(), custom)
        self.assertEqual(self.scene.read_bytes(), self.stock_scene, "the scene is still brought up to date")
        self.assertFalse(result["view"]["verified"], "a page other than the stock page is not credited")

    def test_a_failed_run_leaves_the_previous_scene(self):
        previous = self.stale()
        with patch.object(atomic_file.os, "replace", side_effect=OSError("interrupted")):
            with self.assertRaises(OSError):
                self.review(write_view=True)
        self.assertEqual(self.scene.read_bytes(), previous)
        # A plan error stops the run before the view; nothing is touched.
        with self.assertRaises(ValueError):
            self.review(dict(self.plan, issue=""), write_view=True)
        self.assertEqual(self.scene.read_bytes(), previous)
        self.assertEqual([p.name for p in self.root.iterdir() if p.name.endswith(".tmp")], [])

    def notes(self, plan):
        lines = []
        self.scene.unlink()
        result = self.review(plan, write_view=True, progress=lines.append)
        return result, [l for l in lines if l.startswith("[mounts] note: ")]

    def test_partly_registered_mounts_draw_a_stderr_note_only(self):
        plain, notes = self.notes(self.plan)
        self.assertEqual(notes, [])
        # Two invented members in one mechanism group; only one names its own mount.
        from preliminary_design import mount_notes
        groups = dict(lifts=dict(role="mechanism", members=["left lift", "right lift"]), frame=dict(role="structure", members=["rails"]))
        left = dict(group="lifts", member="left lift", on="rails", pointMm=[0, 0, 0], basis="Invented")
        self.assertEqual(mount_notes(groups, [left]),
                         ["[mounts] note: right lift in lifts has no mount of its own; the group's mounts name only left lift"])
        self.assertEqual(mount_notes(groups, [left, dict(left, member="right lift")]), [])
        self.assertEqual(mount_notes(groups, [left, {k: v for k, v in left.items() if k != "member"}]), [], "a group-level mount covers the rest")
        self.assertEqual(mount_notes(groups, [{k: v for k, v in left.items() if k != "member"}]), [])
        # A structure joint registered for one member points at the members that have none.
        plan = deepcopy(self.plan)
        plan["mounts"].append(dict(group="structure", member="rail", on="mount", pointMm=self.plan["mounts"][0]["pointMm"], basis="Invented joint"))
        result, notes = self.notes(plan)
        self.assertEqual(notes, ["[mounts] note: structure members without a registered joint: mount (a root frame member needs none)"])
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        quiet = self.review(plan)
        self.assertEqual(json.dumps(quiet), json.dumps(result), "the note never enters the receipt")


if __name__ == "__main__":
    unittest.main()
