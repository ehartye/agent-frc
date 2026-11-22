"""Bind a candidate's actual delivered assets to a complete, passing mechanical review."""
from pathlib import Path
import json
import os
import sys

from mechanical_readiness import digest, pinned, project_path, read, require, review, scan, verify_delivery


def verify_candidate(root, study_path, source, derivatives, native=None, receipt=None, distribute_source=False):
    root=Path(root).resolve()
    if isinstance(study_path,dict) and "reviewResult" in study_path:
        # The committed result of the mechanical-readiness review, as a design marked effective carries it.
        # A review that does not pass publishes nothing; this build binds the shown files to the reviewed ones.
        result=read(project_path(root,study_path["reviewResult"]))
        require(result.get("schema")=="agent-frc/mechanical-readiness-result@1","Supply a mechanical-readiness review result")
        require(not source or result["stepSha256"]==digest(project_path(root,source)),"Displayed STEP differs from the reviewed one")
        if receipt:
            require(isinstance(result.get("solids"),int) and result["solids"]==receipt.get("solids"),"Reviewed solid count differs from the display receipt")
        require(not native or result["archiveSha256"]==digest(project_path(root,native)),"Published native archive differs from the reviewed one")
        require(result.get("showcaseEligibility")=="pass","Mechanical readiness "+str(result.get("showcaseEligibility"))+": "+str((result.get("findings") or [])[:3]))
        return
    if not study_path:
        # Retain the exact original public static teaching plate. It has no native download.
        plate=read(Path(__file__).resolve().parents[1]/"references/retained-teaching-display.json")
        if (root==(Path(__file__).resolve().parents[1]/"examples/highlights").resolve() and receipt and native is None and source and receipt.get("sourceSha256")==plate["step"] and
            receipt.get("imageSha256")==plate["still"] and receipt.get("meshSha256")==plate["mesh"] and
            digest(project_path(root,source))==plate["step"] and
            sorted(digest(project_path(root,p)) for p in derivatives)==sorted([plate["still"],plate["mesh"],plate["receipt"]])):
            return
        raise ValueError("A proposed showcase model requires a complete mechanical-readiness review")
    study=read(project_path(root,study_path))
    require(source is None or study["step"]["sha256"]==digest(project_path(root,source)),"Displayed source differs from the readiness review")
    if native:
        require(study["archive"]["sha256"]==digest(project_path(root,native)),"Download differs from the native readiness review")
    cold=scan(root,study)
    require(read(pinned(root,study["geometry"]))==cold,"Registered geometry differs from a fresh complete STEP scan")
    result=review(root,study,cold)
    if result.get("iteration"):
        require(result["iteration"]["kind"]==os.environ.get("FRC_MODEL_SCOPE","whole-robot"),
                "Scoped mechanical issue differs from the commissioned showcase")
    if receipt is not None:
        require(receipt.get("solids")==result["solids"],"Published mesh source census differs from reviewed STEP")
    require(result["showcaseEligibility"]=="pass","Mechanical readiness "+result["showcaseEligibility"]+": "+str(result["findings"][:3]))
    if study.get("externalIssues"):
        from mechanical_methods import run
        fresh=run(root,read(pinned(root,study["issueRegister"])))
        require(fresh==read(pinned(root,study["issueResult"])) and fresh["status"]=="pass","Installed method rerun differs from the accepted issue results")
    verify_delivery(root,study,[*derivatives,*([source] if distribute_source and source else []),*([native] if native else [])])


if __name__=="__main__":
    try:
        root=Path(sys.argv[1]).resolve()
        req=json.loads(sys.argv[2])
        verify_candidate(root,**req)
    except (KeyError,TypeError,ValueError,OSError) as exc:
        sys.exit(str(exc))
