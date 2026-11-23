"""Native station. Call these functions inside Fusion. Observations are recorded as read and accepted as recorded."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil


def module(name):
    p=Path(__file__).with_name(name+".py")
    spec=importlib.util.spec_from_file_location(name,p)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m


def outside(root,location):
    # Resumable scratch files are not project records. Keep them out of the checkout.
    p=Path(location).resolve()
    if p.is_relative_to(root) or root.is_relative_to(p):
        raise ValueError("Keep the station working directory separate from the project")
    return p


def digest(p):
    h=hashlib.sha256()
    with p.open("rb") as source:
        for buf in iter(lambda:source.read(1024*1024),b""):
            h.update(buf)
    return h.hexdigest()


def export_current(app,project,new_issue):
    root=Path(project).resolve()
    register=module("fusion_authority").register_path(root)
    issue=Path(new_issue).resolve()
    return module("fusion_authority").export_issue(app,root,register,issue)


def measure_pose(app,project,lineage,new_output,station_folder,pose=None,batch=256):
    root=Path(project).resolve();register=module("fusion_authority").register_path(root)
    lineage=Path(lineage).resolve();output=Path(new_output).resolve()
    if not output.is_relative_to(root) or output.exists():
        raise ValueError("Choose a fresh project-owned native result file")
    authority=module("fusion_authority")
    authority.verify(root,register,lineage)
    archive=authority.resolve(root,authority.load(lineage)["archive"])
    folder=outside(root,station_folder)
    # A resumed measurement continues only the same issue, pose, output and collector programs.
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
    return {"complete":True,"record":str(output)}
