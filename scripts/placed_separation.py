"""Directional clearance bounds for named rigid STEP occurrences in their installed pose."""
import hashlib
import json
import math
import sys
from pathlib import Path


def direction(values):
    if (not isinstance(values, (tuple, list)) or len(values) != 3 or
            not all(type(v) in (float, int) and math.isfinite(v) for v in values)):
        raise ValueError("Use three finite world-space direction components")
    length = math.hypot(*values)
    if not math.isfinite(length) or length == 0:
        raise ValueError("Use a nonzero projection direction")
    return tuple(v / length for v in values)


def registered_axes(rows, shapes):
    registered = {}
    for row in rows:
        names = row.get("pair")
        if (not isinstance(names, list) or len(names) != 2 or
                not all(isinstance(name, str) and name in shapes for name in names) or names[0] == names[1]):
            raise ValueError("Select two distinct installed STEP solids")
        pair = tuple(sorted(names))
        if pair in registered:
            raise ValueError("Repeated direction registration for " + str(pair))
        axes = row.get("axesWorld")
        if not isinstance(axes, list) or not 1 <= len(axes) <= 12:
            raise ValueError("Register one to twelve world-space directions per pair")
        registered[pair] = [direction(axis) for axis in axes]
    return registered


def projected_clearance(shapes, pair, axes, clearance_mm=0):
    """Bound each full solid, including its BRep tolerances, in one common rigid basis."""
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.Precision import Precision
    from OCP.TopLoc import TopLoc_Location
    from OCP.gp import gp_Ax3, gp_Dir, gp_Pnt, gp_Trsf

    if type(clearance_mm) not in (float, int) or not math.isfinite(clearance_mm) or clearance_mm < 0:
        raise ValueError("Invalid required clearance")
    result = {"pair": list(pair), "status": "open", "requiredClearanceMm": clearance_mm}
    try:
        if not all(BRepCheck_Analyzer(shapes[name]).IsValid() for name in pair):
            return {**result, "reason": "An installed operand has invalid BRep topology"}
        best = None
        for axis in axes:
            axis = direction(axis)
            tr = gp_Trsf()
            tr.SetTransformation(gp_Ax3(gp_Pnt(), gp_Dir(*axis)))
            frame = TopLoc_Location(tr)
            intervals = []
            for name in pair:
                box = Bnd_Box()
                BRepBndLib.AddOptimal_s(shapes[name].Moved(frame), box, False, True)
                if box.IsVoid() or box.IsOpenZmin() or box.IsOpenZmax():
                    raise ValueError("Unbounded projected solid")
                lo, hi = box.CornerMin().Z(), box.CornerMax().Z()
                if not math.isfinite(lo) or not math.isfinite(hi) or hi < lo:
                    raise ValueError("Invalid projected bounds")
                intervals.append([lo, hi])
            a, b = intervals
            gap = max(a[0] - b[1], b[0] - a[1])
            reserve = 2 * Precision.Confusion_s() + 16 * max(math.ulp(v) for limits in intervals for v in limits)
            bound = gap - reserve
            if best is None or bound > best["signedBoundMm"]:
                best = dict(axisWorld=list(axis), intervalsMm=intervals, numericReserveMm=reserve, signedBoundMm=bound)
        if best is None:
            raise ValueError("Missing projection directions")
        result.update(best)
        if best["signedBoundMm"] > clearance_mm:
            result.update(status="separated", clearanceLowerBoundMm=best["signedBoundMm"])
        else:
            result["reason"] = "Projected intervals do not establish the requested separation"
    except (RuntimeError, ValueError, OverflowError) as error:
        result["reason"] = str(error)
    return result


def main():
    import argparse
    from showcase_contacts import load_solids

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("step", type=Path)
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes()
    plan = json.loads(plan_bytes)
    with args.step.open("rb") as handle:
        actual = hashlib.file_digest(handle, "sha256").hexdigest()
    if plan.get("schema") != "agent-frc/placed-separation@1" or plan.get("stepSha256") != actual:
        raise ValueError("Select the exact issued STEP registered for these projections")
    shapes, _ = load_solids(args.step)
    requested = registered_axes(plan["pairs"], shapes)
    if not requested:
        raise ValueError("Register at least one installed pair")
    results = [projected_clearance(shapes, pair, axes, plan["requiredClearanceMm"]) for pair, axes in requested.items()]
    print(json.dumps(dict(schema="agent-frc/placed-separation-result@1", stepSha256=actual,
                          planSha256=hashlib.sha256(plan_bytes).hexdigest(), units="mm", results=results), indent=2))
    return 0 if all(row["status"] == "separated" for row in results) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, OSError, TypeError, ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
