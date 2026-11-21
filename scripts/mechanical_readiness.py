"""Review a proposed complete robot release against its exact placed geometry and registered engineering duties."""
import argparse
from collections import Counter
from hashlib import file_digest, sha256
import json
import math
from pathlib import Path
import sys
import zipfile

from showcase_contacts import candidate_pairs, measure


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path):
    with path.open("rb") as source:
        return file_digest(source, "sha256").hexdigest()


def named(value):
    return isinstance(value, str) and bool(value.strip())


def number(value):
    return type(value) in (float, int) and math.isfinite(value)


def require(condition, text):
    if not condition:
        raise ValueError(text)


def project_path(root, name):
    require(named(name) and not Path(name).is_absolute(), "Use a project-relative file")
    result = (root/name).resolve()
    require(result.is_relative_to(root) and result.is_file(), "Unresolved project file: "+name)
    return result


def pinned(root, ref):
    require(isinstance(ref, dict), "Missing revision-bound file")
    target = project_path(root,ref.get("file"))
    require(digest(target)==ref.get("sha256"), "Changed evidence: "+ref["file"])
    return target


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
    step = pinned(root,study["step"])
    tolerance=study["contactToleranceMm"]
    require(number(tolerance) and tolerance>=0, "Invalid contact reporting tolerance")
    probes={tuple(sorted(j["pair"])) for j in study.get("connections",[])}
    result=measure(step,tolerance,probes,volumes=True)
    requests=component_inputs(root,study)
    if requests:
        from component_shape import compare_components
        result["componentDifferences"]=compare_components(step,requests)
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
    required=candidate_pairs(boxes,tol,probes)
    pairs={}
    for row in geometry["pairs"]:
        require(isinstance(row,list) and len(row)==4,"Missing pair volume")
        a,b,gap,vol=row
        pair=tuple(sorted((a,b)))
        require(pair not in pairs and pair in required and number(gap) and gap>=0 and number(vol) and vol>=0,
                "Invalid/repeated solid pair")
        pairs[pair]=(gap,vol)
    require(set(pairs)==required,"Incomplete broad-phase pair measurements")

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
        from fusion_authority import verify
        authority=pinned(root,study["authority"])
        require(authority==(root/"cad/fusion-authority.json").resolve(),"A mechanical release must use the project's designated cad/fusion-authority.json")
        lineage=verify(root,authority,pinned(root,study["lineage"]))
        require(lineage["archiveSha256"]==archive_sha and lineage["stepSha256"]==step_sha and
                lineage["configuration"]==configuration,"Quality evidence must derive from the designated current Fusion source")
    native={}
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
        if not study.get("nativeCensus"):
            missing("native","cold census","A complete census from the installed native Fusion inspection is required.")
        else:
            from native_contact_review import allowed_census
            census=read(pinned(root,study["nativeCensus"]))
            require(census.get("schema")=="agent-frc/fusion-body-census@1" and census.get("archiveSha256")==archive_sha and
                    allowed_census(census.get("programSha256")) and named(census.get("fusionVersion")),
                    "Unbound or stale native body census")
            registered={}
            for key,occ in native.items():
                names=occ.get("nativeBodyNames",{})
                require(set(names)==set(occ["solids"]),"Map every installed solid to its original Fusion body name")
                for solid,label in names.items():
                    require(named(label) and (key,label) not in registered,"Ambiguous native identity")
                    registered[(key,label)]=(solid,occ)
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
                    finding("native","fail",solid,"Installed transform or world bounds disagree with the cold Fusion census.")
            from native_contact_review import verify as verify_native_contacts
            verify_native_contacts(root,study,record,census,registered,finding,missing)
            if set(registered)!=observed or census["otherGeometry"]:
                finding("native","fail","complete physical inventory","Native solid register or unresolved mesh/surface differs from the release.")
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
        if article.get("rights") not in ("exact-redistribution","derived-views-only","private-master"):
            missing("identity",key,"Record item-level distribution scope and authority.")
        if not named(article.get("rightsBasis")):
            missing("identity",key,"No source for the granted asset rights.")
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
                if not delta or not all(number(delta.get(k)) and delta[k]>=0 for k in ("absentMm3","extraMm3")):
                    missing("identity",solid,"The installed solid has no measured bidirectional shape difference.")
                elif max(delta.values())>policy:
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
            if not all(named(article.get(k)) for k in ("manufacturer","partNumber","manufacturerSource","rights")) or article.get("representation")!="official-exact":
                missing("identity",key,"Purchased part needs the official exact model and item-level rights.")
        elif kind=="fabricated":
            if model.suffix.lower() not in (".f3d",".f3z") or not zipfile.is_zipfile(model) or not article.get("drawing") or not named(article.get("materialGrade")) or occ.get("editable") is not True:
                missing("identity",key,"Manufactured part needs an editable Fusion design, controlled drawing and grade.")
            else:
                drawing=read(pinned(root,article["materialSpecification"])) if article.get("materialSpecification") else None
                pinned(root,article["drawing"])
                if not drawing or not material_record:
                    missing("identity",key,"Fabricated material needs a source stock specification and signed cold physical properties for each solid.")
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
    for (a,b),(gap,vol) in pairs.items():
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
        if observed.get("criteriaSha256")!=scope_digest(study) or observed.get("kind")!="scope-review" or observed.get("scope")!=disposition or observed.get("complete") is not True or not named(observed.get("reviewer")) or not named(observed.get("basis")) or sorted(observed.get("bodies",[]))!=sorted(bodies) or sorted(observed.get("duties",[]))!=expected:
            missing(disposition,"coverage","Independent coverage did not reconcile all installed solids and registered duties.")
    motion_model=None
    if native:
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
    transfers=study.get("transferClaims")
    if not isinstance(transfers,dict) or set(transfers)!=mission_ids:
        missing("build","loaded transfer","The selected physical handoffs must have measured loaded clearance, delivery and recovery cases.")
    else:
        for name,ref in transfers.items():
            from loaded_transfer import replay
            test=read(pinned(root,ref))
            require(test["id"]==name and test["step"]==study["step"],"Loaded transfer names another mechanism or installed assembly")
            result=replay(root,test,motion_model=motion_model)
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
            "solids":len(bodies),"measuredPairs":len(pairs),"geometricGroups":geometric,"retainedGroups":retained,
            "engineeringGeometry":publication,"showcaseEligibility":build,"buildReadiness":build,"findings":findings}


def review(root,study,geometry=None):
    result=evaluate_inputs(root,study,geometry)
    if result["showcaseEligibility"]=="pass":
        from native_station_verify import verify as verify_station
        try:
            verify_station(root.resolve(),study)
        except (ValueError,KeyError,TypeError,OSError) as e:
            result["buildReadiness"]="open";result["showcaseEligibility"]="open"
            result["findings"].append({"domain":"native","status":"open","subject":"trusted native witness","reason":str(e)})
    return result


def verify_render_mesh(root,study,receipt,mesh):
    from mesh_correspondence import compare
    result=compare(pinned(root,study["step"]),mesh,receipt.get("chordMm"),receipt.get("angleRad",.5))
    require(result["status"]=="pass" and result["solids"]==receipt.get("solids") and result["triangles"]==receipt.get("triangles"),
        "Displayed mesh differs from the fresh complete placed source: "+str((result["missingFacets"],result["extraFacets"],result["solids"])))
    return result


def verify_delivery(root,study,files):
    release=study.get("distribution",{})
    require(release.get("configuration")==study["configuration"] and
            release.get("archiveSha256")==study["archive"]["sha256"] and release.get("stepSha256")==study["step"]["sha256"] and
            named(release.get("approvedBy")),"Distribution register does not identify the reviewed issue")
    allowed={}
    for ref in release.get("files",[]):
        file=pinned(root,ref)
        require(file not in allowed and named(ref.get("rightsBasis")) and ref.get("scope") in ("native","neutral","render","mesh"),
                "Each derivative needs an exact reviewed identity and redistribution basis")
        allowed[file]=ref
    checked_meshes=set()
    projected=set()
    delivered={project_path(root,f) for f in files}
    for path,entry in allowed.items():
        if path.suffix.lower()==".json":
            data=read(path)
            if isinstance(data,dict) and data.get("schema") in ("agent-frc/cad-still@1","agent-frc/cad-still@2"):
                require(data.get("sourceSha256")==study["step"]["sha256"],"Displayed metadata uses a different STEP")
                meshes=[f for f in allowed if allowed[f]["sha256"]==data.get("meshSha256")]
                require(meshes,"The displayed mesh is absent from the registered releases")
                m=meshes[0]
                if m not in checked_meshes:
                    verify_render_mesh(root,study,data,m);checked_meshes.add(m)
                images=[f for f in allowed if allowed[f]["sha256"]==data.get("imageSha256")]
                require(images,"Displayed still is absent from the distribution")
                from release_projection import verify as verify_projection
                verify_projection(root,study,data,m,images[0])
                projected.update(images)
    for name in files:
        path=project_path(root,name)
        require(path in allowed,"Unreviewed distributed asset: "+name)
        restricted=any(row.get("rights")!="exact-redistribution" for row in study["articles"].values())
        if allowed[path]["scope"] in ("native","neutral") or path.suffix.lower() in (".f3d",".f3z",".step",".stp"):
            require(not restricted,"Full CAD download includes a component without exact redistribution rights")
        elif any(row.get("rights")=="private-master" for row in study["articles"].values()):
            require(False,"Rendered derivative includes an item without public view rights")
        if path.suffix.lower() in (".png",".jpg",".jpeg",".webp",".avif",".gif",".svg"):
            require(path in projected,"Distributed CAD still lacks a reproduced projection for this issue")
        if path.name.lower().endswith((".glb",".gltf",".stl",".stl.gz",".obj",".3mf")) and path not in checked_meshes:
            from mesh_correspondence import compare
            proof=allowed[path].get("meshStudy")
            require(proof,"Supply a source-to-geometry comparison for every published mesh")
            spec=read(pinned(root,proof))
            require(spec["step"]==study["step"] and pinned(root,spec["mesh"])==path,"Mesh correspondence points to another issue")
            result=compare(pinned(root,study["step"]),path,spec["chordMm"],spec["angleRad"],resolution=spec.get("coordinateResolutionMm",.0001),
                pose=spec["pose"],registration=spec.get("glbToCad"),surfaces=spec.get("surfaces"))
            require(result["status"]=="pass","Published mesh does not include the actual placed geometry in its declared reference pose")
            if path.suffix.lower() in (".gltf",".glb"):
                from release_animation import verify as verify_animation
                verify_animation(root,study,spec,path)
            if path.suffix.lower()==".gltf":
                from showcase_geometry import Glb
                model=Glb.from_project(path)
                require(set(model.dependencies)<=delivered,"External glTF buffers must be signed with the displayed geometry")
            checked_meshes.add(path)



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
    parser.add_argument("--deliver", action="append",default=[],help="Project-relative exact derivative being delivered")
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
        verify_delivery(root,study,args.deliver)
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
