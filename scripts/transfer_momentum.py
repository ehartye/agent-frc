"""Reconcile the one-sided momenta at every loaded trajectory boundary in the assembly frame."""
import numpy as np
from mechanical_motion import vec
from mechanical_readiness import number,pinned,read,require
from transfer_execution import contact_normal,supported_segment


def verify_boundaries(root,rates,frames,events,article,raw,witness,installed_at,rotates):
    """Finite continuous forces have zero impulse over a zero-duration boundary."""
    mass=raw["massKg"]
    require(number(mass) and mass>0,"Need the finite article mass for momentum reconciliation")
    refs=raw["trajectory"].get("impulses",[])
    require(isinstance(refs,list) and all(isinstance(r,dict) and set(r)=={"file","sha256"} for r in refs)
            and sorted(r["sha256"] for r in refs)==sorted(witness.get("impulseSources",[])),
            "Impact receipts differ from the independent observer inventory")
    impacts={}
    for ref in refs:
        r=read(pinned(root,ref))
        fields={"schema","case","pieceId","stepSha256","pieceSha256","timeS","receiver","model","pointMm",
                "normalOnArticle","impulseOnArticleNs","impulseOnReceiverNs","observerBasis"}
        require(set(r)==fields and r["schema"]=="agent-frc/contact-impulse@1" and
                r["model"]=="fixed-frictionless-inelastic-capture" and isinstance(r["observerBasis"],str) and r["observerBasis"].strip()
                and all(r[k]==raw[k] for k in ("case","pieceId","stepSha256","pieceSha256")),
                "Unqualified impulse source, physical model, case or article")
        t=r["timeS"];require(number(t) and t not in impacts,"Invalid or duplicate contact impulse time")
        impacts[t]=r
    rows=[]
    for i in range(1,len(frames)):
        f=frames[i];t=f["timeS"];before=frames[i-1]
        dt=t-before["timeS"];v0,a=rates[i-1];incoming=v0+a*dt
        final=i==len(rates)
        capture=before["custody"]=="free" and f["custody"]=="received"
        if final and not capture:
            # The commissioned clock ends here. Optional reported terminal velocity
            # is the outgoing state; otherwise the final segment supplies its limit.
            outgoing=np.asarray(vec(events[i]["velocityMmS"])) if "velocityMmS" in events[i] else incoming
        elif final:outgoing=np.zeros(3)
        else:outgoing=rates[i][0]
        win=article.rates[i-1];wout=article.rates[i] if not final else win
        if final and "angularVelocityRadS" in events[i]:wout=np.asarray(vec(events[i]["angularVelocityRadS"]))
        # In one physical orientation at a boundary, a finite positive body
        # inertia makes angular-momentum continuity equivalent to equal omega.
        require(np.linalg.norm(wout-win)<=1e-8,"Unqualified angular momentum change at "+str(t)+" s")
        delta=outgoing-incoming
        j=delta*mass/1000
        row=dict(timeS=t,incomingMmS=incoming.tolist(),outgoingMmS=outgoing.tolist(),
                 requiredImpulseNs=j.tolist(),source="continuous")
        event=impacts.pop(t,None)
        if event is None:
            require(np.linalg.norm(delta)<=1e-7,
                    f"Momentum changes at {t:g} s without a qualified contact impulse; required {j.tolist()} N s")
        else:
            body=event["receiver"];point=vec(event["pointMm"]);n=np.asarray(vec(event["normalOnArticle"]))
            require(capture and body==raw["receiver"] and any(c["body"]==body for c in events[i].get("contacts",[])),
                    "Only an observed free-to-received capture on the installed recipient can qualify this impulse")
            neighbors=[before]+([frames[i+1]] if not final else [])
            for other in neighbors:
                require((not rotates or not rotates(other,f,body)) and
                        f["offsetsMm"].get(body,[0,0,0])==other["offsetsMm"].get(body,[0,0,0]),
                        "The supported capture requires a stationary receiver on both sides of the boundary")
            observed=np.asarray(vec(event["impulseOnArticleNs"]))
            opposite=np.asarray(vec(event["impulseOnReceiverNs"]))
            require(abs(np.linalg.norm(n)-1)<=1e-9 and incoming@n < -1e-7 and abs(outgoing@n)<=1e-7 and
                    np.linalg.norm(delta-n*(delta@n))<=1e-7 and observed@n>0,
                    "Impact does not arrest an approaching normal velocity on a stationary frictionless receiver")
            # Compare equivalent velocities so low article mass cannot hide a finite jump.
            require(np.linalg.norm((observed-j)*1000/mass)<=1e-7 and
                    np.linalg.norm((opposite+observed)*1000/mass)<=1e-7,
                    "Observed equal-and-opposite impulses do not reconcile the measured momentum jump")
            require(np.linalg.norm(np.cross(np.asarray(point)-article.center_at(i),n))<=1e-7,
                    "Off-center impulse needs separately qualified angular impact dynamics")
            part=article.at(i);receiver=installed_at(f,body)
            normal=n.tolist();contact_normal(part,receiver,point,normal)
            require(supported_segment(part,point,point,[0,0,0],normal,-1) and
                    supported_segment(receiver,point,point,[0,0,0],normal,1),
                    "Impulse direction differs from the measured surface normals at the installed contact")
            row["source"]="registered inelastic capture"
        rows.append(row)
    require(not impacts,"Claimed impulse lies outside the actual boundary clock")
    return rows
