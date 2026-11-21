"""Check the observer's exact trajectory law and every retained measurement before crediting a duty."""
from bisect import bisect_right
import math
import numpy as np

from mechanical_motion import vec
from mechanical_readiness import number,read,pinned,require
from release_onset import rigid
from transfer_mission import identity

SCHEMA="agent-frc/executed-trajectory@1"
SERIES="agent-frc/trajectory-observations@1"
RAW=set("schema stepSha256 pieceSha256 pieceId case stockIds holder frames resetObserved massKg centerOfMassLocalMm windowS receiver duty outcome observations basis angularVelocityRadS orientationModel massDistribution inertiaKgMm2 trajectory".split())
TRACE=set("stepSha256 pieceSha256 pieceId case stockIds holder frames resetObserved source guide interpolationBasis trajectorySource trajectorySha256".split())
EVENT=set("timeS accelerationMmS2 velocityMmS angularVelocityRadS articlePose acceptedId contacts ready actuator commandedOffsetMm obstructed".split())
FRAME=set("timeS custody nativeCoordinates offsetsMm articlePose installedTransforms".split())
CONTACT=set("body pointMm forceOnPieceN nextPointMm".split())
WITNESS=set("origin observer producer basis missionSha256 releaseOnsets trajectorySha256 impulseSources".split())


def keys(data,allowed,kind):
    require(isinstance(data,dict) and data.keys()<=allowed,
            "Unsupported or unregistered "+kind+" fields: "+str(sorted(set(data)-allowed) if isinstance(data,dict) else type(data).__name__))


def vector_matches(observed,expected,label):
    require(max(abs(np.asarray(vec(observed))-expected))<=1e-7,"Observed "+label+" contradicts the executed trajectory")


def verify(root,mission,trace,raw,witness,article,gravity,installed_at,rotates):
    """Support exact producer laws. A handful of samples alone cannot bound unknown interpolation."""
    law=raw.get("trajectory")
    require((mission is None or mission.get("trajectorySchema")==SCHEMA) and isinstance(law,dict) and law.get("schema")==SCHEMA,
            "The independent mission and observed execution need a supported typed trajectory contract")
    require(trace.get("interpolationBasis",SCHEMA)==SCHEMA and
            trace.get("trajectorySha256")==identity(law)==witness.get("trajectorySha256"),
            "Proposed interpolation differs from the independently registered trajectory")
    keys(raw,RAW,"execution");keys(trace,TRACE,"trace");keys(witness,WITNESS,"observer")
    keys(law,{"schema","segments","series","errorMm","errorRad","impulses"},"trajectory")
    require(all(number(law.get(k)) and law[k]==0 for k in ("errorMm","errorRad")),
            "A nonzero or unknown trajectory error needs a qualified swept uncertainty model")
    require(raw.get("orientationModel") in (None,"fixed-in-saved-axes") and raw.get("massDistribution") in (None,"uniform"),
            "Unsupported physical orientation or mass model")
    frames=trace["frames"];events=raw["observations"];clock=[f["timeS"] for f in frames]
    require(raw["frames"]==frames and len(events)==len(frames) and
            isinstance(law.get("segments"),list) and len(law["segments"])==len(frames)-1,
            "Executed law must cover every consecutive source interval")
    rates=[];fall_speed=0.
    for i,(f,e) in enumerate(zip(frames,events)):
        keys(f,FRAME,"primary pose");keys(e,EVENT,"primary observation")
        for c in e.get("contacts",[]):keys(c,CONTACT,"support reaction")
        if i+1==len(frames):break
        dt=clock[i+1]-clock[i];require(dt>0,"Non-increasing execution clock")
        seg=law["segments"][i];keys(seg,{"windowS","center","orientation","installed"},"segment law")
        free=f["custody"]=="free"
        spin=bool(np.linalg.norm(article.rot[i])>1e-10)
        require(seg==dict(windowS=clock[i:i+2],center="gravity-from-rest" if free else "constant-velocity",
            orientation="constant-world-angular-velocity" if spin else "constant-orientation",installed="linear-native-coordinates"),
            "Declared segment has an unsupported law or conflicts with its applied motion and clock")
        acc=np.array([0.,0.,-gravity if free else 0.])
        vel=(article.center_at(i+1)-article.center_at(i))/dt-.5*acc*dt
        if free:
            require(np.linalg.norm(vel-np.array([0.,0.,-fall_speed]))<=1e-6,"Free-flight samples disagree with gravity from observed release")
            fall_speed+=gravity*dt
        else:fall_speed=0.
        rates.append((vel,acc))
    from transfer_momentum import verify_boundaries
    momentum=verify_boundaries(root,rates,frames,events,article,raw,witness,installed_at,rotates)
    def check_sample(s,i,t):
        dt=t-clock[i];vel,acc=rates[i];fraction=dt/(clock[i+1]-clock[i])
        center=article.center_at(i)+vel*dt+.5*acc*dt**2
        if "centerMm" in s:vector_matches(s["centerMm"],center,"center position")
        if "velocityMmS" in s:vector_matches(s["velocityMmS"],vel+acc*dt,"center velocity")
        if "accelerationMmS2" in s:vector_matches(s["accelerationMmS2"],acc,"center acceleration")
        if "angularVelocityRadS" in s:vector_matches(s["angularVelocityRadS"],article.rates[i],"spin")
        if "externalForceN" in s:vector_matches(s["externalForceN"],np.zeros(3),"external applied force (unsupported)")
        matrix=article.matrix(i,fraction).copy();matrix[:3,3]=center-matrix[:3,:3]@article.center
        if "endBoundsMm" in s or "donorGapMm" in s:
            from release_onset import position
            from mechanical_motion import bounds,distance
            placed=position(article.shape,matrix)
            if "endBoundsMm" in s:
                box=s["endBoundsMm"];require(isinstance(box,list) and len(box)==6 and all(number(x) for x in box)
                    and max(abs(a-b) for a,b in zip(bounds(placed),box))<=1e-7,"Observed finite bounds contradict the trajectory")
            if "donorGapMm" in s:
                f={}
                for k in ("offsetsMm","nativeCoordinates"):
                    a=frames[i].get(k,{});b=frames[i+1].get(k,{})
                    require(set(a)==set(b),"Changing native state roster needs a qualified interpolation")
                    f[k]={key:(np.asarray(x)+fraction*(np.asarray(b[key])-x)).tolist() for key,x in a.items()}
                gap=s["donorGapMm"]
                require(number(gap) and abs(distance(placed,installed_at(f,trace["holder"]))-gap)<=1e-7,
                        "Observed donor separation contradicts the trajectory")
        if "normalReactionsN" in s:
            actual=s["normalReactionsN"];contacts=events[i if fraction<1 else i+1].get("contacts",[])
            require(isinstance(actual,list) and len(actual)==len(contacts) and all(number(x) and
                    np.linalg.norm(np.array([0,0,x])-np.array(c["forceOnPieceN"]))<=1e-9 for x,c in zip(actual,contacts)),
                    "Observed normal reactions contradict the qualified contact force history")
        if "articlePose" in s:
            require(np.max(abs(rigid(s["articlePose"])-matrix))<=1e-7,"Measured rigid pose contradicts the executed trajectory")
        if "nativeCoordinates" in s:
            a=frames[i].get("nativeCoordinates",{});b=frames[i+1].get("nativeCoordinates",{})
            require(isinstance(s["nativeCoordinates"],dict) and set(a)==set(b)==set(s["nativeCoordinates"]) and all(
                number(v) and abs(v-(a[k]+fraction*(b[k]-a[k])))<=1e-8 for k,v in s["nativeCoordinates"].items()),
                "Measured native joint differs from the registered operating segment")
    for i,e in enumerate(events):
        if i==len(rates) and frames[i-1]["custody"]=="free" and frames[i]["custody"]=="received":
            # At an observed final capture use the post-contact kinematic state.
            # The incoming gravitational interval, occupied volume and actual
            # loaded receiving contact are verified independently.
            for k in ("accelerationMmS2","velocityMmS"):
                if k in e:vector_matches(e[k],np.zeros(3),"post-capture "+k)
            e={k:v for k,v in e.items() if k not in ("velocityMmS","accelerationMmS2")}
        check_sample(e,min(i,len(rates)-1),clock[i])
    series=law.get("series")
    require(isinstance(series,list) and len({r["sha256"] for r in series})==len(series),
            "Register the complete unique synchronized observation series, including an explicit empty inventory")
    count=0
    for ref in series:
        keys(ref,{"file","sha256"},"source pin")
        data=read(pinned(root,ref))
        keys(data,{"schema","case","pieceId","stepSha256","pieceSha256","windowS","samples"},"measurement series")
        require(data.get("schema")==SERIES and all(data[k]==raw[k] for k in ("case","pieceId","stepSha256","pieceSha256")),
                "Auxiliary observation is for a different finite article, duty or issue")
        samples=data["samples"];times=[s["timeS"] for s in samples]
        require(len(samples)>=2 and data["windowS"]==[times[0],times[-1]] and all(number(t) for t in times)
                and all(a<b for a,b in zip(times,times[1:])) and clock[0]<=times[0]<times[-1]<=clock[-1]+1e-12,
                "Unordered or out-of-range source observations")
        count+=len(samples)
        for s,t in zip(samples,times):
            keys(s,{"timeS","centerMm","articlePose","velocityMmS","accelerationMmS2","angularVelocityRadS","nativeCoordinates","externalForceN","endBoundsMm","donorGapMm","normalReactionsN"},"synchronized observation")
            require("centerMm" in s or "articlePose" in s,"A synchronized observation must identify actual placement")
            i=max(0,min(bisect_right(clock,t)-1,len(rates)-1));check_sample(s,i,t)
    article.trajectory_evidence=dict(schema=SCHEMA,primaryFrames=len(frames),segments=len(rates),observationSeries=len(series),synchronizedSamples=count,momentum=momentum)
