"""Record and verify the selected files needed to resume an issued native design in another checkout."""
import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from design_iteration import put
import fusion_authority
from native_job import check_tree, files, pinned_json, require, sha, source_file


SCHEMA = "agent-frc/native-handoff@1"
NATIVE = {".f3d", ".f3z"}
NEUTRAL = {".step", ".stp"}
ROLES = {"child-native": NATIVE, "diagnostic-native": NATIVE, "diagnostic-step": NEUTRAL,
         "historical-native": NATIVE, "historical-step": NEUTRAL, "private-input": None}


def record(project, lineage_path, selected):
    project = project.resolve(strict=True)
    register = fusion_authority.register_path(project)
    register_path = register.relative_to(project).as_posix()
    source_file(project, register_path)
    lineage = source_file(project, lineage_path)
    lineage_hash = sha(lineage)
    issue = pinned_json(lineage, lineage_hash)
    proof = fusion_authority.verify(project, register, lineage)
    rows = []

    def add(name, role, basis, expected=None):
        path = source_file(project, name)
        digest = sha(path)
        require(expected is None or digest == expected, f"Registered bytes changed: {name}")
        rows.append(dict(path=name, role=role, basis=basis, bytes=path.stat().st_size, sha256=digest))

    add(issue["archive"]["file"], "canonical-native", "Registered Fusion issue", proof["archiveSha256"])
    add(issue["step"]["file"], "canonical-step", "Export named in the registered lineage", proof["stepSha256"])
    require(isinstance(selected, list), "Supply a list of additional files")
    for entry in selected:
        require(isinstance(entry, dict) and set(entry) == {"path", "role", "basis"},
                "Select each additional file by path, role and basis")
        name, role, basis = entry["path"], entry["role"], entry["basis"]
        require(role in ROLES and isinstance(basis, str) and basis.strip(), "Unknown transfer role or empty basis")
        require(ROLES[role] is None or Path(name).suffix.lower() in ROLES[role], f"Wrong file type for {role}")
        add(name, role, basis)
    files(rows)
    require(sha(lineage) == lineage_hash and sha(register) == issue["authority"]["sha256"],
            "Register or lineage changed during inventory")
    return dict(schema=SCHEMA, authority=issue["authority"], lineage=dict(file=lineage_path, sha256=lineage_hash),
                id=proof["id"], revision=proof["revision"], configuration=proof["configuration"],
                files=sorted(rows, key=lambda r: r["path"]))


def check(project, manifest, expected=None, payload=None):
    # The inventory travels with the project in Git. A digest of it is verified when one is given.
    expected = expected or sha(manifest)
    inventory = pinned_json(manifest, expected)
    require(inventory["schema"] == SCHEMA, "Unsupported transfer inventory")
    rows = inventory["files"]
    expected_files = files(rows)
    selected = [{k: row[k] for k in ("path", "role", "basis")} for row in rows
                if row["role"] not in ("canonical-native", "canonical-step")]
    actual = record(project, inventory["lineage"]["file"], selected)
    actual_rows = {row["path"]: row for row in actual["files"]}
    for row in rows:
        require(type(row["bytes"]) is int and actual_rows.get(row["path"]) == row,
                f"Receiving file differs in bytes, role or identity: {row['path']}")
    require(actual == inventory, "Receiving authority, lineage or full file selection differs")
    if payload is not None:
        check_tree(payload, expected_files)
    return dict(status="pass", manifestSha256=expected, revision=actual["revision"],
                verifiedFiles=len(rows), exactPayload=payload is not None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    capture = sub.add_parser("record", help="write a new transfer inventory")
    capture.add_argument("project", type=Path)
    capture.add_argument("lineage", help="project-relative lineage JSON path")
    capture.add_argument("selection", type=Path, help="JSON list of additional files with roles")
    capture.add_argument("manifest", type=Path)
    verify = sub.add_parser("check", help="verify the receiving checkout and optional exact payload directory")
    verify.add_argument("project", type=Path)
    verify.add_argument("manifest", type=Path)
    verify.add_argument("expected_sha256", nargs="?", help="Optional: the SHA-256 of the inventory, compared when given")
    verify.add_argument("--payload", type=Path)
    args = parser.parse_args()
    if args.command == "record":
        selected = json.loads(args.selection.read_text(encoding="utf-8-sig"))
        inventory = record(args.project, args.lineage, selected)
        with TemporaryDirectory(dir=args.manifest.parent) as tmp:
            put(args.manifest, inventory, Path(tmp))
        return dict(manifestSha256=sha(args.manifest), files=len(inventory["files"]))
    return check(args.project, args.manifest, args.expected_sha256, args.payload)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), indent=2))
    except (ValueError, OSError, TypeError, KeyError) as error:
        sys.exit(str(error))
