"""Publish a judged preliminary design release into the season site, set a release's design status, republish the view
of an effective release, copy a release's inputs to a new release folder, or remove a release.

A new release takes a version as its ID, MAJOR.MINOR. The major number is the architecture and carries its name, given
once with --design-name. The minor number counts the effective baselines of that architecture. A draft is a publish
of an in-progress version and takes no number: staging the same ID again counts it.

The coding agent runs this file from the installed plugin, at the project root. A project holds no copy of it.

Staging judges the committed records and measures nothing: a record that is stale or missing, or a verdict other than
layout-checked, is refused. It publishes what was judged, byte for byte: each file of the design source, the judgement
file with its reference to the season's requirements, the page file, each record judged and the review page.

Marking a release effective first runs the stage gate (stage-gate.mjs), which judges the committed records, requires every
one of them current and the effective-readiness report to meet every criterion, and measures nothing. The status is set
only when the gate passes, and the gate's record, gate.json, is written beside the published release; a refused release
keeps its status and gains no record. Withdrawing a release is a status change: the index keeps the reason and the last
commit that held its published files, and the files leave the site."""
import argparse
import datetime
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

STATUSES = ("in-progress", "effective", "superseded", "withdrawn")
SCENE = "review-scene.json.gz"
VERSION = re.compile(r"([1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})")
PER_RELEASE = ("designStatus", "revision", "accepted", "refreshed", "reason", "lastCommit")
# What a push does with the change just made, said after each command. The method: docs/testing-methodology.md.
ON_PUSH = "On push: the project's workflow publishes the page. Nothing is rerun."
BEFORE_PUSH = "Before pushing, run the publication check: node PLUGIN/scripts/design-publication.mjs check ."
GATE, JUDGEMENT, PAGE, SCENE_CHECK = "gate.json", "judgement.json", "review.html", Path(__file__).resolve().with_name("review-scene.mjs")
GATE_COMMAND = ["node", str(Path(__file__).resolve().with_name("stage-gate.mjs"))]


def read(path):
    return json.loads(path.read_bytes())


def inside(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("Missing release input: " + str(name))
    return path


def replace_index(temporary, site):
    """Rename the complete new index over the old one, so a reader finds one or the other.

    Windows refuses the rename while a reader holds the index open; the reader finishes shortly."""
    for attempt in range(500):
        try:
            Path(temporary).replace(site / "releases.json")
            return
        except PermissionError:
            if attempt == 499:
                raise
            time.sleep(0.02)


@contextmanager
def update_index(site):
    # The OS releases this advisory lock on process exit, even after a crash.
    key = hashlib.sha256(os.path.normcase(str(site.resolve())).encode()).hexdigest()
    lock = Path(tempfile.gettempdir()) / ("preliminary-review-" + key + ".lock")
    with lock.open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def load_index(site):
    listing = site / "releases.json"
    record = read(listing) if listing.exists() else {"releases": []}
    names = record["releases"]
    if len(names) != len(set(names)):
        raise ValueError("The release index lists a release twice")
    return record


def status_of(record, release):
    """A listed release without a designStatus entry is in progress."""
    return (record.get("designStatus") or {}).get(release, "in-progress")


def version_of(release):
    """(major, minor) of a version ID such as 1.0, else None."""
    match = VERSION.fullmatch(release or "")
    return (int(match[1]), int(match[2])) if match else None


def major_of(release):
    version = version_of(release)
    return version[0] if version else None


def design_name(record, major):
    """The name of the architecture a major number stands for, from the index."""
    name = ((record.get("designs") or {}).get(str(major)) or {}).get("name")
    return name if isinstance(name, str) and name.strip() else None


def title_of(record, release):
    """A version reads NAME MAJOR.MINOR."""
    name = design_name(record, major_of(release))
    return name + " " + release if name else release


def described(record, release):
    return "preliminary design " + title_of(record, release)


def state_of(record, release):
    """What a reader sees after the name: the draft count while in progress, then the status."""
    status = status_of(record, release)
    return ("draft " + str(revision_of(record, release)) + ", in progress") if status == "in-progress" else status


def in_progress_of(record, major, besides=None):
    """The in-progress version of an architecture, if it has one."""
    return next((r for r in record["releases"] if r != besides and major_of(r) == major and status_of(record, r) == "in-progress"), None)


def place_version(record, release, name):
    """Name the architecture of a version being staged and check where the version falls among those listed.

    Returns notes for the person staging. It refuses only what the index cannot hold: an unnamed architecture, a second
    name for one architecture, a second in-progress version of one architecture and a version behind one already listed."""
    major, minor = version_of(release)
    known, notes = design_name(record, major), []
    if name is not None:
        name = " ".join(name.split())
        if not 0 < len(name) <= 60:
            raise ValueError("Give the design a short name in words with --design-name, 60 characters at most")
    if known is None:
        if not name:
            raise ValueError("Name design " + str(major) + " with --design-name \"NAME\": a short name in words for the architecture. "
                             "Give it once, the first time a major number is staged; every version of that architecture keeps it")
        other = next((m for m in (record.get("designs") or {}) if (design_name(record, m) or "").lower() == name.lower()), None)
        if other:
            notes.append("design " + other + " is also named \"" + name + "\". A different architecture takes its own name.")
        record.setdefault("designs", {})[str(major)] = dict(name=name)
    elif name and name != known:
        raise ValueError("Design " + str(major) + " is named \"" + known + "\". A name stays with its architecture: a different architecture "
                         "takes the next major number with its own name. Correct a spelling by editing designs in releases.json in a pull request")
    if release in record["releases"]:
        return notes
    drafting = in_progress_of(record, major)
    if drafting:
        raise ValueError(title_of(record, drafting) + " is already in progress (draft " + str(revision_of(record, drafting)) + "). Revise it in "
                         "place: stage " + drafting + " again. A draft takes no number; a new number is for a new effective baseline or a new architecture")
    minors = [version_of(r)[1] for r in record["releases"] if major_of(r) == major]
    majors = sorted({major_of(r) for r in record["releases"]})
    if minors:
        following = str(major) + "." + str(max(minors) + 1)
        if minor < max(minors):
            raise ValueError("Version " + release + " comes before " + str(major) + "." + str(max(minors)) + ", which is already listed. The next version of "
                             + design_name(record, major) + " is " + following)
        if release != following:
            notes.append("the version after " + str(major) + "." + str(max(minors)) + " is " + following + "; " + release + " skips a number.")
        return notes
    if minor:
        notes.append("the first version of an architecture is " + str(major) + ".0; everything before its first effective baseline is a draft of " + str(major) + ".0.")
    if major != (majors[-1] + 1 if majors else 1):
        notes.append("the next architecture " + ("after design " + str(majors[-1]) + " is " + str(majors[-1] + 1) + ".0" if majors else "is 1.0") + "; " + release + " skips a number.")
    for earlier in majors:
        left = in_progress_of(record, earlier)
        if left:
            notes.append(title_of(record, left) + " is still in progress. If the team has left that architecture, mark it superseded or withdraw it.")
    return notes


def current_for(record):
    """The release the stable URL opens: the effective one, else the newest in-progress one, else the newest not withdrawn."""
    names = record["releases"]
    return (next((n for n in names if status_of(record, n) == "effective"), None)
            or next((n for n in reversed(names) if status_of(record, n) == "in-progress"), None)
            or next((n for n in reversed(names) if status_of(record, n) != "withdrawn"), None)
            or (names[-1] if names else None))


def save_index(record, site):
    record["current"] = current_for(record)
    if record["current"] is None:
        del record["current"]
    with tempfile.NamedTemporaryFile("w", dir=site, delete=False, encoding="utf-8", suffix=".json") as out:
        out.write(json.dumps(record, indent=2) + "\n")
    replace_index(out.name, site)


def checked_id(release):
    if not version_of(release):
        raise ValueError("Use a version as the release ID: MAJOR.MINOR, such as 1.0")
    return release


def judged(season, file):
    """The verdict of the layout judgement on the committed records. Measures nothing; refuses a stale or missing record."""
    from kernel_layout.verdict import judge
    return judge(season, file, judge_only=True)


def scene_problems(scene, verdict):
    """Why a review scene cannot be published: the page cannot play it, or it does not repeat the verdict. Empty when it can."""
    with tempfile.TemporaryDirectory() as temp:
        file = Path(temp) / "verdict.json"
        file.write_text(json.dumps(verdict), encoding="utf-8")
        run = subprocess.run(["node", str(SCENE_CHECK), "validate", str(scene), "--verdict", str(file)], capture_output=True, text=True, encoding="utf-8")
    try:
        return json.loads(run.stdout)["errors"]
    except (ValueError, KeyError):
        return [run.stderr.strip() or "unreadable " + scene.name]


def publishable(season, inputs, judgement, verdict):
    """{published name: file} of what staging copies: what was judged, the page file and the review page. Refuses a judged
    source or record outside the release folder, where a change to it would not touch the release."""
    own, names = inputs.relative_to(season).as_posix() + "/", []
    for name in [n for group in ("source", "parts", "records") for n in verdict["files"][group]]:
        if not name.startswith(own):
            raise ValueError("Keep " + name + " in the release folder, " + own.rstrip("/") + ": a change to a file elsewhere would not touch the release")
    names = [*verdict["files"]["source"], own + JUDGEMENT, *verdict["files"]["records"]]
    page = (judgement.get("page") or {}).get("file")
    if page:
        if not page.startswith(own):
            raise ValueError("Keep " + page + " in the release folder beside its judgement file")
        names.append(page)
    files = {name[len(own):]: inside(season, name) for name in names}
    for name in (PAGE, SCENE):
        if not (inputs / name).is_file():
            raise ValueError("Build the page first: design preliminary-page . " + own + JUDGEMENT + " writes " + PAGE + " and " + SCENE)
    return {**files, "index.html": inputs / PAGE, SCENE: inputs / SCENE}


def stage(season, inputs, release, design=None, refresh=False):
    """Copy one release's judged files into the site and list it in the index as in progress.

    An in-progress release is revised in place: staging its ID again replaces its published files and counts a
    draft in the index, under `revision`. A release stops changing when it is marked effective, and stays so afterwards.

    refresh republishes the view of the effective release: a rebuilt review page or a reworded page file. Its gate record
    must still stand for every file it judged. The status, the accepted date and the draft count stay as they are."""
    checked_id(release)
    season, inputs = season.resolve(), inputs.resolve()
    site = season / "docs/preliminary-design"
    plan_file = inside(inputs, JUDGEMENT)
    if refresh:
        held(load_index(site), release, season)
    judgement, verdict = read(plan_file), judged(season, plan_file)
    if verdict["status"] != "layout-checked":
        raise ValueError("A preliminary release needs a layout-checked design; its records judge it " + verdict["status"] + ": "
                         + ((verdict.get("firstUnmet") or {}).get("text") or "no reason given"))
    files = publishable(season, inputs, judgement, verdict)
    problems = scene_problems(files[SCENE], verdict)
    if problems:
        raise ValueError("The review scene does not repeat the verdict: " + "; ".join(problems[:5]) + ". Build the page again: design preliminary-page . "
                         + plan_file.relative_to(season).as_posix())

    record = dict(schema="agent-frc/preliminary-release@2", release=release, issue=verdict["issue"], phase="preliminary-design",
                  # Where the stage gate and the publication check find the committed inputs to judge.
                  check=dict(project=inputs.relative_to(season).as_posix()),
                  # The season's requirements are shared by every release: the judgement file points to them and they are not copied.
                  requirements=judgement["requirements"]["file"])
    site.mkdir(parents=True, exist_ok=True)
    with update_index(site), tempfile.TemporaryDirectory(dir=site.parent, prefix=".stage-") as tmp:
        index = load_index(site)
        notes = place_version(index, release, design) if not refresh else []
        if not refresh and release in index["releases"] and status_of(index, release) != "in-progress":
            major, minor = version_of(release)
            raise ValueError(title_of(index, release) + " is " + status_of(index, release) + " and no longer changes. Work toward its next baseline is "
                             + str(major) + "." + str(minor + 1) + ", staged as a draft; a different architecture takes the next major number with its own name")
        staged = Path(tmp) / release
        for name, source in files.items():
            (staged / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, staged / name)
        (staged / "release.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        destination = site / "releases" / release
        if refresh and (destination / GATE).is_file():
            # The record of the stage gate stays with the effective release: a view refresh changes no file it judged.
            shutil.copyfile(destination / GATE, staged / GATE)
        destination.parent.mkdir(parents=True, exist_ok=True)
        replaced = destination.exists()
        if replaced and tree(destination) == tree(staged) and release in index["releases"]:
            print(sentence(described(index, release)) + " is unchanged (" + ("effective" if refresh else "draft " + str(revision_of(index, release))) + ")")
            return
        if replaced:
            # Git holds the earlier bytes; the pull request shows what changed.
            shutil.rmtree(destination)
        staged.rename(destination)
        if refresh:
            # A refresh is not a draft: the release keeps its status, its accepted date and its draft count. The index
            # records when the view was republished, under `refreshed`.
            commit = head_commit(season)
            index.setdefault("refreshed", {})[release] = dict(date=datetime.date.today().isoformat(), **(dict(commit=commit) if commit else {}))
            save_index(index, site)
            print("Refreshed the view of " + described(index, release) + " (effective). Its physics, status, accepted date and draft count are unchanged")
            print(BEFORE_PUSH)
            print(ON_PUSH)
            return
        # One version keeps one ID: an edit counts a draft here, in the field named revision, and adds no entry to the picker.
        number = revision_of(index, release) + 1 if replaced or release in index["releases"] else 1
        commit = head_commit(season)
        index.setdefault("revision", {})[release] = dict(number=number, date=datetime.date.today().isoformat(),
                                                         **(dict(commit=commit) if commit else {}))
        if release not in index["releases"]:
            index["releases"].append(release)
            index.setdefault("designStatus", {})[release] = "in-progress"
        save_index(index, site)
    print(("Revised " + described(index, release) + " in place" if number > 1 else "Staged " + described(index, release))
          + " (" + state_of(index, release) + ")")
    for note in notes:
        print("Note: " + note)
    print(BEFORE_PUSH)
    print(ON_PUSH)


def held(index, release, season):
    """Refuse a view refresh of a release that is not effective, or whose gate record no longer stands for its files."""
    listed = release in index["releases"]
    if not listed or status_of(index, release) != "effective":
        raise ValueError("--refresh-view republishes the view of the effective release. " + sentence(described(index, release)) + " is "
                         + (status_of(index, release) if listed else "not listed")
                         + ("" if listed and status_of(index, release) != "in-progress" else "; stage it to publish or revise it: stage_preliminary_review.py " + release))
    run = subprocess.run([*GATE_COMMAND, "holds", str(season), "--release", release], capture_output=True, text=True, encoding="utf-8")
    if run.returncode:
        raise ValueError(run.stderr.strip() + ". A view refresh changes no file its gate judged. Work that changes it belongs to "
                         + str(version_of(release)[0]) + "." + str(version_of(release)[1] + 1) + ", staged as a draft")


def sentence(text):
    return text[:1].upper() + text[1:]


def stage_gate(season, release):
    """Run the stage gate of a release: its committed records are judged, and its readiness report must meet every criterion.

    The gate is the plugin's stage-gate.mjs. It prints what it judged and how long it took, and writes its record beside
    the published release. A release that does not pass keeps its status."""
    sys.stdout.flush()
    if subprocess.run([*GATE_COMMAND, "preliminary", str(season), "--release", release]).returncode != 0:
        raise ValueError("Release " + release + " keeps its status: the stage gate did not pass")


def tree(folder):
    """Every file under a folder with its digest."""
    return {p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob("*") if p.is_file()}


def revision_of(index, release):
    """The draft count: how many times a release has been staged with changed files. One published before drafts were counted is at 1."""
    number = ((index.get("revision") or {}).get(release) or {}).get("number")
    return number if isinstance(number, int) and number > 0 else 1


def head_commit(folder):
    """The commit the checkout is at, which the revision was staged from. None outside Git or before a first commit."""
    try:
        run = subprocess.run(["git", "-C", str(folder), "rev-parse", "--verify", "-q", "HEAD"], capture_output=True, text=True)
        return run.stdout.strip() or None if run.returncode == 0 else None
    except OSError:
        return None


def last_commit(folder):
    """The last commit that changed a folder, where its files can still be read. None outside Git."""
    try:
        run = subprocess.run(["git", "-C", str(folder), "log", "-1", "--format=%H", "--", "."], capture_output=True, text=True)
        return run.stdout.strip() or None if run.returncode == 0 else None
    except OSError:
        return None


def set_status(site, release, status, reason=None):
    """Set a release's design status in the index. Making a release effective supersedes the one that was.

    Withdrawing needs a reason. The index keeps it with the last commit that held the release's published files,
    and the files leave the site. Git keeps them; the checked inputs under cad/ stay."""
    if status not in STATUSES:
        raise ValueError("Set a release to one of " + ", ".join(STATUSES))
    if status == "withdrawn" and not (reason or "").strip():
        raise ValueError("Give the reason for a withdrawal with --reason")
    if status != "withdrawn" and reason:
        raise ValueError("--reason applies to a withdrawal")
    with update_index(site):
        record = load_index(site)
        if release not in record["releases"]:
            raise ValueError("Unknown release: " + release)
        statuses = record.setdefault("designStatus", {})
        version = version_of(release)
        drafting = in_progress_of(record, version[0], besides=release) if status == "in-progress" else None
        if drafting:
            raise ValueError(title_of(record, drafting) + " is already in progress. One architecture has one in-progress version: revise " + drafting + " in place")
        if status == "effective":
            # The date it was accepted stays with the release, so it remains listed as a design once it is superseded.
            record.setdefault("accepted", {}).setdefault(release, datetime.date.today().isoformat())
            for other in record["releases"]:
                if other != release and status_of(record, other) == "effective":
                    statuses[other] = "superseded"
        for field in ("reason", "lastCommit"):
            # A release that returns from withdrawn is staged again; its withdrawal note goes with the old status.
            (record.get(field) or {}).pop(release, None)
            if field in record and not record[field]:
                del record[field]
        if status == "withdrawn":
            published = site / "releases" / release
            commit = last_commit(published) if published.is_dir() else None
            record.setdefault("reason", {})[release] = reason.strip()
            if commit:
                record.setdefault("lastCommit", {})[release] = commit
            if published.is_dir():
                shutil.rmtree(published)
        statuses[release] = status
        save_index(record, site)
    print(sentence(described(record, release)) + " is " + status + "; the site opens " + str(record["current"]))
    if status == "effective" and design_name(record, version[0]):
        latest = max(major_of(r) for r in record["releases"])
        print("Work toward the next baseline of " + design_name(record, version[0]) + " is " + str(version[0]) + "." + str(version[1] + 1)
              + ", staged as drafts until it is accepted. A different architecture is " + str(latest + 1) + ".0 with its own name.")
    print(ON_PUSH)


def judged_records(season, site, release):
    """{record: sha256} of what the gate of a published release judged, by path in its own folder; None without a gate record."""
    try:
        published = site / "releases" / release
        own = (read(published / "release.json").get("check") or {}).get("project", "") + "/"
        records = read(published / GATE)["files"]["records"]
        return {name[len(own):] if name.startswith(own) else name: digest for name, digest in records.items()} or None
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def copy_inputs(season, base, old, new):
    """Copy a release's inputs to a new release folder, with its records, and write the paths that name the old folder.

    The judgement file names its files by project path. The source, its parts, the records and the page keep their bytes, so the
    records stay current: nothing is measured again. The review scene is not copied: the page builder writes it for the new folder."""
    source, target = base / "releases" / checked_id(old), base / "releases" / checked_id(new)
    if not (source / JUDGEMENT).is_file():
        raise ValueError("No judgement file at " + (source / JUDGEMENT).relative_to(season).as_posix())
    if target.exists():
        raise ValueError(target.relative_to(season).as_posix() + " already exists. Choose a new release ID, or remove that folder first")
    before, after = source.relative_to(season).as_posix() + "/", target.relative_to(season).as_posix() + "/"
    records = ((read(source / JUDGEMENT).get("records") or {}).get("folder") or before + "records") + "/"

    def moved(node):
        """A record with each path under the old folder written for the new one."""
        if isinstance(node, dict):
            return {k: after + v[len(before):] if k in ("file", "folder") and isinstance(v, str) and v.startswith(before) else moved(v) for k, v in node.items()}
        return [moved(v) for v in node] if isinstance(node, list) else node

    written = 0
    try:
        shutil.copytree(source, target, ignore=lambda folder, names: [n for n in names if Path(folder) == source and n == SCENE or n == "__pycache__"])
        for file in sorted(target.rglob("*.json")):
            if (before + file.relative_to(target).as_posix()).startswith(records):
                continue
            data = read(file)
            changed = moved(data)
            if changed != data:
                file.write_text(json.dumps(changed, indent=2) + "\n", encoding="utf-8", newline="\n")
                written += 1
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    print("Copied the inputs of release " + old + " to " + after.rstrip("/") + " with its records and wrote the paths of " + str(written) + " file" + ("" if written == 1 else "s")
          + " for the new folder. Now check it there, build its page, then stage " + new + ":\n"
          "  node PLUGIN/scripts/design.mjs preliminary-check . " + after + JUDGEMENT + " --require-checked\n"
          "  node PLUGIN/scripts/design.mjs preliminary-page . " + after + JUDGEMENT)


def remove(season, base, release, replaced_by=None):
    """Take a release out of the index and delete its published folder and its inputs folder. No redirect is left.

    This is the last step of renaming a release: the same design is first rebuilt, checked and staged under its new ID.
    A release that is or was effective is removed only when --replaced-by names the effective release whose gate judged the same records."""
    checked_id(release)
    site = season / "docs/preliminary-design"
    with update_index(site):
        record = load_index(site)
        if release not in record["releases"]:
            raise ValueError("Unknown release: " + release)
        if replaced_by is not None and (replaced_by == release or replaced_by not in record["releases"]):
            raise ValueError("--replaced-by names a listed release other than the one removed")
        gone, accepted = described(record, release), (record.get("accepted") or {}).get(release)
        if status_of(record, release) == "effective" or accepted:
            if replaced_by is None:
                raise ValueError(sentence(gone) + " is or was the effective design. Remove it only to rename it: stage the same design under its "
                                 "new ID, mark that release effective, then run --remove " + release + " --replaced-by NEW")
            if status_of(record, replaced_by) != "effective":
                raise ValueError("Release " + replaced_by + " is " + status_of(record, replaced_by) + ". Mark it effective before it replaces " + release)
            old, new = judged_records(season, site, release), judged_records(season, site, replaced_by)
            if not old or old != new:
                raise ValueError("Releases " + release + " and " + replaced_by + " were not judged on the same records, or a gate record is missing. "
                                 "A rename keeps the design; a changed design is a new version and the earlier one stays as superseded")
            if accepted:
                # The design was accepted on the earlier date; the rename does not move it.
                record["accepted"][replaced_by] = min(accepted, record["accepted"].get(replaced_by, accepted))
        folders = [site / "releases" / release, base / "releases" / release]
        for folder in folders:
            if folder.is_dir():
                shutil.rmtree(folder)
        record["releases"].remove(release)
        for field in PER_RELEASE:
            (record.get(field) or {}).pop(release, None)
            if field in record and not record[field]:
                del record[field]
        version = version_of(release)
        if not any(major_of(r) == version[0] for r in record["releases"]):
            # A major number with no version left is free again, with its name.
            (record.get("designs") or {}).pop(str(version[0]), None)
        if "designs" in record and not record["designs"]:
            del record["designs"]
        save_index(record, site)
    print("Removed " + gone + (", replaced by " + described(record, replaced_by) if replaced_by else "") + ". Its folders "
          + " and ".join(f.resolve().relative_to(season.resolve()).as_posix() for f in folders) + " are deleted and no redirect is left: a link to ?release="
          + release + " now reports an unknown release. The site opens " + str(record.get("current")))
    try:
        links = read(season / "docs/detailed-design/designs.json").get("preliminary") or {}
    except (OSError, ValueError, AttributeError):
        links = {}
    for design in sorted(d for d, link in links.items() if link == release):
        print("Note: detailed design " + design + " names preliminary release " + release + ". Stage it again with --preliminary " + (replaced_by or "NEW") + ".")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("release", nargs="?")
    mode.add_argument("--set-status", nargs=2, metavar=("RELEASE", "STATUS"), help="Set a release " + ", ".join(STATUSES))
    mode.add_argument("--refresh-view", metavar="RELEASE",
                      help="Republish the view of the effective release from its folder: a rebuilt review page or a reworded page file. "
                           "Refused when a file its stage gate judged has changed")
    mode.add_argument("--remove", metavar="RELEASE", help="Delete a release's folders and index entry after it was staged again under a new ID; no redirect is left")
    mode.add_argument("--copy-inputs", nargs=2, metavar=("FROM", "TO"),
                      help="Copy a release's inputs and records to a new release folder with its own paths, to start the next version or rename a release")
    parser.add_argument("--design-name", help="The architecture's name in words, given the first time a major number is staged, as in 1.0")
    parser.add_argument("--replaced-by", metavar="RELEASE", help="With --remove of a release that is or was effective: the effective release whose gate judged the same records")
    parser.add_argument("--reason", help="Why the release is withdrawn, with --set-status RELEASE withdrawn")
    parser.add_argument("--base", type=Path, default=Path("cad/preliminary-design"),
                        help="The project's preliminary design folder, which holds releases/ (default: cad/preliminary-design under the current folder)")
    args = parser.parse_args(argv)
    base = args.base.resolve()
    try:
        if not base.is_dir():
            raise ValueError("No preliminary design folder at " + args.base.as_posix() + ". Run this from the project root, or name the folder with --base")
        if args.design_name is not None and args.refresh_view:
            raise ValueError("--design-name goes with staging a version; a view refresh changes no name")
        if args.design_name is not None and not args.release:
            raise ValueError("--design-name goes with staging a version, as in stage_preliminary_review.py 1.0 --design-name \"NAME\"")
        if args.replaced_by is not None and not args.remove:
            raise ValueError("--replaced-by goes with --remove")
        if args.set_status:
            site = base.parents[1] / "docs/preliminary-design"
            if args.set_status[1] == "effective":
                if args.set_status[0] not in load_index(site)["releases"]:
                    raise ValueError("Unknown release: " + args.set_status[0])
                if args.reason:
                    raise ValueError("--reason applies to a withdrawal")
                # The stage gate runs here, once, on the committed design.
                stage_gate(base.parents[1], args.set_status[0])
            set_status(site, *args.set_status, reason=args.reason)
        elif args.copy_inputs:
            copy_inputs(base.parents[1].resolve(), base, *args.copy_inputs)
        elif args.remove:
            remove(base.parents[1], base, args.remove, args.replaced_by)
        elif args.refresh_view:
            stage(base.parents[1], base / "releases" / args.refresh_view, args.refresh_view, refresh=True)
        else:
            stage(base.parents[1], base / "releases" / args.release, args.release, args.design_name)
    except (KeyError, ValueError, OSError) as error:
        return str(error)
    return 0


if __name__ == "__main__":
    sys.exit(main())
