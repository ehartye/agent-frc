"""Write the CAD still at the top of a project's main README. It is a convenience: nothing requires or checks it.

The still links to the one viewer of the design: its design review page. cad-showcase.json names the shown design:
title, scope and status (in-progress, effective, superseded or withdrawn), and optionally design (its name, version or
release ID), still (the image, docs/robot/cad/assembly.png by default), source, and review (the project-relative folder
or page of the design review) or viewerUrl (its address). Without either, the still links to the review of the current
detailed design, else of the current preliminary design."""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import quote

from atomic_file import write_atomic

START = "<!-- cad-still -->"
END = "<!-- /cad-still -->"
STATUSES = ("in-progress", "effective", "superseded", "withdrawn")


def selection(root):
    """The selected design as the caption names it: the configuration, and the design name, version or release ID."""
    config = json.loads((root / "cad-showcase.json").read_text(encoding="utf-8-sig"))
    design = config.get("design") or config.get("title")
    if not (isinstance(design, str) and design.strip()):
        raise ValueError("Name the shown design in cad-showcase.json: set title, or design to its name, version or release ID")
    if config.get("status") not in STATUSES:
        raise ValueError("Set status in cad-showcase.json to the shown design's status: " + ", ".join(STATUSES))
    return config, design.strip()


def current_of(index_file, key):
    """The design a status index opens, when the index lists it."""
    try:
        index = json.loads(index_file.read_text(encoding="utf-8-sig"))
        current = index.get("current")
        return current if isinstance(current, str) and current in index.get(key, []) else None
    except (OSError, ValueError, AttributeError, TypeError):
        return None


def review_of(root, config):
    """Where the still links: the one viewer of the shown design. Returns (target, words); target is a URL, a file or None.

    An explicit review or viewerUrl wins. Otherwise the review of the current detailed design, then of the current
    preliminary design. A project that still holds a page built by the retired orbit viewer keeps linking to it."""
    words = "Open the design review"
    if config.get("viewerUrl"):
        return config["viewerUrl"], words
    if config.get("review"):
        page = (root / config["review"]).resolve()
        if not page.is_relative_to(root):
            raise ValueError("Name the design review in cad-showcase.json as a project-relative folder or page")
        return (page / "index.html" if page.is_dir() or not page.suffix else page), words
    detailed, preliminary = root / "docs/detailed-design", root / "docs/preliminary-design"
    design, release = current_of(detailed / "designs.json", "designs"), current_of(preliminary / "releases.json", "releases")
    for page in ([detailed / "designs" / design / "index.html"] if design else []) + ([preliminary / "releases" / release / "index.html"] if release else []):
        if page.is_file():
            return page, words
    earlier = root / "docs/robot/cad/index.html"
    return (earlier, "Rotate the model") if earlier.is_file() else (None, words)


def write(root):
    """Write the still block below the title of the main README. Returns the review it links to."""
    config, design = selection(root)
    review, words = review_of(root, config)
    still = (root / config.get("still", "docs/robot/cad/assembly.png")).resolve()
    if not (still.is_relative_to(root) and still.is_file()):
        raise ValueError("No CAD still image at " + str(config.get("still", "docs/robot/cad/assembly.png")) + ". Render it, or name it as still in cad-showcase.json")
    file = root / "README.md"
    original = file.read_bytes()
    text = original.decode("utf-8-sig", errors="surrogateescape").replace("\r\n", "\n")
    text = re.sub(r"\n*" + START + ".*?" + END + r"\n*", "\n\n", text, flags=re.S)
    lines = text.splitlines(keepends=True)
    heading = next((i for i, line in enumerate(lines) if line.startswith("# ")), None)
    if heading is None:
        raise ValueError("README.md needs a title")

    def link(target):
        return quote(Path(os.path.relpath(target, file.parent)).as_posix(), safe="/.-_")
    title = config["title"]
    target = review if isinstance(review, str) else link(review) if review else None
    source = f' [Source STEP]({link(root / config["source"])})' if config.get("source") else ""
    shown = title if design == title else f"{title} · {design}"
    picture = f'![{title}]({link(still)})'
    # Without a published review the still stands alone; the next run links it.
    block = (f'{START}\n{f"[{picture}]({target})" if target else picture}\n\n'
             f'**Project CAD · {shown} · {config["status"]}.** {config["scope"]}'
             f'{" ·".join(part for part in (source, f" [{words}]({target})" if target else "") if part)}\n{END}')
    merged = "".join(lines[:heading+1]).rstrip("\n") + "\n\n" + block + "\n\n" + "".join(lines[heading+1:]).lstrip("\n")
    if b"\r\n" in original:
        merged = merged.replace("\n", "\r\n")
    bom = b"\xef\xbb\xbf" if original.startswith(b"\xef\xbb\xbf") else b""
    write_atomic(file, bom + merged.encode(errors="surrogateescape"))
    return review


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    linked = write(parser.parse_args().root.resolve())
    print("Wrote the still in README.md. " + ("It links to the design review." if linked else
          "No design review is published yet, so it links nowhere: stage the design, or set review in cad-showcase.json, and run this again."))
