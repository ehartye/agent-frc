"""Compare a source-registered physical handoff or inspection with its commissioned boundary conditions."""
from hashlib import sha256
import json
import math

from mechanical_readiness import named, number, pinned, read, require
from mechanical_motion import bounds,distance,transform


def identity(mission):
    return sha256(json.dumps(mission,sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()


def commissioned(plan,system,transfer,reopen):
    mission=plan.get("transferCriteria",{}).get(transfer["id"])
    require(isinstance(mission,dict),"An independent mission name alone cannot establish the required physical delivery")
    from transfer_trajectory import keys
    keys(mission,set("trajectorySchema archiveSha256 stepSha256 mode orientationModel article donor recipient regionFrame terminalBoundsMm positionToleranceMm donorClearanceMm minRecipientWeightFraction dwellS cases terminalObservations".split()),"commissioned mission")
    for key in ("archive","step"):
        require(mission[key+"Sha256"]==system[key]["sha256"],"Commissioned mission belongs to another native issue")
    obj=transfer["piece"]
    require(mission["article"]=={"id":obj["id"],"solid":obj["solid"],"sha256":obj["file"]["sha256"]},
            "Commissioned physical article differs from the replay")
    for kind in ("donor","recipient"):
        mount=mission[kind];solid=mount["solid"]
        require(any(o["path"]==mount["occurrence"] and o["nativeBodyNames"].get(solid)==mount["body"]
                and solid in o["solids"] for o in reopen["installedOccurrences"]),
                "Commissioned "+kind+" differs from installed native body identity")
    mode=mission["mode"];same=mission["donor"]==mission["recipient"]
    require(mode in ("handoff","retained-inspection") and same==(mode=="retained-inspection"),
            "Commission the actual change of custodian or same-support inspection")
    require(mission["regionFrame"] in ("saved-root","recipient-in-saved-root") and
            len(mission["terminalBoundsMm"])==6 and all(number(n) for n in mission["terminalBoundsMm"]) and
            all(mission["terminalBoundsMm"][i]<mission["terminalBoundsMm"][i+3] for i in range(3)),
            "Register the finite terminal region in its physical reference frame")
    require(number(mission["donorClearanceMm"]) and (mission["donorClearanceMm"]>0 if not same else mission["donorClearanceMm"]==0)
            and number(mission["minRecipientWeightFraction"]) and 0<mission["minRecipientWeightFraction"]<=1 and
            number(mission["dwellS"]) and mission["dwellS"]>=0 and
            number(mission["positionToleranceMm"]) and mission["positionToleranceMm"]>=0 and
            transfer["traceToleranceMm"]<=mission["positionToleranceMm"],"Invalid commissioned clearance, force, dwell or uncertainty")
    case_windows=mission["cases"]
    require(isinstance(case_windows,dict) and set(case_windows)=={r["id"] for r in transfer["cases"]} and all(
            case_windows[c["id"]]=={"duty":c["duty"],"windowS":c["windowS"]} for c in transfer["cases"]),
            "Mission is missing a required executed case, duty or clock")
    if "terminalObservations" in mission:
        clocks = mission["terminalObservations"]
        require(isinstance(clocks, dict) and clocks, "Expected a nonempty observation commission")
        for case_id, clock in clocks.items():
            require(case_id in case_windows and case_windows[case_id]["duty"] == "delivery",
                    "Commission the terminal observation on a named delivery case")
            require(isinstance(clock, dict) and set(clock) == {"channel", "periodNs", "originNs"}
                    and named(clock["channel"]) and type(clock["periodNs"]) is int and clock["periodNs"] > 0
                    and type(clock["originNs"]) is int, "Invalid commissioned observation channel or clock")
    return mission


def terminal_observation(root, mission, raw, witness, execution_sha):
    """Check an independently recorded admission decision at every commissioned producer tick."""
    clock = (mission or {}).get("terminalObservations", {}).get(raw["case"])
    if clock is None:
        require("terminalObservation" not in witness, "Observation requires a matching commissioned case")
        return None
    binding = witness.get("terminalObservation")
    if binding is None:
        return {"status": "open", "reason": "The commissioned terminal observation is missing"}
    require(isinstance(binding, dict) and set(binding) == {"record", "source"},
            "Expected independently pinned terminal observation and original acquisition")
    pinned(root, binding["source"])
    observation = read(pinned(root, binding["record"]))
    expected = {"schema": "agent-frc/terminal-observation@1", "executionSha256": execution_sha,
                "missionSha256": identity(mission), "sourceSha256": binding["source"]["sha256"],
                "pieceId": raw["pieceId"], "case": raw["case"], "recipient": mission["recipient"],
                "channel": clock["channel"]}
    require(isinstance(observation, dict) and set(observation) == set(expected) | {"samples"}
            and all(observation[k] == v for k, v in expected.items()),
            "Terminal observation differs from the registered run, article, recipient, source or channel")
    # Decimal conversion preserves declared decimal endpoints; tolerate only binary roundoff below one picosecond.
    from decimal import Decimal
    end = Decimal(str(raw["windowS"][1]))
    start = end - Decimal(str(mission["dwellS"]))
    ticks = []
    for t in (start, end):
        ns = t * 1_000_000_000
        rounded = round(ns)
        tick, remainder = divmod(rounded - clock["originNs"], clock["periodNs"])
        if abs(ns - rounded) > Decimal("0.0001") or remainder:
            return {"status": "open", "reason": "Dwell endpoint lies outside the commissioned observation clock"}
        ticks.append(tick)
    first, last = ticks
    samples = observation["samples"]
    require(isinstance(samples, list), "Expected the original ordered observation samples")
    previous = None
    observed = 0
    denied = None
    for sample in samples:
        require(isinstance(sample, dict) and set(sample) == {"tick", "timeNs", "acceptedId"},
                "Record each original tick, timestamp and observed admission decision")
        tick = sample["tick"]
        require(type(tick) is int and type(sample["timeNs"]) is int
                and sample["timeNs"] == clock["originNs"] + tick * clock["periodNs"]
                and (previous is None or tick > previous), "Repeated, shifted or unordered observation tick")
        accepted = sample["acceptedId"]
        require(accepted is None or named(accepted), "Expected an observed article ID or explicit negative")
        if first <= tick <= last:
            observed += 1
            if accepted != raw["pieceId"] and denied is None:
                denied = tick
        previous = tick
    expected_count = last - first + 1
    result = {"channel": clock["channel"], "firstTick": first, "lastTick": last,
              "observedTicks": observed, "requiredTicks": expected_count}
    if denied is not None:
        return dict(result, status="fail", reason=f"Admission of the commissioned article was absent at tick {denied}")
    if observed != expected_count:
        return dict(result, status="open", reason="The terminal observation does not cover every commissioned tick")
    return dict(result, status="pass", reason="Article admission observed at each commissioned tick")


def relative_gap(shape,holder,delta,required):
    """Certify a positive separating gap over an entire relative linear interval."""
    speed=math.hypot(*delta)
    def gap(t):
        pos=transform(shape,[dict(kind="translation",travelMm=[v*t for v in delta])],1)
        return distance(pos,holder)
    def clear(lo,hi,depth):
        mid=(lo+hi)/2;g=gap(mid)
        if g<required:return False
        if g-speed*(hi-lo)/2>=required:return True
        return depth<12 and clear(lo,mid,depth+1) and clear(mid,hi,depth+1)
    return gap(0)>=required and gap(1)>=required and clear(0.,1.,0)


def verify_terminal(mission,raw,trace,study,piece,installed_at,rotates,article=None):
    import numpy as np
    frames=trace["frames"];events=raw["observations"];obj=trace["pieceId"]
    donor=mission["donor"]["solid"];receiver=mission["recipient"]["solid"]
    require(trace["holder"]==donor and raw["holder"]==donor,"Run used another initial custodian")
    if raw["duty"]!="delivery":return
    require(raw.get("receiver")==receiver,"Run credited a different recipient than the commissioned native body")
    end=frames[-1]["timeS"];start=end-mission["dwellS"]
    indices=[i for i,f in enumerate(frames) if abs(f["timeS"]-start)<=1e-10]
    require(len(indices)==1,"Executed clock lacks the start of the commissioned terminal dwell")
    start_idx=indices[0]
    region=mission["terminalBoundsMm"];tol=mission["positionToleranceMm"];fraction=mission["minRecipientWeightFraction"]
    require(all(f["custody"]=="received" for f in frames[start_idx:]),"Actual custody did not persist through the commissioned dwell")
    def offset(f,name):return f["offsetsMm"].get(name,[0.,0.,0.])
    for i in range(start_idx,len(frames)):
        f=frames[i];event=events[i];off=offset(f,obj)
        shape=article.at(i) if article else transform(piece,[dict(kind="translation",travelMm=off)],1)
        b=bounds(shape)
        if mission["regionFrame"]=="recipient-in-saved-root":
            require(not any(rotates(frames[0],g,receiver) for g in frames[:i+1]) if rotates else True,
                    "A rotating recipient needs a qualified native local-frame trajectory")
            dest=offset(f,receiver);b=[v-dest[k%3] for k,v in enumerate(b)]
        require(all(b[k]>=region[k]-tol and b[k+3]<=region[k+3]+tol for k in range(3)),
                "Complete piece leaves the independently commissioned terminal region")
        if article and i+1<len(frames):
            follower=mission["regionFrame"]=="recipient-in-saved-root"
            p=np.asarray(offset(f,receiver) if follower else [0.,0.,0.]);q=np.asarray(offset(frames[i+1],receiver) if follower else [0.,0.,0.])
            require(article.terminal(i,np.array(region),tol,p,q),"Complete moving article leaves or lacks a bound within the commissioned dwell region")
        contacts=event.get("contacts",[])
        weight=raw["massKg"]*study["gravityMmS2"]/1000
        load=sum(c["forceOnPieceN"][2] for c in contacts if c["body"]==receiver)
        require(load>=fraction*weight*(1-1e-9) and event.get("acceptedId")==obj,
                "Commissioned recipient lacks the required measured share of the load or observed acceptance")
        if mission["mode"]!="handoff":continue
        gap=mission["donorClearanceMm"];holder=installed_at(f,donor)
        require(not any(c["body"]==donor for c in contacts) and distance(shape,holder)>=gap,
                "Original holder remains in contact or inside the required release clearance")
        if i+1<len(frames):
            dest=frames[i+1]
            require(not rotates or not rotates(f,dest,donor),"Rotating donor needs a bounded separation study")
            rel=[v-u-y+x for v,u,y,x in zip(offset(dest,obj),off,offset(dest,donor),offset(f,donor))]
            if article and article.rotating:
                shift=np.array(offset(dest,donor))-np.array(offset(f,donor));speed=math.hypot(*rel)+article.radius*np.linalg.norm(article.rot[i])
                def certified(a,b,depth):
                    t=(a+b)/2;h=transform(holder,[dict(kind="translation",travelMm=(shift*t).tolist())],1)
                    g=distance(article.at(i,t),h)
                    if g<gap:return False
                    if g-speed*(b-a)/2>=gap:return True
                    return depth<18 and certified(a,t,depth+1) and certified(t,b,depth+1)
                ok=certified(0,1,0)
            else:ok=relative_gap(shape,holder,rel,gap)
            require(ok,"Original holder re-enters the piece clearance during receiver dwell")
