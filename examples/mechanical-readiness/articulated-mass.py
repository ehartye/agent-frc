"""Synthetic paired moving-carriage study. Writes original JSON inputs to a new directory."""
import argparse
import hashlib
import json
from pathlib import Path


def write(root, name, value):
    path = root/name
    path.write_text(json.dumps(value, indent=2)+"\n", encoding="utf8")
    return {"file": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def make(root):
    root.mkdir()
    # Four equal blocks before travel. Opposite diagonals have equal aggregate properties.
    sites = [[.03,.04,0], [-.03,-.04,0], [-.03,.04,0], [.03,-.04,0]]
    names = ["upper pad", "lower pad", "left support", "right support"]
    masses = [.006]*4
    issue = write(root, "stock.json", {"ids": names, "centerM": sites, "boxSizeM": [.02,.01,.012],
                                      "massKg": masses, "basis": "Synthetic homogeneous stock"})
    joint = dict(issue=issue["sha256"], joint="shaft", configuration="empty parked carriage",
                 heldState="carriage slide held", frame="carriage world", kind="rotary",
                 unit="rad", signedCoordinate=0., axisUnit=[0,0,1], originM=[0,0,0])
    observations = write(root, "motion.json", {"moving":names[:2], "fixed":names[2:],
                                               "basis":"Synthetic motion assignment"})
    rows = [dict(id=name, role="moving" if i < 2 else "fixed", massBasis="model-assumption",
                 massKg=masses[i], centerM=sites[i], centroidalAxisKgM2=masses[i]*(.02**2+.01**2)/12)
            for i, name in enumerate(names)]
    reference = write(root, "reference.json", dict(joint, issueFile=issue, sources=[issue, observations],
                                                   members=rows, omissions=[]))
    for case, group in (("matched", names[:2]), ("swapped", names[2:])):
        roles = [dict(id=n, role="moving" if n in group else "fixed") for n in names]
        total = dict(massKg=.012, centerM=[0,0,0], axisKgM2=.0000305)
        model = write(root, case+"-model.json", dict(total, assignments=roles))
        sim = write(root, case+"-observation.json", dict(joint, sources=[model], **total,
                    members=roles, contributingIds=group, massBases=["model-assumption"]))
        write(root, case+".json", dict(schema="agent-frc/articulated-mass@1", reference=reference,
              simulation=sim, tolerances=dict(massKg=1e-9, centerM=1e-9, axisKgM2=1e-12,
              axisDirection=1e-8, originM=1e-9, coordinate=1e-8)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    make(parser.parse_args().output)
