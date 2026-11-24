# @lane merge
# @subject scripts/kernel_layout/premises.py
# @subject scripts/concept-select.mjs
"""The premise records concept:select writes are accepted, unchanged, by the layout check's premise reader.

Usage: python -B test/concept_premises_check.py PROJECT_ROOT PREMISES_DIR (PREMISES_DIR relative to the root).
Failure caught: concept:select writes a premise the preliminary layout check cannot read. Controls: a record
without a unit, and interfaces outside the design's groups, are rejected."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from kernel_layout.premises import accepted_premise, within  # noqa: E402

ROOT, FOLDER = Path(sys.argv[1]).resolve(), sys.argv[2]


def links(name):
    return {"accepted": {"file": FOLDER + "/" + name}}


class ConceptPremises(unittest.TestCase):
    def setUp(self):
        self.names = sorted(p.name for p in (ROOT / FOLDER).glob("*.json"))
        self.records = {n: json.loads((ROOT / FOLDER / n).read_text(encoding="utf-8")) for n in self.names}
        self.groups = sorted({g for r in self.records.values() for g in r["interfaces"]} | {"chassis"})

    def test_every_premise_is_accepted(self):
        self.assertTrue(self.names)
        seen = set()
        for name in self.names:
            accepted, decision = accepted_premise(ROOT, links(name), self.groups, seen)
            self.assertEqual(decision["status"], "unknown")
            self.assertEqual(decision["phase"], "conceptual-design")
            self.assertEqual(set(accepted["criterion"]), {"range"})

    def test_a_better_value_is_within_and_a_worse_one_reopens(self):
        """An observation better than base (faster, lighter, more accurate) never reopens conceptual design."""
        for name, record in self.records.items():
            lo, hi = record["criterion"]["range"]
            higher = record["betterDirection"] == "higher"
            better = min(hi, record["base"] * 1.2) if higher else max(lo, record["base"] * 0.8)
            self.assertTrue(within(record["criterion"], better), name + ": better value " + str(better))
            bound = lo if higher else hi
            step = max(abs(bound) * 0.01, 1e-6)
            self.assertFalse(within(record["criterion"], bound - step if higher else bound + step), name + ": past the worse bound")

    def test_a_premise_without_a_unit_is_rejected(self):
        name = self.names[0]
        record = dict(self.records[name])
        del record["unit"]
        with TemporaryDirectory(dir=ROOT / FOLDER) as scratch:
            broken = Path(scratch) / name
            broken.write_text(json.dumps(record), encoding="utf-8")
            relative = broken.relative_to(ROOT).as_posix()
            with self.assertRaises((KeyError, ValueError)):
                accepted_premise(ROOT, {"accepted": {"file": relative}}, self.groups, set())

    def test_interfaces_outside_the_groups_are_rejected(self):
        name = self.names[0]
        groups = [g for g in self.groups if g not in self.records[name]["interfaces"]]
        with self.assertRaisesRegex(ValueError, "Unknown group"):
            accepted_premise(ROOT, links(name), groups, set())


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]])
