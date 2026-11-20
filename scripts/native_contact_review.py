"""Reconcile installed body identities, measured native interference and declared operating poses."""
from pathlib import Path
from mechanical_readiness import digest,named,number,pinned,read,require


def verify(root,study,reopen,base,registered,find,missing):
    archive=study["archive"]["sha256"]
    pose_evidence=study.get("nativePoses",[])
    poses=[base]+[read(pinned(root,p)) for p in pose_evidence]
    planned=reopen.get("inspectionPoses")
    if not planned or not isinstance(planned,list):
        missing("native","poses","Declare the saved and all required operating inspection poses in the native reopen.")
        return
    by_id={p["id"]:p for p in planned}
    require(len(by_id)==len(planned) and "saved" in by_id and by_id["saved"].get("joints")==[],"Invalid native pose registration")
    completed=set()
    for c in poses:
        pid=c.get("pose",{}).get("id")
        if pid not in by_id or pid in completed or c["pose"]!=by_id[pid] or c.get("archiveSha256")!=archive:
            find("native","fail",pid,"Wrong archive, joint pose or duplicate native inspection.")
            continue
        completed.add(pid)
        if not named(c.get("documentId")) or not named(c.get("rootComponentId")) or not named(c.get("rootRevision")) or c.get("otherGeometry"):
            missing("native",pid,"Unresolved native identity or non-solid geometry.")
        require(c["programSha256"]==digest(Path(__file__).with_name("fusion_issue_inventory.py")),"Unexpected native census program")
        rows=c["bodies"]
        mapped=[]
        for row in rows:
            key=(row["path"],row["name"])
            if key not in registered:
                find("native","fail",str(key),"Measured native body absent from the selected assembly.")
                return
            mapped.append(registered[key][0])
            eps=study["reopenBoundsToleranceMm"]
            if not number(row.get("worldVertexErrorMm")) or not 0<=row["worldVertexErrorMm"]<=eps or type(row.get("visible")) is not bool:
                missing("native",str(key),"World-coordinate vertex validation or effective visibility failed.")
        if len(set(mapped))!=len(mapped) or set(mapped)!={v[0] for v in registered.values()}:
            find("native","fail",pid,"Pose omits or repeats an installed native body.")
        record=c.get("contacts",{})
        if record.get("complete") is not True or record.get("programSha256")!=digest(Path(__file__).with_name("fusion_issue_contacts.py")) or record.get("units")!="mm3":
            missing("native",pid,"Complete source-bound native interference pass is missing.")
            continue
        expected={(i,j) for i,x in enumerate(rows) for j in range(i+1,len(rows))
                  if min(min(x["boundsMm"][k+3],rows[j]["boundsMm"][k+3])-max(x["boundsMm"][k],rows[j]["boundsMm"][k]) for k in range(3))>=-1e-6}
        actual=set()
        allowed={tuple(sorted(x["pair"])):x["maxMm3"] for x in study.get("mating",[])}
        for hit in record["pairs"]:
            pair=tuple(hit["pair"])
            require(pair in expected and pair not in actual,"Unexpected or repeated native pair")
            actual.add(pair);a,b=(mapped[i] for i in pair)
            volumes=[hit.get("interferenceMm3"),hit.get("temporaryCommonMm3")]
            require(all(number(v) and v>=0 for v in volumes),"Unresolved native solid intersection")
            limit=allowed.get(tuple(sorted((a,b))),0)
            if max(volumes)>limit:
                find("interference","fail",[pid,a,b],f"Native overlap {max(volumes):.9g} mm³ exceeds the reviewed pair limit {limit:.9g} mm³.")
        if actual!=expected or record["candidatePairs"]!=len(expected):
            missing("native",pid,"The native scan is incomplete for this pose.")
    if completed!=set(by_id):
        missing("native",sorted(set(by_id)-completed),"Required moving native inspection pose is absent.")
    groups=set(reopen.get("movingGroups",[]))
    checked={j.get("group") for pose in planned for j in pose["joints"]}
    if groups-checked:
        missing("native",sorted(groups-checked),"A native moving group has no evaluated operating pose.")
