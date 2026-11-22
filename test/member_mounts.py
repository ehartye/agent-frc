"""Register a mount against the member it supports, and a joint that fixes a structure member to its host."""
from copy import deepcopy
import gzip
import json
import runpy
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

from mechanical_fixture import SCRIPTS, write


class MemberMounts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        from package_view import SCENE_FILE
        cls.scene_file = cls.root / SCENE_FILE
        cls.stock_scene = cls.scene_file.read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def review(self, plan, fresh=True):
        from preliminary_design import review
        write(self.root, "layout.json", plan)
        if fresh:
            self.scene_file.unlink(missing_ok=True)
        return review(self.root, self.root / "layout.json", write_view=fresh)

    def bodies(self):
        return json.loads(gzip.decompress(self.scene_file.read_bytes()))["bodies"]

    def test_group_mounts_keep_the_receipt_and_scene_they_had(self):
        result = self.review(self.plan)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["mounts"], self.plan["mounts"])
        self.assertEqual(self.scene_file.read_bytes(), self.stock_scene, "a plan without member mounts regenerates the same scene")
        self.assertTrue(all("mounts" not in body for body in self.bodies().values()))

    def test_a_mount_names_the_member_it_supports(self):
        plan = deepcopy(self.plan)
        plan["mounts"][0]["member"] = "head"
        result = self.review(plan)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["mounts"][0]["member"], "head")
        bodies = self.bodies()
        first = plan["mounts"][0]
        self.assertEqual(bodies["head"]["mounts"], [dict(on=first["on"], pointMm=first["pointMm"], basis=first["basis"])])
        # A group-level mount is not attributed to any one member.
        self.assertNotIn("mounts", bodies["gate"])
        self.assertFalse(any("Missing mount datum" in m for m in result["missingInputs"]))

    def test_a_mount_member_must_belong_to_its_group(self):
        for member in ("gate", "unknown", "", None, 3):
            plan = deepcopy(self.plan)
            plan["mounts"][0]["member"] = member
            with self.assertRaisesRegex(ValueError, "A mount names a member of its own group", msg=str(member)):
                self.review(plan)
        # A member cannot be its own host: any point inside its own box would pass the envelope check.
        plan = deepcopy(self.plan)
        plan["mounts"].append(dict(group="structure", member="rail", on="rail", pointMm=self.plan["mounts"][1]["pointMm"], basis="Invented"))
        with self.assertRaisesRegex(ValueError, "other than its host"):
            self.review(plan)

    def test_a_structure_member_registers_its_joint_to_a_host(self):
        joint = dict(group="structure", member="rail", on="mount", pointMm=self.plan["mounts"][0]["pointMm"],
                     basis="Invented bolted joint between the rail and the pedestal")
        plan = deepcopy(self.plan)
        plan["mounts"].append(joint)
        result = self.review(plan)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(self.bodies()["rail"]["mounts"], [dict(on="mount", pointMm=joint["pointMm"], basis=joint["basis"])])
        plan["mounts"][-1] = dict(joint, pointMm=[200, 0, 0])
        result = self.review(plan)
        self.assertEqual(result["status"], "provisional")
        self.assertIn("Mount datum outside the selected host envelope: structure (rail) on mount", result["missingInputs"])

    def test_two_members_of_one_group_each_cite_their_own_mount(self):
        plan = deepcopy(self.plan)
        left = dict(group="structure", member="rail", on="mount", pointMm=self.plan["mounts"][0]["pointMm"], basis="Invented left joint")
        right = dict(group="structure", member="mount", on="rail", pointMm=self.plan["mounts"][1]["pointMm"], basis="Invented right joint")
        plan["mounts"] += [left, right]
        result = self.review(plan)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        bodies = self.bodies()
        self.assertEqual([m["basis"] for m in bodies["rail"]["mounts"]], ["Invented left joint"])
        self.assertEqual([m["basis"] for m in bodies["mount"]["mounts"]], ["Invented right joint"])


if __name__ == "__main__":
    unittest.main()
