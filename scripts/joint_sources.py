"""Follow the pinned governing records of a separately qualified load path."""
from mechanical_readiness import number, pinned, read, require


def verify(root, refs, pair, archive, step, configuration, require_measurement=False):
    complete = set()
    active = set()
    measured = set()

    def record(node):
        if isinstance(node, list):
            for child in node:
                record(child)
        elif isinstance(node, dict):
            if "file" in node and "sha256" in node:
                visit(node)
                return
            for field, expected in (("archiveSha256",archive),("stepSha256",step),("configuration",configuration)):
                require(field not in node or node[field] == expected, "Joint source contradicts the reviewed "+field)
            if "status" in node:
                require(node["status"] == "pass", "A governing joint source did not pass")
            if "seats" in node:
                for seat in node["seats"]:
                    if sorted(seat.get("pair",[]))==sorted(pair):
                        measured.add("seat")
                    require(number(seat.get("areaMm2")) and seat["areaMm2"]>0 and seat.get("interferenceMm3")==0,
                            "Governing seat inspection did not establish clear opposed area")
                    if "minAreaMm2" in seat:
                        require(seat["areaMm2"] >= seat["minAreaMm2"], "Governing joint area is below the registered limit")
            if set(("subjects","unit","value")) <= set(node) and sorted(node["subjects"])==sorted(pair):
                limits=[(key,node[key]) for key in ("min","max") if key in node]
                if limits:
                    require(number(node["value"]) and all(number(limit) and
                        (node["value"]>=limit if key=="min" else node["value"]<=limit) for key,limit in limits),
                        "Measured joint value is outside its governing interval")
                    measured.add("duty")
            for key, child in node.items():
                if key=="sources":
                    require(isinstance(child,list) and child, "Missing joint qualification sources")
                    for item in child:
                        visit(item)
                else:
                    record(child)

    def visit(ref):
        path = pinned(root, ref)
        if path.suffix.lower() != ".json" or path in complete:
            return
        require(path not in active, "Circular governing joint reference")
        active.add(path)
        record(read(path))
        active.remove(path)
        complete.add(path)

    for ref in refs:
        visit(ref)
    if require_measurement:
        require(measured,"Joint qualification lacks an underlying measured criterion for this exact pair")
