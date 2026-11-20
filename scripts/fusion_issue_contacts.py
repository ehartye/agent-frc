"""Native interference measurements on a cold-open Fusion design. Called by fusion_issue_inventory."""
import hashlib
import itertools
import json
import math
from pathlib import Path


def measure(design, rows, proxies, solids, checkpoint, fingerprint, batch):
    import adsk.core
    import adsk.fusion
    manager = adsk.fusion.TemporaryBRepManager.get()
    pairs = []
    for a, b in itertools.combinations(range(len(rows)), 2):
        x, y = rows[a]["boundsMm"], rows[b]["boundsMm"]
        if min(min(x[k+3],y[k+3])-max(x[k],y[k]) for k in range(3)) >= -1e-6:
            pairs.append((a,b))
    signature = hashlib.sha256(json.dumps([fingerprint, pairs,
        [[r["path"], r["name"], r["boundsMm"], r["worldTransform"]] for r in rows]],
        sort_keys=True,separators=(",",":")).encode()).hexdigest()
    progress = {"schema":"agent-frc/fusion-interference-progress@1","study":signature,"pairs":[]}
    if checkpoint.exists():
        progress=json.loads(checkpoint.read_text(encoding="utf-8"))
        if progress.get("study")!=signature or any(r["pair"]!=list(pair) for r,pair in zip(progress["pairs"],pairs)):
            raise ValueError("Checkpoint belongs to another archive, native pose or scan")
    def save():
        temp=checkpoint.with_suffix(".writing")
        temp.write_text(json.dumps(progress, separators=(",",":"),allow_nan=False),encoding="utf-8")
        temp.replace(checkpoint)
    if type(batch) is not int or batch<1:
        raise ValueError("Expected a positive native pair budget")
    offset=len(progress["pairs"])
    if offset>len(pairs):
        raise ValueError("Invalid resume position")
    for i in range(offset,min(len(pairs),offset+batch)):
        a,b=pairs[i]
        entities=adsk.core.ObjectCollection.create()
        entities.add(proxies[a]);entities.add(proxies[b])
        query=design.createInterferenceInput(entities)
        query.areCoincidentFacesIncluded=False
        result=design.analyzeInterference(query)
        if result is None:
            raise ValueError("Fusion returned no interference result on "+str((a,b)))
        native=sum(1000*r.interferenceBody.volume for r in result)
        def world(index):
            body,matrix=solids[index]
            shape=manager.copy(body)
            if matrix and not manager.transform(shape,matrix):
                raise ValueError("Could not transform the native solid to world coordinates")
            return shape
        copy=world(a)
        if not manager.booleanOperation(copy,world(b),adsk.fusion.BooleanTypes.IntersectionBooleanType):
            raise ValueError("Native transient intersection failed on "+str((a,b)))
        transient=1000*copy.volume if copy.isValid and copy.lumps.count else 0
        if not all(math.isfinite(v) and v>=0 for v in (native,transient)):
            raise ValueError("Unresolved native volume")
        progress["pairs"].append({"pair":[a,b],"interferenceMm3":native,"temporaryCommonMm3":transient})
        if (i+1)%16==0:
            save()
    save()
    return {"method":"Fusion Design.analyzeInterference and placed temporary BRep intersection",
        "units":"mm3","candidatePairs":len(pairs),"complete":len(progress["pairs"])==len(pairs),
        "pairs":progress["pairs"],"programSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
