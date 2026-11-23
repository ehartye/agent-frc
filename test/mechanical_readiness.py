import shutil
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import fixture, write, SCRIPTS
from mechanical_readiness import evaluate_inputs as review, verify_delivery, digest,scan
from showcase_contacts import measure
from mesh_controls import MeshComparisons
from observed_transfer import ObservedTransfer
from installed_kinematics import InstalledKinematics
from linked_kinematics import LinkedKinematics
from native_pose_stages import PoseStages
from collider_comparison_test import ColliderComparison
from articulated_mass_test import ArticulatedMass
from pilot_alignment_test import SeatedPilot
from mission_boundaries import MissionBoundaries
from spatial_operating_cases import SpatialOperatingCases
from constant_pose_pairs import ConstantPosePairs
from interface_evidence import InterfaceEvidence
from game_piece_compression import GamePieceCompression
from checker_progress_failfast import CheckerProgressFailFast
from motion_heartbeat import MotionHeartbeat
from atomic_writes import AtomicWrites
from free_path import FreePath
from fixture_support import FixtureSupport
from fixture_warning import FixtureWarning
from member_mounts import MemberMounts
from scene_replace import SceneReplace
from compression_trial_pin import CompressionTrialPin
from scene_mesh_once import SceneMeshOnce
from view_location import ViewLocation
from held_position_replay import HeldPositionReplay
from contact_transport import ContactTransport
from held_pin_relocation import HeldPinRelocation
from parallel_cases import ParallelCases
from view_only import ViewOnly
from layout_scope import LayoutScope


class Readiness(unittest.TestCase):
    def test_named_pair_cache_is_bound_to_independent_registration(self):
        from copy import deepcopy
        from hashlib import sha256
        from unittest.mock import patch
        from OCP.gp import gp_Trsf, gp_Vec
        from OCP.TopLoc import TopLoc_Location
        import placed_pair_cache as cache
        from showcase_contacts import load_solids

        identities = {}
        solids, _ = load_solids(self.root/self.s["step"]["file"], identities)
        left, right = sorted(identities)
        plan = {"schema":"agent-frc/placed-pairs@1","lineage":self.s["lineage"],
                "leaves":identities,"pairs":[[left,right]]}
        folder = self.root/"cache"
        pin = cache.run("register", self.root, plan)["indexSha256"]
        self.assertEqual(cache.run("prepare", self.root, plan, folder)["indexSha256"], pin)
        with self.assertRaises(FileExistsError):
            cache.run("prepare", self.root, plan, folder)
        with patch("placed_pair_cache.load_solids", side_effect=AssertionError("Unexpected full import")):
            measured = cache.run("measure", self.root, plan, folder, pin)
        self.assertEqual(measured["readFrom"], "placed-cache")
        self.assertEqual(measured["pairs"][0]["status"], "measured")
        self.assertAlmostEqual(measured["pairs"][0]["opposedPlanarAreaMm2"], 100.)
        path = folder/"index.json"
        saved = path.read_bytes()
        index = json.loads(saved)
        moved = gp_Trsf()
        moved.SetTranslation(gp_Vec(1,2,0))
        wrong = cache.binary_solid(solids[left].Moved(TopLoc_Location(moved)))
        changed = deepcopy(index)
        changed["leaves"][left]["sha256"] = sha256(wrong).hexdigest()
        (folder/(changed["leaves"][left]["sha256"]+".brep")).write_bytes(wrong)
        path.write_bytes(cache.encoded(changed))
        with self.assertRaisesRegex(ValueError, "independent full-source"):
            cache.run("measure", self.root, plan, folder, pin)
        changed["leaves"].pop(right)
        path.write_bytes(cache.encoded(changed))
        with self.assertRaisesRegex(ValueError, "independent index"):
            cache.run("measure", self.root, plan, folder, sha256(path.read_bytes()).hexdigest(), True)
        path.write_bytes(saved)
        blob = folder/(index["leaves"][left]["sha256"]+".brep")
        blob.write_bytes(wrong)
        with self.assertRaisesRegex(ValueError, "Cached"):
            cache.run("measure", self.root, plan, folder, pin)
        recovered = cache.run("measure", self.root, plan, folder, pin, True)
        self.assertEqual(recovered["readFrom"], "canonical-step")
        self.assertTrue(recovered["cacheFinding"])
        self.assertEqual(recovered["pairs"], measured["pairs"])
        with self.assertRaises(ValueError):
            cache.run("measure", self.root, {**plan,"wholeRobot":True}, folder, pin, True)
        other = deepcopy(plan)
        other["leaves"][right]["instance"] = "unrelated"
        with self.assertRaisesRegex(ValueError, "Missing or different"):
            cache.run("measure", self.root, other, folder, pin, True)
        pending = self.root/"new-cache"
        with self.assertRaisesRegex(ValueError, "Missing or different"):
            cache.run("prepare", self.root, other, pending)
        self.assertFalse(pending.exists())
        self.assertFalse(list(self.root.glob(".placed-pairs-*")))
        self.assertEqual(cache.run("prepare", self.root, plan, pending)["indexSha256"], pin)
        for impossible in (-1., 1001.):
            with patch("placed_pair_cache.boolean_measure", return_value=(impossible,True)):
                contradiction = cache.run("measure", self.root, plan, pending, pin)["pairs"][0]
            self.assertEqual(contradiction["rawCommonMm3"], impossible)
            self.assertEqual(contradiction["status"], "open")
        def replace_during_import(path, found):
            original = load_solids(path, found)
            path.write_bytes(b"different STEP during full read")
            return original
        with patch("placed_pair_cache.load_solids", side_effect=replace_during_import):
            with self.assertRaisesRegex(ValueError, "changed during the full read"):
                cache.run("register", self.root, plan)
        (self.root/self.s["step"]["file"]).write_bytes(b"another issue")
        with self.assertRaisesRegex(ValueError, "authority evidence"):
            cache.run("measure", self.root, plan, folder, pin, True)

    def test_bounded_source_comparison_retains_finished_rows_and_retries_partial_writes(self):
        from unittest.mock import patch
        import component_batch as batch
        from placed_solid_identity import IDENTITY
        from showcase_contacts import load_solids

        step = self.s["step"]
        labels = sorted(load_solids(self.root/step["file"])[0])
        rows = [{"id": label, "source": {**step, "solid": label}, "installed": {**step, "solid": label},
                 "worldTransform": IDENTITY.copy()} for label in labels]
        rows[1]["worldTransform"][3] = 1
        plan = {"schema": "agent-frc/component-batch@1", "configuration": "parked", "articles": rows}
        with self.assertRaisesRegex(ValueError, "Unsupported article"):
            batch.check_plan(self.root, {**plan, "articles": [{**rows[0], "interiorPointsMm": [[0, 0, 0]]}]})
        path = self.root/"articles.json"
        path.write_bytes(batch.encoded(plan))
        partial = self.root/"partial"
        opened = {"execution": "completed", "observation": {"absentMm3": 0, "extraMm3": 0,
                  "measurementStatus": "open", "reason": "conflicting integrations"}}
        with patch.object(batch, "attempt", side_effect=[opened, KeyboardInterrupt]), self.assertRaises(KeyboardInterrupt):
            batch.run(self.root, path, partial, 20)
        (partial/".pending-interrupted").write_bytes(b'{"observation":')
        self.assertEqual(len(list(partial.glob("00001-*.json"))), 1)
        self.assertFalse((partial/"summary.json").exists())
        resumed = self.root/"resumed"
        timed = batch.run(self.root, path, resumed, 0.001, partial)
        self.assertEqual(timed["execution"], "incomplete")
        self.assertEqual(timed["unfinished"], [labels[1]])
        self.assertEqual(timed["unresolved"], [labels[0]])
        final = self.root/"finished"
        result = batch.run(self.root, path, final, 45, resumed)
        self.assertEqual(result["execution"], "complete")
        self.assertEqual(result["unresolved"], [labels[0]])
        success = json.loads((final/result["receipts"][1]).read_bytes())
        self.assertGreater(success["observation"]["absentMm3"], 0)
        self.assertEqual(success["previousAttempt"], timed["receipts"][1])
        with patch.object(batch, "collector", return_value={"scriptsSha256": "different"}), self.assertRaisesRegex(ValueError, "method"):
            batch.run(self.root, path, self.root/"changed-method", 20, final)
        receipts = list(final.glob("00001-*.json"))
        receipts[0].write_bytes(b"{}")
        with self.assertRaisesRegex(ValueError, "checksum"):
            batch.run(self.root, path, self.root/"changed-receipt", 20, final)
        rows[0]["worldTransform"][3] += 1
        path.write_bytes(batch.encoded(plan))
        with self.assertRaisesRegex(ValueError, "Prior plan"):
            batch.run(self.root, path, self.root/"changed-pose", 20, final)
        with (self.root/step["file"]).open("ab") as stream:
            stream.write(b"changed")
        with self.assertRaisesRegex(ValueError, "Changed evidence"):
            batch.run(self.root, path, self.root/"changed-input", 20, final)

    def test_exact_placed_identity_keeps_locations_orientation_and_failed_cuts(self):
        from unittest.mock import patch
        from placed_solid_identity import IDENTITY, binary_solid, run
        from showcase_contacts import load_solids
        from OCP.gp import gp_Trsf, gp_Vec
        from OCP.TopLoc import TopLoc_Location

        step = self.root/self.s["step"]["file"]
        identities = {}
        solids, _ = load_solids(step, identities)
        first, other = sorted(solids)
        registered = {"step": self.s["step"], "selected": first, "STEPidentity": identities[first]}
        register = write(self.root, "parked.json", registered)
        side = dict(step=self.s["step"], registration=register, configuration="parked",
                    solid=first, instance=identities[first]["instance"])
        plan = dict(schema="agent-frc/placed-solid-identity@1", frame="base",
                    beforeToAfter=IDENTITY[:], before=side, after=dict(side))
        with patch("component_shape.boolean_measure", return_value=(0., False)):
            equal = run(self.root, plan)
        self.assertEqual(equal["representedSolidEquality"], "proved")
        self.assertEqual(equal["directedComparison"]["measurementStatus"], "open")
        mismatched_rows = write(self.root, "two-issues.json", {"rows": [
            {**registered, "selected": other, "STEPidentity": identities[other]},
            {**registered, "step": {"sha256": "a" * 64}}]})
        for path in ("/rows/0", "/rows/1"):
            with self.assertRaisesRegex(ValueError, "Registration does not identify"):
                run(self.root, {**plan, "before": {**side, "registration": {**mismatched_rows, "rowAt": path}}})

        shape = solids[first]
        move = gp_Trsf()
        move.SetTranslation(gp_Vec(1e-10, 0., 0.))
        self.assertNotEqual(binary_solid(shape), binary_solid(shape.Moved(TopLoc_Location(move))))
        with self.assertRaises(ValueError):
            binary_solid(shape.Reversed())
        plan["after"]["solid"] = other
        with self.assertRaisesRegex(ValueError, "Registration does not identify"):
            run(self.root, plan)
        del plan["after"]["registration"]
        with self.assertRaisesRegex(ValueError, "occurrence index"):
            run(self.root, plan)
        plan["after"]["instance"] = identities[other]["instance"]
        plan["after"]["registration"] = register
        with self.assertRaisesRegex(ValueError, "Registration does not identify"):
            run(self.root, plan)
        del plan["after"]["registration"]
        shifted = run(self.root, plan)
        self.assertEqual(shifted["after"]["occurrenceRegistration"], "unverified")
        self.assertEqual(shifted["representedSolidEquality"], "open")
        self.assertGreater(shifted["directedComparison"]["absentMm3"], 0.)
        plan["beforeToAfter"][3] = 1e-10
        with self.assertRaisesRegex(ValueError, "same world frame"):
            run(self.root, plan)

    def test_registered_volume_retest_stays_separate_from_shape(self):
        from component_shape import measured_difference, volume
        from fusion_volume_readback import compare, run
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt

        source = BRepPrimAPI_MakeBox(8., 5., 3.).Shape()
        moved = BRepPrimAPI_MakeBox(gp_Pnt(1, 0, 0), 8., 5., 3.).Shape()
        method = "physicalProperties.VeryHigh"
        def observed(values):
            return dict(kernel="Fusion", build="synthetic", unit="mm3",
                        realization="persistent-definition", readings=values)
        first = observed({method: volume(source)})
        other = observed({"body.volume": volume(moved)})
        self.assertEqual(compare(first, other, method, .01)["status"], "unresolved")
        other["readings"][method] = volume(moved)
        with TemporaryDirectory() as directory:
            root = Path(directory)
            model = write(root, "fixture.json", {"synthetic": True})
            def target(name, result):
                ref = write(root, name, dict(modelSha256=model["sha256"], bodies={"part": result}))
                return dict(model=model, observations=ref, body="part")
            plan = dict(source=target("original.json", first), candidate=target("cold.json", other),
                        method=method, toleranceMm3=.01)
            self.assertEqual(run(root, plan)["status"], "consistent-volume")
            (root / "fixture.json").write_text("changed")
            with self.assertRaisesRegex(ValueError, "Changed evidence"):
                run(root, plan)
        for change in [dict(build="different"), dict(realization="temporary"),
                       dict(kernel="OCCT"), dict(unit="cm3"), dict(readings={method: 0})]:
            self.assertEqual(compare(first, dict(other, **change), method, .01)["status"], "unresolved")
        first["readings"]["body.volume"] = 123.
        self.assertEqual(compare(first, other, method, .01)["status"], "unresolved")
        other["readings"][method] += 1
        self.assertEqual(compare(first, other, method, .01)["status"], "different-volume")
        self.assertAlmostEqual(measured_difference(source, moved, [])["absentMm3"], 15.)
        self.assertAlmostEqual(measured_difference(source, source, [])["extraMm3"], 0.)

    def test_service_removals_preserve_one_complete_extraction_history(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        except ImportError:
            self.skipTest("Requires OpenCascade")
        from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
        from OCP.gp import gp_Pnt
        from mechanical_fixture import pin
        from mechanical_motion import bounds, evaluate
        from showcase_contacts import load_solids

        with TemporaryDirectory() as folder:
            root = Path(folder)
            writer = STEPControl_Writer()
            for x in (0, 10, 20, 30):
                solid = BRepPrimAPI_MakeBox(gp_Pnt(x, 0, 0), 2., 2., 2.).Shape()
                writer.Transfer(solid, STEPControl_AsIs)
            writer.Write(str(root / "service.step"))
            shapes, _ = load_solids(root / "service.step")
            first, second, panel, _ = sorted(shapes, key=lambda n: bounds(shapes[n])[0])
            study = dict(schema="agent-frc/mechanical-motion@1", step=pin(root, "service.step"))

            def pull(name, group, removed=None):
                return dict(id=name, basis="Lift the selected stock vertically", stage="service",
                            extract=group, removed=removed or {}, minGapMm=.1,
                            moves={part: [dict(kind="translation", travelMm=[0, 0, 10])] for part in group})

            left = pull("first", [first])
            right = pull("second", [second])
            both = pull("pair", [first, second])
            following = pull("next", [second], {first: "first"})
            alternatives = [left, right, both, following]
            for previous in ({first: "first", second: "next"}, {first: "pair", second: "pair"}):
                final = pull("panel", [panel], previous)
                result = evaluate(root, dict(study, cases=[*alternatives, final]))
                self.assertEqual([(r["status"], r["extracted"]) for r in result["cases"]],
                                 [("pass", sorted(case["extract"])) for case in [*alternatives, final]])

            invalid = {
                "missing grouped member": {first: "pair"},
                "missing earlier removal": {second: "next"},
                "merged independent removals": {first: "first", second: "second"},
                "future extraction": {first: "later"},
            }
            for reason, previous in invalid.items():
                with self.subTest(reason=reason), self.assertRaisesRegex(ValueError, "complete state"):
                    evaluate(root, dict(study, cases=[*alternatives, pull("panel", [panel], previous)]))

    def test_axial_obstruction_requires_strict_coverage_and_keeps_separate_seats(self):
        import runpy
        exercise=runpy.run_path(str(SCRIPTS.parent/"examples/mechanical-readiness/axial-bearing-stack.py"))
        self.assertFalse(exercise["covered"]([0,1],[(-1,.5),(.5,2)]))
        self.assertFalse(exercise["covered"]([0,1],[(0,2)]))
        observed=exercise["exercise"]()
        self.assertTrue(observed["trapped"]["everyOffsetObstructed"])
        relieved=observed["relieved"]
        self.assertFalse(relieved["everyOffsetObstructed"])
        self.assertEqual(relieved["shaftTravel"],"pass")
        self.assertAlmostEqual(relieved["outerShoulderAreaMm2"],40.71504,places=2)
        self.assertAlmostEqual(relieved["innerSpacerAreaMm2"],16.33628,places=2)

    def test_widening_changes_both_extreme_fibers_and_the_bending_comparison(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from section_bending import measure
        case=dict(pointMm=[0,0,5],normalWorld=[0,0,1],bendingAxisWorld=[1,0,0],momentNmm=100000,axialN=0)
        for height in (20,30):
            s=BRepPrimAPI_MakeBox(40,height,10).Shape()
            r=measure(s,case)
            expected=40*height**2/6
            for z in r["sectionModuliMm3"]: self.assertAlmostEqual(z,expected,places=5)
            self.assertAlmostEqual(r["stressAtNegativePositiveFiberMPa"][0],-100000/expected)
        case["comparison"]=dict(sectionModuliMm3=[r["inertiaAboutBendingAxisMm4"]/10]*2,toleranceMm3=.01,
                                basis="Frozen solver retained the previous extreme distance.")
        self.assertEqual(measure(s,case)["modulusComparison"],"outside-declared-tolerance")
        case["pointMm"]=[1e8,-1e8,5]
        self.assertAlmostEqual(measure(s,case)["sectionModuliMm3"][0],expected,places=5)
        case["pointMm"]=[0,0,10]
        with self.assertRaises(ValueError): measure(s,case)

    def test_unsymmetric_net_section_uses_the_full_centroidal_inertia_and_signed_load(self):
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
        from OCP.gp import gp_Ax1,gp_Dir,gp_Pnt,gp_Trsf
        from section_bending import measure
        s=BRepAlgoAPI_Cut(BRepPrimAPI_MakeBox(8,8,10).Shape(),BRepPrimAPI_MakeBox(gp_Pnt(4,4,-1),6,6,12).Shape()).Shape()
        c=(64*4-16*6)/48
        inertia=64*(64/12+(4-c)**2)-16*(16/12+(6-c)**2)
        product=64*(4-c)**2-16*(6-c)**2
        det=inertia**2-product**2
        stress=[3+200*(inertia*(y-c)-product*(x-c))/det for x,y in [(0,0),(0,8),(4,8),(4,4),(8,4),(8,0)]]
        case=dict(pointMm=[1,2,5],normalWorld=[0,0,1],bendingAxisWorld=[1,0,0],momentNmm=200,axialN=144)
        r=measure(s,case)
        self.assertAlmostEqual(r["productOfAreaMm4"], product)
        self.assertAlmostEqual(r["stressAtNegativePositiveFiberMPa"][0],min(stress))
        self.assertAlmostEqual(r["stressAtNegativePositiveFiberMPa"][1],max(stress))
        self.assertGreater(abs(r["sectionModuliMm3"][0]-r["sectionModuliMm3"][1]),1)
        tr=gp_Trsf(); tr.SetRotation(gp_Ax1(gp_Pnt(3,4,5),gp_Dir(1,2,3)),.72)
        case.update(pointMm=gp_Pnt(1,2,5).Transformed(tr).Coord(),normalWorld=gp_Dir(0,0,1).Transformed(tr).Coord(),
                    bendingAxisWorld=gp_Dir(1,0,0).Transformed(tr).Coord(),momentNmm=-200)
        r=measure(BRepBuilderAPI_Transform(s,tr,True).Shape(),case)
        for actual, expected in zip(r["stressAtNegativePositiveFiberMPa"],[6-min(stress),6-max(stress)]):
            self.assertAlmostEqual(actual,expected)

    def test_section_station_registration_preserves_unmeasured_loads_and_other_stations(self):
        from mechanical_fixture import pin
        from section_bending import run
        step=pin(self.root,"fixture.step")
        first=dict(id="inside",solid="frame",pointMm=[5,5,5],normalWorld=[0,0,1],bendingAxisWorld=[1,0,0])
        register=dict(schema="agent-frc/section-loads@1",stepSha256=step["sha256"],basis="Installed cube under inspection.",
                      cases=[first,dict(first,id="shoulder",pointMm=[5,5,10])])
        plan=dict(schema="agent-frc/section-bending@1",step=step,loadCases=write(self.root,"load-cases.json",register))
        rows=run(self.root,plan)["sections"]
        self.assertEqual([r["status"] for r in rows],["measured","open"])
        self.assertIsNone(rows[0]["stressAtNegativePositiveFiberMPa"])
        register["stepSha256"]="0"*64
        plan["loadCases"]=write(self.root,"load-cases.json",register)
        with self.assertRaises(ValueError): run(self.root,plan)

    def test_smooth_belt_pitch_is_separate_from_local_metal_and_other_obstacles(self):
        import math
        from belt_envelope import inspect
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
        from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
        c = 10*math.pi
        def cyl(x,r):
            return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x,0,0),gp_Dir(0,0,1)),r,4).Shape()
        def capsule(r):
            box = BRepPrimAPI_MakeBox(gp_Pnt(0,-r,0),c,2*r,4).Shape()
            return BRepAlgoAPI_Fuse(BRepAlgoAPI_Fuse(box,cyl(0,r)).Shape(),cyl(c,r)).Shape()
        belt = BRepAlgoAPI_Cut(capsule(7),capsule(5)).Shape()
        parts = dict(band=belt,left=cyl(0,6),right=cyl(c,6),
                     guide=BRepPrimAPI_MakeBox(gp_Pnt(c/2,5.5,1),1,1,1).Shape())
        plan = dict(belt="band", axisWorld=[0,0,1], pulleys=[
            dict(solid="left",teeth=12,centerAtStartMm=[0,0,0]),
            dict(solid="right",teeth=12,centerAtStartMm=[c,0,0])],pitchMm=math.pi,beltTeeth=32,
            pitchToInnerMm=1,pitchToOuterMm=1,widthMm=4,pitchLengthToleranceMm=.001,
            shapeResolutionMm3=.1,stationsFromStartMm=[.5,3.5],obstacles=["guide"])
        r=inspect(parts,plan)
        self.assertTrue(r["pitchLengthMatches"])
        self.assertEqual(r["smoothEnvelopeComparison"],"pass")
        self.assertAlmostEqual(r["sampledMetal"][0]["aboveInnerRadiusMm"],1)
        self.assertGreater(r["pairObservations"][0]["measuredCommonMm3"],1)
        self.assertAlmostEqual(r["pairObservations"][-1]["measuredCommonMm3"],1)
        self.assertEqual(r["matingAndLoad"],"open")
        parts["guide"]=BRepPrimAPI_MakeBox(gp_Pnt(c/2,0,1),1,1,1).Shape()
        plan["pulleys"][1]["centerAtStartMm"][0]+=2
        r=inspect(parts,plan)
        self.assertFalse(r["pitchLengthMatches"])
        self.assertEqual(r["smoothEnvelopeComparison"],"fail")
        self.assertEqual(r["pairObservations"][-1]["measuredCommonMm3"],0)
        self.assertAlmostEqual(r["sampledMetal"][-1]["remainingToOuterRadiusMm"],-1)
        self.assertEqual(r["matingAndLoad"],"open")

    def setUp(self):
        self.folder=TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root=Path(self.folder.name)
        self.s=fixture(self.root)

    def change(self,key,edit):
        data=json.loads((self.root/self.s[key]["file"]).read_bytes())
        edit(data)
        self.s[key]=write(self.root,self.s[key]["file"],data)

    def status(self):
        return review(self.root,self.s)

    def test_independent_native_pose_results_survive_an_unusable_peer(self):
        good=self.status()
        self.assertEqual(good["showcaseEligibility"],"pass")
        self.assertEqual([r["status"] for r in good["nativePoseReviews"]],["checked","checked"])
        self.change("nativeCensus",lambda c:c["contacts"]["pairs"][0].update(temporaryCommonMm3=9))
        moving=self.s["nativePoses"][0]
        alternate=json.loads((self.root/moving["file"]).read_bytes())
        absent={"file":"absent.json","sha256":"1"*64}
        controls=[
            (absent,"unavailable"),
            (write(self.root,"aborted.json",{"error":"joint write refused"}),"rejected"),
            (write(self.root,"other.json",dict(alternate,archiveSha256="2"*64)),"rejected"),
            (write(self.root,"broken.json",dict(alternate,bodies=[None])),"rejected"),
            (dict(moving,sha256="3"*64),"rejected"),
        ]
        for ref,expected in controls:
            with self.subTest(ref=ref):
                self.s["nativePoses"]=[ref,moving]
                report=self.status()
                self.assertEqual(report["showcaseEligibility"],"fail")
                self.assertTrue(any(f["domain"]=="interference" and f["subject"][0]=="saved" for f in report["findings"]))
                saved,bad,valid=report["nativePoseReviews"]
                self.assertEqual((saved["source"],saved["status"]),(self.s["nativeCensus"],"fail"))
                self.assertEqual((bad["source"],bad["status"]),(ref,expected))
                self.assertEqual((valid["source"],valid["status"]),(moving,"checked"))
        self.s["nativePoses"]=[moving]
        self.change("nativeCensus",lambda c:c["bodies"][0].update(worldTransform=[None]))
        damaged=self.status()
        self.assertEqual(damaged["showcaseEligibility"],"fail")
        self.assertEqual([r["status"] for r in damaged["nativePoseReviews"]],["rejected","open"])
        self.assertFalse(any("pose bounds disagree" in f["reason"] for f in damaged["findings"]))
        self.s["nativeCensus"]=absent
        report=self.status()
        self.assertNotEqual(report["showcaseEligibility"],"pass")
        self.assertEqual([(r["pose"],r["status"]) for r in report["nativePoseReviews"]],
                         [("saved","unavailable"),(alternate["pose"]["id"],"open")])

    def test_control_and_real_governing_case(self):
        self.assertEqual(self.status()["showcaseEligibility"],"pass")
        self.s["duties"][-1]["max"]=.7
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_historical_volume_census_still_reports_clashes_but_cannot_qualify_new_issue(self):
        legacy = "9a570e82486dbcf077d961a143cf6808666255dda1d17a0ac1a9b9bec0112dfe"
        self.change("nativeCensus", lambda c: c["contacts"].update(programSha256=legacy))
        result = self.status()
        self.assertEqual(result["showcaseEligibility"], "open")
        self.assertIn("Fresh native census", json.dumps(result["findings"]))
        self.change("nativeCensus", lambda c: c["contacts"]["pairs"][0].update(temporaryCommonMm3=999))
        self.assertEqual(self.status()["showcaseEligibility"], "fail")

    def test_required_spatial_pair_cannot_disappear_from_the_cold_census(self):
        self.change("operatingRequirements",lambda r:r["operatingIntent"].update(spatialFits=[{"commission":{"bodies":[]}}]))
        self.s["operatingRequirements"]["pointer"]="/operatingIntent"
        result=self.status()
        self.assertNotEqual(result["showcaseEligibility"],"pass")
        self.assertIn("spatial fit roster",json.dumps(result["findings"]))

    def test_piecewise_stock_sections_and_displaced_bore(self):
        import math
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeCone
        from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
        from stock_sections import stock_difference, compare_limit
        blank = BRepPrimAPI_MakeBox(20, 14, 8).Shape()
        def bore(x):
            axis = gp_Ax2(gp_Pnt(x, 7, 3), gp_Dir(0, 0, 1))
            return BRepAlgoAPI_Cut(blank, BRepPrimAPI_MakeCylinder(axis, 2, 6).Shape()).Shape()
        left, right = bore(4), bore(14)
        measured = stock_difference(left, right, [0, 0, 1])
        for field in ("absentMm3", "extraMm3"):
            self.assertAlmostEqual(measured[field], 20 * math.pi)
        self.assertEqual(compare_limit(measured, .01), "fail")
        self.assertEqual(len(measured["slabs"]), 2)
        match = stock_difference(left, left, [0, 0, 1])
        self.assertEqual(compare_limit(match, .01), "pass")
        self.assertEqual(compare_limit(match, 0), "open")
        taper = BRepPrimAPI_MakeCone(4, 2, 8).Shape()
        self.assertEqual(stock_difference(taper, taper, [0, 0, 1])["status"], "open")
        self.assertEqual(stock_difference(left, right, [1, 0, 0])["status"], "open")

    def test_commissioned_stock_sections_needed_in_release_and_direct_cli(self):
        from stock_sections import run
        from mechanical_readiness import component_inputs, scope_digest
        step = self.root/self.s["step"]["file"]
        self.s = fixture(self.root, measured=measure(step, .02, [], volumes=True))
        target, source, label, pose = component_inputs(self.root, self.s)[0]
        plan = dict(schema="agent-frc/stock-sections@1", before=dict(file=source.name, sha256=digest(source)),
                    after=self.s["step"], comparisons=[dict(beforeSolid=label, afterSolid=target,
                    worldTransform=pose, axisWorld=[0,0,1], resolutionMm3=.01)])
        self.assertEqual(run(self.root, plan)["comparisons"][target]["sourceMatch"], "pass")
        self.s["componentSectionAxesWorld"] = {target: [0,0,1]}
        self.s["articles"][self.s["installed"][target]["article"]]["shapeResolutionMm3"] = .01
        scope = json.loads((self.root/"test-scope.json").read_bytes())
        for observation in scope["observations"].values():
            observation["criteriaSha256"] = scope_digest(self.s)
        signed = write(self.root, "test-scope.json", scope)
        self.s["coverage"] = {k: {**signed, "id": k} for k in scope["observations"]}
        self.assertEqual(self.status()["showcaseEligibility"], "open")
        measured = scan(self.root, self.s)["componentDifferences"]
        self.change("geometry", lambda g: g.update(componentDifferences=measured))
        self.assertEqual(self.status()["showcaseEligibility"], "pass")
        plan["comparisons"][0]["worldTransform"] = list(pose)
        plan["comparisons"][0]["worldTransform"][3] += 2
        self.assertEqual(run(self.root, plan)["comparisons"][target]["sourceMatch"], "fail")
        plan["before"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Changed evidence"):
            run(self.root, plan)

    def test_repeated_interfaces_preserve_world_readings_and_distinct_placements(self):
        from unittest.mock import patch
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.TopLoc import TopLoc_Location
        from OCP.gp import gp_Trsf, gp_Vec
        from showcase_contacts import repeated_interface_disagreements

        def placement(x):
            tr = gp_Trsf()
            tr.SetTranslation(gp_Vec(x, 0, 0))
            return TopLoc_Location(tr)

        block = BRepPrimAPI_MakeBox(2, 2, 2).Shape()
        bar = BRepPrimAPI_MakeBox(3, 1, 1).Shape()
        offset = placement(1)
        moved = placement(20)
        shapes = {"block": block, "bar": bar.Moved(offset),
                  "second block": block.Moved(moved), "second bar": bar.Moved(offset).Moved(moved),
                  "shifted bar": bar.Moved(placement(3)).Moved(moved),
                  "different bar": BRepPrimAPI_MakeBox(3, 1, 1).Shape().Moved(offset).Moved(moved)}
        rows = [["block", "bar", 0, 1.], ["second bar", "second block", 0, 1.],
                ["second block", "shifted bar", 1., 0.], ["second block", "different bar", 0., 0.]]
        self.assertEqual(repeated_interface_disagreements(shapes, rows), [])
        rows[1][3] = 0.
        group, = repeated_interface_disagreements(shapes, rows)
        self.assertEqual(group["status"], "open")
        self.assertEqual([r["worldCommonMm3"] for r in group["observations"]], [1., 0.])
        self.assertAlmostEqual(group["referenceCommonMm3"], 1.)
        self.assertTrue(group["referenceTopologyValid"])
        with patch("component_shape.boolean_measure", side_effect=ValueError("reference kernel unresolved")):
            group, = repeated_interface_disagreements(shapes, rows)
        self.assertIn("unresolved", group["referenceError"])
        self.assertEqual(rows[1][3], 0.)

    def test_disagreeing_step_pairs_stay_open_and_other_clashes_are_reported(self):
        def add_pair(geometry):
            geometry["bodies"].update({"spare frame": [100,0,0,110,10,10],
                                       "spare block": [109,0,0,119,10,10]})
            geometry["pairs"].append(["spare block","spare frame",0,1.])
            geometry["repeatedInterfaceDisagreements"] = [{
                "status":"open", "observations":[
                    {"pair":["block","frame"],"worldCommonMm3":0.},
                    {"pair":["spare block","spare frame"],"worldCommonMm3":1.}]}]
        self.change("geometry",add_pair)
        result=self.status()
        self.assertEqual(result["showcaseEligibility"],"fail")
        interference=[r for r in result["findings"] if r["domain"]=="interference"]
        self.assertTrue(any(r["status"]=="open" and "relative placement" in r["reason"] for r in interference))
        self.assertTrue(any(r["status"]=="fail" and r["subject"]==["spare block","spare frame"] for r in interference))

    def test_blind_and_through_fastener_commissioning(self):
        from fastener_stack import measure as check, review as roster_check
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder
        from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt

        def cylinder(r, start, end):
            axis = gp_Ax2(gp_Pnt(0, 0, start), gp_Dir(0, 0, 1))
            return BRepPrimAPI_MakeCylinder(axis, r, end - start).Shape()

        def screw(length):
            return BRepAlgoAPI_Fuse(cylinder(3.6,-2,0), cylinder(1.8,0,length)).Shape()

        case = dict(screw="s", host="h", seat="p", kind="blind",
                    grippedLayers=[dict(solid="p",exitFromSeatMm=[3.9,4.1],minBearingAreaMm2=3,bearingRadiusMm=4)],
                    underHeadCenterMm=[0,0,0], axisIntoHost=[0,0,1])
        drawing = dict(underHeadLengthMm=[11.9,12.1], gripMm=[3.9,4.1], boreRadiusMm=[1.9,2.1],
                       cylindricalDepthMm=[9.9,10.1], drillPointDepthMm=[9.9,10.1],
                       maleThreadStartFromSeatMm=[0,1], maleTipRunoutMm=[.3,.5], femaleLeadMm=[.3,.5],
                       lastFullThreadDepthMm=[8,9], minEngagementMm=6, minBottomClearanceMm=.5,
                       screwThread="original fixture thread", hostThread="original fixture thread",
                       threadFitBasis="Dimensioned matching teaching parts", minSeatAreaMm2=3,headBearingRadiusMm=3.6)
        solids = dict(s=screw(12), h=BRepAlgoAPI_Cut(cylinder(6,4,17),cylinder(2,3,14)).Shape(),
                      p=BRepAlgoAPI_Cut(cylinder(5,0,4),cylinder(2.2,-1,5)).Shape())
        drawing.update(externalProfile=dict(representation="minor",form="original V",pitchMm=.7,hand="right",
                           minorDiameterMm=[3.58,3.62],pitchDiameterMm=[4.10,4.12],majorDiameterMm=[4.48,4.52]),
                       internalProfile=dict(representation="minor",form="original V",pitchMm=.7,hand="right",
                           minorDiameterMm=[3.98,4.02],pitchDiameterMm=[4.15,4.17],majorDiameterMm=[4.55,4.60]))
        self.assertEqual(check(solids,case,drawing)["status"],"pass")
        vent_axis = gp_Ax2(gp_Pnt(.85,.4,13.5),gp_Dir(0,0,1))
        vent = BRepPrimAPI_MakeCylinder(vent_axis,.25,5).Shape()
        vented = check(dict(solids,h=BRepAlgoAPI_Cut(solids["h"],vent).Shape()),case,drawing)
        self.assertEqual(vented["status"], "open")
        self.assertIn("termination",vented["reason"])
        mouth_axis = gp_Ax2(gp_Pnt(0,0,4),gp_Dir(0,0,1))
        chamfer = BRepPrimAPI_MakeCone(mouth_axis, 2.25, 2, .25).Shape()
        chamfered = dict(solids,h=BRepAlgoAPI_Cut(solids["h"],chamfer).Shape())
        specified = dict(drawing,entranceChamferDepthMm=[.24,.26])
        fit = check(chamfered,case,specified)
        self.assertEqual(fit["status"],"pass")
        self.assertAlmostEqual(fit["pilotStartFromSeatMm"],4.25,places=5)
        self.assertAlmostEqual(fit["cylinderWallLengthMm"],9.75,places=5)
        for incomplete in (drawing, dict(specified,threadFitBasis=""), dict(specified,femaleLeadMm=[.1,.2])):
            self.assertEqual(check(chamfered,case,incomplete)["status"],"open")
        bottomed = check(dict(chamfered,s=screw(15)),case,dict(specified,underHeadLengthMm=[15,15],threadFitBasis=""))
        self.assertEqual(bottomed["status"],"fail")
        self.assertGreater(bottomed["sharedLowerBoundMm3"],0)
        stepped = dict(solids,h=BRepAlgoAPI_Cut(solids["h"],cylinder(2.25,3,4.25)).Shape())
        for grip in ([3.9,4.1],[3.9,4.3]):
            with self.assertRaisesRegex(ValueError,"commissioned mouth"):
                check(stepped,case,dict(specified,gripMm=grip))
        from math import pi
        lip = BRepAlgoAPI_Cut(cylinder(6,4,5),cylinder(2,3,6)).Shape()
        body = BRepAlgoAPI_Cut(cylinder(6,5,17),cylinder(2,3,14)).Shape()
        split = BRepAlgoAPI_Fuse(lip,body).Shape()
        half = BRepPrimAPI_MakeCone(mouth_axis,2.25,2,.25,pi).Shape()
        late_thread = dict(drawing, femaleLeadMm=[1.1,1.2])
        self.assertEqual(check(dict(solids,h=split),case,late_thread)["status"],"pass")
        with self.assertRaisesRegex(ValueError,"commissioned mouth"):
            check(dict(solids,h=BRepAlgoAPI_Cut(split,half).Shape()),case,late_thread)
        thin = BRepAlgoAPI_Cut(cylinder(5,0,.5),cylinder(2.2,-1,5)).Shape()
        self.assertEqual(check(dict(solids,p=thin),case,drawing)["status"],"fail")
        self.assertEqual(check(dict(solids,p=thin),case,dict(drawing,externalProfile={}))["status"],"fail")
        spacer=BRepAlgoAPI_Cut(cylinder(5,.5,4),cylinder(2.2,-1,5)).Shape()
        packed=dict(case,grippedLayers=[dict(case["grippedLayers"][0],exitFromSeatMm=[.5,.5]),
                                        dict(case["grippedLayers"][0],solid="spacer")])
        self.assertEqual(check(dict(solids,p=thin,spacer=spacer),packed,drawing)["status"],"pass")
        direct=dict(solids,s=screw(8),h=BRepAlgoAPI_Cut(cylinder(6,0,13),cylinder(2,-1,10)).Shape())
        self.assertEqual(check(direct,dict(case,seat="h",grippedLayers=[]),
                               dict(drawing,underHeadLengthMm=[7.9,8.1],gripMm=[0,0]))["status"],"pass")
        for radius in (.2,2.9):
            wrong = BRepAlgoAPI_Fuse(cylinder(3.6,-2,0),cylinder(radius,0,12)).Shape()
            self.assertEqual(check(dict(solids,s=wrong),case,drawing)["status"], "open")
        middle = BRepAlgoAPI_Cut(cylinder(3,6,8),cylinder(.2,5,9)).Shape()
        waist = BRepAlgoAPI_Cut(solids["s"],middle).Shape()
        self.assertEqual(check(dict(solids,s=waist),case,drawing)["status"],"open")
        bad_host = dict(drawing, internalProfile=dict(drawing["internalProfile"],hand="left"))
        with self.assertRaisesRegex(ValueError,"hand"):
            check(solids,case,bad_host)
        short=check(dict(solids,s=screw(7)),case,dict(drawing,underHeadLengthMm=[6.9,7.1]))
        self.assertEqual(short["status"], "fail")
        self.assertLess(short["minimumFullEngagementMm"],6)
        bottom=check(dict(solids,s=screw(15)),case,dict(drawing,underHeadLengthMm=[14.9,15.1]))
        self.assertEqual(bottom["status"], "fail")
        self.assertGreater(bottom["sharedLowerBoundMm3"],0)
        through = dict(solids,h=BRepAlgoAPI_Cut(cylinder(6,4,11),cylinder(2,3,12)).Shape())
        td = dict(drawing,cylindricalDepthMm=[6.9,7.1], lastFullThreadDepthMm=[6.6,6.8],
                  minEngagementMm=5.5, minThroughProjectionMm=.5)
        self.assertEqual(check(through,dict(case,kind="through"),td)["status"],"pass")
        with self.assertRaisesRegex(ValueError, "through"):
            check(solids,dict(case,kind="through"),td)
        with self.assertRaisesRegex(ValueError,"Unclassified"):
            roster_check(self.root,dict(stepSha256="issue",nonScrewSolids=["h","p"],stacks=[]),solids,"issue")
        self.change("operatingRequirements",lambda plan:plan["operatingIntent"].pop("fastenerStacks"))
        self.assertNotEqual(self.status()["showcaseEligibility"],"pass")


    def test_split_pilot_preserves_the_wall_and_rejects_removed_material(self):
        from math import pi
        from fastener_stack import bore_profile, circular_partition, closed_flat_floor, trace_bore
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Common, BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
        from OCP.BRepCheck import BRepCheck_Analyzer
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCone, BRepPrimAPI_MakeCylinder
        from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt

        def box(x,y,z,dx,dy,dz):
            return BRepPrimAPI_MakeBox(gp_Pnt(x,y,z),dx,dy,dz).Shape()

        # A small datum rounding error is inside the registered coaxial tolerance.
        offset = .000006
        def axis(z):
            return gp_Ax2(gp_Pnt(offset,0,z),gp_Dir(0,0,1))

        def profile(shape,through=False):
            self.assertTrue(BRepCheck_Analyzer(shape).IsValid())
            return bore_profile(shape,[1.99,2.01],[-.01,.01],through=through)

        def divided(shape):
            half = box(offset,-8,-2,8,16,15)
            return BRepAlgoAPI_Fuse(BRepAlgoAPI_Cut(shape,half).Shape(),
                BRepAlgoAPI_Common(shape,half).Shape()).Shape()

        block = box(-5,-5,0,10,10,10)
        pilot = BRepPrimAPI_MakeCylinder(axis(-1),2,7).Shape()
        cone = BRepPrimAPI_MakeCone(axis(6),2,0,1.25).Shape()
        blind = BRepAlgoAPI_Cut(BRepAlgoAPI_Cut(block,pilot).Shape(),cone).Shape()
        flat = divided(BRepAlgoAPI_Cut(block,pilot).Shape())
        _,_,end,_,r,walls = trace_bore(flat,[1.99,2.01],[-.01,.01])
        self.assertTrue(closed_flat_floor(flat,walls,end,r))
        for host in (blind,divided(blind)):
            mouth,start,end,tips = profile(host)
            self.assertEqual([mouth,start,end,tips],[0.,0.,6.,[7.25]])
            with self.assertRaisesRegex(ValueError,"through exit"):
                profile(host,True)
        through = BRepAlgoAPI_Cut(block,BRepPrimAPI_MakeCylinder(axis(-1),2,12).Shape()).Shape()
        self.assertEqual(profile(divided(through),True),(0.,0.,10.,[]))
        # Keep both end rings intact while cutting entirely through the middle of the wall.
        for host in (through,divided(through)):
            window = box(0,-.35,2,6,.7,2)
            with self.assertRaisesRegex(ValueError,"wall"):
                profile(BRepAlgoAPI_Cut(host,window).Shape(),True)
        self.assertFalse(circular_partition([(0,pi),(0,pi)]))
        self.assertFalse(circular_partition([(0,pi/2),(pi,pi)]))


    def test_directional_clearance_preserves_actual_contacts_and_probe_distance(self):
        from unittest.mock import patch
        import math
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.TopLoc import TopLoc_Location
        from OCP.gp import gp_Trsf, gp_Vec, gp_Ax1, gp_Pnt, gp_Dir
        from placed_separation import projected_clearance

        rotate=gp_Trsf()
        rotate.SetRotation(gp_Ax1(gp_Pnt(),gp_Dir(0,0,1)), math.pi/4)
        bar=BRepPrimAPI_MakeBox(10,1,1).Shape().Moved(TopLoc_Location(rotate))
        normal=[-math.sqrt(.5), math.sqrt(.5), 0]
        def placed(offset):
            tr=gp_Trsf()
            tr.SetTranslation(gp_Vec(*[v*offset for v in normal]))
            return {"guide":bar,"shoe":bar.Moved(TopLoc_Location(tr))}

        axes=[{"pair":["guide","shoe"],"axesWorld":[normal]}]
        clear=placed(1.6)
        with patch("showcase_contacts.load_solids",return_value=(clear,[])):
            with patch("component_shape.boolean_measure",side_effect=AssertionError("unexpected common")):
                scan=measure(self.root,.01,[],volumes=True,separation_axes=axes)
                actual=measure(self.root,.01,[("guide","shoe")],volumes=True,separation_axes=axes)
        pair,=scan["pairs"]
        self.assertAlmostEqual(pair[2],.6,places=5)
        self.assertEqual(pair[3],0.)
        self.assertEqual(scan["projectedSeparations"][0]["pairDistanceKind"],"lower-bound")
        self.assertEqual(actual["projectedSeparations"][0]["pairDistanceKind"],"extrema")
        self.assertGreaterEqual(actual["pairs"][0][2],pair[2])
        self.assertEqual(projected_clearance(clear,("guide","shoe"),[normal],.6)["status"],"open")
        crossed=placed(.8)
        self.assertEqual(projected_clearance(crossed,("guide","shoe"),[normal])["status"],"open")
        with patch("showcase_contacts.load_solids", return_value=(crossed,[])):
            scan=measure(self.root,.01,[],volumes=True,separation_axes=axes)
        self.assertAlmostEqual(scan["pairs"][0][3],2.)
        self.assertEqual(scan["projectedSeparations"][0]["status"],"open")

    def test_world_intersection_checks_topology_before_accepting_a_volume(self):
        from unittest.mock import patch
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        shapes={"a":BRepPrimAPI_MakeBox(2,2,2).Shape(),
                "b":BRepPrimAPI_MakeBox(gp_Pnt(1,1,1),2,2,2).Shape()}
        with patch("showcase_contacts.load_solids", return_value=(shapes,[])):
            direct=measure(self.root,0,[],volumes=True)
            self.assertAlmostEqual(direct["pairs"][0][3],1.)
            for value,valid in [(0.,False),(1.,False),(9.,True)]:
                with self.subTest(value=value,valid=valid), patch("component_shape.boolean_measure",return_value=(value,valid)) as query:
                    result=measure(self.root,0,[],volumes=True)
                    query.assert_called_once()
                    self.assertIsNone(result["pairs"][0][3])
                    observation,=result["unresolvedIntersections"]
                    self.assertEqual(observation["rawCommonMm3"],value)
                    self.assertEqual(observation["topologyValid"],valid)
            with patch("component_shape.boolean_measure",side_effect=ValueError("kernel unresolved")):
                result=measure(self.root,0,[],volumes=True)
                self.assertIsNone(result["unresolvedIntersections"][0]["rawCommonMm3"])

    def test_unresolved_world_pair_preserves_an_independent_clash(self):
        def invalid(geometry):
            geometry["pairs"][0][3]=None
            geometry["unresolvedIntersections"]=[{"pair":["block","frame"],"topologyValid":False,
                "rawCommonMm3":8.1,"reason":"Invalid topology"}]
        self.change("geometry",invalid)
        findings=self.status()["findings"]
        self.assertTrue(any(r["status"]=="open" and "Invalid topology" in r["reason"] for r in findings))
        self.assertFalse(any(r["status"]=="fail" for r in findings))
        def extra(geometry):
            geometry["bodies"].update({"spare frame":[100,0,0,110,10,10],"spare block":[109,0,0,119,10,10]})
            geometry["pairs"].append(["spare block","spare frame",0,1.])
        self.change("geometry",extra)
        self.assertEqual(self.status()["showcaseEligibility"],"fail")
        self.change("geometry",lambda g:g.pop("unresolvedIntersections"))
        with self.assertRaisesRegex(ValueError,"Invalid/repeated"):
            self.status()

    def test_connected_clash_and_incomplete_pair_coverage(self):
        self.change("geometry",lambda g:g["pairs"][0].__setitem__(3,8.1))
        r=self.status()
        self.assertEqual(len(r["geometricGroups"]),1)
        self.assertEqual(r["showcaseEligibility"],"fail")
        self.change("geometry",lambda g:g.update(pairs=[]))
        with self.assertRaisesRegex(ValueError,"Incomplete"):
            self.status()

    def test_attached_obsolete_article_and_missing_current_site(self):
        approved=self.status()
        self.assertEqual(approved["articleFunctions"]["differences"],0)
        target=json.loads((self.root/"article-functions.json").read_bytes())
        target["occurrences"][1]["path"]="right inspection block"
        target_ref=write(self.root,"next-architecture.json",target)
        self.change("operatingRequirements",lambda plan:plan["operatingIntent"].update(articleFunctions=target_ref))
        self.s["operatingRequirements"]["pointer"]="/operatingIntent"
        actual=self.status()
        self.assertEqual(actual["retainedGroups"],approved["retainedGroups"])
        self.assertEqual(actual["showcaseEligibility"],"fail")
        self.assertEqual(actual["articleFunctions"]["differences"],2)
        self.assertTrue(any(r["subject"]=="block" and "no commissioned function" in r["reason"] for r in actual["findings"]))
        self.assertTrue(any(r["subject"]=="right inspection block" and "Missing occurrence" in r["reason"] for r in actual["findings"]))

    def test_approved_function_roster_cannot_be_rewritten_or_reused_for_a_different_issue(self):
        from article_functions import compare,slots
        target=json.loads((self.root/"article-functions.json").read_bytes())
        installed={r["path"]:dict(r) for r in target["occurrences"]}
        installed["block"]["revision"]="different"
        self.assertIn("revision",compare(target,installed,"bench",self.s["configuration"])[0][1])
        with self.assertRaisesRegex(ValueError,"different authority"):
            compare(target,installed,"another design",self.s["configuration"])
        target["occurrences"].append(target["occurrences"][0])
        with self.assertRaisesRegex(ValueError,"Repeated"):
            slots(target)
        write(self.root,"article-functions.json",target)
        result=self.status()
        self.assertEqual(result["showcaseEligibility"],"open")
        self.assertTrue(any(r["subject"]=="commissioned article functions" and "Changed evidence" in r["reason"] for r in result["findings"]))

    def test_visible_legacy_rail_cannot_be_filtered_out_of_both_step_and_declared_native_bodies(self):
        def omit(census):
            census["bodies"].append(dict(census["bodies"][0],path="Legacy stock rail:1",name="Crossing the motor"))
        self.change("nativeCensus",omit)
        out=self.status()
        self.assertEqual(out["showcaseEligibility"],"fail")
        self.assertTrue(any("Legacy stock" in row["subject"] for row in out["findings"]))

    def test_latest_canonical_source_stale_child_same_name_and_old_step(self):
        from fusion_authority import verify
        authority=self.root/self.s["authority"]["file"];lineage=self.root/self.s["lineage"]["file"]
        spec=json.loads(authority.read_bytes());issued=json.loads(lineage.read_bytes())
        self.assertEqual(verify(self.root,authority,lineage)["policy"],"registered-offline-archive")
        spec["source"]={"kind":"cloud","dataFileId":"unique-cloud-file"}
        issued.update(authority=write(self.root,self.s["authority"]["file"],spec),policy="observed-cloud-latest",
            dataFileId="other-cloud-file",savedVersion=8,latestVersion=8,versionId="exact-8",children=[],hasOutofDateChildReferences=False)
        def check():
            write(self.root,lineage.name,issued)
            return verify(self.root,authority,lineage)
        with self.assertRaisesRegex(ValueError,"design"):
            check()
        issued["dataFileId"]="unique-cloud-file";issued["latestVersion"]=9
        with self.assertRaisesRegex(ValueError,"latest"):
            check()
        issued.update(savedVersion=9,hasOutofDateChildReferences=True,children=[dict(id="link",versionId="v2",latestVersionId="v3")])
        with self.assertRaisesRegex(ValueError,"stale"):
            check()
        spec["pinnedChildren"]=[dict(id="link",versionId="v2",basis="version-qualified option")]
        issued["authority"]=write(self.root,self.s["authority"]["file"],spec)
        self.assertEqual(check()["status"],"pass")
        (self.root/issued["step"]["file"]).write_text("stale export")
        with self.assertRaisesRegex(ValueError,"evidence"):
            check()

    def test_native_pair_incomplete_and_failed_repeated_readback(self):
        self.change("nativeCensus",lambda c:c["contacts"].update(pairs=[]))
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s=fixture(self.root)
        self.change("nativeCensus",lambda c:c["contacts"]["pairs"][0].update(interferenceMm3=9))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")
        self.s=fixture(self.root)
        raw=json.loads((self.root/"test-raw.json").read_bytes())
        raw["measurements"]["heldout"]=dict(raw["measurements"]["strength"],value=1.6)
        updated=write(self.root,"test-raw.json",raw)
        obs=json.loads((self.root/"test-observations.json").read_bytes())
        for row in obs["observations"].values():
            if "measurement" in row:
                row["measurement"].update(updated)
                row["sources"][0].update(updated)
        u=write(self.root,"test-observations.json",obs)
        for d in self.s["duties"]:d["observation"].update(u)
        self.s["connections"][0]["evidence"].update(u)
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_nested_joint_source_cannot_override_governing_seat(self):
        from joint_sources import verify
        pair=["block","frame"];step=self.s["step"]["sha256"];archive=self.s["archive"]["sha256"]
        def qualify(status):
            child=write(self.root,"seat.json",dict(schema="agent-frc/mechanical-motion-result@1",stepSha256=step,
                cases=[dict(seats=[dict(pair=pair,areaMm2=48,minAreaMm2=50 if status=="fail" else 45,
                    status=status,interferenceMm3=0)])]))
            summary=write(self.root,"qualified.json",dict(stepSha256=step,archiveSha256=archive,status="pass",pair=pair,
                qualification={"sources":[child]}))
            return lambda:verify(self.root,[summary],pair,archive,step,"A")
        qualify("pass")()
        with self.assertRaisesRegex(ValueError,"area|pass"):qualify("fail")()

    def test_coincident_faces_do_not_establish_retention(self):
        self.s["connections"]=[]
        r=self.status()
        self.assertEqual(len(r["geometricGroups"]),1)
        self.assertEqual(len(r["retainedGroups"]),2)
        self.assertEqual(r["showcaseEligibility"],"open")

    def test_real_separation_exceeds_interface_gap(self):
        self.change("geometry",lambda g:g["pairs"][0].__setitem__(2,2))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_archived_evidence_broken_by_substitution_or_missing_stiffness(self):
        self.s["articles"]["block"]["representation"]="supplier-envelope"
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s["articles"]["block"]["representation"]="official-exact"
        del self.s["duties"][5]["observation"]
        self.assertEqual(self.status()["showcaseEligibility"],"open")

    def test_complete_signed_load_spectrum_and_supported_fatigue_only(self):
        from member_duty import evaluate
        step=self.s["step"]
        base=dict(body="root",stepSha256=step["sha256"])
        dims=write(self.root,"dims.json",{**base,"section":"solid-rectangle","bendingAxis":"minor","grade":"fixture",
            "spanMm":100,"widthMm":10,"depthMm":10})
        mat=write(self.root,"mat.json",dict(grade="fixture",basis="original teaching fixture",modulusMPa=100000,bendingAllowableMPa=100,
            fatigueBasis="reversed bending, matching source treatment",fullyReversedSnMPaCycles=[[90,1000],[20,100000]]))
        cyc=dict(id="adverse",source="synthetic force history",minimumN=-50,maximumN=50,cycles=10)
        forces={**base,"support":"fixed-free-end-force","axis":"minor","cases":[cyc],"completeLifeSpectrum":True}
        study=dict(schema="agent-frc/member-duty@1",step=step,material=mat,dimensions=dims,body="root",stressFactor=1,
            factorBasis="uniform synthetic section",deflectionLimitMm=1,damageLimit=1)
        def actual():
            study["load"]=write(self.root,"forces.json",forces)
            return evaluate(self.root,study)
        r=actual()
        self.assertEqual(r["status"],"pass")
        self.assertAlmostEqual(r["cases"][0]["bendingMPa"],30)
        self.assertAlmostEqual(r["cases"][0]["tipDeflectionMm"],.2)
        cyc["cycles"]=1000000
        self.assertEqual(actual()["fatigue"],"fail")
        cyc["minimumN"]=0
        self.assertEqual(actual()["status"],"open")
        cyc["maximumN"]=400
        self.assertEqual(actual()["status"],"fail")

    def test_changed_pose_assembly_and_raw_evidence(self):
        self.s["installed"]["block"]["transform"][3]=9
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s["installed"]["block"]["transform"][3]=10
        (self.root/"test-raw.json").write_text("{}")
        with self.assertRaisesRegex(ValueError,"Changed evidence"):
            self.status()

    def test_same_vendor_sku_and_good_source_geometry_do_not_cover_a_new_configuration(self):
        from vendor_configuration import compare
        article=self.s["articles"]["block"]
        self.assertEqual(compare(self.root,article)["status"],"pass")
        purchase=json.loads((self.root/"ordered.json").read_bytes())
        purchase["items"].append(dict(position="spacer",partNumber="slim spacer",revision="b",quantity=2))
        article["procurementBom"]=write(self.root,"ordered.json",purchase)
        self.assertEqual(compare(self.root,article)["differentPositions"],["spacer"])
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_rights_for_native_and_derivatives_are_separate(self):
        p=self.root/"view.png";p.write_bytes(b"test view")
        self.s=fixture(self.root,assets=["view.png"])
        self.s["articles"]["block"]["rights"]="derived-views-only"
        with self.assertRaisesRegex(ValueError,"projection"):
            verify_delivery(self.root,self.s,["view.png"])
        with self.assertRaisesRegex(ValueError,"redistribution"):
            verify_delivery(self.root,self.s,["test.f3d"])
        self.s["articles"]["block"]["rights"]="private-master"
        with self.assertRaisesRegex(ValueError,"public view"):
            verify_delivery(self.root,self.s,["view.png"])

    def test_fresh_step_repeated_source_measurement_clear_and_interfering_controls(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
            from OCP.gp import gp_Pnt
            from OCP.STEPControl import STEPControl_AsIs,STEPControl_Writer
        except ImportError:
            self.skipTest("Install OCP to exercise the native measurement lane")
        from showcase_release import verify_candidate
        for x,expected in [(10,"pass"),(8,"fail")]:
            file=self.root/"actual.step"
            writer=STEPControl_Writer()
            for pos in [0,x]:
                writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(pos,0,0),10.,10.,10.).Shape(),STEPControl_AsIs)
            writer.Write(str(file))
            data=measure(file,.02,[],volumes=True)
            from mechanical_readiness import digest
            data["stepSha256"]=digest(file)
            self.assertAlmostEqual(data["pairs"][0][3],(10-x)*100,places=5)
            s=fixture(self.root,"actual.step",measured=data)
            self.assertEqual(review(self.root,s)["showcaseEligibility"],expected)
            if expected=="pass":
                with self.assertRaisesRegex(ValueError,"native station|native Fusion"):
                    verify_candidate(self.root,"test-readiness.json","actual.step",[])
            else:
                with self.assertRaisesRegex(ValueError,"readiness fail"):
                    verify_candidate(self.root,"test-readiness.json","actual.step",[])

    def test_independent_grounding_regressions(self):
        # Adding a same-bounds purchased bore is a shape change independently of a good envelope.
        self.change("geometry",lambda g:g["componentDifferences"]["block"].update(extraMm3=125.66))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")
        self.s=fixture(self.root)
        self.s["duties"][-1]["max"]=1.25
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s=fixture(self.root)
        for d in self.s["duties"]:
            d["subjects"]=["frame"]
        with self.assertRaisesRegex(ValueError,"case/subjects"):
            self.status()
        self.s=fixture(self.root)
        self.change("geometry",lambda g:g["pairs"][0].__setitem__(2,50))
        obs=json.loads((self.root/"test-observations.json").read_bytes())
        obs["observations"]["joint"]["maxInterfaceGapMm"]=50
        updated=write(self.root,"test-observations.json",obs)
        for d in self.s["duties"]:d["observation"].update(updated)
        self.s["connections"][0]["evidence"].update(updated)
        self.assertNotEqual(self.status()["showcaseEligibility"],"pass")

    def test_inconsistent_solid_comparison_stays_open_without_masking_a_second_failure(self):
        from unittest.mock import patch
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.gp import gp_Pnt
        from component_shape import measured_difference
        block=BRepPrimAPI_MakeBox(10.,8.,6.).Shape()
        def placed(x):
            return BRepPrimAPI_MakeBox(gp_Pnt(x,0,0),10.,8.,6.).Shape()
        self.assertAlmostEqual(measured_difference(block,placed(0),[])["absentMm3"],0)
        disjoint=measured_difference(block,placed(13),[])
        self.assertNotIn("measurementStatus",disjoint)
        self.assertAlmostEqual(disjoint["extraMm3"],480)
        # Fault-inject only the three Boolean scalar returns; the independent
        # interior test still runs both solid classifiers and measures real faces.
        with patch("component_shape.boolean_measure",side_effect=[(480.,True),(480.,True),(0.,True)]*2):
            contradicted=measured_difference(block,placed(0),[])
            thin=measured_difference(block,placed(9.99999),[])
        self.assertEqual(thin["measurementStatus"],"open")
        self.assertGreater(thin["numericalEvidence"]["certifiedLowerBoundMm3"],0)
        self.assertEqual(contradicted["absentMm3"],480)
        self.assertEqual(contradicted["measurementStatus"],"open")
        self.assertGreater(contradicted["numericalEvidence"]["certifiedLowerBoundMm3"],1)
        self.change("geometry",lambda g:g["componentDifferences"].update(frame=contradicted))
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.change("geometry",lambda g:g["componentDifferences"]["block"].update(extraMm3=2))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")
        with patch("component_shape.boolean_measure",side_effect=[(0.,False),(0.,True)]):
            invalid=measured_difference(block,placed(0),[])
            self.assertEqual(invalid["measurementStatus"],"open")
            self.assertFalse(invalid["numericalEvidence"]["absentTopologyValid"])
        with patch("component_shape.boolean_measure",side_effect=[(0.,True),(0.,True),(480.,False)]):
            invalid=measured_difference(block,placed(0),[[5,4,3]])
            self.assertEqual(invalid["measurementStatus"],"open")
            self.assertFalse(invalid["numericalEvidence"]["commonTopologyValid"])
        with patch("component_shape.boolean_measure",side_effect=ValueError("kernel failure")):
            self.assertEqual(measured_difference(block,placed(0),[])["measurementStatus"],"open")

    def test_shared_package_keeps_partial_and_stale_handoffs_distinct(self):
        import runpy
        from preliminary_design import review
        from mechanical_fixture import package_write
        build=Path(__file__).resolve().parents[1]/"examples/preliminary-design/create.py"
        folder=self.root/"layout"
        plan=runpy.run_path(str(build))["create"](folder)
        file=folder/"layout.json"
        good=review(folder.parent,file)
        self.assertEqual(good["status"],"layout-checked")
        self.assertEqual(good["control"]["witness"]["witness"]["t"],.5)
        self.assertGreater(good["control"]["witness"]["witness"]["volumeMm3"],50)
        self.assertTrue(good["view"]["verified"])
        from copy import deepcopy
        incomplete = deepcopy(plan)
        del incomplete["presentation"]["components"]["head"]["rationale"]
        incomplete["narrativeReview"]["objectives"][1]["disposition"] = "open"
        package_write(folder,"layout.json",incomplete)
        held = review(folder.parent,file)
        self.assertEqual(held["status"],"provisional")
        self.assertIn("Missing component rationale: head",held["missingInputs"])
        self.assertIn("Open narrative objective: Park at the finish",held["missingInputs"])
        old = dict(plan)
        del old["narrativeReview"], old["presentation"]
        package_write(folder,"layout.json",old)
        self.assertIn("Read and identify the current strategic narrative",review(folder.parent,file)["missingInputs"])
        package_write(folder,"layout.json",plan)
        self.assertEqual(good["budgets"]["inspectionKg"],[11,13.5])
        weak=[r for r in good["budgets"]["electricalCases"] if r["batteryCondition"]=="weak"]
        self.assertEqual({r["stage"] for r in weak},set(plan["cycle"]))
        self.assertTrue(all(r["loadedBusV"][0]==10 for r in weak))
        player=folder.parent/plan["view"]
        original=player.read_bytes()
        # The review page is a starting place: a project's edit to its copy does not unsettle the checked layout.
        player.write_bytes(original+b"<!-- an invented project edit -->")
        self.assertEqual(review(folder.parent,file)["status"],"layout-checked")
        player.write_bytes(original)
        budget=json.loads((folder/"budgets.json").read_text())
        budget["electricalCases"]["loaded-turn-weak"]["batterySideA"]["drive"]=[20,80]
        package_write(folder,"layout.json",dict(plan,budgets=package_write(folder,"weak.json",budget)))
        undervoltage=review(folder.parent,file)
        self.assertEqual(undervoltage["status"],"blocked")
        self.assertIn("voltage/loaded-turn-weak",[r["reason"] for r in undervoltage["reopen"]])
        static=json.loads((folder/"paths.json").read_text())
        static["cases"][0]["initialPose"]={"rail":[{"kind":"translation","travelMm":[-21,-72,-18]}]}
        package_write(folder,"layout.json",dict(plan,motion=package_write(folder,"stationary.json",static)))
        collision=review(folder.parent,file)
        self.assertEqual(collision["status"],"blocked")
        self.assertTrue(any(set(p["pair"])=={"mount","rail"} and p["status"]=="fail"
                            for c in collision["cases"] for p in c["pairs"]))
        off_host=dict(plan,mounts=[dict(plan["mounts"][0],pointMm=[200,0,0]),plan["mounts"][1]])
        package_write(folder,"layout.json",off_host)
        self.assertIn("outside the selected host",review(folder.parent,file)["missingInputs"][0])
        partial=dict(plan,missingInputs=["Cable loop radius"])
        package_write(folder,"layout.json",partial)
        self.assertEqual(review(folder.parent,file)["status"],"provisional")
        package_write(folder,"layout.json",dict(plan,control=dict(plan["control"],offsetMm=[0,50,0])))
        self.assertEqual(review(folder.parent,file)["status"],"provisional")
        observations=plan["premises"]
        current=json.loads((folder.parent/observations[1]["current"]["file"]).read_text())
        slower=package_write(folder,"slower.json",dict(current,value=3.01,source=package_write(folder,"slow-estimate.json",{"acquireSeconds":3.01})))
        package_write(folder,"layout.json",dict(plan,premises=[observations[0],dict(observations[1],current=slower)]))
        stale=review(folder.parent,file)
        self.assertEqual(stale["status"],"reopen")
        self.assertEqual(stale["reopen"],[dict(phase="conceptual-design",reason="acquire-time",affected=["carried article","carrier"])])
        hold=folder/"hold.json"
        package_write(folder,hold.name,stale)
        package_write(folder,"layout.json",plan)
        self.assertEqual(review(folder.parent,file,hold)["status"],"reopen")
        decision=json.loads((folder.parent/observations[1]["accepted"]["file"]).read_text())
        import subprocess
        profile=json.loads((SCRIPTS.parent/"examples/kickoff/training-field.json").read_text())
        profile["rehearsal"]["programs"]["shuttle"]["steps"][0]["dwell"]=current["value"]
        run_input=package_write(folder,"field.json",profile)
        replay=json.loads(subprocess.check_output(["node",str(SCRIPTS/"rehearsal-series.mjs"),str(folder/"field.json")]))
        field=dict(profile=run_input,result=package_write(folder,"replayed.json",replay),match="trial-1",actor="B1",
                   input="actionDwell",period="Opening",stepIndex=0,stepLabel="Pick up tile")
        upstream=package_write(folder,"latest-role.json",dict(issue=plan["issue"],designSha256=plan["design"]["sha256"],
                       stepSha256=plan["step"]["sha256"],phase="conceptual-design",scenario="selected cycle",premise="acquire-time",
                       fieldReplay=field))
        repeated=package_write(folder,"repeat.json",dict(decision,source=upstream,repeat=dict(previousPlanSha256=stale["planSha256"])))
        package_write(folder,"layout.json",dict(plan,premises=[observations[0],dict(observations[1],accepted=repeated)]))
        self.assertEqual(review(folder.parent,file,hold)["status"],"layout-checked")
        earlier=package_write(folder,"earlier.json",dict(current,issue="outgoing"))
        package_write(folder,"layout.json",dict(plan,premises=[dict(observations[1],current=earlier)]))
        self.assertEqual(review(folder.parent,file)["status"],"provisional")
        nominal=json.loads((folder/"paths.json").read_text())
        nominal["cases"][0]["initialPose"]={"rail":[{"kind":"translation","travelMm":[0,-50,0]}]}
        package_write(folder,"layout.json",dict(plan,motion=package_write(folder,"blocked.json",nominal)))
        self.assertEqual(review(folder.parent,file)["status"],"blocked")
        nominal["cases"][0]["moves"]["sample"][0]["travelDeg"]=-90
        package_write(folder,"layout.json",dict(plan,motion=package_write(folder,"wrong-carry.json",nominal)))
        with self.assertRaisesRegex(ValueError,"diverges"):
            review(folder.parent,file)
        (folder/"design.json").write_text((folder/"design.json").read_text()+" ")
        with self.assertRaisesRegex(ValueError,"Changed evidence"):
            review(folder.parent,file)

    def test_true_placed_bore_and_midstroke_tool_collision(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox,BRepPrimAPI_MakeCylinder
            from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
            from OCP.gp import gp_Pnt,gp_Ax2,gp_Dir
            from OCP.STEPControl import STEPControl_AsIs,STEPControl_Writer
        except ImportError:
            self.skipTest("Install OCP to exercise the native comparison")
        from component_shape import compare_components
        from showcase_contacts import load_solids
        from mechanical_motion import evaluate
        from mechanical_fixture import pin
        def save(name,shapes):
            writer=STEPControl_Writer()
            for solid in shapes:writer.Transfer(solid,STEPControl_AsIs)
            path=self.root/name;writer.Write(str(path));return path
        cube=BRepPrimAPI_MakeBox(10.,10.,10.).Shape()
        hole=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(5,5,0),gp_Dir(0,0,1)),2,10).Shape()
        official=save("bored.step",[BRepAlgoAPI_Cut(cube,hole).Shape()])
        installed=save("line.step",[cube,BRepPrimAPI_MakeBox(gp_Pnt(20,0,0),5.,10.,10.).Shape()])
        labels=list(load_solids(installed)[0]);original=next(iter(load_solids(official)[0]))
        delta=compare_components(installed,[(labels[0],official,original,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])])
        with self.assertRaisesRegex(ValueError,"reflection"):
            compare_components(installed,[(labels[0],official,original,[-1,0,0,10,0,1,0,0,0,0,1,0,0,0,0,1])])
        self.assertAlmostEqual(delta[labels[0]]["extraMm3"],40*3.14159265358979,places=4)
        case=dict(id="service",basis="finite driver passes through housing at intermediate stroke",minGapMm=.1,
                  moves={labels[0]:[dict(kind="translation",travelMm=[40,0,0])]})
        m={"schema":"agent-frc/mechanical-motion@1","step":pin(self.root,"line.step"),"cases":[case]}
        result=evaluate(self.root,m)["cases"][0]
        self.assertEqual(result["status"],"fail")
        self.assertEqual(result["pairs"][0]["witness"]["t"],.5)
        case["moves"][labels[0]][0]["travelMm"]=[0,20,0]
        self.assertEqual(evaluate(self.root,m)["cases"][0]["status"],"pass")
        case["requiredContacts"]=[dict(id="pickup",pair=labels,maxGapMm=.1,window=[0,1],criterion="actual source contact")]
        miss=evaluate(self.root,m)["cases"][0]
        self.assertEqual(miss["status"],"fail")
        self.assertGreater(miss["requiredContacts"][0]["lowerBoundMm"],.1)
        from mechanical_motion import bearing_area
        side=BRepPrimAPI_MakeBox(gp_Pnt(10,0,0),10.,10.,10.).Shape()
        edge=BRepPrimAPI_MakeBox(gp_Pnt(10,10,0),10.,10.,10.).Shape()
        self.assertAlmostEqual(bearing_area(cube,side),100)
        self.assertEqual(bearing_area(cube,edge),0)
        # Sliding a bored block past a stud: its bounding box collides even when
        # the finite stud stays inside the bored-through channel for the whole stroke.
        from mechanical_motion import planar_translation_clear
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
        channel=BRepPrimAPI_MakeBox(gp_Pnt(-1,2,2),12.,6.,6.).Shape()
        carrier=BRepAlgoAPI_Cut(cube,channel).Shape()
        travel=[dict(kind="translation",travelMm=[20,0,0])]
        for y,expected in ((3,True),(1,False)):
            stud=BRepPrimAPI_MakeBox(gp_Pnt(12,y,3),2.,2.,2.).Shape()
            self.assertEqual(planar_translation_clear(carrier,stud,travel,[],0),expected)
        case.pop("requiredContacts")
        case["initialPose"]={labels[1]:[dict(kind="translation",travelMm=[-18,0,0])]}
        case["moves"][labels[1]]=case["moves"][labels[0]]
        self.assertEqual(evaluate(self.root,m)["cases"][0]["status"],"fail")



if __name__=="__main__":
    unittest.main()
