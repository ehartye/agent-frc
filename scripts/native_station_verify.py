"""Authenticate the raw native export and every measured pose against the operator's trusted station key."""
import json
import os
from pathlib import Path
import subprocess
import zipfile
from mechanical_readiness import digest,pinned,read,require


def inspect_archive(path):
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


def verify(root,study):
    key=os.environ.get("FRC_NATIVE_WITNESS_PUBLIC_KEY")
    require(key and Path(key).is_file() and not Path(key).resolve().is_relative_to(root),
            "Supply the independently trusted native station public key outside the candidate")
    inspect_archive(pinned(root,study["archive"]))
    register=pinned(root,study["authority"])
    observations=[("canonical-export",study["lineage"]),("native-contacts",study["nativeCensus"])]
    observations.extend([("native-body-materials",study["materialCensus"]),("native-joint-authority",study["jointAuthority"])])
    from source_joint_roster import intended
    intended(root,study,read(pinned(root,study["reopen"])),trusted=True)
    observations.extend(("native-contacts",r) for r in study.get("nativePoses",[]))
    script="const fs=require('node:fs'),c=require('node:crypto');const args=JSON.parse(fs.readFileSync(0));const k=c.createPublicKey(fs.readFileSync(process.argv[1]));if(k.asymmetricKeyType!=='ed25519'||!args.every(x=>c.verify(null,Buffer.from(x.raw),k,Buffer.from(x.signature,'base64'))))process.exit(1)"
    signatures=[]
    for kind,ref in observations:
        path=pinned(root,ref);sig=read(path.with_suffix(".native-signature.json"))
        body=sig["body"]
        require(body=={"schema":"agent-frc/native-station-witness@1","kind":kind,"authoritySha256":digest(register),
            "archiveSha256":study["archive"]["sha256"],"stepSha256":study["step"]["sha256"],"recordSha256":digest(path),
            "stationSha256":digest(Path(__file__).with_name("fusion_issue_station.py"))},
            "Native witness does not bind this exact current source, pose and station")
        signatures.append({"raw":json.dumps(body,sort_keys=True,separators=(",",":")),"signature":sig["signature"]})
    result=subprocess.run(["node","-e",script,str(Path(key).resolve())],input=json.dumps(signatures),text=True,capture_output=True)
    require(result.returncode==0,"Native station witness signature failed")
