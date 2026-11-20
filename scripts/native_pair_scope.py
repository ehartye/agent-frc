
"""Locate remaining clash and kernel work around a proposed subassembly change in a complete native census."""
import argparse
import json
from pathlib import Path

from mechanical_readiness import digest, number, pinned, read, require


def summarize(root, selection):
    path = pinned(root, selection["census"])
    census = read(path)
    contacts = census["contacts"]
    require(census["schema"] == "agent-frc/fusion-body-census@1" and contacts["complete"] is True
            and len(contacts["pairs"]) == contacts["candidatePairs"], "Use the complete native pair census")
    identities = [(b["path"], b["name"]) for b in census["bodies"]]
    members = [tuple(m) for m in selection["members"]]
    require(len(set(identities)) == len(identities) and members and len(set(members)) == len(members)
            and set(members) <= set(identities), "Unknown or ambiguous selected native occurrence/body")
    selected = set(members)
    threshold = selection["thresholdMm3"]
    require(number(threshold) and threshold >= 0, "Specify the screening threshold in cubic millimeters")
    groups = {name: dict(tested=0, aboveThreshold=[], unresolved=[]) for name in ("outside", "crossing", "inside")}
    seen = set()
    for row in contacts["pairs"]:
        a,b = row["pair"]
        require(0 <= a < b < len(identities) and (a,b) not in seen, "Duplicate or unknown broad-phase pair")
        seen.add((a,b))
        pair = [identities[a], identities[b]]
        group = groups[("outside", "crossing", "inside")[sum(m in selected for m in pair)]]
        group["tested"] += 1
        measurements = [row.get(k) for k in ("interferenceMm3", "temporaryCommonMm3")]
        if not all(number(v) and v >= 0 for v in measurements):
            group["unresolved"].append(pair)
        if any(number(v) and v > threshold for v in measurements):
            group["aboveThreshold"].append(dict(pair=pair, nativeMm3=measurements[0], temporaryMm3=measurements[1]))
    return dict(archiveSha256=census["archiveSha256"], censusSha256=digest(path), pose=census["pose"],
                thresholdMm3=threshold, selectedBodies=len(members), groups=groups)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("project",type=Path)
    p.add_argument("selection",type=Path)
    args = p.parse_args()
    print(json.dumps(summarize(args.project.resolve(), read(args.selection)),indent=2,allow_nan=False))
