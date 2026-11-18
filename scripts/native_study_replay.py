"""Read-only Fusion binding and finite rigid-pose intersection queries (cm, cm³)."""

import hashlib
import json
import math
import re
from pathlib import Path

IDENTITY = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
DESTINATION_FIELDS = {"projectId", "folderId", "fileId", "versionId", "versionNumber"}


class ReplayError(ValueError):
    def __init__(self, status, path, detail):
        self.status = status
        self.path = path
        super().__init__(f"{status} at {path}: {detail}")


def _required_id(value, path):
    if not isinstance(value, str) or not value.strip() or len(value) > 2000:
        raise ReplayError("invalid", path, "expected a nonempty bounded identifier")
    return value


def _finite(value, path):
    if type(value) not in (float, int) or not math.isfinite(value):
        raise ReplayError("invalid", path, "expected a finite number")
    return value


def _tuple_key(parts):
    return _required_id(json.dumps(parts, separators=(",", ":"), ensure_ascii=False), "instanceKey")


def _items(collection):
    return (collection.item(i) for i in range(collection.count))


def _matrix(native_matrix):
    values = list(native_matrix.asArray())
    if len(values) != 16:
        raise ReplayError("unsupported", "matrix", "expected sixteen matrix entries")
    return [_finite(value, "matrix") for value in values]


def _multiply(a, b):
    return [sum(a[4*i+k] * b[4*k+j] for k in range(4))
            for i in range(4) for j in range(4)]


def _put(table, key, value):
    if key in table:
        raise ReplayError("ambiguous", key, "duplicate native instance identity")
    table[key] = value


def destination_of(document):
    file = document.dataFile
    return {"projectId": file.parentProject.id, "folderId": file.parentFolder.id,
            "fileId": file.id, "versionId": file.versionId, "versionNumber": file.versionNumber}


def _validate_destination(destination):
    if not isinstance(destination, dict) or destination.keys() != DESTINATION_FIELDS:
        raise ReplayError("invalid", "destination", "requires project, folder, file and saved version")
    for key in DESTINATION_FIELDS - {"versionNumber"}:
        _required_id(destination[key], "destination/" + key)
    if type(destination["versionNumber"]) is not int or destination["versionNumber"] < 1:
        raise ReplayError("invalid", "destination/versionNumber", "expected a positive saved version")


def _digest(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _validate_transition(binding):
    transition = binding["transition"]
    fields = {"schema", "archiveSha256", "archiveDigestPointer", "originalReferenceSha256", "savedReferenceSha256",
              "componentRevisions"}
    if (not isinstance(transition, dict) or transition.keys() != fields
            or transition["schema"] != "agent-frc/native-study-revision-transition@1"
            or not all(_digest(transition[k]) for k in ("archiveSha256", "originalReferenceSha256", "savedReferenceSha256"))
            or not isinstance(transition["archiveDigestPointer"], str) or not transition["archiveDigestPointer"].startswith("/")
            or not isinstance(transition["componentRevisions"], list)):
        raise ReplayError("invalid", "transition", "malformed archive-to-save transition receipt")
    occurrences = binding["reference"]["occurrences"]
    seen = set()
    for row in transition["componentRevisions"]:
        if not isinstance(row, dict) or row.keys() != {"occurrenceId", "componentId", "originalRevisionId", "savedRevisionId"}:
            raise ReplayError("invalid", "transition/componentRevisions", "incomplete revision row")
        key = _required_id(row["occurrenceId"], "transition/occurrenceId")
        _required_id(row["originalRevisionId"], "transition/originalRevisionId")
        expected = occurrences.get(key)
        if (key in seen or not isinstance(expected, dict) or row["componentId"] != expected.get("componentId")
                or row["savedRevisionId"] != expected.get("revisionId")):
            raise ReplayError("invalid", "transition/componentRevisions", "duplicate or unregistered revision mapping")
        seen.add(key)
    if seen != occurrences.keys():
        raise ReplayError("invalid", "transition/componentRevisions", "missing occurrence revision mapping")


def _attest_archive(transition, receipt_bytes):
    pointer = transition["archiveDigestPointer"]
    if re.search(r"~(?![01])", pointer):
        raise ReplayError("invalid", "transition/archiveDigestPointer", "malformed JSON Pointer escape")
    try:
        value = json.loads(receipt_bytes)
        for token in pointer[1:].split("/"):
            key = token.replace("~1", "/").replace("~0", "~")
            if isinstance(value, list) and re.fullmatch(r"0|[1-9][0-9]*", key):
                value = value[int(key)]
            elif isinstance(value, dict):
                value = value[key]
            else:
                raise KeyError(key)
    except (ValueError, KeyError, IndexError, UnicodeError) as error:
        raise ReplayError("invalid", "transition/archiveDigestPointer", "receipt archive digest unavailable") from error
    if value != transition["archiveSha256"]:
        raise ReplayError("changed", "transition/archiveSha256", "historical receipt identifies another archive")


def _one_document(app, destination):
    matches = []
    try:
        for doc in _items(app.documents):
            if doc.isSaved and doc.dataFile.id == destination["fileId"]:
                matches.append(doc)
    except Exception as error:
        raise ReplayError("unavailable", "documents", "could not inventory open source identities") from error
    if not matches:
        raise ReplayError("missing", "destination/fileId", "the approved file is not open")
    exact = []
    differences = set()
    for doc in matches:
        try:
            current = destination_of(doc)
        except Exception as error:
            raise ReplayError("unavailable", "destination", "could not read the saved destination") from error
        fields = {key for key, value in current.items() if destination[key] != value}
        differences.update(fields)
        if not fields:
            exact.append(doc)
    if len(exact) > 1:
        raise ReplayError("ambiguous", "destination", "multiple open documents match the approved save")
    if not exact:
        raise ReplayError("changed", "destination/" + ",".join(sorted(differences)), "open version or destination differs")
    return exact[0]


# Properties read from each supported native joint motion. Units follow Fusion (cm/radians).
MOTIONS = {
    "RigidJointMotion": ((), (), ()),
    "RevoluteJointMotion": (("rotationAxisVector",), ("rotationValue",), ("rotationLimits",)),
    "SliderJointMotion": (("slideDirectionVector",), ("slideValue",), ("slideLimits",)),
    "CylindricalJointMotion": (("rotationAxisVector",), ("rotationValue", "slideValue"),
                               ("rotationLimits", "slideLimits")),
    "PinSlotJointMotion": (("rotationAxisVector", "slideDirectionVector"), ("rotationValue", "slideValue"),
                           ("rotationLimits", "slideLimits")),
    "PlanarJointMotion": (("normalDirectionVector", "primarySlideDirectionVector", "secondarySlideDirectionVector"),
                          ("rotationValue", "primarySlideValue", "secondarySlideValue"),
                          ("rotationLimits", "primarySlideLimits", "secondarySlideLimits")),
    "BallJointMotion": (("pitchDirectionVector", "yawDirectionVector", "rollDirectionVector"),
                        ("pitchValue", "yawValue", "rollValue"), ("pitchLimits", "yawLimits", "rollLimits")),
}


def _motion(joint, fusion):
    motion = joint.jointMotion
    kind = motion.objectType.rsplit("::", 1)[-1]
    if kind not in MOTIONS:
        raise ReplayError("unsupported", "jointMotion", str(kind))
    motion = getattr(fusion, kind).cast(motion)
    result = {"type": kind}
    vectors, values, limits = MOTIONS[kind]
    for key in vectors:
        vec = getattr(motion, key)
        result[key] = [_finite(x, key) for x in (vec.x, vec.y, vec.z)]
    for key in values:
        result[key] = _finite(getattr(motion, key), key)
    for key in limits:
        limit = getattr(motion, key)
        result[key] = {}
        for field in ("minimum", "maximum", "rest"):
            enabled = getattr(limit, "is" + field.capitalize() + "ValueEnabled")
            result[key][field] = _finite(getattr(limit, field + "Value"), key) if enabled else None
    return result


def _endpoint(occurrence):
    return _required_id(occurrence.fullPathName, "joint/occurrence") if occurrence is not None else None


def _articulation(component, fusion):
    joints = {}
    for kind, collection in (("joint", component.joints), ("asBuilt", component.asBuiltJoints)):
        for joint in _items(collection):
            row = {"endpoints": [_endpoint(joint.occurrenceOne), _endpoint(joint.occurrenceTwo)],
                   "suppressed": joint.isSuppressed, "motion": _motion(joint, fusion)}
            if kind == "joint":
                row.update(locked=joint.isLocked, frameOne=_matrix(joint.geometryOneTransform),
                           frameTwo=_matrix(joint.geometryTwoTransform))
            else:
                row["frame"] = _matrix(joint.transform)
            _put(joints, _tuple_key([kind, joint.name]), row)
    for group in _items(component.rigidGroups):
        _put(joints, _tuple_key(["rigidGroup", group.name]), {
            "suppressed": group.isSuppressed, "members": sorted(o.fullPathName for o in _items(group.occurrences))})
    # The registered motion/geometry contract does not model these relationships.
    for key in ("motionLinks", "assemblyConstraints"):
        if getattr(component, key).count:
            raise ReplayError("unsupported", key, "native articulation requires an additional witness")
    return joints


def _observe(document):
    import adsk.fusion as fusion
    design = fusion.Design.cast(document.products.itemByProductType("DesignProductType"))
    if not design:
        raise ReplayError("unsupported", "design", "source has no Fusion design product")
    ref = {"schema": "agent-frc/native-study-reference@1", "occurrences": {}, "bodies": {}, "joints": {}}
    operands = {}
    # Enumerate each definition once per observation. Occurrence transforms and ancestry
    # remain instance-specific even for multiple appearances of the same component.
    definitions = {}
    stack = [(design.rootComponent, (), None, list(IDENTITY), list(IDENTITY), None)]
    while stack:
        component, path, parent, local, world, grounded = stack.pop()
        occurrence = _tuple_key(path)
        comp_id = _required_id(component.id, "component/id")
        revision = _required_id(component.revisionId, "component/revisionId")
        # A token is only a lookup accelerator inside this single live capture. It
        # never enters the persisted fingerprint and is never compared across files.
        definition = (component.entityToken, comp_id, revision)
        _put(ref["occurrences"], occurrence, {"parent": parent, "componentId": comp_id, "revisionId": revision,
                                             "localTransform": local, "grounded": grounded})
        if definition not in definitions:
            if component.meshBodies.count:
                raise ReplayError("unsupported", occurrence, "mesh bodies require a separate inventory")
            bodies = []
            for body in _items(component.bRepBodies):
                if not body.isSolid:
                    raise ReplayError("unsupported", occurrence, "only solid B-Rep operands are supported")
                bodies.append((_required_id(body.name, "body/name"),
                               _required_id(body.revisionId, "body/revisionId")))
            children = []
            for child in _items(component.occurrences):
                # Fusion exposes assembly pinning on root occurrences only.
                # Ground-to-parent is a separate relationship in each local definition.
                ground = {"toParent": child.isGroundToParent}
                if not path:
                    ground["rootPin"] = child.isGrounded
                children.append((_required_id(child.name, "occurrence/name"), _matrix(child.transform2), ground, child.component))
            definitions[definition] = (bodies, children, _articulation(component, fusion))
        bodies, children, joints = definitions[definition]
        if joints:
            ref["joints"][occurrence] = joints
        for i, (name, body_revision) in enumerate(bodies):
            key = _tuple_key([occurrence, name])
            _put(ref["bodies"], key, {"occurrenceId": occurrence, "localBodyId": name, "revisionId": body_revision})
            # Use this instance's actual native body rather than a proxy in an unknown frame.
            operands[key] = (component.bRepBodies.item(i), world)
        for name, child_local, child_grounded, child_component in children:
            stack.append((child_component, path + (name,), occurrence, child_local,
                          _multiply(world, child_local), child_grounded))
    if not operands:
        raise ReplayError("unsupported", "bodies", "source has no solid bodies")
    return ref, operands


def _stable_observation(document):
    try:
        previous = _observe(document)[0]
        for _ in range(2):
            current, operands = _observe(document)
            difference = _difference(previous, current, "reference")
            if difference is None:
                return current, operands
            previous = current
        raise ReplayError("unstable", difference, "reference did not stabilize within three observations")
    except ReplayError:
        raise
    except Exception as error:
        raise ReplayError("unavailable", "reference", str(error)) from error


def capture_reference(document):
    """Require two consecutive matching snapshots, allowing one cold-read retry."""
    return _stable_observation(document)[0]


def capture_transition_reference(document):
    """Capture independently on the archive import and on the approved saved draft."""
    reference, operands = _stable_observation(document)
    try:
        destination = destination_of(document) if document.isSaved else None
        solids, definitions = {}, {}
        for key, (body, _) in operands.items():
            token = body.entityToken
            if token not in definitions:
                bounds = body.preciseBoundingBox
                coordinates = [[_finite(getattr(point, axis), "bounds") for axis in "xyz"]
                               for point in (bounds.minPoint, bounds.maxPoint)]
                definitions[token] = {"areaCm2": _finite(body.area, "area"), "volumeCm3": _finite(body.volume, "volume"),
                                      "boundsCm": coordinates, "topology": [body.lumps.count, body.faces.count,
                                      body.edges.count, body.vertices.count]}
            solids[key] = definitions[token]
        difference = _difference(reference, _observe(document)[0], "reference")
        if difference:
            raise ReplayError("unstable", difference, "native reference changed during the solid measurements")
        if destination != (destination_of(document) if document.isSaved else None):
            raise ReplayError("unstable", "destination", "saved destination changed during observation")
        return {"schema": "agent-frc/native-study-transition-reference@1", "destination": destination,
                "savedUnmodified": bool(document.isSaved and not document.isModified),
                "reference": reference, "solids": solids}
    except ReplayError:
        raise
    except Exception as error:
        raise ReplayError("unavailable", "solidWitness", str(error)) from error


def _difference(expected, actual, path):
    if isinstance(expected, dict) and isinstance(actual, dict):
        for key in sorted(expected.keys() | actual.keys()):
            child = path + "/" + key
            if key not in expected or key not in actual:
                return child
            found = _difference(expected[key], actual[key], child)
            if found:
                return found
    elif isinstance(expected, list) and isinstance(actual, list) and len(expected) == len(actual):
        for i, (a, b) in enumerate(zip(expected, actual)):
            found = _difference(a, b, f"{path}/{i}")
            if found:
                return found
    elif type(expected) is bool or type(actual) is bool:
        if expected is not actual:
            return path
    elif expected != actual:
        return path
    return None


def _rigid_delta(values):
    if not isinstance(values, list) or len(values) != 16:
        raise ReplayError("invalid", "worldDelta", "expected a 4x4 row-major rigid transform")
    for v in values:
        _finite(v, "worldDelta")
    rot = [values[i:i+3] for i in (0, 4, 8)]
    for i in range(3):
        for j in range(i+1):
            if abs(sum(a*b for a, b in zip(rot[i], rot[j])) - (i == j)) > 1e-8:
                raise ReplayError("invalid", "worldDelta", "rotation is not orthonormal")
    (a,b,c), (d,e,f), (g,h,i) = rot
    if a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g) < 0 or values[12:] != [0,0,0,1]:
        raise ReplayError("invalid", "worldDelta", "expected a proper rigid transform")
    return values


def _temporary(manager, operand, delta, core):
    body, world = operand
    temporary = manager.copy(body)
    transform = core.Matrix3D.create()
    if temporary is None or not transform.setWithArray(_multiply(delta, world)) or not manager.transform(temporary, transform):
        raise ReplayError("query-failed", "transform", "could not place the temporary solid")
    return temporary


def _disjoint(a, b):
    return any(getattr(a.maxPoint, axis) < getattr(b.minPoint, axis)
               or getattr(b.maxPoint, axis) < getattr(a.minPoint, axis) for axis in "xyz")


class _ResolvedSource:
    def __init__(self, app, binding, receipt_path):
        self._app = app
        self._binding = json.loads(json.dumps(binding, allow_nan=False))
        self._receipt_path = Path(receipt_path)
        self._check_archive_pointer = "transition" in binding
        serialized = json.dumps(self._binding, sort_keys=True, separators=(",", ":")).encode()
        self.binding_id = hashlib.sha256(serialized).hexdigest()

    def _verify(self):
        b = self._binding
        doc = _one_document(self._app, b["destination"])
        try:
            with self._receipt_path.open("rb") as stream:
                digest = hashlib.sha256()
                if self._check_archive_pointer:
                    receipt_bytes = stream.read()
                    digest.update(receipt_bytes)
                else:
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(block)
        except OSError as error:
            raise ReplayError("unavailable", "sourceReceipt", str(error)) from error
        if digest.hexdigest() != b["sourceReceiptSha256"]:
            raise ReplayError("changed", "sourceReceiptSha256", "source receipt bytes differ from the approved pin")
        if self._check_archive_pointer:
            _attest_archive(b["transition"], receipt_bytes)
            self._check_archive_pointer = False
        try:
            observed, operands = _observe(doc)
        except ReplayError:
            raise
        except Exception as error:
            raise ReplayError("unavailable", "reference", str(error)) from error
        difference = _difference(b["reference"], observed, "reference")
        if difference:
            raise ReplayError("changed", difference, "native reference no longer agrees")
        if doc.isModified:
            raise ReplayError("changed", "document/isModified", "source has unsaved changes")
        return operands

    def run(self, query):
        """Revalidate at query entry. Run synchronously on Fusion's main thread."""
        if not isinstance(query, dict) or query.keys() != {"queryId", "units", "movingBody", "targetBody", "poses"}:
            raise ReplayError("invalid", "query", "expected ID, cm units, moving/target bodies and poses")
        _required_id(query["queryId"], "queryId")
        if query["units"] != "cm" or not isinstance(query["poses"], list) or not 1 <= len(query["poses"]) <= 10000:
            raise ReplayError("invalid", "query", "expected cm and 1 to 10000 sampled poses")
        ids = set()
        for pose in query["poses"]:
            if not isinstance(pose, dict) or pose.keys() != {"id", "worldDelta"}:
                raise ReplayError("invalid", "poses", "expected id and worldDelta")
            pose_id = _required_id(pose["id"], "poses/id")
            if pose_id in ids:
                raise ReplayError("invalid", "poses/id", "duplicate pose ID")
            ids.add(pose_id)
            _rigid_delta(pose["worldDelta"])
        operands = self._verify()
        moving = _required_id(query["movingBody"], "movingBody")
        target = _required_id(query["targetBody"], "targetBody")
        if moving == target or moving not in operands or target not in operands:
            raise ReplayError("invalid", "operands", "expected two distinct bound body instances")
        import adsk.core as core
        import adsk.fusion as fusion
        try:
            manager = fusion.TemporaryBRepManager.get()
            fixed = _temporary(manager, operands[target], IDENTITY, core)
            rows = []
            for pose in query["poses"]:
                sample = _temporary(manager, operands[moving], pose["worldDelta"], core)
                if _disjoint(sample.boundingBox, fixed.boundingBox):
                    method, volume = "disjoint-bounds", 0.0
                else:
                    if not manager.booleanOperation(sample, fixed, fusion.BooleanTypes.IntersectionBooleanType):
                        raise ReplayError("query-failed", pose["id"], "Fusion did not complete the temporary intersection")
                    volume = _finite(sample.volume, pose["id"])
                    if volume < 0:
                        raise ReplayError("query-failed", pose["id"], "intersection volume is negative")
                    method = "temporary-intersection"
                rows.append({"poseId": pose["id"], "worldDelta": list(pose["worldDelta"]),
                             "method": method, "intersectionCm3": volume})
        except ReplayError:
            raise
        except Exception as error:
            raise ReplayError("query-failed", "temporaryIntersection", str(error)) from error
        return {"schema": "agent-frc/native-study-result@1", "bindingId": self.binding_id,
                "destination": dict(self._binding["destination"]), "sourceReceiptSha256": self._binding["sourceReceiptSha256"],
                "queryId": query["queryId"], "movingBody": moving, "targetBody": target, "units": "cm", "poses": rows}


def resolve_open_source(app, binding, receipt_path):
    """Select by approved saved identity and verify geometry without changing tab or design."""
    fields = {"schema", "destination", "sourceReceiptSha256", "reference"}
    if (not isinstance(binding, dict) or binding.keys() not in (fields, fields | {"transition"})
            or binding["schema"] != "agent-frc/native-study-binding@1"):
        raise ReplayError("invalid", "binding", "unsupported binding")
    _validate_destination(binding["destination"])
    digest = binding["sourceReceiptSha256"]
    if not _digest(digest):
        raise ReplayError("invalid", "sourceReceiptSha256", "expected a lowercase SHA-256 digest")
    ref = binding["reference"]
    if (not isinstance(ref, dict) or ref.keys() != {"schema", "occurrences", "bodies", "joints"}
            or ref["schema"] != "agent-frc/native-study-reference@1"
            or any(not isinstance(ref[key], dict) for key in ("occurrences", "bodies", "joints"))
            or not ref["occurrences"] or not ref["bodies"]):
        raise ReplayError("invalid", "reference", "expected independent native study reference")
    if "transition" in binding:
        _validate_transition(binding)
    try:
        source = _ResolvedSource(app, binding, receipt_path)
    except (ValueError, TypeError) as error:
        raise ReplayError("invalid", "binding", "expected JSON evidence and a source receipt path") from error
    source._verify()
    return source
