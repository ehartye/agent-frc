"""Follow a declared relocation of a held receipt's pinned file only to identical bytes."""
import json
import shutil
from pathlib import Path
import unittest

import held_position_replay as base
from held_position_replay import DELIVERY, BAY


class HeldPinRelocation(base.HeldPositionReplay):
    """Reuse the delivery stand-off hold fixture, then move the held acceptance before resubmitting."""

    def moved(self, tag, relocate, edit_bytes=None):
        held, _ = self.hold(tag, DELIVERY)
        old = self.root / (tag + "-held-standoff-accepted.json")
        new = self.root / "archive" / old.name
        new.parent.mkdir(exist_ok=True)
        shutil.move(old, new)
        if edit_bytes:
            new.write_text(new.read_text() + " ", encoding="utf-8")
        relocations = {old.name: "archive/" + old.name} if relocate else {}
        return held, relocations, old.name

    def resubmit_with(self, tag, held, relocations):
        """Resubmit with the relocations declared on the revised plan."""
        original = self.plan
        self.plan = dict(original, relocations=relocations) if relocations else original
        try:
            return self.resubmit(tag, held, DELIVERY, [BAY[0], BAY[1] - 10], 10.)
        finally:
            self.plan = original

    def test_relocated_identical_held_file_clears_and_is_recorded(self):
        held, relocations, old = self.moved("moved", True)
        result = self.resubmit_with("moved", held, relocations)
        prior = self.prior(result)
        self.assertTrue(prior["repeatVerified"], result["missingInputs"])
        self.assertEqual(result["status"], "layout-checked")
        sha = [p for p in held["premises"] if p["id"] == "delivery-standoff"][0]["accepted"]["sha256"]
        followed = dict(fromFile=old, toFile="archive/" + old, sha256=sha)
        self.assertEqual(prior["relocated"], [followed])
        self.assertEqual(result["heldRelocations"], [followed])

    def test_relocated_file_with_different_bytes_stays_open(self):
        held, relocations, old = self.moved("altered", True, edit_bytes=True)
        result = self.resubmit_with("altered", held, relocations)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")
        self.assertIn("Relocated held file " + old + " -> archive/" + old + " does not match its pinned SHA-256",
                      result["missingInputs"])
        self.assertNotIn("heldRelocations", result)

    def test_moved_file_without_relocation_fails_as_before(self):
        held, _, old = self.moved("unmoved", False)
        with self.assertRaisesRegex(ValueError, "Unresolved project file: " + old):
            self.resubmit_with("unmoved", held, {})

    def test_current_issue_pins_cannot_be_relocated(self):
        held, _ = self.hold("current", DELIVERY)
        design = self.plan["design"]["file"]
        with self.assertRaisesRegex(ValueError, "A relocation cannot redirect a current-issue pin: " + design):
            self.resubmit_with("current", held, {design: "archive/" + design})

    def test_relocations_need_a_held_receipt(self):
        from preliminary_design import review
        plan = dict(self.plan, relocations={"anything.json": "archive/anything.json"})
        (self.root / "layout.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Relocations apply only to a held receipt passed with --previous"):
            review(self.root, self.root / "layout.json")

    def test_no_relocation_is_unchanged(self):
        held, _ = self.hold("plain", DELIVERY)
        result = self.resubmit_with("plain", held, {})
        self.assertTrue(self.prior(result)["repeatVerified"])
        self.assertNotIn("relocated", self.prior(result))
        self.assertNotIn("heldRelocations", result)


# The inherited stand-off cases already run in their own suite.
for name in [n for n in dir(base.HeldPositionReplay) if n.startswith("test_")]:
    if name not in vars(HeldPinRelocation):
        setattr(HeldPinRelocation, name, None)


if __name__ == "__main__":
    unittest.main()
