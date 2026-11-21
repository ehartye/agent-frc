"""Exercise deliberate sealed-parent selection using a synthetic station packet."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path


def run(cli, project, base, vault, temp, parent):
    packet=temp/"extraction";packet.mkdir()
    def save(name,data):
        p=packet/name
        p.write_bytes(data if isinstance(data,bytes) else json.dumps(data).encode())
        return p
    def pin(p):
        return dict(file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
    def write_input(name,data):
        return pin(save(name,data))

    matrix=[1,0,0,1,0,1,0,2,0,0,1,3,0,0,0,1]
    props=dict(materialId="test-stock",faces=6,edges=12,vertices=8,volumeCm3=1,localBoundsCm=[0,0,0,1,1,1])
    paths=["Mount:1+Guide:1","Mount:1+Shaft:1","Base:1"]
    rows=[dict(occurrence=p,component="Stock",partNumber="P",matrixCm=matrix,solids=["body"],otherBodies=[]) for p in paths]
    rows.append(dict(occurrence="@root",component="source",partNumber="",matrixCm=matrix,solids=[],otherBodies=[]))
    def edge(name,left,right):
        return dict(name=name,one=left,two=right,motion="rigid",suppressed=False)
    edges=[dict(edge("link",paths[0],paths[1]),motion="revolute",owner="@root",kind="joint",rotationRad=.23),
           dict(edge("slide",paths[0],paths[1]),motion="slider",owner="@root",kind="asBuilt",slideCm=1.4),
           edge("mount",paths[0],paths[2])]
    roster=dict(sourceArchive=parent,pose="saved",rootPath="@root",fusion="test",
                occurrences=rows,joints=edges,rigidGroups=[],allBodies=3)
    inputs={"parentRoster":write_input("roster.json",roster)}
    done=dict(sourceArchive=parent,fusion="test",status="complete",sourceUnchanged=True,
              roster=inputs["parentRoster"]["sha256"],bodies=3,joints=3,occurrences=3)
    inputs["rosterTerminal"]=write_input("roster-terminal.json",done)
    recipe=write_input("export.py",b"# synthetic recipe")
    inputs["recipe"]=recipe
    reg=dict(schema="agent-frc/native-job@1",jobId="example",recipe="inputs/export.py",
             inputs=[dict(path="export.py",sha256=recipe["sha256"]),dict(path="old.f3d",sha256=parent)])
    inputs["registration"]=write_input("job.json",reg)
    groups={}
    for i,path in enumerate(paths[:2]):
        f=write_input(f"part-{i}.f3d",f"test component {i}".encode())
        groups[path]=dict(occurrence=path,component="Stock",partNumber="P",matrixCm=matrix,bodies={"body":props},
                          cold={"body":deepcopy(props)},file=f["file"],sha256=f["sha256"])
    manifest=dict(nativeParent=parent,configuration="parked",groups=groups,sourceJoints=edges[:2])
    inputs["manifest"]=write_input("manifest.json",manifest)
    report=dict(job="example",parent=parent,build="test",parentUnchanged=True,restored=True,
                exports={"subset":dict(coldManifestSha256=inputs["manifest"]["sha256"],exportedBodies=2)})
    inputs["terminal"]=write_input("terminal.json",report)
    request=dict(schema="agent-frc/archived-occurrence-request@1",id="pair",iteration="new-study",sourceIteration=1,
                 evidenceId="baseline",sourceSha256=parent,destination="cad/components/selected.json",configuration="parked",
                 sourcePose="saved",occurrences=paths[:2],exportId="subset",justification="Retain measured guide spacing",
                 changedConditions="New mounting plate",revalidation="Verify installed guide alignment",inputs=inputs)
    seal=project/"iterations/001/retrospective.json";preserved=seal.read_bytes()
    def invoke(req):
        p=save("request.json",req)
        return cli("design_iteration.py","carry-child",project,p,"--expected",pin(p)["sha256"],"--vault",vault)
    dest=base/request["destination"]
    for chosen in (["@root"],paths,paths[:1],[paths[0],paths[0]]):
        assert invoke(dict(request,occurrences=chosen)).returncode and not dest.exists()
    def rejected(m):
        req=deepcopy(request)
        req["inputs"]["manifest"]=write_input("changed.json",m)
        terminal=deepcopy(report)
        terminal["exports"]["subset"]["coldManifestSha256"]=req["inputs"]["manifest"]["sha256"]
        req["inputs"]["terminal"]=write_input("changed-terminal.json",terminal)
        assert invoke(req).returncode and not dest.exists()
    for field,value in (("matrixCm",[0]*16),("cold",{}),("occurrence",paths[-1])):
        bad=deepcopy(manifest);bad["groups"][paths[0]][field]=value;rejected(bad)
    rejected(dict(manifest,sourceJoints=[]))
    for i,key,value in [(0,"rotationRad",.33),(1,"slideCm",1.5),(0,"suppressed",True),(0,"owner",paths[1])]:
        bad=deepcopy(manifest);bad["sourceJoints"][i][key]=value;rejected(bad)
    result=invoke(request)
    assert result.returncode==0,result.stderr
    assert invoke(request).returncode==0 and seal.read_bytes()==preserved
    remainder=deepcopy(request)
    remainder.update(id="last",destination="cad/components/last.json",occurrences=paths[2:])
    member=deepcopy(groups[paths[0]])
    member.update(occurrence=paths[2],**write_input("last.f3d",b"third synthetic component"))
    remainder["inputs"]["manifest"]=write_input("last-manifest.json",dict(manifest,groups={paths[2]:member},sourceJoints=[]))
    terminal=deepcopy(report)
    terminal["exports"]["subset"].update(coldManifestSha256=remainder["inputs"]["manifest"]["sha256"],exportedBodies=1)
    remainder["inputs"]["terminal"]=write_input("last-terminal.json",terminal)
    forbidden=invoke(remainder)
    assert forbidden.returncode and "entire retired design" in forbidden.stderr and not (base/remainder["destination"]).exists()
    selected=json.loads(dest.read_bytes())
    assert len(selected["members"])==2 and len(selected["boundaryJoints"])==1 and selected["installedRevalidation"]=="pending"
    assert json.loads(cli("design_iteration.py","check",project).stdout)["childCustody"]=="private replay pending"
    member=vault/selected["members"][0]["archiveSha256"]
    original=member.read_bytes();member.write_bytes(b"changed")
    assert cli("design_iteration.py","check",project,"--vault",vault).returncode
    member.write_bytes(original)
    assert cli("design_iteration.py","check",project,"--vault",vault).returncode==0
