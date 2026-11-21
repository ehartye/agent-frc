"""Regression controls for independently recorded moving membership and numerical properties."""
import runpy
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from mechanical_fixture import fixture
from articulated_mass import review
from mechanical_readiness import read, digest

ROOT = Path(__file__).resolve().parents[1]
example = runpy.run_path(str(ROOT/'examples/mechanical-readiness/articulated-mass.py'))


class ArticulatedMass(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)/"input"
        example["make"](self.root)
        self.study = read(self.root/"matched.json")
        self.ref = read(self.root/"reference.json")
        self.sim = read(self.root/"matched-observation.json")

    def evaluate(self):
        for key, record in (("reference", self.ref), ("simulation", self.sim)):
            self.study[key] = example["write"](self.root, key+"-current.json", record)
        return review(self.root, self.study)

    def test_distinct_membership_and_inertia_with_unchanged_aggregates(self):
        self.assertEqual(self.evaluate()["status"], "matched")
        swapped = review(self.root, read(self.root/"swapped.json"))
        self.assertEqual([c["field"] for c in swapped["checks"] if c["status"]=="mismatch"], ["membership"]*4)
        self.sim["axisKgM2"] = .0000005
        self.assertEqual([c["field"] for c in self.evaluate()["checks"] if c["status"]=="mismatch"], ["axisKgM2"])
        self.ref["omissions"] = ["internal motor rotor"]
        self.assertEqual(self.evaluate()["status"], "mismatch")

    def test_partial_basis_coordinate_and_tensor(self):
        self.ref["omissions"] = ["inner rings"]
        self.assertEqual(self.evaluate()["status"], "open")
        self.ref["omissions"].clear()
        self.sim["massBases"] = ["measured"]
        self.assertEqual(self.evaluate()["status"], "mismatch")
        self.sim["massBases"] = ["model-assumption"]
        self.sim["axisUnit"] = [0,0,-1]
        self.sim["unit"] = "deg"
        self.assertEqual({c["field"] for c in self.evaluate()["checks"] if c["status"]=="mismatch"},
                         {"axis direction", "coordinate type and units"})
        self.ref["members"][0].pop("centroidalAxisKgM2")
        self.ref["members"][0]["centroidalTensorKgM2"] = [[1,0,0],[0,1,0],[0,0,7]]
        with self.assertRaisesRegex(ValueError, "Impossible principal"):
            self.evaluate()

    def test_slider_and_source_integrity(self):
        for record in (self.ref,self.sim):
            record.update(kind="prismatic", unit="m", signedCoordinate=.014, joint="carriage")
            for row in record["members"]:
                row["role"]="moving"
        self.sim.update(axisKgM2=None, massKg=.024, contributingIds=[r["id"] for r in self.sim["members"]])
        result = self.evaluate()
        self.assertEqual(result["status"],"matched")
        self.assertIsNone(result["properties"]["axisKgM2"])
        self.sim["members"][-1]["role"]="fixed"
        self.sim["contributingIds"].pop()
        self.assertEqual(self.evaluate()["status"],"mismatch")
        (self.root/"stock.json").write_text("changed data")
        with self.assertRaisesRegex(ValueError,"Changed evidence"):
            self.evaluate()

    def test_real_named_homogeneous_step(self):
        from showcase_contacts import load_solids
        cad=self.root/"cad"
        cad.mkdir()
        fixture(cad)
        step=cad/"fixture.step"
        ids={}
        load_solids(step,ids)
        self.ref["step"]={"file":"cad/fixture.step","sha256":digest(step)}
        self.ref["sources"].append(self.ref["step"])
        mass=.02
        self.ref["members"]=[dict(id=k, role="moving", massKg=mass, massBasis="density-model",
                                  homogeneous=True, solid={"name":k,"identity":v}) for k,v in ids.items()]
        self.sim.update(members=[dict(id=k,role="moving") for k in ids],contributingIds=list(ids),
                        massBases=["density-model"],massKg=.04, centerM=[.01,.005,.005],
                        axisKgM2=sum(mass*(.01**2/6+x**2+.005**2) for x in [.005,.015]))
        self.assertEqual(self.evaluate()["status"],"matched")
        self.ref["members"][0]["solid"]["identity"]["instance"]="wrong"
        with self.assertRaisesRegex(ValueError,"exact distinct occurrence"):
            self.evaluate()


if __name__=="__main__":
    unittest.main()
