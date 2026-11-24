"""Carry what an earlier receipt measured when nothing it was measured from has changed.

The library decides per pair. Given a case's earlier clearance result, it measures again only the pairs with a solid
whose identity changed (from the volume, centre, second moments and box of the solid, and its group's placement
along the motion) or whose declared contact changed, and carries the rest. A rename or an edited note changes no
identity. A receipt keeps what that needs in each case row: `clearance` holds the result's `inputs`, its
`declaredContacts` and the library's own rows, one for each entry of `pairs` and in the same order, without the pair
names that `pairs` already gives; `counts` and `checked` are the library's.

The case's other measures are decided the same way, from the same identities: a required contact or a squeeze is
carried when its two solids and its rule are unchanged, and a withdrawal when no solid of the case changed.
"""
from .files import require


def stored(found):
    """What a case row keeps of the library's clearance result to carry its pairs from later."""
    return dict(inputs=found["inputs"], declaredContacts=found["declaredContacts"],
                rows=[{key: value for key, value in row.items() if key != "pair"} for row in found["pairs"]])


def earlier_result(row):
    """The library's clearance result of an earlier case row, or None when the row keeps none, which measures every pair."""
    held = (row or {}).get("clearance")
    if not isinstance(held, dict) or not isinstance(row.get("checked"), dict):
        return None
    require(len(held.get("rows", ())) == len(row.get("pairs", ())), "Case " + str(row.get("case")) + " of the earlier receipt holds "
            "a pair list and a library row list of different lengths, so it is not a receipt the check wrote. Run the full check")
    return dict(inputs=held["inputs"], declaredContacts=held["declaredContacts"], counts=row["counts"], checked=row["checked"],
                pairs=[dict(raw, pair=judged["pair"]) for raw, judged in zip(held["rows"], row["pairs"])])


def same(before, found, names=None):
    """Whether the named solids, or every solid of the case, stand as they did in the earlier row, under the same rules."""
    held = ((before or {}).get("clearance") or {}).get("inputs") or {}
    now, old = found["inputs"], held.get("solids")
    if old is None or held.get("rules") != now["rules"]:
        return False
    if names is None:
        return old == now["solids"]
    return all(name in now["solids"] and old.get(name) == now["solids"][name] for name in names)


def contacts(case, found, before, reach):
    """(rows, measured) for the case's required contacts. reach(rule) measures one; an unchanged one is carried."""
    earlier, rows, measured = {row["id"]: row for row in (before or {}).get("requiredContacts", [])}, [], 0
    for rule in case["requiredContacts"]:
        held = earlier.get(rule["id"])
        if (held and held["pair"] == rule["pair"] and held["maxGapMm"] == rule["maxGapMm"]
                and list(held["window"]) == list(rule.get("window", [0, 1])) and same(before, found, rule["pair"])):
            rows.append(dict(held, criterion=rule.get("criterion")))
        else:
            rows.append(reach(rule))
            measured += 1
    return rows, measured


def squeezes(case, found, before, press):
    """(rows, measured) for the case's compression rules. press(rule) measures one; an unchanged one is carried."""
    earlier = {(row["payload"], row["contact"]): row for row in (before or {}).get("compression", [])}
    rows, measured = [], 0
    for rule in case["compression"]:
        held = earlier.get((rule["payload"], rule["contact"]))
        if held and held["maxDepthMm"] == rule["maxDepthMm"] and same(before, found, [rule["payload"], rule["contact"]]):
            rows.append(dict(held, basis=rule["basis"]))
        else:
            rows.append(press(rule))
            measured += 1
    return rows, measured


def withdrawal(found, before, withdraw):
    """(the withdrawal, measured) of a service case: carried when no solid of the case changed. withdraw() measures it."""
    if "withdrawnBoxGapMm" in (before or {}) and same(before, found):
        return dict(smallestBoxGapMm=before["withdrawnBoxGapMm"]), 0
    return withdraw(), 1
