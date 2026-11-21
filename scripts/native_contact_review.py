"""Reconcile installed body identities, measured native interference and declared operating poses."""
from pathlib import Path
from mechanical_readiness import digest,named,number,pinned,read,require


def allowed_census(digest_value):
    # Previous installed collector measured topological vertex proxies and
    # could not emit a finished result for a body lacking vertices.
    return digest_value in {digest(Path(__file__).with_name("fusion_issue_inventory.py")),
        "4529f1610cc8d361098cebc822437b3f50ad40c4eda7a53105bda94ff9dbe254"}


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
    nominal={(b["path"],b["name"]):b for b in base["bodies"]}
    cold_shapes=None
    completed=set()
    for c in poses:
        pid=c.get("pose",{}).get("id")
        if pid not in by_id or pid in completed or c["pose"]!=by_id[pid] or c.get("archiveSha256")!=archive:
            find("native","fail",pid,"Wrong archive, joint pose or duplicate native inspection.")
            continue
        completed.add(pid)
        if not named(c.get("documentId")) or not named(c.get("rootComponentId")) or not named(c.get("rootRevision")) or c.get("otherGeometry"):
            missing("native",pid,"Unresolved native identity or non-solid geometry.")
        require(allowed_census(c["programSha256"]),"Unexpected native census program")
        rows=c["bodies"]
        mapped=[]
        for row in rows:
            key=(row["path"],row["name"])
            if key not in registered:
                find("native","fail",str(key),"Measured native body absent from the selected assembly.")
                return
            solid=registered[key][0]
            mapped.append(solid)
            eps=study["reopenBoundsToleranceMm"]
            if pid!="saved" and key in nominal:
                before=nominal[key]
                m0=before["worldTransform"];m1=row["worldTransform"]
                require(len(m1)==16 and all(number(x) for x in m1),"Invalid measured pose transform")
                if all(abs(m0[i]-m1[i])<1e-12 for i in (0,1,2,4,5,6,8,9,10)):
                    delta=[m1[i]-m0[i] for i in (3,7,11)]
                    expected_box=[value+delta[i%3] for i,value in enumerate(before["boundsMm"])]
                else:
                    from OCP.gp import gp_Trsf
                    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
                    from mechanical_motion import bounds
                    from showcase_contacts import load_solids
                    if cold_shapes is None:
                        cold_shapes=load_solids(pinned(root,study["step"]))[0]
                    a=gp_Trsf();b=gp_Trsf();a.SetValues(*m0[:12]);b.SetValues(*m1[:12])
                    relative=b.Multiplied(a.Inverted())
                    expected_box=bounds(BRepBuilderAPI_Transform(cold_shapes[solid],relative,False).Shape())
                if len(row.get("boundsMm",[]))!=6 or not all(number(v) for v in row["boundsMm"]) or any(
                    abs(a-b)>eps for a,b in zip(row["boundsMm"],expected_box)):
                    find("native","fail",[pid,solid],"Recorded pose bounds disagree with the placed source at the native transform.")
            if not number(row.get("worldVertexErrorMm")) or not 0<=row["worldVertexErrorMm"]<=eps or type(row.get("visible")) is not bool:
                missing("native",str(key),"World-coordinate vertex validation or effective visibility failed.")
        if len(set(mapped))!=len(mapped) or set(mapped)!={v[0] for v in registered.values()}:
            find("native","fail",pid,"Pose omits or repeats an installed native body.")
        record=c.get("contacts",{})
        collector = record.get("programSha256")
        current = digest(Path(__file__).with_name("fusion_issue_contacts.py"))
        historical = {
            "d1e1c1abdc918155b16aa62e79137762fc4ccfd272e1e9072207825c566ac121",
            "9a570e82486dbcf077d961a143cf6808666255dda1d17a0ac1a9b9bec0112dfe",
            "8a87902d4dddc0c6655febd21de781161866137532aa1bd807c3e565a271359e",
            "f3ea058c88481de80c6cd554cfff73758d2d77787e4a73f8cac9f6ec81b0465c",
        }
        if record.get("complete") is not True or collector not in {current, *historical} or record.get("units") != "mm3":
            missing("native",pid,"Complete source-bound native interference pass is missing.")
            continue
        if collector != current:
            missing("native", pid, "Fresh native census required. The historical collector did not check retained lumps against reported volume.")
        expected={(i,j) for i,x in enumerate(rows) for j in range(i+1,len(rows))
                  if min(min(x["boundsMm"][k+3],rows[j]["boundsMm"][k+3])-max(x["boundsMm"][k],rows[j]["boundsMm"][k]) for k in range(3))>=-1e-6}
        actual=set()
        allowed={tuple(sorted(x["pair"])):x["maxMm3"] for x in study.get("mating",[])}
        for hit in record["pairs"]:
            pair=tuple(hit["pair"])
            require(pair in expected and pair not in actual,"Unexpected or repeated native pair")
            actual.add(pair);a,b=(mapped[i] for i in pair)
            volumes=[hit.get("interferenceMm3"),hit.get("temporaryCommonMm3")]
            if hit.get("identities") is not None:
                require(hit["identities"]==[[rows[i]["path"],rows[i]["name"]] for i in pair],"Native pair identities disagree with inventory")
            if hit.get("status")=="unresolved" or not all(number(v) and v>=0 for v in volumes):
                missing("native",[pid,a,b],"One or more native intersection kernels remain unresolved: "+str(hit.get("errors",{})))
            volumes=[v for v in volumes if number(v) and v>=0]
            limit=allowed.get(tuple(sorted((a,b))),0)
            if volumes and max(volumes)>limit:
                find("interference","fail",[pid,a,b],f"Native overlap {max(volumes):.9g} mm³ exceeds the reviewed pair limit {limit:.9g} mm³.")
        if actual!=expected or record["candidatePairs"]!=len(expected):
            missing("native",pid,"The native scan is incomplete for this pose.")
    if completed!=set(by_id):
        missing("native",sorted(set(by_id)-completed),"Required moving native inspection pose is absent.")
    groups=set(reopen.get("movingGroups",[]))
    checked={j.get("group") for pose in planned for j in pose["joints"]}
    if study.get("linkCalibration"):
        # The native station drives independent axes, then reads back every coupled
        # coordinate. The full kinematics review verifies the associated body poses.
        observed=read(pinned(root,study["linkCalibration"]))
        for row in observed["frames"]:
            if row["id"] in completed and row["id"]!="saved":
                checked.update(g for g,value in row["values"].items() if abs(value-observed["frames"][0]["values"][g])>1e-8)
    if groups-checked:
        missing("native",sorted(groups-checked),"A native moving group has no evaluated operating pose.")
