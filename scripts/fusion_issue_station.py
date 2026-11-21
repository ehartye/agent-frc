"""Trusted native station. Call these functions inside Fusion with operator-owned key and workspace outside the project."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import subprocess


def module(name):
    p=Path(__file__).with_name(name+".py")
    spec=importlib.util.spec_from_file_location(name,p)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m


def trusted(root,location):
    p=Path(location).resolve()
    if p.is_relative_to(root) or root.is_relative_to(p):
        raise ValueError("Keep the native key and station working directory separate from the candidate project")
    return p


def digest(p):
    h=hashlib.sha256()
    with p.open("rb") as source:
        for buf in iter(lambda:source.read(1024*1024),b""):
            h.update(buf)
    return h.hexdigest()


def seal(root,record,key,kind,authority,archive,step):
    # Only reachable from the station's freshly observed export or protected native scan.
    body={"schema":"agent-frc/native-station-witness@1","kind":kind,"authoritySha256":authority,
        "archiveSha256":archive,"stepSha256":step,"recordSha256":digest(record),"stationSha256":digest(Path(__file__))}
    raw=json.dumps(body,separators=(",",":"),sort_keys=True).encode("utf8")
    script="const fs=require('node:fs'),c=require('node:crypto');const k=c.createPrivateKey(fs.readFileSync(process.argv[1]));if(k.asymmetricKeyType!=='ed25519')throw Error('Expected Ed25519');process.stdout.write(c.sign(null,fs.readFileSync(0),k).toString('base64'))"
    run=subprocess.run(["node","-e",script,str(trusted(root,key))],input=raw,capture_output=True,check=True)
    receipt={"body":body,"signature":run.stdout.decode("ascii")}
    path=record.with_suffix(".native-signature.json")
    with path.open("x",encoding="utf8") as stream:json.dump(receipt,stream,indent=2)
    return path


def export_current(app,project,new_issue,key):
    root=Path(project).resolve()
    register=root/"cad/fusion-authority.json"
    issue=Path(new_issue).resolve()
    trusted(root,key)
    result=module("fusion_authority").export_issue(app,root,register,issue)
    seal(root,issue/"lineage.json",key,"canonical-export",digest(register),result["archiveSha256"],result["stepSha256"])
    return result


def measure_pose(app,project,lineage,new_output,key,station_folder,pose=None,batch=256):
    root=Path(project).resolve();register=root/"cad/fusion-authority.json"
    lineage=Path(lineage).resolve();output=Path(new_output).resolve()
    if not output.is_relative_to(root) or output.exists():
        raise ValueError("Choose a fresh project-owned native result file")
    authority=module("fusion_authority")
    identity=authority.verify(root,register,lineage)
    archive=authority.resolve(root,authority.load(lineage)["archive"])
    folder=trusted(root,station_folder);trusted(root,key)
    # Protect prior measured chunks from candidate-controlled progress files.
    fingerprint=json.dumps([digest(register),digest(lineage),pose,output.relative_to(root).as_posix(),
        digest(Path(__file__)),digest(Path(__file__).with_name("fusion_issue_inventory.py")),
        digest(Path(__file__).with_name("fusion_issue_contacts.py"))],sort_keys=True)
    staging=folder/hashlib.sha256(fingerprint.encode()).hexdigest()
    staging.mkdir(parents=True,exist_ok=True)
    raw=staging/"native.json"
    if not raw.exists():
        update=module("fusion_issue_inventory").capture(app,archive,raw,batch=batch,pose=pose)
        if not update["complete"]:
            return update
    output.parent.mkdir(parents=True,exist_ok=True)
    with raw.open("rb") as src, output.open("xb") as dest:
        shutil.copyfileobj(src,dest)
    signature=seal(root,output,key,"native-contacts",digest(register),identity["archiveSha256"],identity["stepSha256"])
    return {"complete":True,"record":str(output),"signature":str(signature)}
