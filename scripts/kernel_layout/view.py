"""The review scene's frames: each solid's display mesh once, where the library places it at each frame of a motion, and
the motion's own clock and readout from its records.

Nothing here measures. The library builds the solids and tessellates them for display; it states each group's placement
along a motion; its records state each commanded joint's start and end, and each powered motion's currents and bus
voltage. A frame is an even step of the motion's stroke.
"""
from .inputs import library

FRAMES = 25
# How far a display triangle may stand off the true surface. It affects the picture only: nothing is measured on a mesh.
MESH_DEFLECTION_MM = 0.08
UNITS = {"rotation": "°", "slide": " mm"}


def built(inputs):
    """The library's assembly of the design source, and each solid's volume as the library computes it."""
    kernel = library()
    from frc_design_kernel.measure import carry
    assembly = kernel.build(inputs.design)
    return assembly, {name: figures[0] for name, figures in carry.figures(assembly).items()}


def clock(duration, frames=FRAMES):
    """Seconds at each frame of a stroke made from rest to rest on the library's triangle speed profile: even
    acceleration over the first half of the duration and even deceleration over the second."""
    out = []
    for k in range(frames):
        s = k / (frames - 1)
        out.append(duration * ((s / 2) ** 0.5 if s <= 0.5 else 1 - ((1 - s) / 2) ** 0.5))
    return out


def joint_rows(inputs, motion, record):
    """[(drive, kind, start, end)] for each drive the motion commands, from the joints its clearance record used."""
    joints = record["used"].get("joints") or {}
    drives = inputs.data.get("drives") or {}
    rows = []
    for name in sorted((inputs.data["motions"][motion].get("drive") or {})):
        joint = drives[name]["joint"]
        found = joints.get(joint["group"])
        if found:
            rows.append((name, found["kind"], found["from"], found["to"]))
    return rows


def readout(inputs, case, record, power):
    """(time per frame or None, readout per frame): the drives' joint values, peak currents and the bus, or the stated cause."""
    entry = inputs.data["motions"][case["id"]]
    joints = joint_rows(inputs, case["id"], record)
    if not joints:
        line = ("By " + entry["by"] if entry.get("by") else "No stated cause") + ": no motor drives this motion"
        if power:
            line += " · bus %.2f–%.2f V with %s running" % (*power["busV"], ", ".join(r["drive"] for r in power["alsoRunning"]))
        return None, [line] * FRAMES
    drives = {d["drive"]: d for d in (power or {}).get("drives", [])}
    lines = []
    for k in range(FRAMES):
        s = k / (FRAMES - 1)
        words = []
        for name, kind, start, end in joints:
            word = "%s %.1f%s of %g–%g%s" % (name, start + (end - start) * s, UNITS[kind], start, end, UNITS[kind])
            if name in drives:
                word += ", up to %.2f A" % drives[name]["currentA"][1]
            words.append(word)
        if power:
            words.append("bus %.2f–%.2f V" % tuple(power["busV"]))
        lines.append(" · ".join(words))
    duration = entry.get("durationS")
    value = duration.get("value") if isinstance(duration, dict) else duration
    return (clock(value) if isinstance(value, (int, float)) else None), lines


def capture(inputs, assembly, volumes, case_id, motion, moving, absent, meshes, shifted=None):
    """One case's bodies: display mesh and per-frame placement. A solid whose group does not move keeps one frame.

    meshes is shared across the cases, so the library tessellates each solid once, as drawn. shifted is (solid, offset)
    for the displaced control: that solid is drawn where the control puts it."""
    from frc_design_kernel.motion import matrix
    kernel = library()
    steps = [kernel.placements(inputs.design, motion=motion, t=i / (FRAMES - 1)) for i in range(FRAMES)]
    bodies = {}
    for name, solid in sorted(assembly.solids.items()):
        if name in absent:
            continue
        if name not in meshes:
            meshes[name] = dict(assembly.mesh(name, MESH_DEFLECTION_MM), volumeMm3=volumes.get(name))
        identity = list(matrix.IDENTITY)
        frames = [steps[i].get(solid.group, identity) for i in (range(FRAMES) if solid.group in moving else range(1))]
        if shifted and name == shifted[0]:
            frames = [matrix.compose(m, matrix.translation(shifted[1])) for m in frames]
        bodies[name] = dict(vertices=meshes[name]["vertices"], triangles=meshes[name]["triangles"], matrices=[list(m) for m in frames])
    return dict(id=case_id, bodies=bodies)


def scenes(inputs, assembly, volumes, order, control):
    """The motions in the order given, then the displaced control, which plays its motion with one solid shifted."""
    from package_view import CONTROL_ID
    meshes, by_id = {}, {c["id"]: c for c in inputs.cases}
    found = [capture(inputs, assembly, volumes, m, m, set(by_id[m]["movingGroups"]), set(by_id[m]["absent"]), meshes) for m in order]
    if control:
        case = by_id[control["motion"]]
        found.append(capture(inputs, assembly, volumes, CONTROL_ID, case["id"], set(case["movingGroups"]), set(case["absent"]), meshes,
                             (control["displaced"], control["offsetMm"])))
    return found, {name: mesh["volumeMm3"] for name, mesh in meshes.items()}
