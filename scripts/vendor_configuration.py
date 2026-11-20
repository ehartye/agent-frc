"""Compare the selected vendor's current purchased configuration with the as-drawn supplier model."""
from mechanical_readiness import digest,named,pinned,read,require


def compare(root,article):
    required=("procurementBom","asDrawnBom")
    if not all(article.get(k) for k in required):
        return {"status":"open","reason":"Missing current purchase configuration or as-drawn assembly register."}
    docs=[read(pinned(root,article[k])) for k in required]
    def lines(doc):
        records={}
        for line in doc["items"]:
            key=line["position"]
            require(named(key) and key not in records and named(line["partNumber"]) and named(line["revision"]) and
                type(line["quantity"]) is int and line["quantity"]>0,"Invalid supplier configuration position")
            records[key]=(line["partNumber"],line["revision"],line["quantity"])
        require(records,"Empty supplier configuration census")
        return records
    for i,doc in enumerate(docs):
        require(doc.get("schema")=="agent-frc/vendor-configuration@1" and doc.get("role")==("selected-purchase","as-drawn")[i],
            "Wrong supplier evidence role")
        require(all(doc.get(k)==article.get(k) and named(doc.get(k)) for k in ("manufacturer","partNumber","configuration")),
            "Supplier evidence differs from selected part or option")
        require(named(doc.get("issued")) and named(doc.get("authority")) and doc.get("sources"),"Missing manufacturer authority, issue or source")
        for source in doc["sources"]:pinned(root,source)
    current,drawn=docs
    require(drawn.get("modelSha256")==digest(pinned(root,article["model"])),"As-drawn BOM does not identify the installed model")
    a,b=lines(current),lines(drawn)
    changed=sorted(k for k in set(a)|set(b) if a.get(k)!=b.get(k))
    scoped=current.get("revision")==drawn.get("revision")==article.get("revision")
    return {"status":"pass" if scoped and not changed else "fail","differentPositions":changed,"revisionMatches":scoped,
        "purchaseIssue":current["issued"],"modelIssue":drawn["issued"]}
