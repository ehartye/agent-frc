"""Archive an outgoing design, start a blank numbered iteration, and record deliberate imports."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import hashlib
import subprocess
import sys
from tempfile import TemporaryDirectory

from native_job import lease, no_link, relative, require, sha, source_file


def read(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def write(file, value):
    with file.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


def label(value):
    require(isinstance(value, str) and bool(value.strip()), "Supply a nonempty description")
    return value.strip()


def identifier(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value), "Invalid identity")
    return value


def directory(number):
    require(type(number) is int and 1 <= number <= 999, "Invalid iteration number")
    return f"{number:03d}"


def pointer(number, identity):
    return dict(schema="agent-frc/active-iteration@1", number=number, id=identifier(identity),
                root=f"iterations/{directory(number)}/design")


def put(file, value, tmp):
    """A failed or interrupted cutover may finish only its own matching pending records."""
    if file.exists():
        no_link(file)
        require(read(file) == value, f"Existing record differs: {file}")
    else:
        staged = tmp / str(len(list(tmp.iterdir())))
        write(staged, value)
        os.link(staged, file)


def inventory(folder):
    entries = {}
    if folder.exists():
        no_link(folder)
        for current, dirs, names in os.walk(folder):
            for n in dirs + names:
                no_link(Path(current)/n)
            for n in names:
                file = Path(current)/n
                require(file.is_file(), f"Unsupported archive member: {file}")
                name = file.relative_to(folder).as_posix()
                if name != ".gitkeep" or file.stat().st_size:
                    entries[name] = sha(file)
    return entries


def current(project):
    file = project/"iterations/active.json"
    if not file.exists():
        return None
    record = read(source_file(project, "iterations/active.json"))
    require(record == pointer(record["number"], record["id"]), "Invalid active design pointer")
    start = read(source_file(project, f"iterations/{directory(record['number'])}/iteration.json"))
    require((start["id"], start["number"]) == (record["id"], record["number"]), "Active design identity differs")
    for name in ("design","carry-forward"):
        folder = project/record["root"]
        target = folder if name=="design" else folder.parent/name
        no_link(target)
        require(target.is_dir(), f"Missing active iteration directory: {name}")
    return record


def archive_file(file, digest, vault):
    require(re.fullmatch(r"[0-9a-f]{64}", digest) and sha(file) == digest, f"Changed outgoing evidence: {file}")
    obj = vault / digest
    if not obj.exists():
        with TemporaryDirectory(dir=vault) as temporary:
            blob = Path(temporary)/"blob"
            shutil.copyfile(file, blob)
            require(sha(blob) == digest, f"File changed during capture: {file}")
            try:
                os.link(blob, obj)
            except FileExistsError:
                pass
    no_link(obj)
    require(sha(obj) == digest, f"Private custody digest differs: {digest}")


def claims(rows, ids, keys):
    require(isinstance(rows, list) and rows, "Supply the outgoing observations")
    for row in rows:
        for k in keys:
            label(row[k])
        require(isinstance(row["evidence"], list) and row["evidence"] and set(row["evidence"]) <= ids,
                "Each observation needs registered supporting evidence")
    return [{k:row[k] for k in (*keys, "evidence")} for row in rows]


def harvest(project, old, plan, vault):
    evidence = {}
    for row in plan["evidence"]:
        key = identifier(row["id"])
        require(key not in evidence, "Duplicate source identity")
        kind = row["kind"]
        require(kind in {"design", "image", "result", "element", "notes"}, "Unknown evidence kind")
        path = Path(row["file"])
        file = path if path.is_absolute() else source_file(project, row["file"])
        no_link(file)
        archive_file(file, row["sha256"], vault)
        evidence[key] = dict(kind=kind, source=label(row["source"]), sha256=row["sha256"])
    kinds = {r["kind"] for r in evidence.values()}
    require({"design","image","result"} <= kinds, "Archive the outgoing design, a visual and a result")
    require(any(evidence.get(k, {}).get("kind")=="image" for h in plan["highlights"] for k in h["evidence"]),
            "Link a preserved image to its highlight")
    design_hashes = {r["sha256"] for r in evidence.values() if r["kind"]=="design"}
    require(not any(r["sha256"] in design_hashes for r in evidence.values() if r["kind"]=="element"),
            "A whole outgoing design cannot be registered as an individual element")
    frozen = {}
    if old:
        active_dir = project/old["root"]
        iteration_dir = active_dir.parent
        for folder in ("design", "carry-forward"):
            for name, digest in inventory(iteration_dir/folder).items():
                archive_file(iteration_dir/folder/name, digest, vault)
                frozen[f"{folder}/{name}"] = digest
    register = project/(old["root"] if old else ".")/"cad/fusion-authority.json"
    old_source = {}
    if register.exists():
        authority = read(register)
        source = authority["source"]
        old_source = {"id": authority["id"], "authoritySha256": sha(register)}
        require(authority["id"] != plan["to"]["fusionId"], "Reserve a new Fusion identity")
        if source["kind"] == "cloud":
            old_source["dataFileId"] = label(source["dataFileId"])
        elif source["kind"] == "offline":
            require(any(r["kind"]=="design" and r["sha256"]==source["archive"]["sha256"] for r in evidence.values()),
                    "Harvest the exact outgoing native master")
    return dict(fusionSource=old_source, schema="agent-frc/retrospective@1", number=plan["from"]["number"], id=plan["from"]["id"],
                decision=label(plan["reason"]), preservation=label(plan["preservation"]), evidence=evidence,
                highlights=claims(plan["highlights"], evidence.keys(), ("finding",)),
                failures=claims(plan["failures"], evidence.keys(), ("finding",)),
                lessons=claims(plan["lessons"], evidence.keys(), ("observation","nextChange")), files=frozen)


def review(project, vault=None, pending=None, preparing=False, migration=None):
    active=current(project)
    if not active:
        require(preparing or not any((project/"iterations").glob("[0-9][0-9][0-9]")),
                "Numbered records exist without an active pointer; inspect and finish the original cutover")
        return dict(active=None, root=".", authority="cad/fusion-authority.json")
    iterations=project/"iterations"
    if not preparing:
        require(not any(int(f.name)>active["number"] for f in iterations.glob("[0-9][0-9][0-9]")),
                "A later iteration exists; inspect the interrupted cutover or stale pointer")
    previous_id=None
    prior={}
    names=set()
    old_digests=set()
    master_hashes=set()
    for i in range(1,active["number"]+1):
        base=iterations/directory(i)
        opening=read(source_file(project,f"iterations/{directory(i)}/iteration.json"))
        require(opening["number"]==i and opening["previous"]==previous_id and opening["id"] not in names,
                "Iteration history is incomplete or renumbered")
        names.add(opening["id"])
        previous_id=opening["id"]
        if i==active["number"]:
            break
        retro=read(source_file(project,f"iterations/{directory(i)}/retrospective.json"))
        successor=read(source_file(project,f"iterations/{directory(i+1)}/iteration.json"))
        opening_hash = sha(base/"iteration.json")
        decision_hash = sha(base/"retrospective.json")
        expected = retro.get("openingSha256")
        if expected is None:
            seal = migration if migration and migration["number"]==i else read(source_file(project,f"iterations/seals/{directory(i)}.json"))
            require(seal["schema"]=="agent-frc/iteration-history-seal@1" and seal["number"]==i and
                    seal["retrospectiveSha256"]==decision_hash and re.fullmatch(r"[0-9a-f]{40}",seal["commit"]),
                    "Historical opening seal differs")
            expected=seal["openingSha256"]
        require(expected==opening_hash and retro["id"]==previous_id and retro["number"]==i
                and successor["retrospectiveSha256"]==decision_hash, "Archived decision changed")
        observed={f"{f}/{n}":d for f in ("design","carry-forward") for n,d in inventory(base/f).items()}
        require(observed==retro["files"], "Retired iteration contents changed")
        for k,r in retro["evidence"].items():
            prior[(i,k)]=r
            old_digests.add(r["sha256"])
            if r["kind"]=="design":
                master_hashes.add(r["sha256"])
        old_digests.update(observed.values())
        if vault:
            for digest in set(observed.values()) | {r["sha256"] for r in retro["evidence"].values()}:
                require(sha(source_file(vault,digest))==digest, f"Missing archived evidence: {digest}")
    base=project/active["root"]
    files=inventory(base)
    explicit={}
    for name in inventory(base.parent/"carry-forward"):
        rec=read(base.parent/"carry-forward"/name)
        validate_import(rec,active,prior,base)
        require(rec["destination"] not in explicit, "Duplicate manual import destination")
        explicit[rec["destination"]]=rec
    if pending:
        validate_import(pending,active,prior,base)
        at=pending["destination"]
        require(at not in explicit or pending==explicit[at], "Destination already imported")
        explicit[at]=pending
    for name, value in files.items():
        require(value not in master_hashes, "A retired whole design cannot appear as a successor artifact")
        if value in old_digests:
            require(name in explicit and explicit[name]["sourceSha256"]==value,
                    "Historical bytes must match the exact deliberately selected source")
    return dict(active=active, root=active["root"], authority=active["root"]+"/cad/fusion-authority.json",
                manualImports=len(explicit), historyVerified=active["number"]-1, _prior=prior)


def validate_import(entry,active,prior,base):
    require(entry.get("schema")=="agent-frc/iteration-import@1" and entry.get("iteration")==active["id"],
            "Carry-forward must name the active successor")
    identifier(entry["id"])
    asset=prior.get((entry["sourceIteration"],entry["evidenceId"]))
    require(asset and asset["kind"]=="element" and asset["sha256"]==entry["sourceSha256"],
            "Select one registered element; a prior whole design cannot become the new master")
    for k in ("justification","changedConditions","revalidation"):
        label(entry[k])
    require(sha(source_file(base,entry["destination"]))==entry["destinationSha256"], "Imported artifact differs from its recorded bytes")


def cutover(project, plan, vault):
    require(plan["schema"]=="agent-frc/design-restart@1","Wrong restart plan")
    vault=vault.resolve()
    require(not vault.is_relative_to(project) and not project.is_relative_to(vault), "Keep private custody outside the project")
    vault.mkdir(parents=True,exist_ok=True)
    it=project/"iterations"
    it.mkdir(exist_ok=True); no_link(it)
    with lease(it/"design-iterations",publication=True), TemporaryDirectory(dir=it,prefix=".starting-") as t:
        tmp=Path(t)
        for name,contents in ((".gitattributes","* -text\n"),(".gitignore","/.native-publish-design-iterations\n/.starting-*/\n/.selecting-*/\n/.sealing-*/\n")):
            if not (it/name).exists():
                (it/name).write_text(contents,encoding="ascii",newline="\n")
        old=current(project)
        frm=plan["from"];next_id=identifier(plan["to"]["id"])
        n=frm["number"];last=identifier(frm["id"]);num=directory(n);nxt=directory(n+1)
        require((old==pointer(n,last) if old else n==1) and last!=next_id,"Stale restart or unchanged design identity")
        # The old tree is verified before anything is written there. Recovery after
        # interruption is safe because existing preparation must match byte for byte.
        review(project,vault,preparing=True)
        require(all(read(it/directory(i)/"iteration.json")["id"]!=next_id for i in range(1,n)),"Reused historical identity")
        retro=harvest(project,old,plan,vault)
        native_id=identifier(plan["to"]["fusionId"])
        require(native_id==next_id,"Reserve one fresh engineering/Fusion identity for the successor")
        old_dir=it/num;new_dir=it/nxt
        require(not any(int(f.name)>n+1 for f in it.glob("[0-9][0-9][0-9]")), "A later design already exists")
        if not old and old_dir.exists():
            no_link(old_dir)
            require(set(x.name for x in old_dir.iterdir())<={"iteration.json","retrospective.json"}, "Occupied outgoing number")
        old_dir.mkdir(exist_ok=True);no_link(old_dir)
        if not old:
            put(old_dir/"iteration.json",dict(schema="agent-frc/design-iteration@1",number=n,id=last,previous=None,
                                              reason="Adopt existing design history",scope=label(frm["scope"])),tmp)
        retro["openingSha256"]=sha(old_dir/"iteration.json")
        put(old_dir/"retrospective.json",retro,tmp)
        opening=dict(schema="agent-frc/design-iteration@1",id=next_id,number=n+1,previous=last,
                     scope=label(plan["to"]["scope"]),reason=label(plan["reason"]),fusionId=native_id,
                     retrospectiveSha256=sha(old_dir/"retrospective.json"))
        if not new_dir.exists():
            staged=tmp/"new";staged.mkdir()
            write(staged/"iteration.json",opening)
            for name in ("design", "carry-forward"):
                folder=staged/name
                folder.mkdir()
                (folder/".gitkeep").touch()
            staged.rename(new_dir)
        no_link(new_dir)
        require(set(x.name for x in new_dir.iterdir())=={"iteration.json","design","carry-forward"}
                and read(new_dir/"iteration.json")==opening and not inventory(new_dir/"design") and not inventory(new_dir/"carry-forward"),
                "Successor folder occupied or belongs to a different cutover")
        record=pointer(n+1,next_id)
        candidate=tmp/"active.json";write(candidate,record)
        os.replace(candidate,it/"active.json")
        return record


def seal_prototype(project, commit, vault):
    """Bind the first prototype's unsealed opening to its already committed original bytes."""
    require(re.fullmatch(r"[0-9a-f]{40}",commit), "Select the complete known original cutover commit")
    it=project/"iterations"
    with lease(it/"design-iterations",publication=True), TemporaryDirectory(dir=it,prefix=".sealing-") as temporary:
        require(current(project)["number"]>=2, "No completed cutover to seal")
        require("openingSha256" not in read(it/"001/retrospective.json"), "History already has a native seal")
        values={}
        for name in ("001/iteration.json","001/retrospective.json","002/iteration.json"):
            file=source_file(project,"iterations/"+name)
            original=subprocess.check_output(["git","-C",str(project),"show",commit+":iterations/"+name])
            require(hashlib.sha256(original).hexdigest()==sha(file),"Current archive differs from the approved Git evidence: "+name)
            values[name]=sha(file)
        record=dict(schema="agent-frc/iteration-history-seal@1",number=1,commit=commit,
                    openingSha256=values["001/iteration.json"],retrospectiveSha256=values["001/retrospective.json"])
        result=review(project,vault,migration=record)
        target=it/"seals";target.mkdir(exist_ok=True);no_link(target)
        put(target/"001.json",record,Path(temporary))
        return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="action",required=True)
    for name in ("start","check","carry"):
        p=sub.add_parser(name);p.add_argument("project",type=Path)
        if name!="check":p.add_argument("input",type=Path)
        if name!="carry":p.add_argument("--vault",type=Path,required=name=="start")
    s=sub.add_parser("seal");s.add_argument("project",type=Path)
    s.add_argument("--from-commit",required=True);s.add_argument("--vault",type=Path,required=True)
    args=parser.parse_args();project=args.project.resolve(strict=True)
    if args.action=="start":result=cutover(project,read(args.input),args.vault)
    elif args.action=="seal":result=seal_prototype(project,args.from_commit,args.vault)
    elif args.action=="check":result=review(project,args.vault)
    else:
        it=project/"iterations"
        with lease(it/"design-iterations",publication=True), TemporaryDirectory(dir=it,prefix=".selecting-") as t:
            active=current(project);require(active,"Start an iteration first")
            # The manual copy precedes its receipt. Validate history without using
            # the new unregistered destination as an accepted import.
            pending=read(args.input)
            review(project, pending=pending)
            base=project/active["root"]
            put(base.parent/"carry-forward"/(identifier(pending["id"])+".json"),pending,Path(t))
            result=review(project)
    result.pop("_prior",None)
    print(json.dumps(result,indent=2))


if __name__=="__main__":
    try:main()
    except (OSError,ValueError,KeyError,TypeError) as exc:sys.exit(str(exc))
