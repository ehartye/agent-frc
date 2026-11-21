"""Measure commissioned pairs of placed solids in one registered Fusion STEP."""
import argparse
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import re

from component_shape import boolean_measure
from fusion_authority import register_path, verify
from mechanical_motion import bearing_area, distance
from mechanical_readiness import digest, named, pinned, read, require
from placed_solid_identity import binary_solid
from showcase_contacts import load_solids


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def binding(root, plan):
    import OCP

    require(set(plan) == {"schema", "lineage", "leaves", "pairs"}
            and plan["schema"] == "agent-frc/placed-pairs@1", "Register only named placed pairs")
    leaves, pairs = plan["leaves"], plan["pairs"]
    require(isinstance(leaves, dict) and len(leaves) >= 2 and all(named(key) for key in leaves),
            "Name each unique placed solid")
    for identity in leaves.values():
        require(isinstance(identity, dict) and set(identity) == {"definition", "instance", "occurrencePath"}
                and isinstance(identity["occurrencePath"], list) and identity["occurrencePath"]
                and all(isinstance(label, str) for label in identity["occurrencePath"])
                and isinstance(identity["definition"], str) and named(identity["instance"]),
                "Supply the complete identity from the placed inventory")
    require(isinstance(pairs, list) and pairs, "Register one or more specific pairs")
    for pair in pairs:
        require(isinstance(pair, list) and len(pair) == 2 and all(named(n) and n in leaves for n in pair)
                and pair[0] != pair[1], "A registered pair needs two distinct selected leaves")
    require(len({frozenset(pair) for pair in pairs}) == len(pairs)
            and {n for pair in pairs for n in pair} == set(leaves), "Repeated pair or unused leaf")
    lineage_path = pinned(root, plan["lineage"])
    checked = verify(root, register_path(root), lineage_path)
    step = root/read(lineage_path)["step"]["file"]
    scripts = Path(__file__).parent
    methods = {name:digest(scripts/name) for name in ("placed_pair_cache.py", "showcase_contacts.py",
               "placed_solid_identity.py", "stock_sections.py", "component_shape.py", "mechanical_motion.py")}
    return step, {"issue":checked, "planSha256":sha256(encoded(plan)).hexdigest(), "kernel":OCP.__version__,
                  "encoding":"BinTools V4 mesh-free", "frame":"canonical STEP root in mm", "methods":methods}


def placement(shape):
    transform = shape.Location().Transformation()
    return [transform.Value(i,j) for i in range(1,4) for j in range(1,5)]


def full_read(step, source, plan, cache=None):
    identities = {}
    shapes, surfaces = load_solids(step, identities)
    rows, selected = {}, {}
    for name, identity in plan["leaves"].items():
        require(identities.get(name) == identity, "Missing or different rooted occurrence: "+name)
        shape = shapes[name]
        data = binary_solid(shape)
        fingerprint = sha256(data).hexdigest()
        rows[name] = {"identity":identity, "sha256":fingerprint, "length":len(data), "placement3x4":placement(shape)}
        if cache is not None and not (cache/(fingerprint+".brep")).exists():
            with (cache/(fingerprint+".brep")).open("xb") as output:
                output.write(data)
        selected[name] = shape
    return {"schema":"agent-frc/placed-pair-index@1", "binding":source, "totalSolids":len(shapes),
            "nonSolidLeafCount":len(surfaces), "leaves":rows, "pairs":plan["pairs"]}, selected


def cached_read(cache, index_pin, source, plan):
    from OCP.BinTools import BinTools
    from OCP.TopoDS import TopoDS_Shape

    raw = (cache/"index.json").read_bytes()
    require(sha256(raw).hexdigest() == index_pin, "Cache index differs from independent full-source registration")
    index = json.loads(raw)
    require(index["binding"] == source and index["pairs"] == plan["pairs"]
            and set(index["leaves"]) == set(plan["leaves"]), "Cache source, reader or selection changed")
    selected = {}
    for name, row in index["leaves"].items():
        require(row["identity"] == plan["leaves"][name], "Cache occurrence differs: "+name)
        path = cache/(row["sha256"]+".brep")
        require(path.stat().st_size == row["length"], "Cached solid length differs: "+name)
        data = path.read_bytes()
        require(sha256(data).hexdigest() == row["sha256"], "Cached placed bytes differ: "+name)
        shape = TopoDS_Shape()
        BinTools.Read_s(shape, BytesIO(data))
        require(placement(shape) == row["placement3x4"] and binary_solid(shape) == data,
                "Placed BRep did not round-trip exactly: "+name)
        selected[name] = shape
    return index, selected


def measure_pairs(index, shapes, plan):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common

    results = []
    for left, right in plan["pairs"]:
        row = {"leaves":[left,right], "errors":[]}
        a, b = shapes[left], shapes[right]
        for key, measure in (("gapMm", distance), ("opposedPlanarAreaMm2", bearing_area)):
            try:
                value = measure(a,b)
                require(math.isfinite(value) and value >= 0, "Invalid scalar")
                row[key] = value
            except (RuntimeError, ValueError) as exc:
                row["errors"].append(key+": "+str(exc))
        try:
            row["rawCommonMm3"], row["commonValid"] = boolean_measure(a,b,BRepAlgoAPI_Common)
            if not row["commonValid"]:
                row["errors"].append("Common topology is invalid")
        except (RuntimeError, ValueError) as exc:
            row["errors"].append("Common: "+str(exc))
        row["status"] = "open" if row["errors"] else "measured"
        results.append(row)
    return {"schema":"agent-frc/placed-pair-results@1", "scope":"Listed pairs in the parked STEP only",
            "binding":index["binding"], "selected":index["leaves"], "totalSolids":index["totalSolids"],
            "nonSolidLeafCount":index["nonSolidLeafCount"], "pairs":results}


def run(action, root, plan, cache=None, index_pin=None, fallback=False):
    step, source = binding(root.resolve(), plan)
    if action in ("prepare", "register"):
        if action == "prepare":
            cache.mkdir(exist_ok=False)
        index, _ = full_read(step, source, plan, cache if action == "prepare" else None)
        data = encoded(index)
        if action == "prepare":
            with (cache/"index.json").open("xb") as output:
                output.write(data)
        return {"operation":action, "indexSha256":sha256(data).hexdigest(), "binding":source,
                "totalSolids":index["totalSolids"], "selected":list(index["leaves"])}
    require(action == "measure" and isinstance(index_pin,str) and re.fullmatch("[0-9a-f]{64}",index_pin),
            "Measure requires an independent full-source index SHA-256")
    why = None
    try:
        index, selected = cached_read(cache, index_pin, source, plan)
    except (OSError, RuntimeError, ValueError) as exc:
        if not fallback:
            raise
        why = str(exc)
        index, selected = full_read(step, source, plan)
        require(sha256(encoded(index)).hexdigest() == index_pin,
                "Full-source fallback differs from independent index: "+why)
    return {**measure_pairs(index, selected, plan), "indexSha256":index_pin,
            "readFrom":"canonical-step" if why is not None else "placed-cache", "cacheFinding":why}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    for action in ("prepare", "register", "measure"):
        cmd = commands.add_parser(action)
        cmd.add_argument("project", type=Path)
        cmd.add_argument("plan", type=Path)
        if action != "register":
            cmd.add_argument("cache", type=Path)
        if action == "measure":
            cmd.add_argument("--index-sha256", required=True)
            cmd.add_argument("--fallback", action="store_true")
    args = parser.parse_args()
    try:
        result = run(args.action,args.project,read(args.plan),getattr(args,"cache",None),
                     getattr(args,"index_sha256",None),getattr(args,"fallback",False))
        ok = all(p["status"] == "measured" for p in result.get("pairs",[]))
    except (OSError, RuntimeError, ValueError, TypeError, KeyError) as exc:
        result, ok = {"operation":args.action, "status":"open", "reason":str(exc)}, False
    print(json.dumps(result,indent=2,allow_nan=False))
    raise SystemExit(0 if ok else 1)
