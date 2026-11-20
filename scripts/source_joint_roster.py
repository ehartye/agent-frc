
"""Reconcile the rooted Fusion constraint inventory and the independently selected commissioning duty."""
from collections import Counter, defaultdict
import os
from pathlib import Path

from mechanical_readiness import digest, pinned, read, require


def joint_key(row):
    return row["type"], row["occurrence"], row["name"]


def intended(root, study, reopen, *, trusted=False):
    ref = study.get("operatingRequirements")
    require(isinstance(ref, dict), "Register the selected operating duty from the project's commissioning plan")
    plan = pinned(root, ref)
    pointer = ref.get("pointer")
    require(isinstance(pointer, str) and pointer.startswith("/") and "//" not in pointer, "Choose a commissioning plan section")
    if trusted:
        external = os.environ.get("FRC_OPERATING_REQUIREMENTS")
        require(external and Path(external).is_file() and not Path(external).resolve().is_relative_to(root),
                "Supply the independently approved commissioning plan outside the candidate")
        require(digest(Path(external)) == digest(plan) and pointer == os.environ.get("FRC_OPERATING_PROFILE", "/operatingIntent"),
                "Candidate duties differ from the independently approved plan or selected profile")
    record = read(plan)
    for part in pointer[1:].split("/"):
        record = record[part.replace("~1", "/").replace("~0", "~")]
    authority = read(pinned(root, study["authority"]))
    require(record["authorityId"] == authority["id"] and record["configuration"] == study["configuration"],
            "Operating intent belongs to a different design or configuration")
    require(record.get("mode") in ("fixed", "articulated") and isinstance(record.get("basis"), str) and record["basis"].strip(),
            "Declare and substantiate the intended operating mode")
    groups = set(reopen["movingGroups"])
    require(isinstance(record["motionRanges"], dict) and set(record["motionRanges"]) == groups
            and record["motionRanges"] == reopen["motionRanges"] and bool(groups) == (record["mode"] == "articulated"),
            "Intended operating travel differs from the selected native duty register")
    for key, actual in (("transferMissions", reopen["transferMissions"]), ("externalIssues", study.get("externalIssues"))):
        expected = record[key]
        require(isinstance(expected, list) and isinstance(actual, list) and len(expected) == len(set(expected))
                and sorted(actual) == sorted(expected), "Incomplete commissioning scope for " + key)
    return record


def active_coordinates(raw, owners, anchor):
    occurrences = {r["path"]: r for r in raw["occurrences"]}
    require(len(occurrences) == len(raw["occurrences"]) and "@root" not in occurrences, "Ambiguous rooted occurrence inventory")
    nodes = set(occurrences) | {"@root"}
    require(set(owners.values()) <= nodes and set(raw["localCounts"]) == nodes,
            "Installed occurrences or local native constraint counts are missing")
    counts = defaultdict(Counter)
    neighbors = defaultdict(set)
    def connect(members):
        require(members and len(set(members)) == len(members) and set(members) <= nodes,
                "Native constraint has unknown or repeated occurrence membership")
        for member in members[1:]:
            neighbors[members[0]].add(member)
            neighbors[member].add(members[0])
    for name, row in occurrences.items():
        require(row["parent"] in nodes and type(row["groundedToParent"]) is bool, "Unknown occurrence parent or grounding")
        if row["groundedToParent"]:
            connect([name, row["parent"]])
    joints = {}
    inventories = {"RigidJointMotion": set(), "SliderJointMotion": {"slideValue"}, "RevoluteJointMotion": {"rotationValue"},
        "CylindricalJointMotion": {"slideValue", "rotationValue"}, "PinSlotJointMotion": {"slideValue", "rotationValue"},
        "PlanarJointMotion": {"primarySlideValue", "secondarySlideValue", "rotationValue"},
        "BallJointMotion": {"pitchValue", "rollValue", "yawValue"}}
    for joint in raw["joints"]:
        kind, owner, name = key = joint_key(joint)
        require(owner in nodes and kind in ("joint", "asBuilt") and key not in joints, "Ambiguous native joint identity")
        counts[owner][kind] += 1
        joints[key] = joint
        require(type(joint["suppressed"]) is bool and type(joint["locked"]) is bool, "Unknown native joint state")
        require(len(joint["members"]) == 2 and set(joint["members"]) <= nodes, "Unknown native joint endpoints")
        if joint["suppressed"]:
            continue
        require(joint["health"] == "healthy", "Unresolved solver health on native joint: " + name)
        require(joint["recognized"] and inventories.get(joint["motionType"].split("::")[-1]) == set(joint["coordinates"]),
                "Unknown or incomplete active native joint degrees of freedom: " + name)
        connect(joint["members"])
    for group in raw["rigidGroups"]:
        counts[group["occurrence"]]["rigidGroups"] += 1
        require(type(group["suppressed"]) is bool, "Unknown rigid group state")
        if not group["suppressed"]:
            require(group["health"] == "healthy", "Unresolved native rigid group health: " + group["name"])
            connect(group["members"])
    for link in raw["motionLinks"]:
        counts[link["occurrence"]]["motionLinks"] += 1
        require(link["suppressed"] is True, "Active native motion link needs independently calibrated dependent coordinates: " + link["name"])
    for owner, summary in raw["localCounts"].items():
        require(set(summary) == {"joint", "asBuilt", "rigidGroups", "motionLinks"} and all(
            type(n) is int and n >= 0 and counts[owner][k] == n for k, n in summary.items()),
            "Rooted joint inventory differs from native component constraints at " + owner)
    require(set(counts) <= nodes, "Native constraint has an unknown owner")
    pending = [owners[anchor]]
    connected = set(pending)
    while pending:
        for neighbor in neighbors[pending.pop()] - connected:
            connected.add(neighbor)
            pending.append(neighbor)
    loose = set(owners.values()) - connected
    require(not loose, "Installed occurrences lack a native constraint path to the registered support: " + ", ".join(sorted(loose)))
    return {key:j for key,j in joints.items() if not j["locked"] and not j["suppressed"] and j["coordinates"]}
