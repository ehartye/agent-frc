# @lane merge
"""Synthetic host boundary tests. Real Fusion is a separate qualification."""
import copy
import hashlib
import itertools
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import native_study_replay as replay

Obj = types.SimpleNamespace


class Collection(list):
    @property
    def count(self):
        return len(self)

    def item(self, i):
        return self[i]


class Matrix:
    def __init__(self, values=replay.IDENTITY):
        self.values = list(values)

    def asArray(self):
        return self.values

    def setWithArray(self, values):
        self.values = values
        return True


def translation(x, y=0):
    result = list(replay.IDENTITY)
    result[3], result[7] = x, y
    return result


def body(name):
    box = Obj(minPoint=Obj(x=0, y=0, z=0), maxPoint=Obj(x=1, y=1, z=1))
    return Obj(name=name, revisionId="body-revision", entityToken=name, isSolid=True, volume=1.0,
               area=6, lumps=Obj(count=1), faces=Obj(count=6), edges=Obj(count=12), vertices=Obj(count=8),
               preciseBoundingBox=box, boundingBox=box)


def component(name):
    return Obj(id=name, entityToken=f"token-{name}", revisionId="component-revision", bRepBodies=Collection(),
               meshBodies=Collection(), occurrences=Collection(), joints=Collection(), asBuiltJoints=Collection(),
               rigidGroups=Collection(), assemblyConstraints=Collection(), motionLinks=Collection())


def occurrence(name, definition, matrix):
    return Obj(name=name, fullPathName=name, component=definition, transform2=Matrix(matrix), isGrounded=False,
               isGroundToParent=False)


def document():
    root = component("root")
    root.bRepBodies.append(body("Target"))
    frame = component("Frame")
    part = component("Solid")
    part.bRepBodies.append(body("Study solid"))
    a = occurrence("A:1", frame, translation(2))
    b = occurrence("B:1", part, translation(3))
    c = occurrence("B:2", part, translation(9))
    root.occurrences.append(a)
    frame.occurrences.extend([b, c])
    limits = Obj(isMinimumValueEnabled=True, minimumValue=-1, isMaximumValueEnabled=True, maximumValue=1,
                 isRestValueEnabled=False)
    motion = Obj(objectType="adsk::fusion::RevoluteJointMotion", rotationAxisVector=Obj(x=0,y=0,z=1),
                 rotationValue=0.0, rotationLimits=limits)
    frame.joints.append(Obj(name="hinge", isSuppressed=False, isLocked=False, geometryOneTransform=Matrix(),
                            geometryTwoTransform=Matrix(), occurrenceOne=b, occurrenceTwo=c, jointMotion=motion))
    saved = Obj(id="source-file", versionId="saved-version", versionNumber=2,
                parentProject=Obj(id="project"), parentFolder=Obj(id="folder"))
    return Obj(isSaved=True, isModified=False, dataFile=saved, products=Obj(itemByProductType=lambda _: Obj(rootComponent=root)),
               name="Source", root=root)


class TemporaryManager:
    def __init__(self):
        self.copies = self.operations = 0
        self.fail = False

    def copy(self, source):
        self.copies += 1
        return copy.deepcopy(source)

    def transform(self, solid, matrix):
        box = solid.boundingBox
        corners = itertools.product(*[(getattr(box.minPoint, a), getattr(box.maxPoint, a)) for a in "xyz"])
        points = [[sum(matrix.values[i*4+j] * v for j, v in enumerate((*corner, 1))) for i in range(3)]
                  for corner in corners]
        for i, axis in enumerate("xyz"):
            setattr(box.minPoint, axis, min(p[i] for p in points))
            setattr(box.maxPoint, axis, max(p[i] for p in points))
        return True

    def booleanOperation(self, sample, target, operation):
        self.operations += 1
        if self.fail:
            return False
        volume = 1
        for axis in "xyz":
            hi = min(getattr(s.boundingBox.maxPoint, axis) for s in [sample, target])
            lo = max(getattr(s.boundingBox.minPoint, axis) for s in [sample, target])
            volume *= max(0, hi-lo)
        sample.volume = volume
        return True


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.manager = TemporaryManager()
        adsk, core, fusion = (types.ModuleType(name) for name in ("adsk", "adsk.core", "adsk.fusion"))
        adsk.core, adsk.fusion = core, fusion
        core.Matrix3D = Obj(create=Matrix)
        fusion.Design = fusion.RevoluteJointMotion = Obj(cast=lambda value: value)
        fusion.TemporaryBRepManager = Obj(get=lambda: self.manager)
        fusion.BooleanTypes = Obj(IntersectionBooleanType=1)
        modules = patch.dict(sys.modules, {"adsk":adsk, "adsk.core":core, "adsk.fusion":fusion})
        modules.start()
        self.addCleanup(modules.stop)
        self.saved = document()
        self.other = document()
        self.other.dataFile.id = "other-file"
        self.other.isModified = True
        self.app = Obj(documents=Collection([self.other, self.saved]), activeDocument=self.other)
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.receipt = Path(folder.name) / "receipt"
        self.receipt.write_bytes(b"source evidence")
        # Independent pre-save observation, with a different session identity and label.
        old = document()
        old.isSaved = False
        old.name = "Earlier study"
        reference = replay.capture_reference(old)
        self.binding = {"schema":"agent-frc/native-study-binding@1", "destination":replay.destination_of(self.saved),
                        "sourceReceiptSha256":hashlib.sha256(b"source evidence").hexdigest(), "reference":reference}
        keys = list(reference["bodies"])
        self.query = {"queryId":"first", "units":"cm", "movingBody":next(k for k in keys if 'B:1' in k),
                      "targetBody":next(k for k in keys if 'Target' in k),
                      "poses":[{"id":"home","worldDelta":translation(0)}, {"id":"overlap","worldDelta":translation(-4.5)}]}

    def resolve(self):
        return replay.resolve_open_source(self.app, self.binding, self.receipt)

    def test_saved_renamed_source_two_queries_and_world_placement(self):
        self.saved.name = "Named and saved"
        source = self.resolve()
        first = source.run(self.query)
        second = source.run(dict(self.query, queryId="second", poses=[{"id":"touch","worldDelta":translation(-4)}]))
        self.assertEqual(first["bindingId"], second["bindingId"])
        self.assertNotEqual(first["queryId"], second["queryId"])
        self.assertEqual([p["intersectionCm3"] for p in first["poses"]], [0, 0.5])
        self.assertEqual(first["poses"][0]["method"], "disjoint-bounds")
        self.assertEqual(second["poses"][0]["intersectionCm3"], 0)
        self.assertEqual(self.manager.operations, 2)
        self.assertEqual(self.saved.root.bRepBodies[0].volume, 1)
        self.assertIs(self.app.activeDocument, self.other)
        self.assertTrue(self.other.isModified)

    def test_repeated_definition_instances_have_distinct_queries(self):
        duplicate = next(key for key in self.binding["reference"]["bodies"] if "B:2" in key)
        result = self.resolve().run(dict(self.query, movingBody=duplicate))
        self.assertTrue(all(p["method"] == "disjoint-bounds" for p in result["poses"]))

    def test_child_translation_rotates_with_parent_before_world_delta(self):
        local = [0,-1,0,2, 1,0,0,0, 0,0,1,0, 0,0,0,1]
        self.saved.root.occurrences[0].transform2 = Matrix(local)
        self.binding["reference"] = replay.capture_reference(self.saved)
        query = dict(self.query, poses=[{"id":"aligned", "worldDelta":translation(-1, -3)}])
        result = self.resolve().run(query)
        self.assertEqual(result["poses"][0]["intersectionCm3"], 1)

    def test_guard_rejects_live_changes_before_any_temporary_copy(self):
        changes = {
            "occurrence":lambda d:setattr(d.root.occurrences[0], "transform2", Matrix(translation(2.001))),
            "component":lambda d:setattr(d.root.occurrences[0].component, "revisionId", "changed"),
            "body":lambda d:setattr(d.root.bRepBodies[0], "revisionId", "changed"),
            "joint endpoint":lambda d:setattr(d.root.occurrences[0].component.joints[0], "occurrenceTwo", None),
            "joint limit":lambda d:setattr(d.root.occurrences[0].component.joints[0].jointMotion.rotationLimits, "maximumValue", 2),
            "joint frame":lambda d:setattr(d.root.occurrences[0].component.joints[0], "geometryTwoTransform", Matrix(translation(1))),
            "unsaved state":lambda d:setattr(d, "isModified", True),
            "version number":lambda d:setattr(d.dataFile, "versionNumber", 3),
            "version ID":lambda d:setattr(d.dataFile, "versionId", "different-version"),
            "destination":lambda d:setattr(d.dataFile, "parentFolder", Obj(id="other-folder")),
            "source receipt":lambda d:self.receipt.write_bytes(b"changed"),
        }
        for name, edit in changes.items():
            with self.subTest(name=name):
                self.saved = document()
                self.app.documents[1] = self.saved
                self.receipt.write_bytes(b"source evidence")
                source = self.resolve()
                edit(self.saved)
                with self.assertRaises(replay.ReplayError) as failed:
                    source.run(self.query)
                self.assertEqual(failed.exception.status, "changed")
                self.assertEqual(self.manager.copies, 0)

    def test_missing_ambiguous_and_duplicate_local_identity(self):
        self.app.documents.append(document())
        with self.assertRaisesRegex(replay.ReplayError, "ambiguous"):
            self.resolve()
        self.app.documents.pop().name = "Removed copy"
        older = document()
        older.dataFile.versionId = "earlier"
        self.app.documents.append(older)
        self.resolve()
        self.app.documents = Collection([self.other])
        with self.assertRaisesRegex(replay.ReplayError, "missing"):
            self.resolve()
        self.saved.root.bRepBodies.append(body("Target"))
        self.app.documents.append(self.saved)
        with self.assertRaisesRegex(replay.ReplayError, "ambiguous"):
            self.resolve()
        self.assertEqual(self.manager.copies, 0)

    def test_rechecks_when_second_matching_document_opens(self):
        bound = self.resolve()
        bound.run(self.query)
        copies = self.manager.copies
        self.app.documents.append(document())
        with self.assertRaisesRegex(replay.ReplayError, "ambiguous"):
            bound.run(self.query)
        self.assertEqual(self.manager.copies, copies)

    def test_refuses_unknown_articulation_without_geometry(self):
        self.saved.root.motionLinks.append(Obj())
        with self.assertRaisesRegex(replay.ReplayError, "unsupported at motionLinks"):
            self.resolve()
        self.assertEqual(self.manager.copies, 0)

    def test_missing_receipt(self):
        self.receipt.unlink()
        with self.assertRaisesRegex(replay.ReplayError, "unavailable at sourceReceipt"):
            self.resolve()

    def test_reference_requires_stable_consecutive_captures(self):
        def sequence(*versions):
            return [({"occurrences": {"example": {"revisionId": value}}}, {}) for value in versions]
        with patch.object(replay, "_observe", side_effect=sequence("cold", "warm", "warm")) as observe:
            captured = replay.capture_reference(self.saved)
            self.assertEqual(captured["occurrences"]["example"]["revisionId"], "warm")
            self.assertEqual(observe.call_count, 3)
        with patch.object(replay, "_observe", side_effect=sequence("one", "two", "three")):
            with self.assertRaisesRegex(replay.ReplayError, "unstable at reference/occurrences/example/revisionId"):
                replay.capture_reference(self.saved)

    def test_transition_observation_and_strict_saved_revision_reuse(self):
        capture = replay.capture_transition_reference(self.saved)
        self.assertTrue(capture["savedUnmodified"])
        self.assertEqual(capture["destination"], self.binding["destination"])
        self.assertEqual(set(capture["solids"]), set(self.binding["reference"]["bodies"]))
        self.assertEqual(capture["solids"][self.query["movingBody"]]["topology"], [1,6,12,8])
        digest = "a" * 64
        receipt = json.dumps({"original/archives":[{"~hash":digest}]}).encode()
        self.receipt.write_bytes(receipt)
        self.binding["sourceReceiptSha256"] = hashlib.sha256(receipt).hexdigest()
        revisions = [{"occurrenceId":key, "componentId":row["componentId"],
                      "originalRevisionId":"original", "savedRevisionId":row["revisionId"]}
                     for key, row in capture["reference"]["occurrences"].items()]
        self.binding["transition"] = {"schema":"agent-frc/native-study-revision-transition@1", "archiveSha256":digest,
                                      "archiveDigestPointer":"/original~1archives/0/~0hash", "originalReferenceSha256":"b"*64,
                                      "savedReferenceSha256":"c"*64, "componentRevisions":revisions}
        source = self.resolve()
        source.run(self.query)
        self.saved.root.revisionId = "original"
        with self.assertRaisesRegex(replay.ReplayError, "changed at reference/occurrences"):
            source.run(self.query)
        self.saved.root.revisionId = "component-revision"
        self.binding["transition"]["archiveSha256"] = "d"*64
        with self.assertRaisesRegex(replay.ReplayError, "changed at transition/archiveSha256"):
            self.resolve()
        revisions.pop()
        with self.assertRaisesRegex(replay.ReplayError, "missing occurrence revision"):
            self.resolve()

    def test_pose_must_be_rigid_and_query_operands_must_exist(self):
        source = self.resolve()
        invalid = [0] * 16
        for changes in ({"poses":[{"id":"scale","worldDelta":invalid}]}, {"targetBody":"absent"}, {"units":"mm"}):
            with self.assertRaisesRegex(replay.ReplayError, "invalid"):
                source.run(dict(self.query, **changes))
        self.assertEqual(self.manager.copies, 0)

    def test_failed_kernel_is_not_a_clear_result(self):
        self.manager.fail = True
        with self.assertRaisesRegex(replay.ReplayError, "query-failed"):
            self.resolve().run(self.query)


if __name__ == "__main__":
    unittest.main()
