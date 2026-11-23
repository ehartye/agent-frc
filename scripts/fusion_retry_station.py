"""Retry selected unresolved native intersections against the prior complete measurement of the same issue."""
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory


def retry(app,project,lineage_file,previous_file,new_output,pairs,station_folder):
    root=Path(project).resolve()
    spec=importlib.util.spec_from_file_location("station",Path(__file__).with_name("fusion_issue_station.py"))
    station=importlib.util.module_from_spec(spec);spec.loader.exec_module(station)
    authority=station.module("fusion_authority");collector=station.module("fusion_issue_inventory")
    previous=Path(previous_file).resolve();target=Path(new_output).resolve()
    if not previous.is_relative_to(root) or not target.is_relative_to(root) or target.exists() or not pairs:
        raise ValueError("Use a prior project measurement, fresh output and named unresolved pairs")
    register=authority.register_path(root);lineage=authority.verify(root,register,Path(lineage_file))
    archive=authority.resolve(root,authority.load(lineage_file)["archive"])
    raw=json.loads(previous.read_bytes())
    if raw["archiveSha256"]!=lineage["archiveSha256"] or not raw["contacts"]["complete"]:
        raise ValueError("Prior native coverage belongs to a different issue")
    rows=raw["bodies"];contacts=raw["contacts"];entries=contacts["pairs"]
    fingerprint=[raw["archiveSha256"],raw["pose"],raw["fusionVersion"],raw["programSha256"],contacts["programSha256"]]
    evidence=[fingerprint,[r["pair"] for r in entries],[[r["path"],r["name"],r["boundsMm"],r["worldTransform"]] for r in rows]]
    identity=hashlib.sha256(json.dumps(evidence,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    folder=station.outside(root,station_folder);folder.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(dir=folder) as tmp:
        checkpoint=Path(tmp)/"prior.json";measured=Path(tmp)/"native.json"
        checkpoint.write_text(json.dumps(dict(study=identity,pairs=entries)),encoding="utf8")
        result=collector.capture(app,archive,measured,batch=len(pairs),pose=raw["pose"],retry_pairs=pairs,checkpoint=checkpoint)
        if not result["complete"]:raise ValueError("Prior coverage changed during targeted retry")
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open("xb") as stream:stream.write(measured.read_bytes())
    return result
