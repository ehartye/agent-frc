"""Read chapter clocks and root-local piece translations from a hash-bound GLB."""
import hashlib
import json
import math
import sys
from pathlib import Path
from showcase_geometry import Glb, indexed, require


def read_clips(file, digest, chapters):
    raw = Path(file).read_bytes()
    require(hashlib.sha256(raw).hexdigest() == digest, "Changed GLB during replay check")
    glb = Glb(raw)
    doc = glb.doc
    roots = doc["scenes"][doc.get("scene", 0)]["nodes"]
    result = []
    for chapter in chapters:
        matches = [a for a in doc.get("animations", []) if a.get("name") == chapter["animation"]]
        require(len(matches) == 1, "Missing or ambiguous animation")
        animation = matches[0]
        def times(sampler):
            rows = [r[0] for r in glb.accessor(sampler["input"], times=True)]
            require(rows[0] >= 0 and all(math.isfinite(v) for v in rows) and
                    all(a < b for a, b in zip(rows, rows[1:])), "Invalid animation key times")
            return rows
        duration = max(times(s)[-1] for s in animation["samplers"])
        row = {"duration": duration}
        if "node" in chapter:
            nodes = [n for n in roots if doc["nodes"][n].get("name") == chapter["node"]]
            require(len(nodes) == 1 and "mesh" in doc["nodes"][nodes[0]], "Expected unique root piece mesh")
            channels = [c for c in animation["channels"] if c["target"].get("node") == nodes[0]
                        and c["target"]["path"] == "translation"]
            require(len(channels) == 1, "Missing or ambiguous piece translation channel")
            sampler = indexed(animation["samplers"], channels[0]["sampler"], "sampler")
            require(sampler.get("interpolation", "LINEAR") in ["LINEAR", "STEP"], "Unsupported piece interpolation")
            keys = times(sampler)
            points = glb.accessor(sampler["output"], positions=True)
            require(len(keys) == len(points), "Piece key count differs")
            row.update(node=nodes[0], firstTime=keys[0], lastTime=keys[-1],
                       start=points[0], end=points[-1])
        result.append(row)
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(read_clips(sys.argv[1], sys.argv[2], json.load(sys.stdin)), allow_nan=False))
    except (KeyError, IndexError, ValueError, OSError, TypeError) as error:
        sys.exit(str(error))
