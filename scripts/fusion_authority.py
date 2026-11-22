"""Check the project’s designated Fusion source and its one-way neutral export. Run export_issue inside Fusion."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys


def digest(file):
    with file.open("rb") as stream:
        h=hashlib.sha256()
        for block in iter(lambda:stream.read(1024*1024), b""):
            h.update(block)
        return h.hexdigest()


def check(test, message):
    if not test:
        raise ValueError(message)


def ref(root, file):
    return {"file":file.resolve().relative_to(root).as_posix(),"sha256":digest(file)}


def resolve(root, item):
    file=(root/item["file"]).resolve()
    check(not Path(item["file"]).is_absolute() and file.is_relative_to(root) and file.is_file() and digest(file)==item["sha256"],
        "Missing, replaced or external authority evidence")
    return file


def load(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def active_design(root):
    root = Path(root).resolve()
    pointer = root/"iterations/active.json"
    if not pointer.exists():
        check(not any((root/"iterations").glob("[0-9][0-9][0-9]")), "Numbered designs are missing their active pointer")
        for parent in root.parents:
            if (parent/"iterations/active.json").is_file():
                raise ValueError("Use the owning project checkout for Fusion authority")
            if (parent/".git").exists(): break
        return root, None
    record = load(pointer)
    number = record["number"]
    check(type(number) is int and 1 <= number <= 999, "Invalid active iteration number")
    relative = f"iterations/{number:03d}/design"
    check(record.get("schema") == "agent-frc/active-iteration@1" and record["root"] == relative,
          "Invalid active design location")
    check(not any(int(f.name)>number for f in (root/"iterations").glob("[0-9][0-9][0-9]")),
          "A later numbered design exists; verify the active pointer")
    base = root/relative
    opening = load(base.parent/"iteration.json")
    check(base.resolve() == base and base.is_dir() and opening["id"] == record["id"] == opening["fusionId"]
          and opening["number"] == number, "Active design root or identity differs")
    return base, record


def register_path(root):
    return active_design(root)[0]/"cad/fusion-authority.json"


def verify_active(root, register, spec):
    base, active = active_design(root)
    if active:
        check(register.resolve() == register_path(root) and spec.get("id") == active["id"],
              "Use the fresh Fusion authority of the active design iteration")
        for number in range(1, active["number"]):
            archive = load(root/f"iterations/{number:03d}/retrospective.json")
            old = archive.get("fusionSource", {})
            source = spec["source"]
            if source["kind"] == "cloud":
                check(source["dataFileId"] != old.get("dataFileId"), "Create a new Fusion cloud design")
            else:
                master = resolve(root, source["archive"])
                check(master.is_relative_to(base) and source["archive"]["sha256"] not in
                      {a["sha256"] for a in archive["evidence"].values()} | set(archive["files"].values()),
                      "Create and save a new native root inside the active design")


def verify(root, register, lineage):
    root=root.resolve()
    spec=load(register);verify_active(root, register, spec);out=load(lineage)
    check(spec.get("schema")=="agent-frc/fusion-authority@1" and all(isinstance(spec.get(k),str) and spec[k].strip()
        for k in ("id","configuration","revision","basis")),"A single named Fusion source, configuration, revision and basis are required")
    check(out.get("schema")=="agent-frc/fusion-export-lineage@1" and out["authority"]==ref(root,register) and
          out["exporterSha256"]==digest(Path(__file__)) and out["configuration"]==spec["configuration"] and
          out["revision"]==spec["revision"] and out["nativeConfiguration"]==spec["nativeConfiguration"] and
          out["nativeConfiguration"] and out.get("inspectedAt"),"Source, export method, configuration or revision changed")
    native=resolve(root,out["archive"]);step=resolve(root,out["step"])
    check(native.suffix.lower() in (".f3d",".f3z") and step.suffix.lower() in (".step",".stp") and
        out["id"]==spec["id"] and out["dirty"] is False,"Unidentified or modified Fusion source")
    source=spec["source"]
    if source["kind"]=="offline":
        check(resolve(root,source["archive"])==native,"Offline authority differs from its registered current native file")
        check(out["policy"]=="registered-offline-archive","Offline archive cannot claim cloud freshness")
        seen={r["id"]:r["versionId"] for r in out["externalReferences"]}
        expected={r["id"]:r["versionId"] for r in spec.get("pinnedChildren",[]) if r.get("basis")}
        check(len(seen)==len(out["externalReferences"]) and seen==expected and len(expected)==len(spec.get("pinnedChildren",[])),
            "Offline external references must resolve to all and only the explicitly pinned identities and versions")
    else:
        check(source["kind"]=="cloud" and out["policy"]=="observed-cloud-latest" and out["dataFileId"]==source["dataFileId"] and
            type(out["savedVersion"]) is int and out["savedVersion"]>0 and out["savedVersion"]==out["latestVersion"] and
            bool(out["versionId"]),"Cloud source is not the latest saved version of the designated design")
        pins={r["id"]:(r["versionId"],r["basis"]) for r in spec.get("pinnedChildren",[])}
        stale=set()
        for child in out["children"]:
            if child["versionId"]!=child["latestVersionId"]:
                stale.add(child["id"])
                check(child["id"] in pins and pins[child["id"]][0]==child["versionId"] and bool(pins[child["id"]][1]),
                    "Unresolved stale referenced component")
        check(stale==set(pins) and (not out["hasOutofDateChildReferences"] or stale),"Missing, unresolved or superseded pinned reference")
    return {"status":"pass","policy":out["policy"],"id":spec["id"],"configuration":spec["configuration"],
        "revision":spec["revision"],"asOf":out["inspectedAt"],"archiveSha256":digest(native),"stepSha256":digest(step)}


def export_issue(app,root,register,issue):
    """Read an offline canonical master or an already open, saved cloud design. Never save changes to the user's document."""
    import adsk.fusion
    root=Path(root).resolve();register=Path(register).resolve();issue=Path(issue).resolve()
    check(register.is_relative_to(root) and issue.is_relative_to(root),"Keep private evidence under this project")
    spec=load(register);verify_active(root, register, spec);source=spec["source"]
    issue.mkdir(parents=True,exist_ok=False)
    old=app.activeDocument
    temporary=None
    try:
        if source["kind"]=="offline":
            archive=resolve(root,source["archive"])
            temporary=app.importManager.importToNewDocument(app.importManager.createFusionArchiveImportOptions(str(archive)))
            doc=temporary
            extra={"policy":"registered-offline-archive"}
        else:
            check(source["kind"]=="cloud","Unknown authority policy")
            matches=[d for d in app.documents if d.dataFile and d.dataFile.id==source["dataFileId"] and not d.isModified and
                d.dataFile.versionNumber==d.dataFile.latestVersion.versionNumber]
            check(len(matches)==1,"Open exactly one unmodified, latest saved copy of the designated cloud design")
            doc=matches[0];doc.activate();f=doc.dataFile
            children=[];seen=set();pending=list(f.childReferences)
            while pending:
                c=pending.pop()
                if c.versionId in seen:
                    continue
                seen.add(c.versionId)
                children.append({"id":c.id,"versionId":c.versionId,"latestVersionId":c.latestVersion.versionId})
                pending.extend(c.childReferences)
            extra={"policy":"observed-cloud-latest","dataFileId":f.id,"versionId":f.versionId,"savedVersion":f.versionNumber,
                "latestVersion":f.latestVersion.versionNumber,"hasOutofDateChildReferences":f.hasOutofDateChildReferences,"children":children}
            archive=issue/"assembly.f3d"
        design=adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        config=design.configurationRowId if design.isConfiguration else design.configurationTopTable.activeRow.id if design.isConfiguredDesign else "unconfigured"
        check(config==spec["nativeConfiguration"],"Opened Fusion configuration differs from the project authority")
        if source["kind"]=="offline":
            resolved={}
            def include(reference):
                check(reference and reference.dataFile and reference.dataFile.versionId and reference.dataFile.id,
                    "Missing or unresolvable external Fusion reference in the offline master")
                f=reference.dataFile
                check(f.id not in resolved or resolved[f.id]==f.versionId,"Conflicting installed revisions of a linked design")
                resolved[f.id]=f.versionId
            for reference in doc.documentReferences:
                include(reference)
            for occurrence in design.rootComponent.allOccurrences:
                if occurrence.isReferencedComponent:
                    include(occurrence.documentReference)
            extra["externalReferences"]=[{"id":key,"versionId":value} for key,value in sorted(resolved.items())]
        manager=design.exportManager
        if source["kind"]=="cloud":
            check(manager.execute(manager.createFusionArchiveExportOptions(str(archive))),"Cloud native archive export failed")
        step=issue/"assembly.step"
        check(manager.execute(manager.createSTEPExportOptions(str(step),design.rootComponent)),"STEP export from the designated Fusion design failed")
        if source["kind"]=="cloud":
            check(not doc.isModified and doc.dataFile.versionId==extra["versionId"] and doc.dataFile.latestVersion.versionNumber==extra["latestVersion"],
                "Cloud design changed during export")
        else:
            resolve(root,source["archive"])
        result={**extra,"schema":"agent-frc/fusion-export-lineage@1","authority":ref(root,register),"exporterSha256":digest(Path(__file__)),
            "id":spec["id"],"configuration":spec["configuration"],"nativeConfiguration":config,"revision":spec["revision"],
            "dirty":False,"archive":ref(root,archive),"step":ref(root,step),"inspectedAt":datetime.now(timezone.utc).isoformat()}
        out=issue/"lineage.json"
        out.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
        return verify(root,register,out)
    finally:
        if temporary:
            temporary.close(False)
        if old and old.isValid:
            old.activate()


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("project","register","lineage"):p.add_argument(name,type=Path)
    a=p.parse_args()
    try:
        print(json.dumps(verify(a.project,a.project/a.register,a.project/a.lineage),indent=2))
    except (ValueError,OSError,KeyError,TypeError) as e:
        sys.exit(str(e))
