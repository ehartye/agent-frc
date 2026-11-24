"""Small helpers the preliminary path shares: read a project file, check an input and resolve a file reference.

They hold no geometry and import nothing of the plugin, so the check, its review page and the staging commands can use
them without loading the detailed-design path. The layout judgement names its files by path alone (reference); the
digest helpers below serve the detailed-design review, which pins its own evidence."""
from hashlib import file_digest
import json
import math
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path):
    with path.open("rb") as source:
        return file_digest(source, "sha256").hexdigest()


def named(value):
    return isinstance(value, str) and bool(value.strip())


def number(value):
    return type(value) in (float, int) and math.isfinite(value)


def require(condition, text):
    if not condition:
        raise ValueError(text)


def project_path(root, name):
    require(named(name) and not Path(name).is_absolute(), "Use a project-relative file")
    result = (root/name).resolve()
    require(result.is_relative_to(root) and result.is_file(), "Unresolved project file: "+name)
    return result


def reference(root, ref, where, problems, kind="file"):
    """The project file (or folder) a {file} or {folder} reference names, or None with the problem appended.

    A reference holds its path and nothing else: no digest is typed or checked, because judging reads what a file says
    now, and the one record of what was judged is gate.json."""
    if not (isinstance(ref, dict) and named(ref.get(kind))):
        problems.append("Name " + where + " as {" + kind + ": PATH}, a project-relative path")
        return None
    extra = sorted(set(ref) - {kind})
    if extra:
        problems.append("A " + kind + " reference is {" + kind + "}: " + where + " holds " + ", ".join(extra))
        return None
    name = ref[kind]
    found = (root / name).resolve() if not Path(name).is_absolute() else None
    if found is None or not found.is_relative_to(root) or not (found.is_dir() if kind == "folder" else found.is_file()):
        if kind == "folder" and found is not None and found.is_relative_to(root) and not found.exists():
            return found
        problems.append("Unresolved project " + kind + ": " + name)
        return None
    return found


def pinned(root, ref):
    """The project file a reference names. A SHA-256 the author typed is verified; none is required.

    A reference written as {"file": "..."} is given the digest of the file as read, so a result still records what
    was checked."""
    require(isinstance(ref, dict), "Missing revision-bound file")
    target = project_path(root,ref.get("file"))
    if ref.get("sha256") is None:
        ref["sha256"] = digest(target)
        return target
    require(digest(target)==ref.get("sha256"), "Changed evidence: "+ref["file"])
    return target


# Keys that may sit beside `file` in a reference an author writes without a SHA-256.
PATH_REFERENCE = {"file", "role", "field"}


def path_reference(node):
    """Whether a node is a file reference that names its project-relative path and no SHA-256."""
    return isinstance(node, dict) and named(node.get("file")) and set(node) <= PATH_REFERENCE


def resolve_references(root, node):
    """Return a copy of a plan or record in which every path-only file reference also holds its SHA-256.

    An author names a file by its project-relative path, as {"file": "..."}. The checker reads the file and records
    the digest it found, so the record still says what was checked. A reference that already holds a sha256 is left
    as typed and is verified wherever it is used."""
    if path_reference(node):
        return dict(node, sha256=digest(project_path(root, node["file"])))
    if isinstance(node, dict):
        return {key: resolve_references(root, value) for key, value in node.items()}
    if isinstance(node, list):
        return [resolve_references(root, value) for value in node]
    return node
