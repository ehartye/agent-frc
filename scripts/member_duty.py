"""Evaluate a straight rectangular, fixed-free, elastic member under transverse end loading."""
import argparse
import json
import math
from pathlib import Path
import sys
from mechanical_readiness import digest, named, number, pinned, project_path, read, require


def positive(x):
    return number(x) and x > 0


def fatigue_life(points, stress):
    """Interpolate stress amplitude and failure cycles logarithmically within the tested range."""
    for (high, short), (low, long) in zip(points, points[1:]):
        if low <= stress <= high:
            fraction = math.log(stress / high) / math.log(low / high)
            return math.exp(math.log(short) + fraction * math.log(long / short))
    return None


def evaluate(root, study):
    require(study.get("schema") == "agent-frc/member-duty@1", "Unknown member study")
    step = pinned(root, study["step"])
    material = read(pinned(root, study["material"]))
    load = read(pinned(root, study["load"]))
    geometry = read(pinned(root, study["dimensions"]))
    subject = study["body"]
    require(named(subject) and geometry["body"] == load["body"] == subject and
            geometry["stepSha256"] == load["stepSha256"] == digest(step), "Source or installed member differs")
    require(geometry["section"] == "solid-rectangle" and load["support"] == "fixed-free-end-force" and
            load["axis"] == geometry["bendingAxis"] and named(load["axis"]), "Unsupported section, axis or boundary")
    require(material["grade"] == geometry["grade"] and named(material["grade"]) and named(material["basis"]),
            "Material properties differ from issued stock")
    width, depth, span = [geometry[k] for k in ("widthMm", "depthMm", "spanMm")]
    elastic, allowable = [material[k] for k in ("modulusMPa", "bendingAllowableMPa")]
    factor, deflection = [study[k] for k in ("stressFactor", "deflectionLimitMm")]
    require(all(positive(x) for x in (width, depth, span, elastic, allowable, factor, deflection)) and
            factor >= 1 and named(study["factorBasis"]), "Invalid units, geometry or concentration basis")
    inertia = width * depth**3 / 12
    modulus = 2 * inertia / depth
    solved = []
    damage = 0
    fatigue_open = False
    points = material.get("fullyReversedSnMPaCycles", [])
    require(all(len(p) == 2 and all(positive(x) for x in p) for p in points) and
            all(a[0] > b[0] and a[1] < b[1] for a, b in zip(points, points[1:])), "Invalid S-N curve")
    ids = set()
    for case in load["cases"]:
        key = case["id"]
        require(named(key) and key not in ids and named(case["source"]), "Repeated or unsourced force case")
        ids.add(key)
        low, high, cycles = [case[k] for k in ("minimumN", "maximumN", "cycles")]
        require(number(low) and number(high) and low <= high and type(cycles) is int and cycles >= 0,
                "Invalid signed force extremes or cycles")
        magnitude = max(abs(low), abs(high))
        stress = factor * magnitude * span / modulus
        delta = magnitude * span**3 / (3 * elastic * inertia)
        life = None
        if cycles:
            if low == -high and high > 0 and len(points) >= 2 and named(material.get("fatigueBasis")):
                life = fatigue_life(points, stress)
            if life is None:
                fatigue_open = True
            else:
                damage += cycles / life
        solved.append({"case": key, "bendingMPa": stress, "tipDeflectionMm": delta, "fatigueCycles": life,
            "status": "fail" if stress > allowable or delta > deflection else "pass"})
    require(solved, "Supply source-bound force cases")
    limit = study["damageLimit"]
    require(positive(limit) and limit <= 1, "Supply the allowable cumulative fatigue damage")
    if load.get("completeLifeSpectrum") is not True or not any(c["cycles"] for c in load["cases"]):
        fatigue_open = True
    fatigue = "fail" if damage > limit else "open" if fatigue_open else "pass"
    governing = "fail" if fatigue == "fail" or any(r["status"] == "fail" for r in solved) else fatigue
    return {"schema":"agent-frc/member-duty-result@1","stepSha256":digest(step),"body":subject,
            "scope":"Fixed-free member bending, elastic tip deflection and supported fatigue spectrum",
            "cases":solved,"knownDamage":damage,"fatigue":fatigue,"status":governing}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("project", type=Path)
    p.add_argument("study")
    p.add_argument("--require-pass", action="store_true")
    a = p.parse_args()
    try:
        root = a.project.resolve()
        result = evaluate(root, read(project_path(root, a.study)))
        print(json.dumps(result, indent=2, allow_nan=False))
        sys.exit(int(a.require_pass and result["status"] != "pass"))
    except (KeyError, TypeError, ValueError, OSError) as error:
        sys.exit(str(error))
