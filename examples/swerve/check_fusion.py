"""Reopen and exercise an independent-axis teaching module in Autodesk Fusion."""
import hashlib
import json
import math
from pathlib import Path

import adsk.core
import adsk.fusion


def require(condition, message):
    if not condition:
        raise ValueError(message)


def world_point(occurrence, xyz_mm):
    point = adsk.core.Point3D.create(*(value / 10 for value in xyz_mm))
    point.transformBy(occurrence.transform2)
    return [value * 10 for value in point.asArray()]


def inspect_archive(filename):
    archive = Path(filename)
    require(archive.is_file() and archive.suffix.lower() == ".f3d", "Choose a local F3D archive.")
    fingerprint = hashlib.sha256(archive.read_bytes()).hexdigest()
    app = adsk.core.Application.get()
    previous = app.activeDocument
    manager = app.importManager
    doc = manager.importToNewDocument(manager.createFusionArchiveImportOptions(str(archive.resolve())))
    require(doc is not None, "Fusion could not import the archive.")
    try:
        design = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        root = design.rootComponent
        names = ["Chassis mounting interface", "Azimuth carrier and drive motor", "Driven wheel and pulley"]
        require(root.occurrences.count == len(names), "Unexpected number of top-level occurrences.")
        occurrences = {occ.component.name: occ for occ in root.occurrences}
        require(set(occurrences) == set(names), "Unexpected component inventory.")
        parts = [occurrences[name] for name in names]
        counts = [sum(1 for body in occ.component.bRepBodies if body.isSolid) for occ in parts]
        require(counts == [5, 10, 4], "Expected 5 fixed, 10 carrier and 4 wheel solids.")
        require(parts[0].isGrounded, "Mounting interface is not grounded.")
        tread = parts[2].component.bRepBodies.itemByName("Tread annulus")
        require(tread is not None, "Wheel tread missing.")
        ground_mm = tread.createForAssemblyContext(parts[2]).boundingBox.minPoint.z * 10
        require(abs(ground_mm) < 0.01, "Nominal tread does not reach the ground plane.")

        # Each off-axis point has a known radius. Its chord for a 30-degree rotation is 2r sin(15°).
        witnesses = [(58, 44, 144), (55, 0, 98), (10, 0, 50)]
        scenarios = {
            "Azimuth about vertical spindle": ([0, 0, 1], [0, 55, 10]),
            "Wheel roll about transverse axle": ([0, 1, 0], [0, 0, 10]),
        }
        joints = {joint.name: joint for joint in root.asBuiltJoints}
        require(root.asBuiltJoints.count == len(scenarios) and set(joints) == set(scenarios),
                "Unexpected as-built joint inventory.")
        travel = {}
        for name, (expected_axis, radii) in scenarios.items():
            motion = joints[name].jointMotion
            require(motion.objectType == adsk.fusion.RevoluteJointMotion.classType(), name + " is not revolute.")
            axis = motion.rotationAxisVector.asArray()
            require(math.dist(axis, expected_axis) < 0.0001, name + " has an unexpected axis or sign.")
            initial = [world_point(part, point) for part, point in zip(parts, witnesses)]
            angle = motion.rotationValue
            try:
                motion.rotationValue = angle + math.pi / 6
                adsk.doEvents()
                require(abs(motion.rotationValue - angle - math.pi / 6) < 0.0001, name + " missed its rotation.")
                moved = [world_point(part, point) for part, point in zip(parts, witnesses)]
                chord = [math.dist(a, b) for a, b in zip(initial, moved)]
                expected = [2 * r * math.sin(math.pi / 12) for r in radii]
                require(all(abs(a - b) < 0.01 for a, b in zip(chord, expected)), name + " witness mismatch.")
                travel[name] = chord
            finally:
                motion.rotationValue = angle
                adsk.doEvents()
        return {"fusionVersion": app.version, "sha256": fingerprint, "solidCounts": counts,
                "groundMm": ground_mm, "witnessTravelMm": travel}
    finally:
        doc.close(False)
        if previous and previous.isValid:
            previous.activate()


def run(context):
    app = adsk.core.Application.get()
    dialog = app.userInterface.createFileDialog()
    dialog.title = "Choose the independent-axis teaching module to check"
    dialog.filter = "Fusion design archive (*.f3d)"
    if dialog.showOpen() != adsk.core.DialogResults.DialogOK:
        return
    report = json.dumps(inspect_archive(dialog.filename), indent=2)
    app.log(report)
    app.userInterface.messageBox(report, "Swerve module verification")
