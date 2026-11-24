# @lane merge
# @subject scripts/kernel_layout/premises.py
# @subject scripts/concept-select.mjs
"""The premise records concept:select writes are accepted, unchanged, by the layout judgement's premise reader.

Usage: python -B test/concept_premises_check.py PROJECT_ROOT PREMISES_DIR (PREMISES_DIR relative to the root).
Failure caught: concept:select writes a premise the preliminary layout judgement cannot read, or one whose observed fact
it cannot compute. Controls: a record without a unit, and interfaces outside the design's groups, are rejected; a mass
over the bound reopens conceptual design."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from kernel_layout.premises import accepted, judged, within  # noqa: E402

ROOT, FOLDER = Path(sys.argv[1]).resolve(), sys.argv[2]


def ref(name):
    return {"file": FOLDER + "/" + name}


class ConceptPremises(unittest.TestCase):
    def setUp(self):
        self.names = sorted(p.name for p in (ROOT / FOLDER).glob("*.json"))
        self.records = {n: json.loads((ROOT / FOLDER / n).read_text(encoding="utf-8")) for n in self.names}
        self.groups = sorted({g for r in self.records.values() for g in r["interfaces"]} - {"robot"} | {"chassis"})

    def read(self, name, groups=None):
        problems = []
        found = accepted(ROOT, ref(name), self.groups if groups is None else groups, set(), problems)
        return found, problems

    def test_every_premise_is_accepted_unchanged(self):
        self.assertTrue(self.names)
        for name in self.names:
            found, problems = self.read(name)
            self.assertEqual(problems, [], name)
            self.assertEqual(found["phase"], "conceptual-design")
            self.assertEqual(set(found["criterion"]), {"range"})

    def test_the_mass_premise_observes_the_library_mass_in_its_own_unit(self):
        name = next(n for n in self.names if n.endswith("massLb.json"))
        found, _ = self.read(name)
        bound = self.records[name]["criterion"]["range"][1]
        light = dict(rangeKg=[20.0, bound * 0.45359237 - 0.5], totalKg=21.0)
        heavy = dict(rangeKg=[20.0, bound * 0.45359237 + 0.5], totalKg=21.0)
        self.assertEqual(judged(found, light)["status"], "within")
        row = judged(found, heavy)
        self.assertEqual(row["status"], "reopen")
        self.assertAlmostEqual(row["value"][1], heavy["rangeKg"][1] / 0.45359237)
        # A rate premise states no fact to observe: it is not observed yet.
        rate = next(n for n in self.names if not n.endswith("massLb.json"))
        self.assertEqual(judged(self.read(rate)[0], light)["status"], "not observed")

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
            problems = []
            accepted(ROOT, {"file": broken.relative_to(ROOT).as_posix()}, self.groups, set(), problems)
            self.assertTrue(any("unit" in p for p in problems), problems)

    def test_interfaces_outside_the_groups_are_rejected(self):
        name = next(n for n in self.names if "robot" not in self.records[n]["interfaces"])
        groups = [g for g in self.groups if g not in self.records[name]["interfaces"]]
        _, problems = self.read(name, groups)
        self.assertTrue(any("Unknown group" in p for p in problems), problems)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]])
