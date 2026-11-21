"""Compare one issued contact article and a solver's finite collision primitive at named poses."""
import argparse
import json
import math
from pathlib import Path

import numpy as np

from fusion_authority import register_path, verify
from mechanical_motion import bounds, vec
from mechanical_readiness import digest, named, number, pinned, read, require
from release_onset import position, rigid
from showcase_contacts import load_solids


def observe_mujoco(model, data, geom, frame_body):
    """Call after forward kinematics on the registered model/state. Coordinates and sizes are SI."""
    import mujoco

    body, g = model.body(frame_body), model.geom(geom)
    types = {int(mujoco.mjtGeom.mjGEOM_CYLINDER): ("cylinder", 2),
             int(mujoco.mjtGeom.mjGEOM_BOX): ("box", 3)}
    kind, count = types[int(g.type[0])]
    frame = data.xmat[body.id].reshape(3, 3)
    pose = np.eye(4)
    pose[:3,:3] = frame.T @ data.geom_xmat[g.id].reshape(3, 3)
    pose[:3,3] = frame.T @ (data.geom_xpos[g.id] - data.xpos[body.id])
    return dict(geom=geom, frame=frame_body, kind=kind, halfSizesM=g.size[:count].tolist(),
                geomToFrameM=pose.ravel().tolist(), contactType=int(g.contype[0]),
                contactAffinity=int(g.conaffinity[0]))


def physical_witnesses(shape, points):
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_ON
    from OCP.gp import gp_Pnt

    require(BRepCheck_Analyzer(shape).IsValid(), "The registered CAD article has invalid topology")
    require(isinstance(points, dict) and points and all(named(k) for k in points),
            "Name the material surface witnesses on the selected solid")
    classifier = BRepClass3d_SolidClassifier(shape)
    for name, point in points.items():
        classifier.Perform(gp_Pnt(*vec(point)), 1e-7)
        require(classifier.State() == TopAbs_ON, "Witness is off the trimmed CAD surface: " + name)


def compare(local_bounds, points, expected, observed, tolerance):
    # Both poses use the same directed project frame. Convert the runtime translation once.
    cad = rigid(expected)
    sim = rigid(observed["geomToFrameM"])
    sim[:3,3] *= 1000
    local = np.linalg.inv(cad) @ sim
    rotation, center = local[:3,:3], local[:3,3]
    kind, sizes = observed["kind"], observed["halfSizesM"]
    require(kind in ("box", "cylinder") and len(sizes) == (3 if kind == "box" else 2)
            and all(number(x) and x > 0 for x in sizes), "Invalid finite collision primitive")
    sizes = np.array(sizes)*1000
    if kind == "box":
        half = abs(rotation) @ sizes
    else:
        half = (np.hypot(rotation[:,0], rotation[:,1])*sizes[0] + abs(rotation[:,2])*sizes[1])
    residuals = np.r_[center-half, center+half] - local_bounds
    surface = {}
    for name, point in points.items():
        p = rotation.T @ (point-center)
        q = (abs(p)-sizes if kind == "box" else
             np.array([math.hypot(p[0],p[1])-sizes[0], abs(p[2])-sizes[1]]))
        surface[name] = float(np.linalg.norm(np.maximum(q,0)) + min(max(q),0))
    # Cylinder axis polarity and roll do not alter its occupied volume. Only compare its line.
    axial_tilt = math.degrees(math.atan2(math.hypot(rotation[0,2],rotation[1,2]),abs(rotation[2,2])))
    checks = [max(abs(center)) <= tolerance["mountMm"],
              max(abs(residuals)) <= tolerance["extentMm"],
              max(abs(x) for x in surface.values()) <= tolerance["surfaceMm"]]
    if kind == "cylinder":
        checks.append(axial_tilt <= tolerance["axisLineDeg"])
    return dict(status="matched-samples" if all(checks) else "mismatch",
                centerOffsetLocalMm=center.tolist(), runtimeHalfSizesM=observed["halfSizesM"],
                extentResidualsMm=residuals.tolist(), signedSurfaceDistancesMm=surface,
                axisLineTiltDeg=axial_tilt if kind=="cylinder" else None)


def review(root, study):
    require(study["schema"] == "agent-frc/collider-comparison@1", "Expected collider-comparison@1")
    ref, sim = [read(pinned(root,study[key])) for key in ("reference","simulation")]
    lineage = pinned(root,ref["lineage"])
    issue = verify(root,register_path(root),lineage)
    for key in ("archiveSha256","stepSha256","configuration"):
        require(issue[key] == ref[key] == sim[key], "Different selected issue or configuration: " + key)
    for key in ("frame","geom"):
        require(named(ref[key]) and ref[key] == sim[key], "Different simulator mapping: " + key)
    for record in (ref,sim):
        require(isinstance(record["sources"],list) and record["sources"], "Pin original CAD/runtime evidence")
        for source in record["sources"]:
            pinned(root,source)
    require(sim["model"] in sim["sources"], "Bind the model used by the original execution")
    tolerance = ref["tolerance"]
    require(all(number(tolerance[k]) and tolerance[k]>=0 for k in
                ("mountMm","extentMm","surfaceMm","axisLineDeg")), "Invalid project comparison tolerance")
    name, identity = ref["solid"], ref["identity"]
    step = root/read(lineage)["step"]["file"]
    ids = {}
    shapes,_ = load_solids(step,ids)
    require(name in ids and ids[name] == identity and digest(step)==issue["stepSha256"],
            "Wrong placed occurrence or source revision")
    saved = rigid(ref["savedMountToFrameMm"])
    shape = position(shapes[name], np.linalg.inv(saved))
    points = ref["surfacePointsLocalMm"]
    physical_witnesses(shape, points)
    extents = np.array(bounds(shape))
    require(np.isfinite(extents).all(), "Unresolved placed extents")
    ref_poses, sim_poses = ref["poses"], sim["poses"]
    require(isinstance(ref_poses,dict) and ref_poses and all(named(s) for s in ref_poses)
            and isinstance(sim_poses,dict) and set(sim_poses)<=set(ref_poses), "Unexpected or empty pose commission")
    results = {}
    for key, pose in ref_poses.items():
        observed = sim_poses.get(key)
        if observed is None:
            results[key] = {"status":"open", "reason":"Missing effective collider readback"}
            continue
        require(observed["geom"]==ref["geom"] and observed["frame"]==ref["frame"] and
                observed["kind"]==ref["kind"], "Changed primitive, frame or collider: " + key)
        results[key] = compare(extents,points,pose,observed,tolerance)
    states = {r["status"] for r in results.values()}
    return dict(schema="agent-frc/collider-result@1",issue=issue,solid=name,identity=identity,
                localCadBoundsMm=extents.tolist(),poses=results,reference=study["reference"],simulation=study["simulation"],
                status="mismatch" if "mismatch" in states else "open" if "open" in states else "matched-samples")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    result = review(args.project.resolve(),read(args.study))
    print(json.dumps(result,indent=2,allow_nan=False))
    raise SystemExit(0 if result["status"]=="matched-samples" else 1)

