"""Verify a manually selected set of archived native occurrences and its cold extraction."""
import json
import math
from pathlib import Path
import re

from native_job import check_plan, no_link, relative, require, sha, source_file


INPUTS = {"parentRoster", "rosterTerminal", "registration", "recipe", "terminal", "manifest"}


def digest(value):
    require(isinstance(value, str) and re.fullmatch("[0-9a-f]{64}", value), "Invalid custody digest")
    return value


def indexed(rows, key):
    result = {}
    for row in rows:
        name = row[key]
        require(isinstance(name, str) and name.strip() and name not in result, f"Missing or duplicate {key}")
        result[name] = row
    return result


def real(value):
    return type(value) in (float, int) and math.isfinite(value)


def close(a, b, size, tolerance):
    return (isinstance(a, list) and isinstance(b, list) and len(a) == len(b) == size
            and all(real(x) and real(y) and abs(x-y) <= tolerance for x,y in zip(a,b)))


def body_readback(before, after):
    require(isinstance(before["materialId"],str) and before["materialId"] and
            all(type(before[k]) is int and before[k]>=0 for k in ("faces","edges","vertices")) and
            before["faces"]>0,"Incomplete native body properties")
    for key in ("materialId", "faces", "edges", "vertices"):
        require(before[key] == after[key], f"Cold member {key} differs")
    a, b = before["volumeCm3"], after["volumeCm3"]
    require(real(a) and real(b) and min(a,b)>0 and abs(a-b) <= .00001 and
            close(before["localBoundsCm"], after["localBoundsCm"], 6, .0001), "Cold member geometry differs")


def edge_key(edge):
    values = tuple(edge[key] for key in ("name","one","two","motion"))
    require(all(isinstance(v,str) and v.strip() for v in values), "Incomplete native joint identity")
    return values


def collect(request, request_dir, vault, archive):
    require(set(request["inputs"]) == INPUTS, "Pin the full parent roster, registration, recipe, terminal result and manifest")
    pins = {}
    files = {}
    for key, item in request["inputs"].items():
        path = Path(item["file"])
        file = path if path.is_absolute() else source_file(request_dir,item["file"])
        no_link(file)
        pins[key] = digest(item["sha256"])
        archive(file,pins[key],vault)
        files[key] = file
    manifest = json.loads(source_file(vault,pins["manifest"]).read_bytes())
    for member in manifest["groups"].values():
        file = source_file(files["manifest"].parent,member["file"])
        archive(file,digest(member["sha256"]),vault)
    return pins


def selection(entry, vault):
    request_file = source_file(vault,digest(entry["requestSha256"]))
    require(sha(request_file)==entry["requestSha256"],"Private source selection changed")
    request = json.loads(request_file.read_bytes())
    require(request["schema"]=="agent-frc/archived-occurrence-request@1" and
            all(request[k]==entry[k] for k in ("id","iteration","sourceIteration","evidenceId","sourceSha256","destination",
                                               "configuration","sourcePose","occurrences","exportId","justification","changedConditions","revalidation")),
            "Original selection decision differs")
    pins = entry["proof"]
    require(set(pins)==INPUTS and {k:v["sha256"] for k,v in request["inputs"].items()}==pins, "Incomplete extraction proof")
    evidence = {}
    for key, value in pins.items():
        file = source_file(vault,digest(value))
        require(sha(file)==value, f"Changed {key}")
        if key != "recipe":
            evidence[key] = json.loads(file.read_bytes())
    parent = entry["sourceSha256"]
    archive = source_file(vault,digest(parent))
    require(sha(archive)==parent, "Sealed native parent differs")
    job = evidence["registration"]
    registered = check_plan(job)
    recipe = relative(job["recipe"])
    require(parent in registered.values() and recipe.parts[0]=="inputs" and
            registered.get(Path(*recipe.parts[1:]).as_posix())==pins["recipe"],
            "Extraction job must pin the selected native parent and its actual project recipe")
    report, manifest = evidence["terminal"], evidence["manifest"]
    export = report["exports"][entry["exportId"]]
    require(report["job"]==job["jobId"] and report["parent"]==parent and report["parentUnchanged"] is True
            and report["restored"] is True and not report.get("error") and export["coldManifestSha256"]==pins["manifest"],
            "Terminal native result differs or lacks the cold export")
    require(manifest["nativeParent"]==parent and manifest["configuration"]==entry["configuration"],
            "Extraction parent or configuration differs")
    roster = evidence["parentRoster"]
    done=evidence["rosterTerminal"]
    if "sourceStep" in roster or "placedStepParent" in manifest:
        require(digest(roster["sourceStep"])==manifest["placedStepParent"],"Placed source revisions differ")
    require(roster["sourceArchive"]==parent==done["sourceArchive"] and roster["pose"]==entry["sourcePose"]
            and done["status"]=="complete" and done["roster"]==pins["parentRoster"] and done["sourceUnchanged"] is True
            and not done.get("error") and roster["fusion"]==done["fusion"]==report["build"],
            "Require an independent complete source occurrence roster for this parent and configuration")
    source = indexed(roster["occurrences"],"occurrence")
    total = 0
    for row in source.values():
        names = row["solids"]
        require(isinstance(names,list) and all(isinstance(n,str) and n for n in names) and len(set(names))==len(names),
                "Invalid or duplicate parent body identity")
        total += len(names)
    require(total==roster["allBodies"]==done["bodies"] and roster["rootPath"] in source and
            len(source)==done["occurrences"]+1 and len(roster["joints"])==done["joints"], "Parent census count differs")
    members = indexed(manifest["groups"].values(),"occurrence")
    chosen = entry["occurrences"]
    require(isinstance(chosen,list) and chosen and len(chosen)==len(set(chosen)) and set(chosen)==set(members)
            and set(chosen)<=source.keys() and roster["rootPath"] not in members, "Choose exact proper native occurrences")
    result, count = [], 0
    for name in sorted(chosen):
        g, original = members[name], source[name]
        before, cold = g["bodies"], g["cold"]
        require(before and set(before)==set(cold)==set(original["solids"]) and not original["otherBodies"] and
                not any(p.startswith(name+"+") for p in source), "Choose complete, solid-bearing leaf components")
        require((g["component"],g["partNumber"])==(original["component"],original["partNumber"])
                and close(g["matrixCm"],original["matrixCm"],16,1e-7), "Native occurrence identity or pose differs")
        child = digest(g["sha256"])
        require(child != parent and sha(source_file(vault,child))==child, "Missing or substituted child archive")
        for body, props in before.items():
            body_readback(props,cold[body])
        count += len(cold)
        result.append(dict(occurrence=name, component=g["component"], partNumber=g["partNumber"],
                           matrixCm=g["matrixCm"], bodies=sorted(cold), archiveSha256=child))
    require(count == export["exportedBodies"] and 0 < count < total,
            "Selected bodies must be a strict subset of the complete archived design")
    require(all(j["one"] in source and j["two"] in source for j in roster["joints"]),"Unknown native joint endpoint")
    internal = [j for j in roster["joints"] if j["one"] in members and j["two"] in members]
    edges = {edge_key(j):j for j in internal}
    emitted = [edge_key(j) for j in manifest["sourceJoints"]]
    require(len(emitted)==len(internal)==len(edges) and set(emitted)==edges.keys(), "Internal native joint edges differ")
    for row in manifest["sourceJoints"]:
        original=edges[edge_key(row)]
        if "parkedRad" in row:
            require(real(row["parkedRad"]) and real(original["rotationRad"]) and
                    abs(row["parkedRad"]-original["rotationRad"])<=1e-7,"Source joint coordinate differs")
    boundary = [j for j in roster["joints"] if (j["one"] in members)!=(j["two"] in members)]
    groups=[]
    for group in roster["rigidGroups"]:
        require(set(group["occurrences"])<=source.keys(),"Unknown native rigid group member")
        if set(group["occurrences"]) & members.keys():
            groups.append(group)
    return dict(schema="agent-frc/selected-archive-occurrences@1", nativeParent=parent,
                configuration=entry["configuration"], parentBodies=total, members=result,
                internalJoints=internal, boundaryJoints=boundary, sourceRigidGroups=groups, installedRevalidation="pending")
