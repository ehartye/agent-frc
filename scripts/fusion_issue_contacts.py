"""Native interference measurements on a cold-open Fusion design. Called by fusion_issue_inventory."""
import hashlib
import itertools
import json
import math
from pathlib import Path


def measure_pair(design, rows, proxies, solids, a, b):
    """Measure the same placed pair with both Fusion kernels, recording unknown results."""
    import adsk.core
    import adsk.fusion
    manager = adsk.fusion.TemporaryBRepManager.get()
    row={"pair":[a,b],"identities":[[rows[i]["path"],rows[i]["name"]] for i in (a,b)]}
    def native():
        entities=adsk.core.ObjectCollection.create()
        entities.add(proxies[a]);entities.add(proxies[b])
        query=design.createInterferenceInput(entities);query.areCoincidentFacesIncluded=False
        result=design.analyzeInterference(query)
        if result is None:raise ValueError("Fusion returned no interference result")
        return sum(1000*r.interferenceBody.volume for r in result)
    def transient():
        def world(index):
            body,matrix=solids[index];shape=manager.copy(body)
            if not shape or (matrix and not manager.transform(shape,matrix)):
                raise ValueError("Native solid could not be copied to occurrence coordinates")
            return shape
        shape=world(a)
        if not manager.booleanOperation(shape,world(b),adsk.fusion.BooleanTypes.IntersectionBooleanType):
            raise ValueError("Native transient intersection returned failure")
        if not shape.isValid:raise ValueError("Transient intersection body is invalid")
        return 1000*shape.volume if shape.lumps.count else 0
    errors={}
    for key,evaluate in (("interferenceMm3",native),("temporaryCommonMm3",transient)):
        try:
            value=evaluate()
            if not math.isfinite(value) or value<0:raise ValueError("Invalid intersection volume")
            row[key]=value
        except Exception as e:
            errors[key]=dict(type=type(e).__name__,message=str(e));row[key]=None
    row["status"]="unresolved" if errors else "measured"
    if errors:row["errors"]=errors
    return row


def measure(design, rows, proxies, solids, checkpoint, fingerprint, batch, retry_pairs=()):
    pairs = []
    for a, b in itertools.combinations(range(len(rows)), 2):
        x, y = rows[a]["boundsMm"], rows[b]["boundsMm"]
        if min(min(x[k+3],y[k+3])-max(x[k],y[k]) for k in range(3)) >= -1e-6:
            pairs.append((a,b))
    inventory=[[r["path"],r["name"],r["boundsMm"],r["worldTransform"]] for r in rows]
    def signature(identity):
        return hashlib.sha256(json.dumps([identity,pairs,inventory],sort_keys=True,separators=(",",":")).encode()).hexdigest()
    current=signature(fingerprint)
    progress={"schema":"agent-frc/fusion-interference-progress@1","study":current,"pairs":[]}
    if checkpoint.exists():
        prior=json.loads(checkpoint.read_text(encoding="utf-8"))
        # Same measured kernels and enumeration. The previous collector stopped
        # on a null response and only persisted successful numeric pairs.
        older=signature([*fingerprint[:3],"85fb31fc1040cdfb03eda414b3e67845ec26b8b09c6cabad202d49b7fc602fa9",
            "f3ea058c88481de80c6cd554cfff73758d2d77787e4a73f8cac9f6ec81b0465c"])
        previous=signature([*fingerprint[:4],"8a87902d4dddc0c6655febd21de781161866137532aa1bd807c3e565a271359e"])
        if prior.get("study") not in (current,previous,older) or any(r["pair"]!=list(pair) for r,pair in zip(prior["pairs"],pairs)):
            raise ValueError("Checkpoint belongs to another archive, native pose or scan")
        if prior["study"]==older and not all(all(isinstance(r.get(k),(float,int)) and math.isfinite(r[k]) and r[k]>=0
                for k in ("interferenceMm3","temporaryCommonMm3")) for r in prior["pairs"]):
            raise ValueError("Unrecognized legacy checkpoint outcomes")
        progress["pairs"]=prior["pairs"]
    def save():
        temp=checkpoint.with_suffix(".writing")
        temp.write_text(json.dumps(progress, separators=(",",":"),allow_nan=False),encoding="utf-8")
        temp.replace(checkpoint)
    if type(batch) is not int or batch<1:
        raise ValueError("Expected a positive native pair budget")
    offset=len(progress["pairs"])
    if offset>len(pairs):
        raise ValueError("Invalid resume position")
    retry={tuple(p) for p in retry_pairs}
    indices={tuple(row["pair"]):i for i,row in enumerate(progress["pairs"])}
    if any(p not in indices or progress["pairs"][indices[p]].get("status")!="unresolved" for p in retry):
        raise ValueError("Only a previously unresolved pair on the identical issue can be retried")
    if len(retry)>batch:raise ValueError("Retry set exceeds batch budget")
    for pair in sorted(retry):
        progress["pairs"][indices[pair]]=measure_pair(design,rows,proxies,solids,*pair)
    for i in range(offset,min(len(pairs),offset+batch-len(retry))):
        progress["pairs"].append(measure_pair(design,rows,proxies,solids,*pairs[i]))
        if (i+1)%16==0:
            save()
    save()
    return {"method":"Fusion Design.analyzeInterference and placed temporary BRep intersection",
        "units":"mm3","candidatePairs":len(pairs),"unresolvedPairs":sum(r.get("status")=="unresolved" for r in progress["pairs"]),
        "complete":len(progress["pairs"])==len(pairs),
        "pairs":progress["pairs"],"programSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
