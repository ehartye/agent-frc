"""Retry selected unresolved native intersections without trusting a project-supplied checkpoint."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory


def retry(app,project,lineage_file,previous_file,new_output,pairs,key,station_folder):
    root=Path(project).resolve()
    spec=importlib.util.spec_from_file_location("station",Path(__file__).with_name("fusion_issue_station.py"))
    station=importlib.util.module_from_spec(spec);spec.loader.exec_module(station)
    authority=station.module("fusion_authority");collector=station.module("fusion_issue_inventory")
    previous=Path(previous_file).resolve();target=Path(new_output).resolve()
    if not previous.is_relative_to(root) or not target.is_relative_to(root) or target.exists() or not pairs:
        raise ValueError("Use a previously signed project receipt, fresh output and named unresolved pairs")
    register=authority.register_path(root);lineage=authority.verify(root,register,Path(lineage_file))
    archive=authority.resolve(root,authority.load(lineage_file)["archive"])
    raw=json.loads(previous.read_bytes());signed=json.loads(previous.with_suffix(".native-signature.json").read_bytes())
    expected=dict(schema="agent-frc/native-station-witness@1",kind="native-contacts",authoritySha256=station.digest(register),
        archiveSha256=lineage["archiveSha256"],stepSha256=lineage["stepSha256"],recordSha256=station.digest(previous),
        stationSha256=station.digest(Path(station.__file__)))
    if signed["body"]!=expected or raw["archiveSha256"]!=expected["archiveSha256"] or not raw["contacts"]["complete"]:
        raise ValueError("Prior native coverage belongs to a different issue")
    verification="const c=require('node:crypto'),f=require('node:fs'),r=JSON.parse(f.readFileSync(0));if(!c.verify(null,Buffer.from(r.raw),c.createPublicKey(f.readFileSync(process.argv[1])),Buffer.from(r.sig,'base64')))process.exit(1)"
    subprocess.run(["node","-e",verification,str(station.trusted(root,key))],check=True,text=True,capture_output=True,
        input=json.dumps(dict(raw=json.dumps(expected,sort_keys=True,separators=(",",":")),sig=signed["signature"])))
    rows=raw["bodies"];contacts=raw["contacts"];entries=contacts["pairs"]
    fingerprint=[raw["archiveSha256"],raw["pose"],raw["fusionVersion"],raw["programSha256"],contacts["programSha256"]]
    evidence=[fingerprint,[r["pair"] for r in entries],[[r["path"],r["name"],r["boundsMm"],r["worldTransform"]] for r in rows]]
    signature=hashlib.sha256(json.dumps(evidence,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    folder=station.trusted(root,station_folder);folder.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(dir=folder) as tmp:
        checkpoint=Path(tmp)/"prior.json";measured=Path(tmp)/"native.json"
        checkpoint.write_text(json.dumps(dict(study=signature,pairs=entries)),encoding="utf8")
        result=collector.capture(app,archive,measured,batch=len(pairs),pose=raw["pose"],retry_pairs=pairs,checkpoint=checkpoint)
        if not result["complete"]:raise ValueError("Prior coverage changed during targeted retry")
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open("xb") as stream:stream.write(measured.read_bytes())
    station.seal(root,target,key,"native-contacts",station.digest(register),lineage["archiveSha256"],lineage["stepSha256"])
    return result
