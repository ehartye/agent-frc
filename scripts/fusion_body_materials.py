"""Capture effective physical material per cold native BRep occurrence, separately from appearance."""
import importlib.util
import json
from pathlib import Path


def capture(app,project,lineage_file,output,key):
    import adsk.fusion
    root=Path(project).resolve();output=Path(output).resolve()
    if not output.is_relative_to(root) or output.exists():raise ValueError("Use a fresh project-owned material receipt")
    deploy=Path(__file__).with_name("fusion_issue_station.py")
    spec=importlib.util.spec_from_file_location("material_station",deploy)
    station=importlib.util.module_from_spec(spec);spec.loader.exec_module(station)
    authority=station.module("fusion_authority");register=root/"cad/fusion-authority.json"
    lineage=authority.verify(root,register,Path(lineage_file))
    archive=authority.resolve(root,authority.load(lineage_file)["archive"])
    before=app.activeDocument;count=app.documents.count
    imp=app.importManager;doc=imp.importToNewDocument(imp.createFusionArchiveImportOptions(str(archive)))
    try:
        design=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        component=design.rootComponent;rows=[]
        for occ in [None,*list(component.allOccurrences)]:
            part=occ.component if occ else component
            for native in part.bRepBodies:
                if not native.isSolid:continue
                body=native.createForAssemblyContext(occ) if occ else native
                mat=body.material
                rows.append(dict(path=occ.fullPathName if occ else "@root",name=native.name,
                    materialName=mat.name if mat else None,materialId=mat.id if mat else None,volumeCm3=body.volume,massKg=body.physicalProperties.mass))
        result=dict(schema="agent-frc/fusion-body-materials@1",archiveSha256=lineage["archiveSha256"],
            stepSha256=lineage["stepSha256"],bodies=rows)
    finally:
        doc.close(False)
        if before and before.isValid:before.activate()
    if app.documents.count!=count:raise ValueError("Native document set changed")
    with output.open("x",encoding="utf8") as f:json.dump(result,f,indent=2)
    station.seal(root,output,key,"native-body-materials",station.digest(register),lineage["archiveSha256"],lineage["stepSha256"])
    return result


def verify_expected(expected,readback,occ):
    from mechanical_readiness import named,require
    seen={(b["path"],b["name"]):b for b in readback["bodies"]}
    require(len(seen)==len(readback["bodies"]),"Repeated native material identity")
    require(set(expected)==set(occ["sourceSolids"].values()),"Source material register does not cover every physical constituent")
    checks=[]
    for solid,source in occ["sourceSolids"].items():
        row=expected[source];body=seen.get((occ["path"],occ["nativeBodyNames"][solid]),{})
        require(named(row.get("grade")) and named(row.get("basis")) and named(row.get("fusionMaterial")) and
            body.get("materialName")==row["fusionMaterial"],"Assigned physical material differs from source grade: "+solid)
        checks.append(dict(id=solid,actual=body,stock=row))
    return checks


def stock_results(checks):
    import subprocess
    entry=Path(__file__).with_name("assembly-native-mass.mjs")
    program="const {checkStockMaterial}=await import(process.argv[1]);const rows=JSON.parse((await import('node:fs')).readFileSync(0,'utf8'));console.log(JSON.stringify(rows.flatMap(r=>{try{checkStockMaterial(r.id,r.actual,r.stock);return []}catch(e){return [e.message]}})))"
    output=subprocess.run(["node","--input-type=module","-e",program,entry.resolve().as_uri()],
        input=json.dumps(checks),text=True,capture_output=True,check=True)
    return json.loads(output.stdout)

def compare_reissue(root,study):
    from mechanical_readiness import read,pinned,named,number,require
    require(study.get("schema")=="agent-frc/material-reissue@1","Unknown material continuity study")
    previous,current=(read(pinned(root,study[k])) for k in ("previous","current"))
    def census(row):
        require(row.get("schema")=="agent-frc/fusion-body-materials@1" and named(row.get("archiveSha256")),
                "Identify the original native material observations")
        by_name={}
        for body in row["bodies"]:
            by_name.setdefault((body["path"],body["name"]),[]).append(body)
        return ({k:v[0] for k,v in by_name.items() if len(v)==1},{k for k,v in by_name.items() if len(v)!=1})
    before,ambiguous_before=census(previous);now,ambiguous_now=census(current)
    ambiguous=ambiguous_before|ambiguous_now
    limit=study["volumeToleranceMm3"]
    require(number(limit) and limit>=0,"Declare volume correspondence uncertainty")
    approved={}
    for ref in study.get("substitutions",[]):
        record=read(pinned(root,ref))
        require(record["beforeArchiveSha256"]==previous["archiveSha256"] and record["afterArchiveSha256"]==current["archiveSha256"]
            and named(record.get("reason")) and named(record.get("reviewer")),"Stale material change approval")
        pinned(root,record["stockSpecification"])
        for item in record["changes"]:
            k=(item["path"],item["name"]);require(k not in approved,"Repeated substitution")
            approved[k]=(item["fromMaterialId"],item["toMaterialId"])
    counts={"matched":0,"newOrReshaped":0,"approved":0,"ambiguousIdentities":len(ambiguous)}
    errors=[]
    for k,r in now.items():
        if k in ambiguous:continue
        old=before.get(k)
        if old is None or abs(old["volumeCm3"]-r["volumeCm3"])*1000>limit:
            counts["newOrReshaped"]+=1;continue
        counts["matched"]+=1
        if r["materialId"]!=old["materialId"]:
            changed=(old["materialId"],r["materialId"])
            if approved.get(k)==changed:counts["approved"]+=1
            else:errors.append(dict(path=k[0],name=k[1],previous=changed[0],current=changed[1]))
    return dict(schema="agent-frc/material-reissue-result@1",beforeArchiveSha256=previous["archiveSha256"],
        archiveSha256=current["archiveSha256"],**counts,changes=errors,status="open" if errors or ambiguous else "pass")


if __name__=="__main__":
    import argparse
    from mechanical_readiness import read,project_path
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("project",type=Path);parser.add_argument("study")
    args=parser.parse_args();root=args.project.resolve()
    result=compare_reissue(root,read(project_path(root,args.study)))
    print(json.dumps(result,indent=2,allow_nan=False))
    raise SystemExit(int(result["status"]!="pass"))
