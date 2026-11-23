"""The review scene's frames: each solid's display mesh once, and where the library places it at each frame of a case."""
FRAMES = 25


def capture(case, measured, placements, meshes, shifted=None):
    """One case's bodies: display mesh and per-frame placement. A solid that does not move in the case keeps one frame.

    meshes is shared across the cases of one check, so each solid is tessellated once, as drawn. shifted is
    (solid, offset) for the displaced control: that solid is drawn where the control put it."""
    import package_mesh
    steps = [placements.at(case["id"], i / (FRAMES - 1)) for i in range(FRAMES)]
    bodies = {}
    for name, solid in sorted(measured.assembly.solids.items()):
        if name in case["removed"]:
            continue
        if name not in meshes:
            meshes[name] = package_mesh.surface_mesh(solid.shape)
        matrices = [steps[i][solid.group] for i in (range(FRAMES) if name in case["moves"] else range(1))]
        if shifted and name == shifted[0]:
            matrices = [placements.matrix.compose(m, placements.matrix.translation(shifted[1])) for m in matrices]
        bodies[name] = dict(**meshes[name], matrices=[list(m) for m in matrices])
    return dict(id=case["id"], stage=case["stage"], bodies=bodies)


def scenes(inputs, measured, placements, control):
    """The cases in cycle order, then the rest, then the displaced control."""
    from package_view import CONTROL_ID
    cycle = inputs.plan.get("cycle") or []
    meshes, by_id = {}, {c["id"]: c for c in inputs.cases}
    ordered = sorted(inputs.cases, key=lambda c: cycle.index(c["id"]) if c["id"] in cycle else len(cycle))
    found = [capture(case, measured, placements, meshes) for case in ordered]
    if control:
        nominal = by_id[control["case"]]
        found.append(capture(dict(nominal, id=CONTROL_ID), measured, PlacedAs(placements, nominal["id"]), meshes,
                             (control["displaced"], control["offsetMm"])))
    return found


class PlacedAs:
    """Placements of one motion under another case ID: the control plays the motion of the case it shifts."""

    def __init__(self, placements, motion):
        self.placements, self.motion, self.matrix = placements, motion, placements.matrix

    def at(self, _, t):
        return self.placements.at(self.motion, t)
