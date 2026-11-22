"""Generated files appear whole: a reader finds the previous bytes or the new bytes, and a failed run changes nothing."""
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading
import time
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS, write
import atomic_file
from atomic_file import write_atomic


class AtomicWrites(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        cls.layout = cls.root / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def leftovers(self, folder):
        return sorted(p.name for p in folder.iterdir() if p.name.endswith(".tmp"))

    def check(self, *flags, plan="layout.json"):
        return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(self.root), "layout/" + plan, "--quiet", *flags],
                              capture_output=True, text=True)

    def test_a_reader_never_finds_a_gap_or_a_partial_file(self):
        target = self.root / "shared.bin"
        versions = [bytes([65 + k]) * 400_000 for k in range(4)]
        write_atomic(target, versions[0])
        reads, bad, done = [0], [], threading.Event()
        def reader():
            while not done.is_set():
                try:
                    data = target.read_bytes()
                except FileNotFoundError:
                    bad.append("missing")
                except PermissionError:
                    # Windows can refuse an open during the rename itself; the reader retries and never finds a gap.
                    continue
                else:
                    reads[0] += 1
                    time.sleep(0.001)
                    if data not in versions:
                        bad.append(len(data))
        thread = threading.Thread(target=reader)
        thread.start()
        try:
            for k in range(60):
                write_atomic(target, versions[k % 4])
        finally:
            done.set()
            thread.join()
        self.assertGreater(reads[0], 0)
        self.assertEqual(bad, [])
        self.assertEqual(self.leftovers(self.root), [])

    def test_a_failed_write_keeps_the_previous_file(self):
        target = self.root / "kept.json"
        write_atomic(target, b"previous")
        with patch.object(atomic_file.os, "replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                write_atomic(target, b"next")
        self.assertEqual(target.read_bytes(), b"previous")
        self.assertEqual(self.leftovers(self.root), [])

    def test_exclusive_write_never_replaces(self):
        target = self.root / "once.html"
        write_atomic(target, b"first", exclusive=True)
        with self.assertRaises(FileExistsError):
            write_atomic(target, b"second", exclusive=True)
        self.assertEqual(target.read_bytes(), b"first")
        # Two writers that both saw no target: the loser is refused at the rename, not only at the first look.
        raced = self.root / "raced.html"
        real = atomic_file.os.path.lexists
        def late(path):
            if not raced.exists() and Path(path) == raced:
                raced.write_bytes(b"winner")
                return False
            return real(path)
        with patch.object(atomic_file.os.path, "lexists", side_effect=late):
            with self.assertRaises(FileExistsError):
                write_atomic(raced, b"loser", exclusive=True)
        self.assertEqual(raced.read_bytes(), b"winner")
        self.assertEqual(self.leftovers(self.root), [])

    def test_output_receipt_matches_stdout_and_survives_a_failed_run(self):
        plain = self.check()
        self.assertEqual(plain.returncode, 0, plain.stderr)
        receipt = self.layout / "check-receipt.json"
        saved = self.check("--output", "layout/check-receipt.json")
        self.assertEqual(saved.returncode, 0, saved.stderr)
        self.assertEqual(saved.stdout, "")
        self.assertEqual(json.loads(receipt.read_text(encoding="utf-8")), json.loads(plain.stdout))
        self.assertEqual(receipt.read_bytes(), (json.dumps(json.loads(plain.stdout), indent=2) + "\n").encode())
        before = receipt.read_bytes()
        write(self.layout, "broken.json", dict(self.plan, issue=""))
        failed = self.check("--output", "layout/check-receipt.json", plan="broken.json")
        self.assertEqual(failed.returncode, 2)
        self.assertEqual(self.check("--output", str(self.root.parent / "outside.json")).returncode, 2)
        self.assertFalse((self.root.parent / "outside.json").exists())
        self.assertEqual(receipt.read_bytes(), before)
        self.assertEqual(self.leftovers(self.layout), [])

    def test_written_view_leaves_no_temporary_files_and_an_interrupted_write_no_page(self):
        import package_view
        self.assertTrue((self.layout / "package-motion.html").is_file())
        self.assertEqual(self.leftovers(self.layout), [])
        folder = self.root / "interrupted"
        folder.mkdir()
        with patch.object(atomic_file.os, "rename", side_effect=OSError("interrupted")),                 patch.object(atomic_file.os, "link", side_effect=OSError("interrupted")):
            with self.assertRaises(OSError):
                package_view.write_atomic(folder / "package-motion.html", b"<html>", exclusive=True)
        self.assertEqual(list(folder.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
