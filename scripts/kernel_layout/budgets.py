"""Screen a source-bound preliminary weight ledger and simultaneous battery-side loads."""
from mechanical_readiness import named, number, pinned, read, require, resolve_references


def interval(values, label):
    require(isinstance(values, list) and len(values) == 2 and all(number(n) for n in values)
            and 0 <= values[0] <= values[1], "Supply a finite nonnegative interval for " + label)
    return values


def budget_review(root, plan, missing):
    if not plan.get("budgets"):
        missing.append("Missing complete weight and concurrent loaded-voltage budgets")
        return None
    study = resolve_references(root, read(pinned(root, plan["budgets"])))
    # The issue name binds the ledger to this plan. A file selection the ledger repeats must be the plan's own.
    if study["issue"] != plan["issue"] or any(k in study and study[k] != plan[k] for k in ("step","motion","design")):
        missing.append("Budget selection differs from the package issue")
        return None
    requirements = read(pinned(root, study["requirements"]))
    require(named(requirements["basis"]) and number(requirements["inspectionLimitKg"])
            and requirements["inspectionLimitKg"] > 0 and number(requirements["operatingMinV"])
            and requirements["operatingMinV"] > 0, "Supply project inspection and operating limits")
    masses = study["masses"]
    expected = {name for key, group in plan["groups"].items() if group["role"] not in ("payload", "service")
                for name in group["members"]}
    accounted = set()
    lines = set()
    total = [0., 0.]
    for row in masses:
        key = row["id"]
        require(named(key) and key not in lines and named(row["basis"]), "Name each mass contribution once")
        lines.add(key)
        members = row["members"]
        require(isinstance(members, list) and len(set(members)) == len(members)
                and not accounted.intersection(members) and set(members) <= expected, "Duplicate or unknown weighed article")
        accounted.update(members)
        amount = interval(row["kg"], key)
        total = [a + b for a,b in zip(total, amount)]
    if accounted != expected:
        missing.append("Missing mass for " + ", ".join(sorted(expected-accounted)))
    required = requirements["massLines"]
    require(isinstance(required, list) and required and len(set(required)) == len(required) and all(named(k) for k in required),
            "Commission the complete robot mass ledger including unmodeled allowances")
    if lines != set(required):
        missing.append("Mass ledger differs from commissioned whole-robot inventory")
    payload = interval(study["runningPayloadKg"], "running payload")
    running = [a+b for a,b in zip(total,payload)]
    power = []
    cases = study["electricalCases"]
    require(isinstance(cases, dict) and cases, "Declare simultaneous electrical load cases")
    commissioned = requirements["electricalCases"]
    require(isinstance(commissioned,dict) and commissioned and all(named(key) for key in commissioned),
            "Declare the governing weak-battery case")
    conditions = {(spec["stage"],spec["batteryCondition"]) for spec in commissioned.values()}
    for stage in plan.get("cycle",[]):
        for condition in ("nominal","weak"):
            if (stage,condition) not in conditions:missing.append("Missing "+condition+" battery duty for "+stage)
    if cases.keys() != commissioned.keys():
        missing.append("Electrical ledger differs from the required nominal and adverse cases")
    for key, row in cases.items():
        if key not in commissioned:continue
        spec = commissioned[key]
        currents = row["batterySideA"]
        require(named(row["basis"]) and named(spec["duty"]) and number(spec["requiredMotionMinV"])
                and spec["requiredMotionMinV"] > 0, "Specify the duty and modeled minimum voltage it requires")
        if row["loadedKg"] != running or spec["stage"] not in plan["stages"]:
            missing.append("Electrical case needs this loaded mass range and registered stage: " + key)
        sources = spec["sources"]
        require(isinstance(sources,list) and sources and all(named(s) for s in sources)
                and len(sources)==len(set(sources)), "Name simultaneous battery loads")
        if set(currents) != set(sources):
            missing.append("Incomplete simultaneous source current coverage: " + key)
        amps = [interval(v,k) for k,v in currents.items()]
        current = [sum(v[i] for v in amps) for i in (0,1)]
        voc = interval(row["openCircuitV"], "battery open circuit")
        resistance = interval(row["resistanceOhm"], "series resistance")
        bus = [voc[0]-current[1]*resistance[1], voc[1]-current[0]*resistance[0]]
        minimum = max(requirements["operatingMinV"], spec["requiredMotionMinV"])
        power.append(dict(case=key, duty=spec["duty"], stage=spec["stage"], batteryCondition=spec["batteryCondition"], batterySideA=current, loadedBusV=bus,
                          requiredMinV=minimum, marginV=bus[0]-minimum, status="pass" if bus[0]>=minimum else "fail"))
    reserve = requirements["inspectionLimitKg"] - total[1]
    return dict(source=plan["budgets"], limits=study["requirements"], inspectionKg=total, runningKg=running,
                remainingKg=reserve, massStatus="pass" if reserve>=0 else "fail", electricalCases=power)
