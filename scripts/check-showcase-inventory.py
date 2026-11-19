"""Compare a project roster with the actual placed geometry of a public orbit artifact."""

import argparse
import hashlib
import json
import math
from pathlib import Path

from showcase_geometry import Glb, Stl, numbers, require


def text(value):
    return isinstance(value,str) and bool(value.strip())


def pinned(root,ref):
    name=ref.get("file")
    require(text(name) and not Path(name).is_absolute(),"Expected a relative public artifact")
    file=(root/name).resolve()
    file.relative_to(root)
    data=file.read_bytes()
    require(hashlib.sha256(data).hexdigest()==ref.get("sha256"),"Changed public artifact: "+name)
    return file,data


def table(rows):
    require(isinstance(rows,list),"Expected an article array")
    result={}
    for row in rows:
        ident=row.get("id")
        require(text(ident) and ident not in result,"Missing or duplicated article ID")
        result[ident]=row
    return result


def review(file,project=None):
    manifest=json.loads(file.read_bytes())
    root=(project or file.parent).resolve()
    require(manifest.get("schema")=="agent-frc/showcase-inventory@1","Unknown publication inventory")
    model,raw=pinned(root,manifest["model"])
    _,data=pinned(root,manifest["expected"])
    roster=json.loads(data)
    require(roster.get("schema")=="agent-frc/showcase-roster@1"
            and text(roster.get("revision")) and text(roster.get("pose"))
            and roster["revision"]==manifest.get("revision") and roster["pose"]==manifest.get("pose"),
            "Expected roster for the same revision and reference pose")
    is_glb=model.suffix.lower()==".glb"
    require(is_glb or model.name.lower().endswith((".stl",".stl.gz")),"Expected GLB or binary STL")
    mesh=Glb(raw) if is_glb else Stl(model,raw)
    expected=table(roster["articles"])
    mapped=table(manifest["articles"])
    require(bool(expected) and not (mapped.keys()-expected.keys()),"Empty roster or unknown article mapping")
    rows=[]
    seen=set()
    for ident,item in expected.items():
        target=item.get("boundsMm");tol=item.get("toleranceMm")
        require(text(item.get("subsystem")) and text(item.get("source")) and numbers(target,6)
                and all(target[i]<=target[i+3] for i in range(3))
                and type(tol) in (int,float) and math.isfinite(tol) and tol>=0,
                "Invalid expected bounds, tolerance, subsystem or source: "+ident)
        row={"id":ident,"subsystem":item["subsystem"],"expectedSource":item["source"]}
        mapping=mapped.get(ident)
        if mapping is None:
            row.update(status="unknown",reason="No public representation declared")
        elif mapping.get("representation")=="omitted":
            require(text(mapping.get("reason")),"Explain an omitted article")
            row.update(status="omitted",reason=mapping["reason"])
        else:
            representation=mapping.get("representation")
            require(representation in ("project-original","authorized-supplier","project-proxy")
                    and text(mapping.get("provenance")),"Declare representation and publication basis")
            selector="node" if is_glb else "facets"
            require(selector in mapping and ("facets" if is_glb else "node") not in mapping,
                    "Select reachable GLB geometry or an STL facet range")
            if is_glb:
                name=mapping["node"]
                require(text(name) and name not in seen,"An article must own a unique named mesh node")
                seen.add(name)
                if name not in mesh.nodes:
                    row.update(status="missing",representation=representation,provenance=mapping["provenance"],node=name)
                    rows.append(row)
                    continue
            row[selector]=mapping[selector]
            actual=mesh.measure(mapping[selector])
            error=max(abs(a-b) for a,b in zip(actual,target))
            row.update(status="represented" if error<=tol else "misplaced",representation=representation,
                       provenance=mapping["provenance"],boundsMm=actual,maximumErrorMm=error,toleranceMm=tol)
        rows.append(row)
    status="mismatch" if any(r["status"] in ("misplaced","missing") for r in rows) else (
        "complete" if all(r["status"]=="represented" for r in rows) else "partial")
    return {"schema":"agent-frc/showcase-inventory-result@1","status":status,
            "modelSha256":manifest["model"]["sha256"],"rosterSha256":manifest["expected"]["sha256"],
            "revision":roster["revision"],"pose":roster["pose"],"articles":rows}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest",type=Path)
    parser.add_argument("--project",type=Path)
    parser.add_argument("--require-complete",action="store_true")
    args=parser.parse_args()
    try:
        result=review(args.manifest,args.project)
        print(json.dumps(result,indent=2,allow_nan=False))
        if result["status"]=="mismatch" or (args.require_complete and result["status"]!="complete"):
            raise SystemExit(1)
    except (KeyError,TypeError,ValueError,IndexError,OSError) as exc:
        parser.exit(2,"Invalid published coverage: "+str(exc)+"\n")
