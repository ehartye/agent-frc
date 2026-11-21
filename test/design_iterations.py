"""Exercise a genuine file cutover and reconcile its archive and normal design entry points."""
from copy import deepcopy
from pathlib import Path
import json
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(SCRIPTS))
from design_iteration import cutover, current, read, review, sha
from fusion_authority import register_path, verify_active


def expect_bad(action):
    try:action()
    except (ValueError,OSError):return
    raise AssertionError("Expected the invalid design to be refused")


def cli(script,*args):
    return subprocess.run([sys.executable,"-B",str(SCRIPTS/script),*map(str,args)],capture_output=True,text=True)


with TemporaryDirectory() as d:
    temp=Path(d);project=temp/"project";project.mkdir();vault=temp/"private"
    baseline=project/"baseline";baseline.mkdir()
    for file,data in [("master.f3d",b"original test design"),("still.png",b"\x89PNG\r\n\x1a\nfixture"),
                      ("observation.json",b'{"observed":true}'),("part.step",b"original test part")]:
        (baseline/file).write_bytes(data)
    plan=read(SCRIPTS.parent/"templates/design-restart.json")
    for row,file in zip(plan["evidence"],["master.f3d","still.png","observation.json","part.step"]):
        row["file"]="baseline/"+file;row["sha256"]=sha(baseline/file)
    (baseline/"different.step").write_bytes(b"different retained part")
    plan["evidence"].append(dict(id="different",kind="element",source="another inspected article",
                                  file="baseline/different.step",sha256=sha(baseline/"different.step")))
    (project/"cad").mkdir()
    legacy=project/"cad/fusion-authority.json"
    legacy.write_text(json.dumps({"id":"original-study","source":{"kind":"offline","archive":{"file":"baseline/master.f3d","sha256":sha(baseline/"master.f3d")}}}))
    assert register_path(project)==legacy
    bad=deepcopy(plan);bad["evidence"][0]["sha256"]="2"*64
    expect_bad(lambda:cutover(project,bad,vault));assert current(project) is None
    # A failure immediately before pointer publication leaves the historical
    # design active and no CAD in the successor. The same plan can complete.
    with patch("design_iteration.os.replace",side_effect=OSError("interrupted before cutover")):
        expect_bad(lambda:cutover(project,plan,vault))
    assert current(project) is None
    active=cutover(project,plan,vault);base=project/active["root"]
    assert not list(base.iterdir()) and review(project,vault)["historyVerified"]==1
    base.rmdir();expect_bad(lambda:review(project))
    base.mkdir()
    prior_open=project/"iterations/001/iteration.json";original=prior_open.read_bytes()
    altered=read(prior_open);altered["scope"]="rewritten past"
    prior_open.write_text(json.dumps(altered));expect_bad(lambda:review(project))
    prior_open.write_bytes(original)
    assert register_path(project)==base/"cad/fusion-authority.json"
    expect_bad(lambda:verify_active(project,legacy,read(legacy)))
    historical_out=project/"cad/stale.json"
    assert subprocess.run(["node",str(SCRIPTS/"design.mjs"),"new",str(historical_out)],capture_output=True).returncode
    assert not historical_out.exists()
    assert subprocess.run(["node",str(SCRIPTS/"design.mjs"),"new",str(base/"current.json")],capture_output=True).returncode==0
    expect_bad(lambda:cutover(project,plan,vault))
    (base/"cad/components").mkdir(parents=True)
    target=base/"cad/components/wheel.step";shutil.copyfile(baseline/"part.step",target)
    expect_bad(lambda:review(project))
    entry=read(SCRIPTS.parent/"templates/design-import.json");entry.update(sourceSha256=sha(target),destinationSha256=sha(target))
    entry_file=temp/"select.json";entry_file.write_text(json.dumps(entry))
    for wrong in ("master.f3d","different.step"):
        shutil.copyfile(baseline/wrong,target)
        entry["destinationSha256"]=sha(target);entry_file.write_text(json.dumps(entry))
        assert cli("design_iteration.py","carry",project,entry_file).returncode!=0
        assert not list((base.parent/"carry-forward").iterdir())
    target.write_text("Freshly rebuilt geometry for this selected part")
    entry["destinationSha256"]=sha(target);entry_file.write_text(json.dumps(entry))
    assert cli("design_iteration.py","carry",project,entry_file).returncode==0
    assert review(project,vault)["manualImports"]==1
    (base/"cad/master.f3d").write_bytes(b"new empty-root test design")
    candidate={"id":active["id"],"source":{"kind":"offline","archive":{"file":active["root"]+"/cad/master.f3d","sha256":sha(base/"cad/master.f3d")}}}
    register=register_path(project);register.write_text(json.dumps(candidate));verify_active(project,register,candidate)
    shutil.copyfile(baseline/"master.f3d",base/"cad/master.f3d");candidate["source"]["archive"]["sha256"]=sha(base/"cad/master.f3d")
    expect_bad(lambda:verify_active(project,register,candidate))
    (base/"cad/master.f3d").write_bytes(b"new empty-root test design")
    (base/"untracked-simulation.log").write_text("unpublished evidence")
    again=deepcopy(plan);again['from']={'id':active['id'],'number':2,'scope':'Current concept'}
    again['to'].update(id='third-design',fusionId='third-design')
    again['evidence'][0].update(file=active['root']+'/cad/master.f3d',sha256=sha(base/'cad/master.f3d'))
    third=cutover(project,again,vault);assert third['number']==3 and not list((project/third['root']).iterdir())
    assert review(project,vault)['historyVerified']==2
    assert (vault/sha(base/'untracked-simulation.log')).read_text()=="unpublished evidence"
    (base/"untracked-simulation.log").write_text("changed")
    expect_bad(lambda:review(project,vault))
