"""Bind a candidate's actual delivered assets to a complete, passing mechanical review."""
from pathlib import Path
import json
import os
import subprocess

from mechanical_readiness import digest, pinned, project_path, read, require, review, scan, verify_delivery


def verify_candidate(root, study_path, source, derivatives, native=None, receipt=None, distribute_source=False):
    root=Path(root).resolve()
    if isinstance(study_path,dict) and "signedPacket" in study_path:
        key=os.environ.get("FRC_MODEL_REVIEW_PUBLIC_KEY")
        project=os.environ.get("FRC_MODEL_PROJECT")
        require(key and project and not Path(key).resolve().is_relative_to(root),"Supply the independently trusted project and reviewer key outside the candidate")
        packet_file=project_path(root,study_path["signedPacket"])
        verifier=Path(__file__).with_name("public-model-release.mjs")
        result=subprocess.run(["node",str(verifier),"verify",str(root),str(packet_file),key,project],capture_output=True,text=True)
        require(result.returncode==0,"Signed release did not verify: "+result.stderr.strip())
        body=read(packet_file)["body"]
        require(not source or body["stepSha256"]==digest(project_path(root,source)),"Displayed STEP differs from signed issue")
        require(not native or body["archiveSha256"]==digest(project_path(root,native)),"Published native archive differs from signed issue")
        approved={r["path"] for r in body["files"]}
        files=[*derivatives,*([native] if native else []),*([source] if source and distribute_source else [])]
        require(all(Path(n).as_posix() in approved for n in files),"An actual derivative is absent from the signed issue")
        return
    if not study_path:
        # Retain the exact original public static teaching plate. It has no native download.
        plate=read(Path(__file__).resolve().parents[1]/"references/retained-teaching-display.json")
        if (root==(Path(__file__).resolve().parents[1]/"examples/highlights").resolve() and receipt and native is None and source and receipt.get("sourceSha256")==plate["step"] and
            receipt.get("imageSha256")==plate["still"] and receipt.get("meshSha256")==plate["mesh"] and
            digest(project_path(root,source))==plate["step"] and
            sorted(digest(project_path(root,p)) for p in derivatives)==sorted([plate["still"],plate["mesh"]])):
            return
        raise ValueError("A proposed showcase model requires a complete mechanical-readiness review")
    study=read(project_path(root,study_path))
    require(source is None or study["step"]["sha256"]==digest(project_path(root,source)),"Displayed source differs from the readiness review")
    if native:
        require(study["archive"]["sha256"]==digest(project_path(root,native)),"Download differs from the native readiness review")
    cold=scan(root,study)
    require(read(pinned(root,study["geometry"]))==cold,"Registered geometry differs from a fresh complete STEP scan")
    result=review(root,study,cold)
    if receipt is not None:
        require(receipt.get("solids")==result["solids"],"Published mesh source census differs from reviewed STEP")
    require(result["showcaseEligibility"]=="pass","Mechanical readiness "+result["showcaseEligibility"]+": "+str(result["findings"][:3]))
    verify_delivery(root,study,[*derivatives,*([source] if distribute_source and source else []),*([native] if native else [])])


if __name__=="__main__":
    import sys
    try:
        root=Path(sys.argv[1]).resolve()
        req=json.loads(sys.argv[2])
        verify_candidate(root,**req)
    except (KeyError,TypeError,ValueError,OSError) as exc:
        sys.exit(str(exc))
