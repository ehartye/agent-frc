"""Reconcile installed body identities, measured native interference and declared operating poses."""
from pathlib import Path
from mechanical_readiness import digest,named,number,pinned,read,require


def staged_census(digest_value):
    return digest_value in {digest(Path(__file__).with_name("fusion_issue_inventory.py")),
                            "f3b9db179d3adee5c01cddeb175f83732730358abc0f0761b9c9c3f09425df4f"}


def allowed_census(digest_value):
    # Previous installed collector measured topological vertex proxies and
    # could not emit a finished result for a body lacking vertices.
    return staged_census(digest_value) or digest_value in {
        "eb807942e574514ac2aaba5408c7dfbeadd342f6883fa69637733d660081d58c",
        "36755938a8793ab716a9200235aa1eae9aa30922519249602704a8e823597822",
        "4529f1610cc8d361098cebc822437b3f50ad40c4eda7a53105bda94ff9dbe254"}


class PoseMismatch(ValueError):
    """An actual coordinate or material point contradicts the commissioned pose."""


def timeline_states(group, parent=()):
    """Identify each leaf by its nested group, native type/name and same-name ordinal."""
    from collections import Counter
    seen = Counter()
    result = {}
    items = group.get("items") if isinstance(group, dict) else None
    require(isinstance(items, list) and type(group.get("count")) is int and group["count"] == len(items),
            "Incomplete post-compute timeline inventory")
    for item in items:
        require(isinstance(item, dict) and named(item.get("name")) and named(item.get("type")),
                "Unidentified post-compute timeline item")
        key = (item["name"], item["type"], item.get("entityType"))
        path = parent + ((*key, seen[key]),)
        seen[key] += 1
        if item["type"].endswith("::TimelineGroup"):
            result.update(timeline_states(item.get("children"), path))
        else:
            result[path] = item
    return result


def check_timeline(before, after, captured):
    old = timeline_states(before)
    new = timeline_states(after)
    require(old.keys() <= new.keys() and len(new)-len(old) <= int(captured),
            "Required timeline identities changed between cold open and recompute")
    for path, row in new.items():
        if path not in old:
            require(captured and row.get("entityType") == "adsk::fusion::Snapshot",
                    f"Unexpected timeline addition after capture: {row['name']} ({row.get('entityType')})")
        previous = old.get(path, {}).get("health")
        current = row.get("health")
        if current == "error":
            raise PoseMismatch(f"Recompute failed on {row['name']}: {row.get('message', '')}")
        if previous in ("suppressed", "rolledback"):
            require(current == previous, f"Cold inactive feature {row['name']} changed state")
        else:
            require(current == "healthy", f"Unqualified post-compute feature {row['name']}: {current}")


def verify_stage(census, base, registered, anchor, tolerance, connections):
    """Tie the inspection label to the stage actually observed on this archive."""
    import numpy as np
    pose = census["pose"]
    commands = pose["joints"]
    default = "command-response" if commands else "archive-rest"
    stage = pose.get("stage", default)
    require(stage in ("archive-rest", "command-response", "after-recompute", "captured-recompute")
            and ((stage == "archive-rest") == (not commands))
            and (pose["id"] != "saved" or not commands), "Invalid native observation stage")
    if not staged_census(census["programSha256"]):
        require("stageEvidence" not in census and "stage" not in pose,
                "Legacy native capture has no explicit stage evidence. Recapture the commissioned pose.")
        return
    evidence = census.get("stageEvidence")
    require(isinstance(evidence, dict) and evidence.get("stage") == stage,
            "Native receipt lacks the requested observation stage")
    if stage in ("after-recompute", "captured-recompute"):
        check_timeline(evidence.get("coldTimeline"), evidence.get("timeline"), stage == "captured-recompute")
    values = evidence.get("coordinates")
    groups = [c["group"] for c in commands]
    require(isinstance(values, dict) and set(values) == set(groups) and len(groups) == len(set(groups)),
            "Missing or duplicate observed native coordinates")
    changed = set()
    for command in commands:
        row = values[command["group"]]
        requested = command["nativeValue"]
        require(isinstance(row, dict) and all(number(v) for v in (row.get("before"),row.get("observed"),requested)),
                "Incomplete native coordinate readback")
        if abs(row["observed"]-requested) > 1e-8:
            raise PoseMismatch(f"Pose {pose['id']} at {stage}: requested {requested}, observed {row['observed']}")
        if abs(row["before"]-row["observed"]) > 1e-8:
            changed.add(command["group"])
    baseline = {(b["path"], b["name"]): b["worldTransform"] for b in base["bodies"]}
    motion = {}
    matrices = {}
    for body in census["bodies"]:
        key = (body["path"], body["name"])
        require(key in registered and key in baseline, "Unknown source of a native motion witness")
        local = np.asarray(body.get("placementPointsCm"), dtype=float)
        observed = np.asarray(body.get("observedWorldPointsMm"), dtype=float)
        require(local.shape == observed.shape == (3, 3) and np.isfinite(local).all() and np.isfinite(observed).all()
                and np.linalg.norm(np.cross(local[1]-local[0],local[2]-local[0])) > 0,
                "Three distinct noncollinear native world witnesses are required per body")
        sites = np.column_stack((10*local, np.ones(3)))
        predicted = (sites @ np.asarray(body["worldTransform"]).reshape(4,4).T)[:,:3]
        parked = (sites @ np.asarray(baseline[key]).reshape(4,4).T)[:,:3]
        require(np.max(np.linalg.norm(observed-predicted,axis=1)) <= .001,
                "Measured material points disagree with the assembly-world transform")
        solid = registered[key][0]
        matrices[solid] = (np.asarray(baseline[key]).reshape(4,4), np.asarray(body["worldTransform"]).reshape(4,4))
        motion[solid] = float(np.max(np.linalg.norm(observed-parked,axis=1)))
    require(anchor in motion and motion[anchor] <= tolerance, "Fixed chassis moved in the observed native pose")
    from assembly_kinematics import relative_errors
    for group in changed:
        pairs = [edge["pair"] for edge in connections if edge.get("jointGroup") == group]
        require(pairs, f"Joint {group} has no registered material pair for observed travel")
        for a,b in pairs:
            a0,a1 = matrices[a]
            b0,b1 = matrices[b]
            distance, angle = relative_errors(a0,b0,a1,b1)
            require(distance > tolerance or angle > 1e-5,
                    f"Joint {group} changed without relative travel of registered members {a} / {b}")


def pose_path(root,ref):
    require(isinstance(ref,dict) and named(ref.get("file")),"Missing revision-bound native pose file")
    name=Path(ref["file"])
    require(not name.is_absolute() and (root/name).resolve().is_relative_to(root),
            "Native pose file must stay inside the project")
    if not (root/name).exists():
        raise FileNotFoundError("Unresolved project file: "+ref["file"])
    return pinned(root,ref)


def check_pose(root,study,c,registered,nominal,cold_shapes,find,missing):
    pid=c["pose"]["id"]
    if not named(c.get("documentId")) or not named(c.get("rootComponentId")) or not named(c.get("rootRevision")) or c.get("otherGeometry"):
        missing("native",pid,"Unresolved native identity or non-solid geometry.")
    require(c.get("schema")=="agent-frc/fusion-body-census@1" and named(c.get("fusionVersion"))
            and allowed_census(c.get("programSha256")),"Unbound or stale native body census")
    rows=c["bodies"]
    require(isinstance(rows,list) and rows,"Missing native solid inventory")
    mapped=[]
    for row in rows:
        require(isinstance(row,dict) and named(row.get("name")) and named(row.get("path")),"Invalid native body identity")
        require(isinstance(row.get("worldTransform"),list) and len(row["worldTransform"])==16 and
                all(number(v) for v in row["worldTransform"]),"Invalid native world transform")
        require(isinstance(row.get("boundsMm"),list) and len(row["boundsMm"])==6 and all(number(v) for v in row["boundsMm"]),"Invalid native body bounds")
        key=(row["path"],row["name"])
        if key not in registered:
            raise ValueError("Measured native body absent from the selected assembly: "+str(key))
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
                if not cold_shapes:
                    cold_shapes.update(load_solids(pinned(root,study["step"]))[0])
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
    require(isinstance(record,dict),"Invalid native contact record")
    collector = record.get("programSha256")
    current = digest(Path(__file__).with_name("fusion_issue_contacts.py"))
    historical = {
        "d1e1c1abdc918155b16aa62e79137762fc4ccfd272e1e9072207825c566ac121",
        "9a570e82486dbcf077d961a143cf6808666255dda1d17a0ac1a9b9bec0112dfe",
        "8a87902d4dddc0c6655febd21de781161866137532aa1bd807c3e565a271359e",
        "f3ea058c88481de80c6cd554cfff73758d2d77787e4a73f8cac9f6ec81b0465c",
    }
    checked_lumps = {current, "78619a14ea834445d8fd1dc971198c8200585b8cd3c45252021e373d6bb7c2bd"}
    if record.get("complete") is not True or collector not in checked_lumps | historical or record.get("units") != "mm3":
        missing("native",pid,"Complete source-bound native interference pass is missing.")
        return
    if collector not in checked_lumps:
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


def verify(root,study,reopen,base,registered,find,missing,*,saved_reference_valid=True,saved_error=None,saved_bytes_verified=False):
    archive=study["archive"]["sha256"]
    planned=reopen.get("inspectionPoses")
    if not planned or not isinstance(planned,list):
        missing("native","poses","Declare the saved and all required operating inspection poses in the native reopen.")
        return []
    by_id={p["id"]:p for p in planned}
    require(len(by_id)==len(planned) and by_id.get("saved",{}).get("joints")==[],"Invalid native pose registration")
    nominal={}
    cold_shapes={}
    completed=set()
    reports=[]
    references=study.get("nativePoses",[])
    if not isinstance(references,list):
        find("native","fail","nativePoses","Supply a list of pinned native pose observations.")
        references=[]
    for index,ref in enumerate([study.get("nativeCensus"),*references]):
        pid="saved" if index==0 else None
        report={"pose":pid,"source":ref,"verifiedBytes":False}
        reports.append(report)
        try:
            if index==0 and not base:
                report["verifiedBytes"]=saved_bytes_verified
                if saved_error is not None:
                    raise saved_error
                raise FileNotFoundError("A validated cold census is required for the saved assembly.")
            if index==0:
                c=base
                report["verifiedBytes"]=True
            else:
                path=pose_path(root,ref)
                report["verifiedBytes"]=True
                c=read(path)
            require(isinstance(c,dict) and isinstance(c.get("pose"),dict),"No measured native pose in receipt")
            pid=c["pose"].get("id")
            require(named(pid) and pid in by_id and pid not in completed and c["pose"]==by_id[pid] and
                    c.get("archiveSha256")==archive and (pid=="saved")==(index==0),
                    "Wrong archive, joint pose or duplicate native inspection.")
            report["pose"]=pid
            observations=[]
            def record(domain,status,subject,reason):
                observations.append((domain,status,subject,reason))
            check_pose(root,study,c,registered,nominal,cold_shapes,record,
                       lambda domain,subject,reason: record(domain,"open",subject,reason))
            stage_ok = True
            if (index == 0 and saved_reference_valid) or (index and nominal):
                try:
                    verify_stage(c,base,registered,study["chassisAnchor"],study["reopenBoundsToleranceMm"],study["connections"])
                except PoseMismatch as error:
                    stage_ok = False
                    record("native","fail",pid,str(error))
                except (ValueError, KeyError, TypeError, IndexError) as error:
                    stage_ok = False
                    record("native","open",pid,str(error))
            if index==0 and not saved_reference_valid:
                record("native","fail","saved","The cold pose differs from the registered assembly reference.")
            if index==0 and saved_reference_valid and stage_ok:
                keys=[(body["path"],body["name"]) for body in c["bodies"]]
                if len(keys)==len(registered) and set(keys)==set(registered):
                    nominal=dict(zip(keys,c["bodies"]))
            if index and not nominal:
                record("native","open",pid,"Parked reference unavailable for the moving body comparison.")
            for finding in observations:
                find(*finding)
            completed.add(pid)
            report["status"]=("fail" if any(o[1]=="fail" for o in observations)
                              else "open" if observations else "checked")
        except (KeyError,TypeError,ValueError,OSError,IndexError,AttributeError,RuntimeError) as error:
            unavailable=isinstance(error,FileNotFoundError)
            report["status"]="unavailable" if unavailable else "rejected"
            report["reason"]=str(error)
            find("native","open" if unavailable else "fail",pid or ref,"Unusable native pose evidence: "+str(error))
    if completed!=set(by_id):
        missing("native",sorted(set(by_id)-completed),"Required moving native inspection pose is absent.")
    groups=set(reopen.get("movingGroups",[]))
    checked={j.get("group") for pose in planned for j in pose["joints"]}
    if study.get("linkCalibration"):
        # The native station drives independent axes, then reads back every coupled
        # coordinate. The full kinematics review verifies the associated body poses.
        try:
            observed=read(pinned(root,study["linkCalibration"]))
            for row in observed["frames"]:
                if row["id"] in completed and row["id"]!="saved":
                    checked.update(g for g,value in row["values"].items() if abs(value-observed["frames"][0]["values"][g])>1e-8)
        except (KeyError,TypeError,ValueError,OSError,IndexError) as error:
            missing("native","linked calibration","Native linked-group comparison unavailable: "+str(error))
    if groups-checked:
        missing("native",sorted(groups-checked),"A native moving group has no evaluated operating pose.")
    return reports
