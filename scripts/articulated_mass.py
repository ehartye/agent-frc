"""Compare one frozen coordinate's physical membership and mass properties with its model."""
import argparse
import json
from pathlib import Path

import numpy as np

from mechanical_readiness import digest, named, number, pinned, read, require


BASES = {"measured", "supplier-nominal", "density-model", "model-assumption", "unknown"}
ROLES = {"moving", "fixed", "unknown"}


def vector(value):
    require(isinstance(value, list) and len(value) == 3 and all(number(x) for x in value),
            "Supply three finite coordinates in the common world frame")
    return np.asarray(value, dtype=float)


def indexed(rows):
    require(isinstance(rows, list) and rows, "Supply a named occurrence roster")
    result = {}
    for row in rows:
        require(isinstance(row, dict) and named(row.get("id")) and row["id"] not in result
                and row.get("role") in ROLES, "Invalid role, missing or duplicate occurrence")
        result[row["id"]] = row
    return result


def projected(tensor, axis):
    require(isinstance(tensor, list) and len(tensor) == 3, "Supply a centroidal 3-by-3 tensor")
    inertia = np.asarray([vector(row) for row in tensor])
    scale = max(float(np.max(np.abs(inertia))), 1e-30) * 1e-10
    require(np.max(np.abs(inertia - inertia.T)) <= scale, "Centroidal tensor must be symmetric")
    eigen = np.linalg.eigvalsh(inertia)
    require(eigen[0] >= -scale and eigen[2] <= eigen[0]+eigen[1]+scale, "Impossible principal moments")
    return max(0., float(axis @ inertia @ axis))


def placed_properties(root, reference, members):
    selected = {k: row for k, row in members.items() if "solid" in row}
    if not selected:
        return {}
    from OCP.BRepGProp import BRepGProp
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.GProp import GProp_GProps
    from showcase_contacts import load_solids
    step_ref = reference["step"]
    file = pinned(root, step_ref)
    ids = {}
    solids, _ = load_solids(file, ids)
    measured, used = {}, set()
    for key, row in selected.items():
        solid = row["solid"]
        name = solid["name"]
        require(name in ids and name not in used and ids[name] == solid["identity"]
                and row.get("homogeneous") is True, "Each homogeneous placed solid needs its exact distinct occurrence")
        require(not any(f in row for f in ("centerM", "centroidalAxisKgM2", "centroidalTensorKgM2")),
                "Use one geometry source per occurrence")
        used.add(name)
        shape = solids[name]
        require(BRepCheck_Analyzer(shape).IsValid(), "Invalid placed solid: "+name)
        props = GProp_GProps()
        BRepGProp.VolumeProperties_s(shape, props, True)
        volume = props.Mass()
        require(number(volume) and volume > 0, "Unresolved volume: "+name)
        center = vector([v*.001 for v in props.CentreOfMass().Coord()])
        mat = props.MatrixOfInertia()
        per_kg = [[mat.Value(i+1, j+1)*1e-6/volume for j in range(3)] for i in range(3)]
        measured[key] = (center, per_kg)
    require(digest(file) == step_ref["sha256"], "Placed source changed during measurement")
    return measured


def subtotal(rows, ids, measured, origin, axis, rotary):
    mass, first, moment = 0., np.zeros(3), 0.
    missing = {"mass": [], "center": [], "inertia": []}
    bases = set()
    for key in sorted(ids):
        row = rows[key]
        basis, m = row["massBasis"], row["massKg"]
        bases.add(basis)
        if m is None or basis == "unknown":
            for field in missing:
                missing[field].append(key)
            continue
        mass += m
        if key in measured:
            center, per_kg = measured[key]
            intrinsic = projected(per_kg, axis)*m if rotary else None
        else:
            center = vector(row["centerM"]) if row.get("centerM") is not None else None
            intrinsic = row.get("centroidalAxisKgM2")
            if row.get("centroidalTensorKgM2") is not None:
                require(intrinsic is None, "Use one centroidal inertia basis")
                intrinsic = projected(row["centroidalTensorKgM2"], axis)
            require(intrinsic is None or number(intrinsic) and intrinsic >= 0, "Invalid centroidal moment")
        if center is None:
            missing["center"].append(key)
        else:
            first += m*center
        if rotary and (center is None or intrinsic is None):
            missing["inertia"].append(key)
        elif rotary:
            moment += intrinsic + m*float(np.linalg.norm(np.cross(axis, center-origin))**2)
    return {"ids": sorted(ids), "knownMassKg": mass, "massKg": None if missing["mass"] else mass,
            "centerM": (first/mass).tolist() if not missing["center"] and mass > 0 else None,
            "axisKgM2": moment if rotary and not missing["inertia"] else None,
            "knownAxisKgM2": moment if rotary else None, "missing": missing, "massBases": sorted(bases)}


def review(root, study):
    require(study["schema"] == "agent-frc/articulated-mass@1", "Expected articulated-mass@1")
    ref, sim = [read(pinned(root, study[k])) for k in ("reference", "simulation")]
    require(study["reference"]["sha256"] != study["simulation"]["sha256"], "Supply independent reference and simulator inputs")
    for field in ("issue", "configuration", "frame", "joint", "heldState"):
        require(named(ref.get(field)) and ref[field] == sim.get(field), "Mismatched study identity: "+field)
    require(ref["issueFile"]["sha256"] == ref["issue"], "Bind the selected issue file")
    pinned(root, ref["issueFile"])
    for record in (ref, sim):
        require(isinstance(record.get("sources"), list) and record["sources"], "Pin each input's underlying evidence")
        for source in record["sources"]:
            pinned(root, source)
    if "step" in ref:
        require(ref["step"] == ref["issueFile"] or ref["step"] in ref["sources"],
                "Bind the placed STEP to this reference calculation")
    rows, observed = indexed(ref["members"]), indexed(sim["members"])
    for row in rows.values():
        require(row.get("massBasis") in BASES and (row.get("massKg") is None or
                number(row["massKg"]) and row["massKg"] > 0), "Supply a positive mass or unknown with basis")
        require("massKg" in row and (row["massBasis"] != "unknown" or row["massKg"] is None),
                "Unknown mass must remain unresolved")
    tol = study["tolerances"]
    for key in ("massKg", "centerM", "axisKgM2", "axisDirection", "originM", "coordinate"):
        require(number(tol.get(key)) and tol[key] >= 0, "Supply a nonnegative tolerance for "+key)
    require(tol["axisDirection"] < 1, "Direction tolerance must distinguish opposing axes")
    rotary = ref["kind"] == "rotary"
    require(rotary or ref["kind"] == "prismatic", "Select a rotary or prismatic coordinate")
    unit = "rad" if rotary else "m"
    origin, axis = vector(ref["originM"]), vector(ref["axisUnit"])
    model_origin, model_axis = vector(sim["originM"]), vector(sim["axisUnit"])
    require(all(abs(np.linalg.norm(v)-1) < 1e-10 for v in (axis, model_axis)), "A signed unit axis is required")
    require(ref["unit"] == unit and number(ref.get("signedCoordinate")) and number(sim.get("signedCoordinate")),
            "Register the signed coordinate in the reference unit")
    checks = []
    def check(field, status, **detail):
        checks.append(dict(field=field, status=status, **detail))
    def compare(field, error, limit):
        check(field, "matched" if error <= limit else "mismatch", error=float(error), tolerance=limit)
    check("coordinate type and units", "matched" if sim["kind"] == ref["kind"] and sim["unit"] == unit else "mismatch")
    compare("signed coordinate", abs(ref["signedCoordinate"]-sim["signedCoordinate"]), tol["coordinate"])
    compare("axis direction", np.linalg.norm(axis-model_axis), tol["axisDirection"])
    # A different point along the same rotary axis represents the same axle line.
    compare("axis location", np.linalg.norm(np.cross(model_origin-origin, axis)) if rotary
            else np.linalg.norm(model_origin-origin), tol["originM"])
    omissions = ref["omissions"]
    require(isinstance(omissions, list) and all(named(x) for x in omissions), "List unmodeled or unknown articles")
    for key in sorted(rows.keys() | observed.keys()):
        expected = rows.get(key, {}).get("role")
        actual = observed.get(key, {}).get("role")
        if expected == actual and expected in ("fixed", "moving"):
            continue
        indeterminate = expected == "unknown" or actual == "unknown" or expected is None or actual is None
        check("membership", "open" if indeterminate else "mismatch", id=key, expected=expected, observed=actual)
    if not any(c["field"] == "membership" for c in checks):
        check("membership", "matched")
    moving = {key for key, row in rows.items() if row["role"] == "moving"}
    seen_moving = {key for key, row in observed.items() if row["role"] == "moving"}
    covered = sim["contributingIds"]
    require(isinstance(covered, list) and all(named(k) for k in covered) and len(covered) == len(set(covered))
            and set(covered) <= seen_moving, "Identify each contributor to the simulated totals exactly once")
    measured = placed_properties(root, ref, rows)
    actual = subtotal(rows, moving, measured, origin, axis, rotary)
    coverage = set(covered)
    partial = omissions or coverage != seen_moving or coverage != moving or set(rows) != set(observed) or any(
        v["role"] == "unknown" for v in [*rows.values(), *observed.values()])
    check("coverage", "open" if partial else "matched", omitted=omissions,
          missingContributors=sorted(seen_moving-coverage))
    if not coverage or not coverage <= rows.keys():
        check("simulated subtotal", "open")
        scope = None
    else:
        scope = subtotal(rows, coverage, measured, origin, axis, rotary)
        require(isinstance(sim["massBases"], list) and all(b in BASES for b in sim["massBases"]),
                "Declare the source basis for the simulated mass")
        check("mass basis", "matched" if set(sim["massBases"]) == set(scope["massBases"]) else "mismatch")
        for field in ("massKg", "centerM", "axisKgM2"):
            value = sim.get(field)
            if field == "axisKgM2" and not rotary:
                check(field, "inapplicable" if value is None else "mismatch")
            elif value is None or scope[field] is None:
                check(field, "open")
            else:
                if field == "centerM":
                    error = np.linalg.norm(vector(value)-vector(scope[field]))
                else:
                    require(number(value) and value >= 0, "Invalid simulated "+field)
                    error = abs(value-scope[field])
                compare(field, error, tol[field])
    statuses = {c["status"] for c in checks}
    return dict(schema="agent-frc/articulated-mass-result@1", joint=ref["joint"], issue=ref["issue"],
                reference=study["reference"], simulation=study["simulation"], properties=actual,
                comparedSubtotal=scope, checks=checks, status="mismatch" if "mismatch" in statuses else
                "open" if "open" in statuses else "matched", scope="Agreement of supplied model inputs at one configuration.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("--project", type=Path)
    args = parser.parse_args()
    evidence = read(args.study)
    result = review((args.project or args.study.parent).resolve(), evidence)
    print(json.dumps(dict(result, studySha256=digest(args.study)), indent=2, allow_nan=False))
