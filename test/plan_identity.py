# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/preliminary_design.py
"""Say which layout plan a check read, and warn when the plan is older than the builder sources it is written from."""
import json
import os
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, digest


class PlanIdentity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        cls.layout = cls.root / "layout"
        runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)
        cls.plan = cls.layout / "layout.json"
        # An invented builder: one source file beside a folder of two.
        cls.builder = cls.root / "tools"
        (cls.builder / "parts").mkdir(parents=True)
        for name in ("build_layout.py", "parts/frame.py", "parts/carrier.py"):
            (cls.builder / name).write_text("# invented builder source\n", encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        # The plan was written at a known time; every source is older until a test touches one.
        self.written = 1_700_000_000
        os.utime(self.plan, (self.written, self.written))
        for source in self.builder.rglob("*.py"):
            os.utime(source, (self.written - 60, self.written - 60))

    def lines(self, *sources):
        from preliminary_design import plan_identity
        return plan_identity(self.root, self.plan, sources)

    def test_the_plan_is_named_with_its_time_and_digest(self):
        self.assertEqual(self.lines(), ["[plan] layout/layout.json modified 2023-11-14T22:13:20Z sha256=" + digest(self.plan)])
        self.assertEqual(len(self.lines("tools", "tools/build_layout.py")), 1, "a plan newer than its sources draws no warning")

    def test_a_plan_older_than_a_builder_source_draws_a_warning(self):
        os.utime(self.builder / "parts/carrier.py", (self.written + 90, self.written + 90))
        for source in ("tools", "tools/parts", "tools/parts/carrier.py"):
            lines = self.lines(source)
            self.assertEqual(len(lines), 2, source)
            self.assertEqual(lines[1], "[plan] warning: layout/layout.json was last written 2023-11-14T22:13:20Z, before "
                             "tools/parts/carrier.py changed at 2023-11-14T22:14:50Z. Its builder may have failed or not run since, "
                             "so this check may be reading a stale plan. Check the builder's exit code and rebuild the plan "
                             "before relying on the result.")
        self.assertEqual(len(self.lines("tools/build_layout.py")), 1)
        self.assertEqual(len(self.lines("tools/build_layout.py", "tools/parts")), 2)

    def test_the_plan_and_caches_in_a_named_folder_are_not_sources(self):
        cache = self.layout / "__pycache__"
        cache.mkdir(exist_ok=True)
        (cache / "build.pyc").write_bytes(b"invented")
        os.utime(self.plan, (self.written + 10_000_000_000, self.written + 10_000_000_000))
        self.assertEqual(len(self.lines("layout")), 1)

    def test_a_missing_or_empty_source_is_an_error(self):
        (self.root / "empty").mkdir(exist_ok=True)
        for source, message in (("tools/absent.py", "--built-from names no file or folder: tools/absent.py"),
                                ("empty", "--built-from names a folder that holds no source file: empty")):
            with self.assertRaises(ValueError) as caught:
                self.lines(source)
            self.assertEqual(str(caught.exception), message)

    def test_the_command_prints_the_lines_first_and_the_result_is_unchanged(self):
        def run(*flags):
            return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(self.root), "layout/layout.json",
                                   "--require-checked", *flags], capture_output=True, text=True)
        plain = run()
        self.assertEqual(plain.returncode, 0, plain.stderr)
        self.assertRegex(plain.stderr.splitlines()[0], r"^\[plan\] layout/layout\.json modified \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ sha256=[0-9a-f]{64}$")
        self.assertEqual(plain.stderr.splitlines()[0].rsplit("=", 1)[1], json.loads(plain.stdout)["planSha256"])
        os.utime(self.builder / "build_layout.py", (self.written + 90, self.written + 90))
        stale = run("--built-from", "tools/build_layout.py", "--built-from", "tools/parts")
        self.assertEqual(stale.returncode, 0, stale.stderr)
        self.assertEqual(stale.stdout, plain.stdout, "the warning never changes the receipt or the exit code")
        self.assertTrue(stale.stderr.splitlines()[1].startswith("[plan] warning: layout/layout.json was last written"))
        self.assertEqual(len([l for l in stale.stderr.splitlines() if l.startswith("[plan] warning")]), 1)
        quiet = run("--built-from", "tools", "--quiet")
        self.assertEqual((quiet.returncode, quiet.stderr, quiet.stdout), (0, "", plain.stdout))
        missing = run("--built-from", "tools/absent.py")
        self.assertEqual(missing.returncode, 2)
        self.assertIn("--built-from names no file or folder: tools/absent.py", missing.stderr)


if __name__ == "__main__":
    unittest.main()
