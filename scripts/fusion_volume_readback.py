"""Compare volume readings on individually identified persistent Fusion body definitions."""
import argparse
import json
import math
from pathlib import Path


METHODS = ("body.volume", "physicalProperties.High", "physicalProperties.VeryHigh")


def observe(app, body):
    """Call while each imported or cold-reopened document is still open."""
    import adsk.fusion

    if not body.isSolid or body.isTemporary:
        raise ValueError("Select a persistent solid in the open source document")
    body = body.nativeObject or body
    readings = {}
    for method in METHODS:
        try:
            if method == "body.volume":
                volume = body.volume
            else:
                setting = method.split(".")[1] + "CalculationAccuracy"
                accuracy = getattr(adsk.fusion.CalculationAccuracy, setting)
                volume = body.getPhysicalProperties(accuracy).volume
            readings[method] = volume * 1000
            if not math.isfinite(readings[method]):
                raise ValueError("Nonfinite volume")
        except Exception as error:
            readings[method] = {"error": str(error)}
    return {"kernel": "Fusion", "build": app.version, "realization": "persistent-definition",
            "unit": "mm3", "readings": readings}


def positive(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def compare(source, candidate, method, tolerance):
    if method not in METHODS or not (type(tolerance) in (float, int) and math.isfinite(tolerance) and tolerance >= 0):
        raise ValueError("Specify a supported common method and nonnegative volume resolution in mm3")
    result = dict(status="unresolved", method=method, toleranceMm3=tolerance,
                  source=source, candidate=candidate)
    for row in (source, candidate):
        if (not isinstance(row, dict) or not isinstance(row.get("readings"), dict)
                or row.get("kernel") != "Fusion" or row.get("realization") != "persistent-definition"
                or row.get("unit") != "mm3" or not isinstance(row.get("build"), str) or not row["build"].strip()):
            return dict(result, reason="Reopen both as persistent Fusion definitions with explicit build and units")
    if source["build"] != candidate["build"]:
        return dict(result, reason="Repeat both observations in the same Fusion build")
    common = {}
    for key in METHODS:
        first = source["readings"].get(key)
        last = candidate["readings"].get(key)
        if positive(first) and positive(last):
            common[key] = last - first
    result["pairedDeltasMm3"] = common
    if method not in common:
        return dict(result, reason="The commissioned method needs positive readings on both original and cold solids")
    verdict = abs(common[method]) <= tolerance
    if any((abs(delta) <= tolerance) != verdict for delta in common.values()):
        return dict(result, reason="Valid same-method comparisons disagree at the registered resolution")
    return dict(result, status="consistent-volume" if verdict else "different-volume")


def run(project, study):
    from mechanical_readiness import digest, pinned, read

    rows = []
    for key in ("source", "candidate"):
        target = study[key]
        model = pinned(project, target["model"])
        receipt = read(pinned(project, target["observations"]))
        if receipt["modelSha256"] != digest(model):
            raise ValueError(f"{key} observation belongs to another model")
        rows.append(receipt["bodies"][target["body"]])
    result = compare(*rows, study["method"], study["toleranceMm3"])
    return dict(result, inputs={k: study[k] for k in ("source", "candidate")})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    report = run(args.project.resolve(), json.loads(args.study.read_bytes()))
    print(json.dumps(report, indent=2, allow_nan=False))
    raise SystemExit(0 if report["status"] == "consistent-volume" else 1)
