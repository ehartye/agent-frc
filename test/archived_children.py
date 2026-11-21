"""Exercise deliberate sealed-parent selection using a synthetic station packet."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path


def rooted_relationship_control():
    from types import SimpleNamespace as Obj
    from unittest import TestCase
    from fusion_occurrence_extract import relationships

    owners = [Obj(fullPathName=f"Mount:{n}") for n in (1, 2)]
    guides = [Obj(fullPathName=o.fullPathName+"+Guide:1") for o in owners]
    shafts = [Obj(fullPathName=o.fullPathName+"+Shaft:1") for o in owners]
    counts = {(path, kind): 0 for path in ["@root", *(o.fullPathName for o in owners + guides + shafts)]
              for kind in ("joint", "asBuilt", "rigidGroup")}
    fusion = Obj(RevoluteJointMotion=Obj(cast=lambda m: m.objectType == "revolute"),
                 SliderJointMotion=Obj(cast=lambda m: m.objectType == "slider"))
    joints, groups = [], []
    for i, owner in enumerate(owners):
        counts[owner.fullPathName, "asBuilt"] = 1
        counts[owner.fullPathName, "rigidGroup"] = 1
        joints.append(Obj(name="Pin axis", assemblyContext=owner, occurrenceOne=guides[i], occurrenceTwo=shafts[i],
                          isSuppressed=False, jointMotion=Obj(objectType="revolute", rotationValue=-0.3+i)))
        groups.append(Obj(name="Carriage", assemblyContext=owner, occurrences=[guides[i], shafts[i]]))
    slider = Obj(name="Travel", assemblyContext=owners[0], occurrenceOne=None, occurrenceTwo=guides[0],
                 isSuppressed=True, jointMotion=Obj(objectType="slider", slideValue=-1.5))
    counts[owners[0].fullPathName, "joint"] = 1
    fixed = Obj(name="Root seat", assemblyContext=None, occurrenceOne=None, occurrenceTwo=owners[0],
                isSuppressed=False, jointMotion=Obj(objectType="rigid"))
    counts["@root", "joint"] = 1
    root = Obj(allAsBuiltJoints=joints, allJoints=[slider, fixed], allRigidGroups=groups)
    rows, sets = relationships(root, counts, fusion)
    assert [(r["owner"], r["one"], r["two"], r["rotationRad"]) for r in rows[2:]] == [
        (o.fullPathName, g.fullPathName, s.fullPathName, -0.3+i)
        for i, (o, g, s) in enumerate(zip(owners, guides, shafts))]
    assert rows[0]["one"] == "Mount:1" and rows[0]["slideCm"] == -1.5 and rows[0]["suppressed"]
    assert rows[1]["owner"] == rows[1]["one"] == "@root" and rows[1]["two"] == "Mount:1"
    assert sets[1]["occurrences"] == [guides[1].fullPathName, shafts[1].fullPathName]
    case = TestCase()
    joints[0].occurrenceOne = guides[1]
    with case.assertRaisesRegex(ValueError, "Unresolved rooted relationship"):
        relationships(root, counts, fusion)
    joints[0].occurrenceOne = guides[0]
    groups[0].occurrences.append(None)
    with case.assertRaisesRegex(ValueError, "Missing member"):
        relationships(root, counts, fusion)
    groups[0].occurrences.pop()
    root.allAsBuiltJoints = joints[:1]
    with case.assertRaisesRegex(ValueError, "count differs"):
        relationships(root, counts, fusion)


def run(cli, project, base, vault, temp, parent):
    rooted_relationship_control()
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
