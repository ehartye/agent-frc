"""Trial replays for the review page, built from the library's own trial record.

Each trial in the record the judgement file names as `trials` becomes one replay: its nominal run, on the run's own
clock. The piece is drawn from the shape the record gives it and placed at each traced centre, on the trial's plane
(and off it by `offPlaneMm` where the 3D engine traced that), turned by the spin summed over the trace about the
plane's normal, signed the way both engines count spin, exactly as the library's fit turns it. Other free pieces of a
3D trial follow their own traced centres. The design's solids stand still where the trial's pose puts them; the
source's own payload solids are left out, so the piece is not drawn twice. A surface a mover slides during the trial
is drawn where it starts: the record traces the piece, not the surface.

Nothing here is a clearance case: the layout check neither runs nor credits a replay.
"""
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory

FRAMES = 240            # at most this many frames of a long trace are kept, every n-th row and always the last
PIECE_MESH_MM = 0.5     # how far a display triangle of a piece may stand off its surface


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def kept_rows(rows):
    """The trace rows a replay shows: all of them, or every n-th and the last for a long trace."""
    step = max(1, -(-len(rows) // FRAMES))
    picked = rows[::step]
    return picked if picked[-1] == rows[-1] else [*picked, rows[-1]]


def piece_mesh(shape):
    """The piece's display mesh, drawn about its centre, as {v, f}. The library builds and meshes it through its public
    calls, from a design source of the one solid written to a temporary folder."""
    import frc_design_kernel as kernel
    source = {"schema": "frc-design-kernel/design@1", "name": "trial piece", "units": {"length": "mm", "mass": "kg"},
              "frame": "The piece's own drawing frame", "groups": {"piece": {"role": "payload"}}, "solids": [{"name": "piece", "group": "piece", "shape": shape}],
              "fixtures": [], "mounts": [], "contacts": [], "poses": {}, "motions": {}}
    with TemporaryDirectory() as folder:
        file = Path(folder) / "piece.json"
        file.write_text(json.dumps(source), encoding="utf-8")
        found = kernel.build(kernel.load(file)).mesh("piece", PIECE_MESH_MM)
    vertices = found["vertices"]
    centre = shape.get("centerMm") or [(min(p[i] for p in vertices) + max(p[i] for p in vertices)) / 2 for i in range(3)]
    return dict(v=[[round(p[i] - centre[i], 4) for i in range(3)] for p in vertices], f=[list(t) for t in found["triangles"]])


def centres(columns, rows, plane, prefix=""):
    """The traced centre of a piece at each row, in millimetres: its two plane axes, the plane's level and any offPlaneMm."""
    across = "xyz".index(plane["normal"])
    axes = [axis for axis in "xyz" if axis != plane["normal"]]
    at = [columns.index(prefix + axis + "Mm") for axis in axes]
    off = columns.index(prefix + "offPlaneMm") if prefix + "offPlaneMm" in columns else None
    out = []
    for row in rows:
        point = [row[at[0]], row[at[1]]]
        point.insert(across, plane["atMm"] + (row[off] if off is not None else 0.0))
        out.append(point)
    return out


def replay(name, trial, record_pin, design, solids, payloads):
    """One replay row of the scene, with the pieces it draws as {body: {name, mesh}}."""
    from frc_design_kernel import placements
    from frc_design_kernel.motion import matrix
    from frc_design_kernel.trials.fit import angles_of, turn_axis
    definition, nominal = trial["definition"], trial["nominal"]
    trace, plane = nominal["trace"], definition["plane"]
    columns, every = trace["columns"], trace["rows"]
    turns = angles_of(trace) or [0.0] * len(every)
    keep = kept_rows(list(range(len(every))))
    rows, angles = [every[i] for i in keep], [turns[i] for i in keep]
    axis, pieces, groups = turn_axis(plane["normal"]), {}, {}
    use = definition["piece"]["use"]
    pieces[use] = piece_mesh(definition["pieces"][use]["shape"])
    groups["piece"] = [list(matrix.compose(matrix.rotation(p, axis, a), matrix.translation(p))) for p, a in zip(centres(columns, rows, plane), angles)]
    bodies = {"piece: " + use: "piece"}
    for other in definition.get("others", []):
        pieces.setdefault(other["use"], piece_mesh(definition["pieces"][other["use"]]["shape"]))
        group = "piece " + other["name"]
        groups[group] = [list(matrix.translation(p)) for p in centres(columns, rows, plane, "other." + other["name"] + ".")]
        bodies["piece: " + other["use"] + " (" + other["name"] + ")"] = group
    placed = placements(design, pose=definition.get("pose"))
    for member, group in sorted(solids.items()):
        if member in payloads:
            continue
        at = placed.get(group)
        if at is None or matrix.is_identity(at):
            bodies[member] = None
        else:
            bodies[member] = group
            groups.setdefault(group, [list(at)] * len(rows))
    times = [row[0] for row in rows]
    events = [dict(frame=next((i for i, t in enumerate(times) if t >= event["t"] - 1e-9), len(times) - 1), label=event["event"])
              for event in nominal.get("events", [])]
    basis = ("The nominal run of trial " + name + " in the " + trial["engine"]["name"] + " engine, outcome " + str(nominal.get("outcome"))
             + "; trial result " + str(trial.get("result")) + ". The solids stand at " + ("pose " + definition["pose"] if definition.get("pose") else "the pose they were drawn in")
             + "; the piece moves as the run traced it.")
    row = dict(id="trial-" + slug(name), label=name + " (trial replay)", basis=basis, evidence=[dict(record_pin, role="trial record")],
               recorded=["The piece's centre and its turn in the trial's plane" + (", and how far it left the plane" if "offPlaneMm" in columns else "")],
               display=["The robot and the field, still at the trial's pose"], time=times, events=events, follow="piece",
               bodies=bodies, groups=groups)
    return row, pieces


def build(inputs):
    """The replays of every trial in the record the judgement file names, in name order, and the pieces they draw."""
    found = inputs.records.get("trials")
    if not found:
        return []
    record, pin, _ = found
    data = inputs.data
    solids = {s["name"]: s["group"] for s in [*data["solids"], *data["fixtures"]]}
    payloads = {m for g in inputs.plan["groups"].values() if g["role"] == "payload" for m in g["members"]}
    # A trial with no traced nominal run, such as an incomplete one, has nothing to play back.
    return [replay(name, trial, pin, inputs.design, solids, payloads) for name, trial in sorted(record.get("trials", {}).items())
            if ((trial.get("nominal") or {}).get("trace") or {}).get("rows")]
