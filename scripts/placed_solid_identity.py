"""Check exact occupied-solid representation in a commissioned common STEP frame."""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

from component_shape import measured_difference, proper_rotation, volume
from mechanical_methods import pointer
from mechanical_readiness import named, pinned, read, require
from showcase_contacts import load_solids
from stock_sections import entities


IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def binary_solid(shape):
    from OCP.BinTools import BinTools, BinTools_FormatVersion
    from OCP.BRep import BRep_Tool
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SHELL, TopAbs_SOLID
    from OCP.TopoDS import TopoDS

    require(shape.ShapeType() == TopAbs_SOLID and BRepCheck_Analyzer(shape).IsValid()
            and volume(shape) > 0, "Select a valid solid with positive signed volume")
    shells = list(entities(shape, TopAbs_SHELL))
    require(shells and all(BRep_Tool.IsClosed_s(s) for s in shells), "Solid has an open boundary")
    face = getattr(TopoDS, "Face_s", None) or TopoDS.Face
    faces = list(entities(shape, TopAbs_FACE))
    require(faces and all(BRep_Tool.Surface_s(face(f)) is not None for f in faces),
            "Every face needs a geometric surface")
    stream = BytesIO()
    BinTools.Write_s(shape, stream, False, False, BinTools_FormatVersion.BinTools_FormatVersion_VERSION_4)
    data = stream.getvalue()
    require(data, "No binary BRep emitted")
    return data


def run(root, plan):
    import OCP
    require(plan.get("schema") == "agent-frc/placed-solid-identity@1" and named(plan.get("frame")),
            "Register the common placed frame")
    transform = plan["beforeToAfter"]
    proper_rotation(transform)
    require(transform == IDENTITY, "Exact comparison requires both exports already in the same world frame")
    observations = {}
    shapes = []
    representations = []
    for side in ("before", "after"):
        selection = plan[side]
        step = pinned(root, selection["step"])
        name = selection["solid"]
        require(named(name) and named(selection["configuration"]), "Register the exact solid and configuration")
        ref = selection.get("registration")
        if "registration" in selection:
            record = read(pinned(root, ref))
            require(pointer(record, ref["stepDigestAt"]) == selection["step"]["sha256"]
                    and pointer(record, ref["solidAt"]) == name,
                    "Registration does not identify the selected STEP and solid")
        identities = {}
        solids, _ = load_solids(step, identities)
        require(name in solids and identities[name]["instance"] == selection["instance"],
                "Selected placed solid or occurrence index differs from its registration")
        shape = solids[name]
        row = {**selection, "resolved": identities[name], "occurrenceRegistration": "unverified"}
        if ref is not None:
            require(pointer(record, ref["identityAt"]) == identities[name],
                    "Registration does not identify this STEP and full resolved occurrence")
            row["occurrenceRegistration"] = "matched"
        try:
            data = binary_solid(shape)
            row.update(bytes=len(data), binarySha256=sha256(data).hexdigest())
        except (RuntimeError, ValueError) as exc:
            data = None
            row["reason"] = str(exc)
        representations.append(data)
        observations[side] = row
        shapes.append(shape)
        del solids
    equal = representations[0] is not None and representations[0] == representations[1]
    return {"schema": "agent-frc/placed-solid-identity-result@1", "commissionedFrame": plan["frame"],
            "scope": "Represented material in the supplied STEP coordinate systems",
            "nativeFrameAndConfiguration": "requires independent native evidence",
            "beforeToAfter": transform, "kernelBinding": OCP.__version__, "binaryFormat": "BinTools V4 without mesh",
            **observations, "representedSolidEquality": "proved" if equal else "open",
            "directedComparison": measured_difference(*shapes, [])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    result = run(args.project.resolve(), read(args.plan))
    print(json.dumps(result, indent=2, allow_nan=False))
    raise SystemExit(int(result["representedSolidEquality"] != "proved"))
