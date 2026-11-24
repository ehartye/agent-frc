"""Review a proposed complete robot release against its exact placed geometry and registered engineering duties."""
import argparse
from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import Path
import sys
import zipfile

from kernel_layout.files import digest, named, number, pinned, project_path, read, require
from showcase_contacts import candidate_pairs, measure


def fill_digests(root, node):
    """Give every file reference written without a SHA-256 the digest of the file it names, in place.

    A study, roster or plan names its files by project-relative path. The checker reads each one here, before any
    comparison, so the fields that repeat a digest downstream hold the one that was read."""
    if isinstance(node, dict):
        name = node.get("file")
        if named(name) and node.get("sha256") is None and not Path(name).is_absolute():
            target = (root/name).resolve()
            if target.is_relative_to(root) and target.is_file():
                node["sha256"] = digest(target)
        for value in node.values():
            fill_digests(root, value)
    elif isinstance(node, list):
        for value in node:
            fill_digests(root, value)
    return node


def components(nodes, edges):
    paths = {n:set() for n in nodes}
    for a,b in edges:
        paths[a].add(b)
        paths[b].add(a)
    groups=[]
    for node in sorted(nodes):
        if node not in paths:
            continue
        pending=[node]
        group=[]
        while pending:
            current=pending.pop()
            if current in paths:
                group.append(current)
                pending.extend(paths.pop(current))
        groups.append(sorted(group))
    return groups


def scope_digest(study):
    frozen={k:v for k,v in study.items() if k not in ("coverage","distribution","geometry")}
    return sha256(json.dumps(frozen,sort_keys=True,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode()).hexdigest()


def component_inputs(root,study):
    if not study.get("reopen"):
        return []
    record=read(pinned(root,study["reopen"]))
    requests=[]
    inventories={}
    for occ in record["installedOccurrences"]:
        article=study.get("articles",{}).get(occ.get("article"),{})
        neutral=article.get("neutral")
        if not neutral:
            continue
        source=pinned(root,neutral)
        # An issued supplier STEP is the official source itself. Direct conversions
        # of another official format need an independently reopened neutral export.
        model=pinned(root,article["model"])
        if model.suffix.lower() in (".stp",".step") and digest(source)!=digest(model):
            raise ValueError("Exact supplier neutral model changed")
        if occ.get("neutralSha256")!=digest(source):
            raise ValueError("Native occurrence does not identify the source neutral export")
        if source not in inventories:
            from showcase_contacts import load_solids
            source_shapes,other=load_solids(source)
            require(not other,"Source component includes unresolved non-solid leaves")
            inventories[source]=set(source_shapes)
        mapping=occ.get("sourceSolids",{})
        require(set(mapping)==set(occ["solids"]) and Counter(mapping.values())==Counter(inventories[source]),
            "Every source solid must appear exactly once per installed occurrence: "+occ["path"])
        for target,label in mapping.items():
            requests.append((target,source,label,occ["worldTransform"]))
    return requests


def scan(root, study):
    fill_digests(root.resolve(), study)
    step = pinned(root,study["step"])
    tolerance=study["contactToleranceMm"]
    require(number(tolerance) and tolerance>=0, "Invalid contact reporting tolerance")
    probes={tuple(sorted(j["pair"])) for j in study.get("connections",[])}
    result=measure(step,tolerance,probes,volumes=True,separation_axes=study.get("projectedSeparationAxes",[]))
    requests=component_inputs(root,study)
    if requests or study.get("componentSectionAxesWorld"):
        from component_shape import compare_components
        result["componentDifferences"]=compare_components(step,requests,interior_points=study.get("componentInteriorPointsMm"),
                                                          section_axes=study.get("componentSectionAxesWorld"))
    if study.get("connections"):
        from mechanical_motion import bearing_area
        from showcase_contacts import load_solids
        shapes,_=load_solids(step)
        result["seatAreasMm2"]=[dict(pair=list(pair),area=bearing_area(shapes[pair[0]],shapes[pair[1]])) for pair in sorted(probes)]
    result["stepSha256"]=digest(step)
    return result


def evaluate_inputs(root,study, geometry=None):
    root=root.resolve()
    require(study.get("schema")=="agent-frc/mechanical-readiness@1","Unknown assembly review schema")
    fill_digests(root, study)
    findings=[]
    def finding(domain,status,subject,reason):
        findings.append(dict(domain=domain,status=status,subject=subject,reason=reason))
    def missing(domain,subject,reason):
        finding(domain,"open",subject,reason)

    # A missing prerequisite leaves no acceptance. Invalidated or mismatched bytes throw.
    step=pinned(root,study["step"])
    step_sha=digest(step)
    configuration=study.get("configuration")
    require(named(configuration),"Identify the installed configuration")
    archive_sha=None
    if study.get("archive"):
        archive=pinned(root,study["archive"])
        require(archive.suffix.lower() in (".f3d",".f3z") and zipfile.is_zipfile(archive),"Expected a native Fusion archive")
        archive_sha=digest(archive)
    else:
        missing("native","assembly","No exact Fusion archive.")
    if geometry is None:
        geometry=read(pinned(root,study["geometry"]))
    require(geometry.get("schema")=="agent-frc/step-solid-intersections@1" and
            geometry.get("method")=="placed-step-distance-and-common-volume" and geometry.get("units")=="mm" and
            geometry.get("stepSha256")==step_sha,"Geometry scan does not identify the selected STEP")
    tol=study["contactToleranceMm"]
    require(number(tol) and tol>=0 and geometry.get("toleranceMm")==tol,"Geometry tolerance changed")
    boxes=geometry["bodies"]
    require(isinstance(boxes,dict) and boxes and all(named(k) and isinstance(b,list) and len(b)==6 and
        all(number(v) for v in b) and all(b[i]<b[i+3] for i in range(3)) for k,b in boxes.items()),"Invalid placed solid bounds")
    bodies=set(boxes)
    # A receipt cannot drop a candidate just because the intersection or distance was inconvenient.
    probes={tuple(sorted(j["pair"])) for j in study.get("connections",[])}
    from placed_separation import registered_axes
    projections=registered_axes(study.get("projectedSeparationAxes",[]),boxes)
    required=candidate_pairs(boxes,tol,probes | set(projections))
    unresolved={}
    for diagnostic in geometry.get("unresolvedIntersections",[]):
        pair=tuple(sorted(diagnostic["pair"]))
        raw=diagnostic["rawCommonMm3"]
        require(pair in required and pair not in unresolved and named(diagnostic.get("reason")) and
                (raw is None or number(raw)), "Invalid unresolved intersection")
        unresolved[pair]=diagnostic
    pairs={}
    for row in geometry["pairs"]:
        require(isinstance(row,list) and len(row)==4,"Missing pair volume")
        a,b,gap,vol=row
        pair=tuple(sorted((a,b)))
        require(pair not in pairs and pair in required and number(gap) and gap>=0 and
                ((vol is None and pair in unresolved) or (pair not in unresolved and number(vol) and vol>=0)),
                "Invalid/repeated solid pair")
        pairs[pair]=(gap,vol)
    require(set(pairs)==required,"Incomplete broad-phase pair measurements")
    receipts=geometry.get("projectedSeparations",[])
    require(len(receipts)==len(projections) and {tuple(r["pair"]) for r in receipts}==set(projections),
            "Missing or unrelated placed-solid projection")
    for row in receipts:
        pair=tuple(row["pair"])
        kind=row.get("pairDistanceKind")
        require(row.get("requiredClearanceMm")==tol and kind in ("lower-bound","extrema")
                and row.get("status") in ("separated","open"),"Invalid placed-solid projection")
        if row["status"]=="separated":
            intervals=row.get("intervalsMm")
            axis=row.get("axisWorld")
            require(isinstance(axis,list) and len(axis)==3 and all(number(v) for v in axis)
                    and any(all(abs(actual-requested)<1e-12 for actual,requested in zip(axis,registered))
                            for registered in projections[pair]),"Unregistered projection basis")
            require(isinstance(intervals,list) and len(intervals)==2
                    and all(isinstance(limits,list) and len(limits)==2 and all(number(v) for v in limits)
                            and limits[0]<=limits[1] for limits in intervals),"Invalid projected body intervals")
            a,b=intervals
            reserve=row.get("numericReserveMm")
            lower=row.get("clearanceLowerBoundMm")
            require(number(reserve) and reserve>0 and number(lower) and lower>tol and
                    lower==row.get("signedBoundMm")==max(a[0]-b[1],b[0]-a[1])-reserve,
                    "Invalid projected clearance certificate")
        if kind=="lower-bound":
            gap=row.get("clearanceLowerBoundMm")
            require(row["status"]=="separated" and number(gap) and gap>tol and pair not in probes
                    and pairs[pair]==(gap,0.0),"A separation bound only certifies a noncontact pair")

    for group in geometry.get("repeatedInterfaceDisagreements", []):
        observations = group["observations"]
        require(group["status"] == "open" and len(observations) >= 2 and
                all(pairs[tuple(sorted(row["pair"]))][1] == row["worldCommonMm3"] for row in observations),
                "Repeated-interface observations must identify the measured placed pairs")
        missing("interference", [row["pair"] for row in observations],
                "Identical solid definitions at the same relative placement yielded different common volumes. "
                "Reconcile the named pairs against the native issue and independent geometry evidence.")

    cache={}
    def witness(ref):
        file=pinned(root,ref)
        if file not in cache:
            cache[file]=read(file)
        record=cache[file]
        require(record.get("archiveSha256")==archive_sha and archive_sha is not None and record.get("stepSha256")==step_sha
                and record.get("configuration")==configuration,"Evidence names a different native issue or configuration")
        rows=record.get("observations",{})
        row=rows.get(ref.get("id"))
        require(isinstance(row,dict),"Missing named observation")
        refs=row.get("sources")
        require(isinstance(refs,list) and refs,"An observation must cite its underlying source artifacts")
        for source in refs:
            require(pinned(root,source)!=file,"A review cannot serve as its own supporting source")
        return row

    if not study.get("authority") or not study.get("lineage"):
        missing("native","source of truth","Identify the authoritative latest Fusion design and its one-way STEP issue.")
    else:
        from fusion_authority import verify,register_path
        authority=pinned(root,study["authority"])
        require(authority==register_path(root).resolve(),"A mechanical release must use the project's designated cad/fusion-authority.json")
        lineage=verify(root,authority,pinned(root,study["lineage"]))
        require(lineage["archiveSha256"]==archive_sha and lineage["stepSha256"]==step_sha and
                lineage["configuration"]==configuration,"Quality evidence must derive from the designated current Fusion source")
    native={}
    registered={}
    census={}
    pose_reviews=[]
    motion_ids=set()
    motion_ranges={}
    mission_ids=set()
    if study.get("reopen") and archive_sha:
        record=read(pinned(root,study["reopen"]))
        require(record.get("opened") is True and record.get("archiveSha256")==archive_sha and record.get("stepSha256")==step_sha and
                record.get("configuration")==configuration,"Reopen does not identify this native/STEP configuration")
        require(isinstance(record.get("transferMissions"),list) and all(named(i) for i in record["transferMissions"]),"Identify any scoped loaded transfer missions in the native duty register")
        mission_ids=set(record["transferMissions"])
        motion_ids=set(record["movingGroups"])
        motion_ranges=record.get("motionRanges",{})
        if set(motion_ranges)!=motion_ids:
            missing("sweep","native travel","Missing independently read native travel for one or more moving groups.")
        require(all(named(x) for x in motion_ids) and len(motion_ids)==len(record["movingGroups"]),"Invalid native moving groups")
        for occ in record["installedOccurrences"]:
            key=occ.get("path")
            require(named(key) and key not in native and isinstance(occ.get("solids"),list) and occ["solids"] and
                    isinstance(occ.get("worldTransform"),list) and len(occ["worldTransform"])==16 and
                    all(number(v) for v in occ["worldTransform"]),"Invalid or duplicate placed native occurrence")
            native[key]=occ
            actual=occ.get("worldBoundsMm",{})
            tolerance=study.get("reopenBoundsToleranceMm")
            if not number(tolerance) or tolerance<0 or set(actual)!=set(occ["solids"]):
                missing("native",key,"Native world bounds and a comparison tolerance are required for every solid.")
            else:
                for solid,b in actual.items():
                    if solid not in boxes or len(b)!=6 or not all(number(v) for v in b) or any(abs(x-y)>tolerance for x,y in zip(b,boxes[solid])):
                        finding("native","fail",solid,"Native and STEP solid extents differ at the selected pose.")
        assigned=Counter(b for row in native.values() for b in row["solids"])
        if set(assigned)!=bodies or any(q!=1 for q in assigned.values()):
            finding("native","fail","inventory","Reopened native body ownership differs from complete STEP solids.")
        registered={}
        for key,occ in native.items():
            names=occ.get("nativeBodyNames",{})
            require(set(names)==set(occ["solids"]),"Map every installed solid to its original Fusion body name")
            for solid,label in names.items():
                require(named(label) and (key,label) not in registered,"Ambiguous native identity")
                registered[(key,label)]=(solid,occ)
        saved_reference_valid=True
        saved_error=None
        saved_bytes_verified=False
        try:
            from native_contact_review import allowed_census,pose_path
            if not study.get("nativeCensus"):
                raise FileNotFoundError("No native cold census provided")
            source=pose_path(root,study["nativeCensus"])
            saved_bytes_verified=True
            census=read(source)
            require(isinstance(census,dict) and isinstance(census.get("bodies"),list)
                    and isinstance(census.get("pose"),dict) and census["pose"].get("id")=="saved",
                    "Invalid saved native body census")
            require(census.get("schema")=="agent-frc/fusion-body-census@1" and census.get("archiveSha256")==archive_sha and
                    allowed_census(census.get("programSha256")) and named(census.get("fusionVersion")),
                    "Unbound or stale native body census")
            observed=set()
            for body in census["bodies"]:
                key=(body["path"],body["name"])
                require(key not in observed and named(body["revision"]) and type(body["bodyLight"]) is bool and
                        type(body["occurrenceVisible"]) is bool,"Invalid native census row")
                observed.add(key)
                if key not in registered:
                    finding("native","fail",str(key),"Native body absent from installed inventory, irrespective of display visibility.")
                    continue
                solid,occ=registered[key]
                b=body.get("boundsMm",[])
                if solid not in boxes or len(b)!=6 or not all(number(x) for x in b) or not number(tolerance) or any(
                        abs(x-y)>tolerance for x,y in zip(b,boxes[solid])) or body.get("worldTransform")!=occ["worldTransform"]:
                    saved_reference_valid=False
                    finding("native","fail",solid,"Installed transform or world bounds disagree with the cold Fusion census.")
            if set(registered)!=observed or census["otherGeometry"]:
                saved_reference_valid=False
                finding("native","fail","complete physical inventory","Native solid register or unresolved mesh/surface differs from the release.")
        except (KeyError,ValueError,TypeError,OSError,AttributeError) as error:
            census={}
            saved_error=error
        from native_contact_review import verify as verify_native_contacts
        pose_reviews=verify_native_contacts(root,study,record,census,registered,finding,missing,
                                         saved_reference_valid=saved_reference_valid,saved_error=saved_error,
                                         saved_bytes_verified=saved_bytes_verified)
    else:
        missing("native","assembly","No measured reopen/STEP export occurrence reconciliation.")
    if geometry.get("nonSolidLeaves"):
        missing("native","surface occurrences","Separate or resolve non-solid leaves before claiming the complete installed geometry.")

    articles=study.get("articles",{})
    issues=study.get("installed",{})
    if not native or set(issues)!=set(native):
        missing("identity","installed occurrences","The expected occurrence register must match the independent native inventory.")
    material_checks=[]
    material_record=None
    if study.get("materialCensus"):
        material_record=read(pinned(root,study["materialCensus"]))
        require(material_record.get("schema")=="agent-frc/fusion-body-materials@1" and
                material_record.get("archiveSha256")==archive_sha and material_record.get("stepSha256")==step_sha,
                "Body material ledger differs from the selected native issue")
        require({(r["path"],r["name"]) for r in material_record["bodies"]}==
                {(o["path"],v) for o in native.values() for v in o["nativeBodyNames"].values()},
                "Material inventory must reconcile every actual placed native body")
    for key,occ in native.items():
        row=issues.get(key,{})
        article=articles.get(row.get("article"),{})
        if not article or row.get("transform")!=occ["worldTransform"] or article.get("id")!=occ.get("article") or not named(article.get("id")):
            missing("identity",key,"Exact installed article or expected world pose differs or is missing.")
            continue
        errors=geometry.get("componentDifferences",{})
        policy=article.get("shapeResolutionMm3")
        if not article.get("neutral") or set(occ.get("sourceSolids",{}))!=set(occ["solids"]) or not number(policy) or policy<0:
            missing("identity",key,"Missing source-solid comparison, source map or independent difference resolution.")
        else:
            model_neutral=pinned(root,article["neutral"])
            if digest(model_neutral)!=occ.get("neutralSha256"):
                finding("identity","fail",key,"Installed source neutral is not the registered component issue.")
            for solid in occ["solids"]:
                delta=errors.get(solid)
                if solid in study.get("componentSectionAxesWorld", {}):
                    from stock_sections import compare_limit
                    from placed_separation import direction
                    section = (delta or {}).get("stockSections", {})
                    axis = list(direction(study["componentSectionAxesWorld"][solid]))
                    decision = compare_limit(section, policy) if section.get("axisWorld") == axis else "open"
                    if decision == "fail":
                        finding("identity","fail",solid,"Planar stock sections exceed the registered source-shape resolution.")
                    elif decision == "open":
                        missing("identity",solid,"Unresolved commissioned stock sections: "+str(section.get("reason","insufficient resolution or missing sections")))
                if delta and delta.get("measurementStatus"):
                    missing("identity",solid,"Unresolved source-shape measurement: "+str(delta.get("reason","missing numerical evidence")))
                elif not delta or not all(number(delta.get(k)) and delta[k]>=0 for k in ("absentMm3","extraMm3")):
                    missing("identity",solid,"The installed solid has no measured bidirectional shape difference.")
                elif max(delta["absentMm3"],delta["extraMm3"])>policy:
                    finding("identity","fail",solid,"Installed solid differs from its exact component at the installed transform.")
        kind=article.get("kind")
        source=article.get("model")
        if not source or not article.get("revision") or not article.get("configuration"):
            missing("identity",key,"No revision, configuration or pinned component model.")
            continue
        model=pinned(root,source)
        if not all(occ.get(k)==article[k] for k in ("revision","configuration")) or occ.get("modelSha256")!=digest(model):
            finding("identity","fail",key,"Reopened occurrence references different component bytes, revision or option.")
        if kind=="purchased":
            from vendor_configuration import compare as vendor_compare
            selection=vendor_compare(root,article)
            if selection["status"]!="pass":
                finding("identity",selection["status"],key,"Supplier current purchase configuration versus as-drawn model: "+str(selection))
            if article.get("procurementBom"):
                procurement=read(pinned(root,article["procurementBom"]))
                expected=procurement.get("bodyMaterials")
                if not expected or not material_record:
                    missing("identity",key,"Purchased component needs supplier constituent data and cold Fusion physical properties.")
                else:
                    from fusion_body_materials import verify_expected
                    try:material_checks.extend(verify_expected(expected,material_record,occ))
                    except (ValueError,TypeError,KeyError) as e:finding("identity","fail",key,str(e))
            # Which supplier part and revision the model represents. Supplier CAD may be used and shown; no rights term is asked for.
            if not all(named(article.get(k)) for k in ("manufacturer","partNumber","manufacturerSource")) or article.get("representation")!="official-exact":
                missing("identity",key,"Purchased part needs the official exact model of its manufacturer, part number and source.")
        elif kind=="fabricated":
            if model.suffix.lower() not in (".f3d",".f3z") or not zipfile.is_zipfile(model) or not article.get("drawing") or not named(article.get("materialGrade")) or occ.get("editable") is not True:
                missing("identity",key,"Manufactured part needs an editable Fusion design, controlled drawing and grade.")
            else:
                drawing=read(pinned(root,article["materialSpecification"])) if article.get("materialSpecification") else None
                pinned(root,article["drawing"])
                if not drawing or not material_record:
                    missing("identity",key,"Fabricated material needs a source stock specification and cold native physical properties for each solid.")
                else:
                    from fusion_body_materials import verify_expected
                    require(len(occ["solids"])!=1 or {r.get("grade") for r in drawing["bodyMaterials"].values()}=={article["materialGrade"]},
                            "Governing drawing grade differs from fabricated article stock")
                    require(drawing["drawing"]==article["drawing"],"Fabrication stock specification refers to another drawing")
                    try:material_checks.extend(verify_expected(drawing["bodyMaterials"],material_record,occ))
                    except (ValueError,TypeError,KeyError) as e:finding("identity","fail",key,str(e))
        else:
            missing("identity",key,"Classify the installed article as purchased or fabricated.")

    if study.get("materialHistory"):
        from fusion_body_materials import compare_reissue
        history=read(pinned(root,study["materialHistory"]))
        require(history["current"]==study.get("materialCensus"),"Material continuity is attached to a different native census")
        continuity=compare_reissue(root,history)
        if continuity["ambiguousIdentities"]:
            missing("identity","material continuity","Resolve ambiguous source identities across the native reissue")
        for change in continuity["changes"]:
            missing("identity",change["path"]+"/"+change["name"],"Unreviewed physical-material change from "+change["previous"]+" to "+change["current"])
    if material_checks:
        from fusion_body_materials import stock_results
        for reason in stock_results(material_checks):
            finding("identity","fail","constitutive material and density",reason)
    evidence_plan={}
    roster_review=None
    spatial_results=[]
    allowance={}
    for item in study.get("mating",[]):
        key=tuple(sorted(item["pair"]))
        require(len(key)==2 and key[0]!=key[1] and set(key)<=bodies and key not in allowance and
                number(item.get("maxMm3")) and item["maxMm3"]>=0 and named(item.get("fit")),"Invalid pair-specific fit limit")
        proof=witness(item["evidence"])
        require(proof.get("kind")=="intended-fit" and sorted(proof.get("pair",[]))==list(key) and
                proof.get("fit")==item["fit"] and proof.get("maxMm3")==item["maxMm3"] and named(proof.get("basis")),
                "Fit allowance does not match the independently identified pair and limit")
        allowance[key]=item["maxMm3"]
    if study.get("operatingRequirements") and study.get("reopen"):
        from source_joint_roster import intended
        from interface_consistency import measure as check_interface
        from showcase_contacts import load_solids
        try:evidence_plan=intended(root,study,read(pinned(root,study["reopen"])))
        except (ValueError,KeyError,TypeError,OSError) as e:
            evidence_plan={}
            missing("native","commissioned interface coverage",str(e))
        if evidence_plan:
            from article_functions import compare
            try:
                target=evidence_plan.get("articleFunctions")
                roster=read(pinned(root,target))
                differences=compare(roster,native,evidence_plan["authorityId"],configuration)
                roster_review={"architecture":roster["architecture"],"rosterSha256":target["sha256"],
                               "plannedOccurrences":len(roster["occurrences"]),"observedOccurrences":len(native),
                               "differences":len(differences)}
                for path,reason in differences:
                    finding("identity","fail",path,reason)
            except (ValueError,KeyError,TypeError,OSError) as e:
                missing("identity","commissioned article functions",str(e))
        mount_shapes={}
        if study.get("nativeCensus") and evidence_plan:
            from mount_datums import verify as verify_mounts
            from showcase_contacts import load_solids
            try:
                mount_shapes=load_solids(step)[0] if evidence_plan.get("mountDatums") else {}
                purchased=[path for path,obj in native.items() if articles.get(obj.get("article"),{}).get("kind")=="purchased"]
                verify_mounts(evidence_plan,native,census["bodies"],mount_shapes,purchased=purchased)
            except (ValueError,KeyError,OSError,TypeError,RuntimeError) as e:
                missing("native","commissioned mounting datums",str(e))
        from fastener_stack import review as check_stacks
        try:
            stack_roster=evidence_plan.get("fastenerStacks")
            stack_shapes=dict.fromkeys(bodies)
            if isinstance(stack_roster,dict) and stack_roster.get("stacks"):
                stack_shapes=mount_shapes or load_solids(step)[0]
            owners={solid:row["article"] for row in native.values() for solid in row["solids"]}
            for result in check_stacks(root,stack_roster,stack_shapes,step_sha,owners=owners):
                if result["status"]!="pass":
                    finding("interference",result["status"],result["screw"],json.dumps(result))
        except (KeyError,ValueError,TypeError,RuntimeError,OSError) as error:
            missing("interference","installed fastener stacks",str(error))
        native_regions=census.get("pose",{}).get("spatialFits",[])
        if "spatialFits" in evidence_plan or native_regions:
            from spatial_fit import review as check_regions
            try:
                cases=evidence_plan.get("spatialFits",[])
                require(isinstance(cases,list),"Commission a list of spatial fits")
                planned=[case["commission"] for case in cases]
                require(len(planned)==len(native_regions) and all(planned.count(item)==native_regions.count(item)==1 for item in planned),
                        "The commissioned spatial fit roster differs from the cold native pose")
                if cases:
                    require(study.get("nativeCensus") and native,"A commissioned spatial fit requires the exact cold body census")
                    spatial_results=check_regions(root,cases,mount_shapes or load_solids(step)[0],
                                                  registered,census,archive_sha,step_sha,configuration,allowance)
                    for row in spatial_results:
                        if row["status"]!="pass": finding("interference",row["status"],row["case"],row["reason"])
                else:
                    require(isinstance(cases,list),"Commission a list of spatial fits")
            except (KeyError,ValueError,TypeError,OSError,RuntimeError) as error:
                missing("interference","commissioned spatial fits",str(error))
        checks=evidence_plan.get("numericalInterfaces")
        if not isinstance(checks,dict):
            missing("interference","registered numerical discrepancies","Commission the known numerically ambiguous pairs, or explicitly record an empty inventory.")
        elif checks:
            shapes=load_solids(step)[0]
            for name,case in checks.items():
                require(case["archiveSha256"]==archive_sha and case["stepSha256"]==step_sha and
                        case["maxOverlapMm3"]==allowance.get(tuple(sorted(case["pair"])),0),
                        "Numerical control differs from this assembly or its independently qualified fit allowance")
                try:
                    result=check_interface(shapes,case)
                    if result["status"]!="pass":
                        finding("interference",result["status"],name,f"Measured common {result['directCommonMm3']} mm³, interior lower bound {result['certifiedLowerBoundMm3']:.9g} mm³, available-material upper bound {result['commonUpperBoundMm3']} mm³, numerical consistency {result['numericallyConsistent']}. {', '.join(result['errors'])}")
                except (ValueError,KeyError,TypeError,RuntimeError) as e:
                    missing("interference",name,"Unresolved registered numerical control: "+str(e))
    for (a,b),(gap,vol) in pairs.items():
        if vol is None:
            detail=unresolved[(a,b)]
            missing("interference",[a,b],f"Unresolved STEP intersection: {detail['reason']}. Raw volume: {detail['rawCommonMm3']} mm³. Check the corresponding native pair.")
            continue
        limit=allowance.get((a,b),0)
        if vol>limit:
            finding("interference","fail",[a,b],f"{vol:.9g} mm³ common material exceeds {limit:.9g} mm³.")

    geometric=components(bodies,[pair for pair,(gap,_) in pairs.items() if gap<=tol])
    structural=[]
    for joint in study.get("connections",[]):
        a,b=joint["pair"]
        require(a!=b and a in bodies and b in bodies,"Connection names an unknown or repeated solid")
        proof=witness(joint["evidence"])
        require(proof.get("kind")=="retained-joint" and sorted(proof.get("pair",[]))==sorted([a,b]) and
                named(proof.get("mechanism")) and named(proof.get("loadPath")) and named(proof.get("inspection")),
                "A retained path needs its actual two bodies, mechanism, load path and inspection basis")
        gap=pairs[tuple(sorted((a,b)))][0]
        limit=proof.get("maxInterfaceGapMm")
        require(number(limit) and limit>=0,"Supply an engineering interface gap limit")
        if gap>limit:
            finding("retention","fail",[a,b],f"Required joint interface is separated by {gap:.9g} mm, exceeding {limit:.9g} mm.")
            continue
        if gap>0:
            missing("retention",[a,b],"Nominal air space cannot carry load. Register the intervening physical hardware or the actual load-seated contact.")
            continue
        if proof.get("interface")=="planar-seat":
            minimum=proof.get("minBearingAreaMm2")
            actual=next((r["area"] for r in geometry.get("seatAreasMm2",[]) if sorted(r["pair"])==sorted([a,b])),None)
            if not number(minimum) or minimum<=0 or not number(actual) or actual<minimum:
                finding("retention","fail",[a,b],"The required opposed bearing area is absent or insufficient.")
                continue
        elif proof.get("interface")=="qualified-joint":
            qualification=proof.get("jointResult")
            if not qualification:
                missing("retention",[a,b],"Missing separately qualified joint load path.")
                continue
            observed=read(pinned(root,qualification))
            if observed.get("status")!="pass" or observed.get("stepSha256")!=step_sha or observed.get("archiveSha256")!=archive_sha or sorted(observed.get("pair",[]))!=sorted([a,b]):
                finding("retention","fail",[a,b],"Separate joint qualification failed or identifies a different assembly.")
                continue
        else:
            missing("retention",[a,b],"Identify and qualify the physical load-transfer interface.")
            continue
        from joint_sources import verify as verify_joint_sources
        try:
            sources=list(proof["sources"])
            if proof.get("jointResult"):
                sources.append(proof["jointResult"])
            verify_joint_sources(root,sources,[a,b],archive_sha,step_sha,configuration,proof.get("interface")=="qualified-joint")
        except (ValueError,KeyError,TypeError,OSError) as e:
            finding("retention","fail",[a,b],str(e))
            continue
        if proof.get("verified") is True:
            structural.append((a,b))
        else:
            finding("retention","fail" if proof.get("verified") is False else "open",[a,b],"Retained connection was not established.")
    anchor=study.get("chassisAnchor")
    if anchor not in bodies:
        missing("retention","assembly","Identify a measured chassis solid.")
    retained=components(bodies,structural)
    for group in retained:
        if anchor not in group:
            missing("retention",group,"No registered load-bearing connection to the chassis anchor.")
    route_results={}
    route_plan=evidence_plan.get("structuralRoutes")
    if not isinstance(route_plan,dict):
        missing("retention","structural duty inventory","Independently nominate structural chassis routes for loaded mounts, or state that none are claimed.")
    elif route_plan:
        from structural_path import evaluate as structural_check
        from showcase_contacts import load_solids
        installed=load_solids(step)[0];edges={frozenset(x) for x in structural}
        mass_rows=read(pinned(root,study["materialCensus"]))["bodies"] if study.get("materialCensus") else []
        native_masses={(r["path"],r["name"]):r["massKg"] for r in mass_rows}
        solid_mass={solid:native_masses[(path,name)] for path,occ in native.items()
                    for solid,name in occ.get("nativeBodyNames",{}).items() if (path,name) in native_masses}
        for name,route in route_plan.items():
            try:
                result=structural_check(root,route,installed,edges,anchor,archive_sha,step_sha,masses=solid_mass)
                route_results[name]=[dict(time=r["time"],status=r["status"],support=r["normalSupportLimits"],residualsN_Nmm=r["residualsN_Nmm"]) for r in result["loadCases"]]
                if result["status"]!="pass":finding("retention",result["status"],name,"No demonstrated balance of all simultaneous forces and moments on the qualified installed chassis route.")
            except (ValueError,KeyError,TypeError,OSError,RuntimeError) as e:
                missing("retention",name,str(e))
    # Numeric checks use project limits, part/operation identities and observed adverse cases.
    # A digest binds the source; the measured value, units, case and subjects must also match.
    required_domains={"sweep","shop","assembly","service","strength","stiffness","impact","fatigue"}
    duties=study.get("duties",[])
    seen_domains=set()
    governed=set()
    run_files={}
    swept=set()
    required_basis={
        "shop":("process","material","tool","access","datums","toleranceStack"),
        "assembly":("joint","assemblyOrder","toolApproach","retention","inspection"),
        "service":("removalPath","toolAccess","replacement","reinspection"),
        "strength":("loadPath","loadCase","material","allowableBasis","boundary","uncertainty"),
        "stiffness":("loadPath","loadCase","displacementBudget","boundary","uncertainty"),
        "impact":("contactDirection","loadCase","energyOrForceBasis","retainedFunction","uncertainty"),
        "fatigue":("dutySpectrum","cyclesRequired","lifeBasis","material","stressConcentration","uncertainty"),
        "sweep":("geometry","operatingRange","boundOrSolver","control")
    }
    duty_ids=[d["id"] for d in duties]
    require(len(set(duty_ids))==len(duty_ids),"Duplicate duty ID")
    for duty in duties:
        domain=duty["domain"]
        require(domain in required_domains and named(duty.get("id")) and named(duty.get("case")) and named(duty.get("basis")) and
                isinstance(duty.get("subjects"),list) and duty["subjects"] and set(duty["subjects"])<=bodies,"Invalid duty scope")
        seen_domains.add(domain)
        governed.update(duty["subjects"])
        if not duty.get("observation"):
            missing(domain,duty["id"],"Missing measured or calculated case.")
            continue
        obs=witness(duty["observation"])
        require(obs.get("kind")==domain and obs.get("case")==duty["case"] and sorted(obs.get("subjects",[]))==sorted(duty["subjects"]) and
                obs.get("duty")==duty["id"] and named(obs.get("method")),"Duty evidence differs from its actual case/subjects")
        for source in obs["sources"]:
            underlying=pinned(root,source)
            if underlying.suffix.lower()==".json":
                measured=read(underlying)
                if isinstance(measured,dict) and measured.get("schema")=="agent-frc/mechanical-measurements@1":
                    require(measured.get("configuration")==configuration and measured.get("archiveSha256")==archive_sha and
                        measured.get("stepSha256")==step_sha and isinstance(measured.get("measurements"),dict),
                        "A cited trial register identifies a different source or configuration")
                    run_files[source["sha256"]]=measured
                if isinstance(measured,dict) and (measured.get("status") in ("fail","open") or
                        measured.get("schema")=="agent-frc/mechanical-motion-result@1" and
                        (measured.get("stepSha256")!=step_sha or any(r.get("status")!="pass" for r in measured["cases"]))):
                    finding(domain,"fail",duty["id"],"Underlying engineering run failed, remains open, or uses different geometry.")
        if not all(named(obs.get("inputs",{}).get(field)) for field in required_basis[domain]):
            missing(domain,duty["id"],"Missing engineering basis: "+", ".join(k for k in required_basis[domain] if not named(obs.get("inputs",{}).get(k))))
        if domain=="sweep":
            groups=set(obs.get("movingGroups",[]))
            if not groups<=motion_ids or (motion_ids and not groups) or (motion_ids and obs.get("coverage")=="fixed-assembly"):
                missing(domain,duty["id"],"Sweep does not identify installed moving groups.")
            if obs.get("coverage") in ("continuous","conservatively-bounded"):
                swept.update(groups)
        if domain=="sweep" and obs.get("coverage") not in ("continuous","conservatively-bounded","fixed-assembly"):
            missing(domain,duty["id"],"Discrete poses leave the intermediate path unknown.")
            continue
        if obs.get("disposition")=="inapplicable":
            if domain=="sweep" and not motion_ids and obs.get("coverage")=="fixed-assembly" and named(obs.get("basis")):
                continue
            missing(domain,duty["id"],"An unsupported exemption cannot establish the case.")
            continue
        value=obs.get("value")
        lo,hi=duty.get("min"),duty.get("max")
        require(named(duty.get("unit")) and obs.get("unit")==duty["unit"] and
                (lo is not None or hi is not None) and all(x is None or number(x) for x in (lo,hi)) and
                (lo is None or hi is None or lo<=hi),"Invalid duty units or limits")
        if number(value):
            observation=obs.get("measurement",{})
            require(observation in obs["sources"] and named(observation.get("pointer")) and observation["pointer"].startswith("/"),
                    "Value must point into a pinned original analysis or measurement")
            original=read(pinned(root,observation))
            require(original.get("schema")=="agent-frc/mechanical-measurements@1" and isinstance(original.get("measurements"),dict),
                    "Use a complete issued case register for numeric measurements")
            run_files[observation["sha256"]]=original
            require(len(observation["pointer"].split("/"))==4 and observation["pointer"].startswith("/measurements/") and observation["pointer"].endswith("/value"),"Measurement is outside the issued case register")
            require(original.get("configuration")==configuration and original.get("archiveSha256")==archive_sha and
                    original.get("stepSha256")==step_sha,"Original run uses a different robot configuration")
            source_value=original
            measured_row=None
            for token in observation["pointer"][1:].split("/"):
                token=token.replace("~1","/").replace("~0","~")
                measured_row=source_value
                source_value=source_value[int(token)] if isinstance(source_value,list) else source_value[token]
            require(isinstance(measured_row,dict) and measured_row.get("duty")==duty["id"] and measured_row.get("case")==duty["case"]
                    and measured_row.get("unit")==duty["unit"] and sorted(measured_row.get("subjects",[]))==sorted(duty["subjects"]),
                    "Original result does not represent the same duty, units, subjects and case")
            require(all(measured_row.get(k,v)==v for k,v in (("stepSha256",step_sha),("archiveSha256",archive_sha),("configuration",configuration))),
                    "Original measured row conflicts with the issued revision or configuration")
            if domain=="sweep" and motion_ids:
                reached=measured_row.get("motionRanges",{})
                if "samples" in measured_row:
                    samples=measured_row["samples"]
                    for g in groups:
                        trace=[point.get(g) for point in samples]
                        if not trace or not all(number(v) for v in trace) or [min(trace),max(trace)]!=motion_ranges.get(g):
                            missing("sweep",g,"Published motion samples do not traverse the identified native range.")
                if set(reached)!=groups or any(not isinstance(motion_ranges.get(g),list) or len(motion_ranges[g])!=2
                    or not all(number(v) for v in motion_ranges[g]) or motion_ranges[g][0]>=motion_ranges[g][1]
                    or reached.get(g)!=motion_ranges[g] for g in groups) or measured_row.get("coverage")!=obs.get("coverage"):
                    missing("sweep",duty["id"],"Original executed moving ranges do not span the native travel.")
            require(number(source_value) and source_value==value,"Reported value differs from original numerical evidence")
        if not number(value):
            missing(domain,duty["id"],"No finite measured value.")
        elif (lo is not None and value<lo) or (hi is not None and value>hi):
            finding(domain,"fail",duty["id"],f"Observed {value} {duty['unit']} outside registered interval [{lo},{hi}].")
    covered={(d["id"],d["case"],tuple(sorted(d["subjects"])),d.get("unit")):d for d in duties if d.get("observation")}
    for original in run_files.values():
        for raw in original["measurements"].values():
            require(all(raw.get(k,v)==v for k,v in (("stepSha256",step_sha),("archiveSha256",archive_sha),("configuration",configuration))),
                "A cited trial contradicts its source revision")
            identity=(raw.get("duty"),raw.get("case"),tuple(sorted(raw.get("subjects",[]))),raw.get("unit"))
            if identity not in covered:
                missing("build",raw.get("case"),"An original issued adverse case is absent from the evaluated duty roster.")
            else:
                d=covered[identity];v=raw.get("value")
                if not number(v) or v<d.get("min",-math.inf) or v>d.get("max",math.inf):
                    finding(d["domain"],"fail",raw.get("trial",d["id"]),"A trial in the original case register fails the registered interval.")
    structural_subjects={b for d in duties if d["domain"] in ("strength","stiffness","impact","fatigue") and d.get("observation") for b in d["subjects"]}
    joint_subjects={b for d in duties if d["domain"] in ("assembly","service","shop") and d.get("observation") for b in d["subjects"]}
    if bodies-structural_subjects or bodies-joint_subjects:
        missing("build",sorted((bodies-structural_subjects)|(bodies-joint_subjects)),"Installed body missing structural or production/attachment duty coverage.")
    if bodies-governed:
        missing("build",sorted(bodies-governed),"Installed occurrences absent from all engineering duty subjects.")
    if swept!=motion_ids:
        missing("sweep",sorted(motion_ids-swept),"Installed motion remains without full-travel evidence.")
    for domain in sorted(required_domains-seen_domains):
        missing(domain,"assembly","No registered, investigated duty.")
    for disposition in ("engineering","build"):
        scope=study.get("coverage",{}).get(disposition)
        if not scope or not archive_sha:
            missing(disposition,"coverage","No independent review of complete installed scope and omitted duties.")
            continue
        observed=witness(scope)
        need={"sweep"} if disposition=="engineering" else required_domains
        expected=sorted(d["id"] for d in duties if d["domain"] in need)
        # A scope review may record the digest of the criteria it read. It is compared when present and never required.
        if observed.get("criteriaSha256") not in (None,scope_digest(study)) or observed.get("kind")!="scope-review" or observed.get("scope")!=disposition or observed.get("complete") is not True or not named(observed.get("reviewer")) or not named(observed.get("basis")) or sorted(observed.get("bodies",[]))!=sorted(bodies) or sorted(observed.get("duties",[]))!=expected:
            missing(disposition,"coverage","Independent coverage did not reconcile all installed solids and registered duties.")
    motion_model=None
    if native and any(r["status"] in ("rejected","unavailable") for r in pose_reviews):
        missing("native","installed kinematics","Restore the unavailable or rejected native pose receipts before evaluating joint travel.")
    elif native:
        from assembly_kinematics import native_model
        try:
            motion_model=native_model(root,study)
            if motion_model.get("linked"):
                from linked_motion import duty_sweep
                from source_joint_roster import intended
                intent=intended(root,study,read(pinned(root,study["reopen"])))
                result=duty_sweep(root,study,motion_model,intent)
                for case in result["cases"]:
                    if case["status"]!="pass":
                        finding("sweep",case["status"],case["case"],"Linked operating sequence has unresolved clearance or interference.")
        except (ValueError,KeyError,TypeError,OSError) as e:
            missing("native","installed kinematics",str(e))
    transfer_results={}
    transfers=study.get("transferClaims")
    if not isinstance(transfers,dict) or set(transfers)!=mission_ids:
        missing("build","loaded transfer","The selected physical handoffs must have measured loaded clearance, delivery and recovery cases.")
    else:
        for name,ref in transfers.items():
            from loaded_transfer import replay
            test=read(pinned(root,ref))
            require(test["id"]==name and test["step"]==study["step"],"Loaded transfer names another mechanism or installed assembly")
            from source_joint_roster import intended
            from transfer_mission import commissioned
            try:
                reopen=read(pinned(root,study["reopen"]))
                plan=intended(root,study,reopen)
                mission=commissioned(plan,study,test,reopen)
                result=replay(root,test,motion_model=motion_model,mission=mission)
            except (KeyError,TypeError,ValueError,OSError) as e:
                missing("build",name,str(e))
                continue
            transfer_results[name]=[{k:c[k] for k in ("id","status","corridorStatus","executionStatus","executionReason","terminalInside","endBoundsMm","trajectoryEvidence")} for c in result["cases"]]
            if result["status"]!="pass":
                reasons=[c["id"]+": "+c["executionReason"] for c in result["cases"] if c["executionStatus"]!="pass"]
                finding("build",result["status"],name,"Loaded delivery and jam-reset remain unqualified. "+"; ".join(reasons))
    external=study.get("externalIssues")
    if not isinstance(external,list) or len(external)!=len(set(external)):
        missing("build","external findings","Reconcile the explicit external defect register; use an empty list if none were found.")
    elif external:
        if not study.get("issueRegister") or not study.get("issueResult"):
            missing("build",external,"Missing installed-method negative controls and candidate reruns.")
        else:
            from mechanical_methods import digest_study
            issue_study=read(pinned(root,study["issueRegister"]))
            issue_result=read(pinned(root,study["issueResult"]))
            ids=[r["id"] for r in issue_result.get("issues",[])]
            require(issue_result.get("schema")=="agent-frc/mechanical-issues-result@1" and
                    issue_result.get("studySha256")==digest_study(issue_study) and issue_result.get("archiveSha256")==archive_sha and
                    issue_result.get("stepSha256")==step_sha and sorted(ids)==sorted(external) and
                    issue_result.get("engineSha256")==digest(Path(__file__).with_name("mechanical_methods.py")) and
                    issue_result.get("pluginVersion")==read(Path(__file__).resolve().parents[1]/"plugin.json")["version"],
                    "Stale or incomplete first-party issue register")
            for row in issue_result["issues"]:
                if row["status"]!="pass":
                    finding("build","fail",row["id"],"Installed method did not distinguish the failing control from the corrected candidate.")
    any_failure=any(row["status"]=="fail" for row in findings)
    engineering_domains={"native","identity","interference","retention","sweep","engineering"}
    publication="fail" if any_failure else "open" if any(r["domain"] in engineering_domains for r in findings) else "pass"
    build="fail" if any_failure else "open" if findings else "pass"
    return {"schema":"agent-frc/mechanical-readiness-result@1","configuration":configuration,"archiveSha256":archive_sha,"stepSha256":step_sha,
            "solids":len(bodies),"measuredPairs":len(pairs),"geometricGroups":geometric,"retainedGroups":retained,"articleFunctions":roster_review,"structuralRoutes":route_results,"loadedTransfers":transfer_results,
            "nativePoseReviews":pose_reviews,"spatialFits":spatial_results,"engineeringGeometry":publication,"showcaseEligibility":build,"buildReadiness":build,"findings":findings}


def inspect_archive(path):
    """Recognize the registered archive as a native Fusion design with BRep content."""
    require(zipfile.is_zipfile(path),"Unrecognized Fusion archive")
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if path.suffix.lower()==".f3z":
            require(any(n.lower().endswith(".f3d") for n in names),"Fusion distributed design contains no native design")
            return
        root="FusionAssetName[Active]/"
        require(all(n in names and z.getinfo(n).file_size>0 for n in ("Manifest.dat",root+"Manifest.dat",root+"FusionDesignSegmentType1/BulkStream.dat"))
                and any(n.startswith(root+"Breps.BlobParts/") and n.endswith((".smb",".smbh")) and z.getinfo(n).file_size>0 for n in names),
                "Archive has no recognized native Fusion design and BRep content")


def issue_scope(root,study):
    """Identify the numbered design a passing review belongs to. Native observations are accepted as recorded."""
    inspect_archive(pinned(root,study["archive"]))
    from source_joint_roster import intended
    intent=intended(root,study,read(pinned(root,study["reopen"])))
    from fusion_authority import active_design
    base,active=active_design(root)
    if active:
        scope=intent.get("publicationScope")
        require(scope in ("whole-robot","subsystem"),"Commission the numbered design's publication scope")
        return {"number":active["number"],"id":active["id"],"openingSha256":digest(base.parent/"iteration.json"),
                "kind":scope,"authoritySha256":study["authority"]["sha256"],"lineageSha256":study["lineage"]["sha256"]}


def review(root,study,geometry=None):
    """The verdict rests on the registered evidence alone. No key, signature or environment variable takes part."""
    result=evaluate_inputs(root,study,geometry)
    if result["showcaseEligibility"]=="pass":
        try:
            result["iteration"]=issue_scope(root.resolve(),study)
        except (ValueError,KeyError,TypeError,OSError) as e:
            result["buildReadiness"]="open";result["showcaseEligibility"]="open"
            result["findings"].append({"domain":"native","status":"open","subject":"native archive and design scope","reason":str(e)})
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command",choices=["measure","review"])
    parser.add_argument("project",type=Path)
    parser.add_argument("study")
    parser.add_argument("--output",type=Path)
    parser.add_argument("--require-publication",action="store_true")
    parser.add_argument("--require-build-ready",action="store_true")
    parser.add_argument("--source-sha256")
    parser.add_argument("--archive-sha256")
    parser.add_argument("--deliver", action="append",default=[],help="Retired: the design review page is the one published view. Accepted and ignored")
    parser.add_argument("--rescan",action="store_true")
    args=parser.parse_args()
    root=args.project.resolve()
    study=read(project_path(root,args.study))
    qualified=args.require_publication or args.require_build_ready
    fresh=scan(root,study) if args.command=="measure" or args.rescan or qualified else None
    if qualified and args.command=="review":
        require(fresh==read(pinned(root,study["geometry"])),"Registered geometry differs from a fresh complete STEP scan")
    report=fresh if args.command=="measure" else review(root,study,fresh)
    if args.source_sha256:
        require(report.get("stepSha256")==args.source_sha256,"Proposed release differs from displayed STEP")
    if args.archive_sha256:
        require(report.get("archiveSha256")==args.archive_sha256,"Proposed release differs from downloadable Fusion archive")
    if (args.require_publication or args.require_build_ready) and study.get("externalIssues") and report.get("showcaseEligibility")=="pass":
        from mechanical_methods import run
        fresh=run(root,read(pinned(root,study["issueRegister"])))
        require(fresh==read(pinned(root,study["issueResult"])) and fresh["status"]=="pass","Installed detector replay differs from the issue receipt")
    if args.deliver:
        print("Note: --deliver does nothing now. The separate published mesh, still and animated model it compared are retired; the design review page is the one viewer.",file=sys.stderr)
    output=json.dumps(report,indent=2,allow_nan=False)+"\n"
    if args.output:
        with args.output.open("x",encoding="utf-8") as stream:
            stream.write(output)
    else:
        print(output,end="")
    return int((args.require_publication and report.get("showcaseEligibility")!="pass") or
               (args.require_build_ready and report.get("buildReadiness")!="pass"))


if __name__=="__main__":
    try:
        sys.exit(main())
    except (KeyError,ValueError,TypeError,OSError,ImportError) as error:
        sys.exit(str(error))
