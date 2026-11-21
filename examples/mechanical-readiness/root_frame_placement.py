"""Worked edit and cold readback for one registered child in a nested Fusion fixture."""
import importlib.util
import math
from pathlib import Path

# Use the helper in this staged package even in a long-lived Fusion interpreter.
helper = Path(__file__).resolve().parents[2]/"scripts/fusion_checked_placement.py"
spec = importlib.util.spec_from_file_location("_fixture_placement", helper)
guard = importlib.util.module_from_spec(spec)
exec(compile(helper.read_bytes(), str(helper), "exec"), guard.__dict__)
close, require, rigid = guard.close, guard.require, guard.rigid
placement_witness = guard.sibling("fusion_issue_inventory").placement_witness


def root_occurrence(design, path):
    matches = [occ for occ in design.rootComponent.allOccurrences if occ.fullPathName == path]
    require(len(matches) == 1, "Expected one rooted occurrence: " + path)
    return matches[0]


def registered_child(design, plan):
    parent = root_occurrence(design, plan["parent"])
    require(plan["occurrence"].rpartition("+")[0] == parent.fullPathName,
            "Child is not directly under the commissioned parent")
    require(close(parent.transform2.asArray(), rigid(plan["parentWorldCm"])), "Parent datum moved")
    return root_occurrence(design, plan["occurrence"])


def inspect_material(design, plan, point2d):
    child = registered_child(design, plan)
    require(close(child.transform2.asArray(), rigid(plan["worldTransformCm"])), "Child world pose differs")
    material = root_occurrence(design, plan.get("materialOccurrence", child.fullPathName))
    require(guard.under(material.fullPathName, child.fullPathName), "Material witness is outside the selected child")
    bodies = [b for b in material.component.bRepBodies if b.isSolid and b.name == plan["body"]]
    require(len(bodies) == 1, "Expected one selected solid")
    body = bodies[0]
    context_error, local_sites = placement_witness(body, material, point2d)
    # The synthetic plate has a distinctive corner away from its rotation axis.
    # Find that source vertex again because entity indices can change on reopen.
    corners = [v for v in body.vertices if math.dist(v.geometry.asArray(), plan["cornerLocalCm"]) <= 1e-7]
    require(len(corners) == 1, "Source corner is missing or ambiguous")
    observed = list(corners[0].createForAssemblyContext(material).geometry.asArray())
    error_mm = 10 * math.dist(observed, plan["cornerWorldCm"])
    require(math.isfinite(error_mm) and error_mm <= .001, "Placed material missed the fixture datum")
    return {"occurrence": child.fullPathName, "materialOccurrence": material.fullPathName,
            "body": body.name, "contextSitesLocalCm": local_sites,
            "cornerLocalCm": list(corners[0].geometry.asArray()), "expectedCornerWorldCm": plan["cornerWorldCm"],
            "cornerWorldCm": observed, "cornerErrorMm": error_mm, "contextErrorMm": context_error}


def inspect_attachment(design, plan, api):
    observed = inspect_material(design, plan, api.core.Point2D)
    parent = root_occurrence(design, plan["parent"])
    backing = root_occurrence(design, plan["backing"])
    require(backing.fullPathName.rpartition("+")[0] == parent.fullPathName
            and backing.fullPathName != plan["occurrence"], "Register a distinct sibling attachment")
    joints = [j for j in design.rootComponent.allAsBuiltJoints
              if j.name == plan["jointName"] and j.assemblyContext is not None
              and j.assemblyContext.fullPathName == parent.fullPathName]
    require(len(joints) == 1, "Expected one named as-built joint in the registered parent")
    joint = joints[0]
    require(joint.isValid and not joint.isSuppressed and joint.jointMotion.objectType == plan["jointMotion"],
            "Required joint is suppressed or has the wrong motion")
    entry = joint.timelineObject
    joint_path = parent.fullPathName + "/" + joint.name
    require(entry and entry.isValid, "Missing valid timeline entry for " + joint_path)
    require(not entry.isSuppressed and not entry.isRolledBack
            and entry.healthState == api.fusion.FeatureHealthStates.HealthyFeatureHealthState,
            f"No healthy active timeline entry for {joint_path}: health={entry.healthState}, "
            f"suppressed={entry.isSuppressed}, rolledBack={entry.isRolledBack}, {entry.errorOrWarningMessage}")
    ends = []
    for endpoint in (joint.occurrenceOne, joint.occurrenceTwo):
        require(endpoint is not None, "Attachment lacks a sibling endpoint")
        ends.append(endpoint.fullPathName)
    require(sorted(ends) == sorted([plan["occurrence"], plan["backing"]]), "Wrong joint endpoints")
    return {**observed, "joint": joint.name, "owner": joint.assemblyContext.fullPathName,
            "motion": joint.jointMotion.objectType, "endpoints": ends, "suppressed": joint.isSuppressed,
            "timelineHealth": "healthy"}


def edit_nested(design, plan, desired_matrix, attach_in_owner, api):
    """Use inside checked_placement's edit callback on its disposable design."""
    target = rigid(plan["worldTransformCm"])
    require(close(desired_matrix.asArray(), target), "Edit matrix differs from commissioning")
    child = registered_child(design, plan)
    moved = not close(child.transform2.asArray(), target)
    if moved:
        child.transform2 = desired_matrix
        require(close(registered_child(design, plan).transform2.asArray(), target),
                "Root-context write missed its requested pose")
        if design.snapshots.hasPendingSnapshot:
            design.snapshots.add()
    parent = root_occurrence(design, plan["parent"])
    # Project-owned operation creating or verifying the specified joint in the design copy.
    attach_in_owner(parent.component)
    require(design.computeAll(), "Joint edit did not recompute")
    return {"wroteTransform": moved, **inspect_attachment(design, plan, api)}
