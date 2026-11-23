# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/package_view.py
# @subject scripts/preliminary_design.py
# @subject templates/preliminary-review/review.html
# @subject scripts/stage_preliminary_review.py
"""Check a package from the repository root: the review page and scene sit beside the layout plan in its release folder."""
from hashlib import sha256
import json
from pathlib import Path
import runpy
import shutil
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS

CREATE = SCRIPTS.parent / "examples/preliminary-design/create.py"
REFUSED = "A review view is not written at the project root"


def unroot(folder, name, prefix, done):
    """Rewrite every pin reachable from one JSON file so that it is relative to the folder itself."""
    if name in done:
        return
    done.add(name)
    file = folder / name
    try:
        data = json.loads(file.read_bytes())
    except ValueError:
        return
    def walk(node):
        if isinstance(node, dict):
            if isinstance(node.get("file"), str) and isinstance(node.get("sha256"), str) and node["file"].startswith(prefix):
                node["file"] = node["file"][len(prefix):]
                unroot(folder, node["file"], prefix, done)
                node["sha256"] = sha256((folder / node["file"]).read_bytes()).hexdigest()
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
    before = json.dumps(data)
    walk(data)
    # A file without pins keeps its bytes: other records hold its digest.
    if json.dumps(data) != before:
        file.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


class ViewLocation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.repo = Path(cls.folder.name) / "repository"
        cls.package = cls.repo / "cad" / "preliminary-design" / "releases" / "layout-001"
        cls.repo.mkdir()
        cls.plan = runpy.run_path(str(CREATE))["create"](cls.package, project=cls.repo, pins=True)
        cls.prefix = cls.package.relative_to(cls.repo).as_posix() + "/"

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def review(self, view, write_view=True):
        from preliminary_design import review
        (self.package / "trial.json").write_text(json.dumps(dict(self.plan, view=view)), encoding="utf-8")
        return review(self.repo, self.package / "trial.json", write_view=write_view)

    def test_the_example_keeps_its_view_and_scene_in_the_release_folder(self):
        self.assertEqual([p.name for p in self.repo.iterdir()], ["cad"], "nothing is generated at the repository root")
        self.assertEqual(self.plan["view"], self.prefix + "package-motion.html")
        self.assertEqual(self.plan["step"]["file"], self.prefix + "package.step", "pins are written from the repository root")
        result = self.review(self.prefix + "package-motion.html", write_view=False)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["view"]["file"], self.prefix + "package-motion.html")
        self.assertEqual(result["view"]["scene"]["file"], self.prefix + "review-scene.json.gz")
        self.assertTrue(result["view"]["verified"])
        (self.package / "review-scene.json.gz").unlink()
        self.assertTrue(self.review(self.prefix + "package-motion.html")["view"]["verified"], "the scene is rewritten beside the plan")
        self.assertTrue((self.package / "review-scene.json.gz").is_file())
        self.assertEqual([p.name for p in self.repo.iterdir()], ["cad"])
        # Another spelling of the same path is recorded in the one normal form.
        respelled = self.review(self.prefix + "views/../package-motion.html", write_view=False)
        self.assertEqual(respelled["view"]["file"], self.prefix + "package-motion.html")
        for view in (7, ["package-motion.html"]):
            with self.assertRaisesRegex(ValueError, "Name the view as a project-relative HTML path"):
                self.review(view, write_view=False)

    def test_the_page_finds_its_scene_receipt_and_field_player_beside_it(self):
        page = (SCRIPTS.parent / "templates/preliminary-review/review.html").read_text(encoding="utf-8")
        self.assertIn("fetch('review-scene.json.gz'", page)
        self.assertIn("fetch('receipt.json'", page)
        with TemporaryDirectory() as folder:
            repo = Path(folder)
            release = repo / "cad/preliminary-design/releases/layout-002"
            plan = runpy.run_path(str(CREATE))["create"](release, release_id="layout-002", project=repo)
            receipt = json.loads((release / "receipt.json").read_text())
            self.assertEqual((repo / receipt["view"]["file"]).parent, release)
            self.assertEqual((repo / receipt["view"]["scene"]["file"]).parent, release)
            # The linked field player is addressed from the page; its evidence is pinned from the repository root.
            row = plan["presentation"]["fieldInteractions"][0]
            self.assertTrue((release / row["href"]).is_file())
            self.assertTrue((repo / row["evidence"]["file"]).is_file())
            self.assertEqual([p.name for p in repo.iterdir()], ["cad"])

    def test_a_view_away_from_its_plan_is_refused_with_the_expected_path(self):
        expected = "Select an HTML view beside the layout plan, such as " + self.prefix + "package-motion.html"
        for view in ("package-motion.html", "cad/package-motion.html", self.prefix + "views/package-motion.html",
                     "../package-motion.html", self.prefix + "package-motion.txt"):
            with self.assertRaises(ValueError, msg=view) as refused:
                self.review(view)
            self.assertIn(expected, str(refused.exception), view)
        self.assertFalse((self.repo / "package-motion.html").exists())
        self.assertFalse((self.repo / "review-scene.json.gz").exists())

    def test_a_view_at_the_project_root_is_checked_but_never_written(self):
        import package_view
        from preliminary_design import review
        with TemporaryDirectory() as folder:
            # A package checked with its own folder as the project, as releases were before this rule.
            root = Path(folder) / "package"
            shutil.copytree(self.package, root)
            unroot(root, "layout.json", self.prefix, set())
            plan = dict(json.loads((root / "layout.json").read_text()), view="package-motion.html")
            (root / "layout.json").write_text(json.dumps(plan), encoding="utf-8")
            (root / "review-scene.json.gz").unlink()
            with self.assertRaises(ValueError) as refused:
                review(root, root / "layout.json", write_view=True)
            self.assertIn(REFUSED, str(refused.exception))
            self.assertIn("cad/preliminary-design/releases/ID/package-motion.html", str(refused.exception))
            self.assertFalse((root / "review-scene.json.gz").exists())
            self.assertFalse(review(root, root / "layout.json")["view"]["verified"])
            # Write the scene as the earlier version did, to stand for an issued release.
            checked = package_view.require
            with patch.object(package_view, "require", lambda ok, message: REFUSED in message or checked(ok, message)):
                review(root, root / "layout.json", write_view=True)
            issued = review(root, root / "layout.json")
            self.assertEqual((issued["status"], issued["view"]["verified"]), ("layout-checked", True), issued["missingInputs"])
            self.assertEqual((issued["view"]["file"], issued["view"]["scene"]["file"]), ("package-motion.html", "review-scene.json.gz"))
            with self.assertRaisesRegex(ValueError, REFUSED):
                review(root, root / "layout.json", write_view=True)

    def test_staging_reads_pins_from_the_root_the_receipt_was_checked_in(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("stage_review", SCRIPTS / "stage_preliminary_review.py")
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        view = lambda name: name
        self.assertEqual(stage.project_root(self.repo, self.package, view(self.prefix + "package-motion.html")), self.repo.resolve())
        # A release checked in its own folder names a bare view: its pins resolve from the release folder.
        self.assertEqual(stage.project_root(self.repo, self.package, view("package-motion.html")), self.package.resolve())
        self.assertEqual(stage.project_root(self.repo, self.package, None), self.package.resolve())
        self.assertEqual(stage.project_root(self.repo, self.package, view("cad/package-motion.html")), self.package.resolve())


if __name__ == "__main__":
    unittest.main()
