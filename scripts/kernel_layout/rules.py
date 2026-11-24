"""The rules, stated once: the defaults every motion is judged by, the exceptions, the purposes and the bindings.

    "rules":    {"minGapMm": 1, "depth": 9, "allowanceBasis": "...", "pathToleranceMm": 40,
                 "payloadCompression": [{"payload", "contact", "maxDepthMm", "basis"}],
                 "exceptions": {"<motion>": {"minGapMm": 0.5, "allowanceBasis": "..."}}}
    "purposes": {"park": ["<motion>"], "service": {"<motion>": {"extract": true}}}
    "motions":  {"<motion>": {"carriedWith" | "transportedBy" | "freePath" | "supportedBy" | "requiredContacts" | "absent"}}

Every motion of the design source is judged, as an operating motion unless purposes says otherwise, against the
defaults unless rules.exceptions names it. A squeeze rule applies to every motion in which its pair is a declared
contact. Only the motions that differ, or that are bound to a trial or a carrier, are named anywhere.
"""
from .files import named, number

PURPOSES = ("operating", "park", "service")
DEFAULT_DEPTH = 9
RULE_KEYS = ("minGapMm", "depth", "allowanceBasis", "pathToleranceMm", "payloadCompression")
BINDINGS = ("carriedWith", "transportedBy", "freePath", "supportedBy", "requiredContacts", "absent")
SERVICE_KEYS = ("extract", "basis")


def contact_during(data, motion):
    """The pairs the design source declares as touching during a motion, as frozensets."""
    return {frozenset(row["pair"]) for row in data.get("contacts", []) if "during" not in row or motion in row["during"]}


def checked_rules(own, where, problems, defaults=None):
    """The rule fields of the defaults or of one exception, checked. Returns them merged over the defaults."""
    if not isinstance(own, dict):
        problems.append(where + " is an object of rules")
        return dict(defaults or {})
    extra = sorted(set(own) - set(RULE_KEYS) - ({"exceptions"} if defaults is None else set()))
    if extra:
        problems.append(where + " holds " + ", ".join(extra) + "; a rule is one of " + ", ".join(RULE_KEYS))
    found = dict(defaults or {}, **{k: v for k, v in own.items() if k in RULE_KEYS})
    if not (number(found.get("minGapMm")) and found["minGapMm"] >= 0 and named(found.get("allowanceBasis"))):
        problems.append("Give " + where + " an allowance minGapMm of zero or more and its allowanceBasis")
    if not isinstance(found.get("depth", DEFAULT_DEPTH), int) or found.get("depth", DEFAULT_DEPTH) < 1:
        problems.append("Give the search depth of " + where + " as a whole number")
    if "pathToleranceMm" in found and not (number(found["pathToleranceMm"]) and found["pathToleranceMm"] > 0):
        problems.append("Give the path tolerance of " + where + " as a positive number of millimetres")
    squeeze = found.get("payloadCompression", [])
    if not isinstance(squeeze, list) or not all(isinstance(r, dict) and named(r.get("payload")) and named(r.get("contact")) and number(r.get("maxDepthMm"))
                                               and r["maxDepthMm"] > 0 and named(r.get("basis")) and set(r) <= {"payload", "contact", "maxDepthMm", "basis"}
                                               for r in squeeze):
        problems.append("A squeeze rule of " + where + " names the payload solid, the contact solid that presses into it, maxDepthMm above zero and its basis")
        found["payloadCompression"] = []
    return found


def purposes_of(judgement, motions, problems):
    """{motion: (purpose, service entry)}: operating unless purposes lists it as park or service."""
    own = judgement.get("purposes", {})
    if not isinstance(own, dict) or set(own) - {"park", "service"}:
        problems.append("Give purposes as {park: [motions], service: {motion: {extract}}}")
        own = {}
    park, service = own.get("park", []), own.get("service", {})
    if not (isinstance(park, list) and isinstance(service, dict)):
        problems.append("Give purposes as {park: [motions], service: {motion: {extract}}}")
        park, service = [], {}
    found = {m: ("operating", {}) for m in motions}
    for name in [*park, *service]:
        if name not in motions:
            problems.append("purposes names " + str(name) + ", which is not a motion of the design source")
    for name in set(park) & set(service):
        problems.append(name + " is listed under both park and service")
    for name in park:
        found[name] = ("park", {})
    for name, entry in service.items():
        if not (isinstance(entry, dict) and set(entry) <= set(SERVICE_KEYS) and isinstance(entry.get("extract", False), bool)):
            problems.append("purposes.service." + name + " holds " + ", ".join(SERVICE_KEYS) + ", with extract true or false")
            entry = {}
        found[name] = ("service", entry)
    return {m: found[m] for m in motions}


def bindings_of(judgement, motions, problems):
    """{motion: bindings}: the per-motion fields that bind a motion to a trial or a carrier, for the motions that have them."""
    own = judgement.get("motions", {})
    if not isinstance(own, dict):
        problems.append("Give motions as {motion: {" + ", ".join(BINDINGS) + "}}")
        return {}
    found = {}
    for name, entry in own.items():
        if name not in motions:
            problems.append("motions names " + name + ", which is not a motion of the design source")
            continue
        if not (isinstance(entry, dict) and entry and set(entry) <= set(BINDINGS)):
            problems.append("motions." + name + " holds only what binds it to a trial or a carrier: " + ", ".join(BINDINGS))
            continue
        found[name] = entry
    return found


def required_contacts(rules, where, roster, problems):
    if not isinstance(rules, list):
        problems.append("List the required contacts of " + where)
        return []
    for rule in rules:
        if not (isinstance(rule, dict) and named(rule.get("id")) and isinstance(rule.get("pair"), list) and len(rule["pair"]) == 2
                and set(rule["pair"]) <= roster and number(rule.get("maxGapMm")) and isinstance(rule.get("window", [0, 1]), list)):
            problems.append("A required contact of " + where + " names an id, a pair of solids, maxGapMm and an optional window of stroke fractions")
            return []
    return rules


def squeezes(rules, data, motion, payloads, problems, seen):
    """The squeeze rules that apply to one motion: each whose pair is a declared contact during it."""
    declared, found = contact_during(data, motion), []
    for rule in rules:
        key = (rule["payload"], rule["contact"])
        if key not in seen:
            seen.add(key)
            if rule["payload"] not in payloads or rule["contact"] in payloads:
                problems.append("A squeeze rule names a solid of a payload group, " + rule["payload"] + ", and the solid that presses into it, " + rule["contact"])
            elif not any(frozenset(key) in contact_during(data, m) for m in data["motions"]):
                problems.append("Declare " + rule["payload"] + " and " + rule["contact"] + " as a contact in the design source: a squeezed pair shares "
                                "volume, so it is judged by its depth and left out of the clearance test")
        if frozenset(key) in declared:
            found.append(rule)
    return found


def cases(judgement, data, roster, payloads, problems):
    """One case per motion of the design source: its purpose, its rules and its bindings."""
    motions = list(data["motions"])
    defaults = checked_rules(judgement.get("rules"), "rules", problems)
    exceptions = (judgement.get("rules") or {}).get("exceptions", {}) if isinstance(judgement.get("rules"), dict) else {}
    if not isinstance(exceptions, dict):
        problems.append("Give rules.exceptions as {motion: {rule: value}}")
        exceptions = {}
    for name in sorted(set(exceptions) - set(motions)):
        problems.append("rules.exceptions names " + name + ", which is not a motion of the design source")
    purposes, bindings, out, seen = purposes_of(judgement, motions, problems), bindings_of(judgement, motions, problems), [], set()
    for name in motions:
        rules = checked_rules(exceptions[name], "rules.exceptions." + name, problems, defaults) if name in exceptions else defaults
        own = bindings.get(name, {})
        purpose, service = purposes[name]
        absent = own.get("absent", [])
        if not (isinstance(absent, list) and set(absent) <= roster):
            problems.append("motions." + name + ".absent lists a solid the design source does not hold")
            absent = []
        out.append(dict(id=name, purpose=purpose, extract=bool(service.get("extract")), minGapMm=rules.get("minGapMm", 0), depth=rules.get("depth", DEFAULT_DEPTH),
                        allowanceBasis=rules.get("allowanceBasis"), pathToleranceMm=rules.get("pathToleranceMm"), absent=sorted(absent),
                        compression=squeezes(rules.get("payloadCompression", []), data, name, payloads, problems, seen),
                        requiredContacts=required_contacts(own.get("requiredContacts", []), name, roster, problems),
                        bindings={k: v for k, v in own.items() if k not in ("absent", "requiredContacts")},
                        cause="drive" if data["motions"][name].get("drive") else data["motions"][name].get("by"),
                        powered=bool(data["motions"][name].get("drive") or data["motions"][name].get("alsoRunning"))))
    return out
