"""Check or refresh the CAD still at the top of every project README, and build the shared CAD view.

Without options this is the README check: each project-owned README shows the still block directly below its title,
the image it shows exists, and its caption names the current design and its status. It compares no bytes: git records
what the image and its source were. --update rewrites every block and, when the project holds a CAD export record,
rebuilds the orbit view from it. --verify-export also checks that record against the source, still and mesh without
writing anything.

cad-showcase.json names the shown design: title, scope and status (in-progress, effective, superseded or withdrawn),
and optionally design (its name, version or release ID), still (the image, docs/robot/cad/assembly.png by default),
viewerUrl and source."""
import argparse
import base64
import hashlib
import html
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import quote, unquote

from atomic_file import write_atomic

START = "<!-- cad-still -->"
END = "<!-- /cad-still -->"
STATUSES = ("in-progress", "effective", "superseded", "withdrawn")


def checked(path, expected):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Changed CAD evidence: {path}")
    return data


def output(file, data, update):
    previous = file.read_bytes() if file.exists() else None
    if previous == data:
        return
    if not update:
        raise ValueError(f"Stale or missing: {file}")
    write_atomic(file, data)


def selection(root):
    """The selected design as the caption names it: the configuration, and the design name, version or release ID."""
    config = json.loads((root / "cad-showcase.json").read_text(encoding="utf-8-sig"))
    design = config.get("design") or config.get("title")
    if not (isinstance(design, str) and design.strip()):
        raise ValueError("Name the shown design in cad-showcase.json: set title, or design to its name, version or release ID")
    if config.get("status") not in STATUSES:
        raise ValueError("Set status in cad-showcase.json to the shown design's status: " + ", ".join(STATUSES))
    return config, design.strip()


def showcase(root, update, template):
    """Check the export record against the source, still and mesh, and write or compare the orbit view."""
    config = json.loads((root / "cad-showcase.json").read_text(encoding="utf-8-sig"))
    folder = root / "docs/robot/cad"
    receipt = json.loads((folder / "receipt.json").read_text(encoding="utf-8"))
    if receipt["source"] != config["source"]:
        raise ValueError("Selected CAD differs from export. Regenerate the still and mesh.")
    checked(root / config["source"], receipt["sourceSha256"])
    checked(folder / "assembly.png", receipt["imageSha256"])
    if "captureReview" in config:
        from cad_capture import evaluate, project_file
        review_file = project_file(root, config["captureReview"])
        review = json.loads(review_file.read_text(encoding="utf-8-sig"))
        result = evaluate(root, review, receipt["sourceSha256"], receipt["imageSha256"])
        if result["status"] != "pass":
            raise ValueError("CAD capture review " + result["status"] + ": " + str(result["features"]))
    mesh = checked(folder / "assembly.stl.gz", receipt["meshSha256"])
    layout = receipt["nativeBounds"]
    if "appearances" in config or receipt.get("schema") == "agent-frc/cad-still@2":
        from cad_appearances import validated_groups
        if not config.get("appearances") or config["appearances"] != receipt.get("appearances", {}).get("file"):
            raise ValueError("Selected appearance manifest differs from the export")
        layout = dict(bounds=layout, groups=validated_groups(root, receipt, folder / "assembly.stl.gz"))
    elif receipt.get("schema") != "agent-frc/cad-still@1":
        raise ValueError("Unknown CAD receipt schema")
    from showcase_release import verify_candidate as release_check
    release_check(root,config.get("mechanicalReadiness"),config["source"],
                  ["docs/robot/cad/assembly.png","docs/robot/cad/assembly.stl.gz","docs/robot/cad/receipt.json"],receipt=receipt,distribute_source=True)
    featured=config.get("featuredAssembly") or config.get("featured")
    if featured:
        paths=[featured[k] for k in ("still","mesh") if k in featured]
        if len(paths)!=2 or not featured.get("source"):
            raise ValueError("Featured model must identify its exact neutral source, still, mesh and readiness study")
        release_check(root,featured.get("mechanicalReadiness"),featured["source"],paths,featured.get("archive"))
    if "backdrop" in config or "backdrop" in receipt:
        from cad_appearances import backdrop_colors
        backdrop = backdrop_colors(config)
        if not backdrop or backdrop != backdrop_colors(receipt):
            raise ValueError("CAD backdrop changed. Regenerate the still and mesh.")
        if isinstance(layout, list):
            layout = {"bounds": layout}
        layout["backdrop"] = backdrop
    fields = dict(title=html.escape(config["title"]), scope=html.escape(config["scope"]),
                  facts=f'{receipt["solids"]:,} solids · {receipt["triangles"]:,} triangles · {receipt["chordMm"]} mm chord setting',
                  bounds=json.dumps(layout), mesh=base64.b64encode(mesh).decode("ascii"))
    viewer = re.sub(r"\{\{(\w+)\}\}", lambda match: fields[match[1]], template.read_text(encoding="utf-8"))
    output(folder / "index.html", viewer.encode(), update)


def readmes(root, update):
    """Check the still block of every project README, or rewrite it. Returns the number of README files.

    The check reads the block only: where it sits, that its image exists and what its caption names. It never
    compares the image, its source or a palette with a recorded digest."""
    config, design = selection(root)
    folder = root / "docs/robot/cad"
    still = (root / config.get("still", "docs/robot/cad/assembly.png")).resolve()
    if update and not (still.is_relative_to(root) and still.is_file()):
        raise ValueError("No CAD still image at " + str(config.get("still", "docs/robot/cad/assembly.png")) + ". Render it, or name it as still in cad-showcase.json")
    paths = subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=root)
    names = sorted(set(n.decode() for n in paths.split(b"\0") if n and Path(n.decode()).name.lower() in ("readme.md", "readme")))
    for name in names:
        file = root / name
        if not file.exists():
            continue
        original = file.read_bytes()
        text = original.decode("utf-8-sig", errors="surrogateescape").replace("\r\n", "\n")
        if not update:
            check_block(file, name, text, design, config["status"])
            continue
        text = re.sub(r"\n*" + START + ".*?" + END + r"\n*", "\n\n", text, flags=re.S)
        lines = text.splitlines(keepends=True)
        heading = next((i for i, line in enumerate(lines) if line.startswith("# ")), None)
        if heading is None:
            raise ValueError(f"README needs a title: {name}")
        def link(target):
            return quote(Path(os.path.relpath(target, file.parent)).as_posix(), safe="/.-_")
        title = config["title"]
        image = link(still)
        target = config.get("viewerUrl") or link(folder / "index.html")
        source = f' [Source STEP]({link(root / config["source"])}) ·' if config.get("source") else ""
        shown = title if design == title else f"{title} · {design}"
        block = (f'{START}\n[![{title}]({image})]({target})\n\n'
                 f'**Project CAD · {shown} · {config["status"]}.** {config["scope"]}'
                 f'{source} [Rotate the model]({target})\n{END}')
        merged = "".join(lines[:heading+1]).rstrip("\n") + "\n\n" + block + "\n\n" + "".join(lines[heading+1:]).lstrip("\n")
        if b"\r\n" in original:
            merged = merged.replace("\n", "\r\n")
        bom = b"\xef\xbb\xbf" if original.startswith(b"\xef\xbb\xbf") else b""
        output(file, bom + merged.encode(errors="surrogateescape"), update)
    return len(names)


def check_block(file, name, text, design, status):
    """One README: the still block sits directly below the title, shows an image that exists and names the design and status."""
    lines = text.splitlines()
    heading = next((i for i, line in enumerate(lines) if line.startswith("# ")), None)
    if heading is None:
        raise ValueError(f"README needs a title: {name}")
    below = next((line for line in lines[heading + 1:] if line.strip()), "")
    found = re.search(START + "(.*?)" + END, text, flags=re.S)
    fix = "Run cad-readmes.py --update"
    if not found or below.strip() != START:
        raise ValueError(f"No CAD still block directly below the title of {name}. {fix}")
    image = re.search(r"!\[[^\]]*\]\(([^)\s]+)\)", found[1])
    if not image or not (file.parent / unquote(image[1])).is_file():
        raise ValueError(f"The CAD still of {name} shows no image file that exists" + (": " + image[1] if image else "") + f". {fix}")
    caption = found[1][image.end():]
    if design not in caption or status not in caption:
        raise ValueError(f"The CAD still caption of {name} does not name the current design ({design}) and its status ({status}). {fix}")


def run(root, update, template, verify_export=False):
    count = readmes(root, update)
    if update and not verify_export and not (root / "docs/robot/cad/receipt.json").is_file():
        print(f"Rewrote the still of {count} README files. No CAD export record at docs/robot/cad/receipt.json, so no orbit view was built.")
    elif update or verify_export:
        showcase(root, update, template)
        print(f"Verified CAD source, mesh, still and viewer, and {'rewrote' if update else 'checked'} the still of {count} README files.")
    else:
        print(f"Checked the still of {count} README files: block below the title, image present, design and status named. No bytes compared.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--update", action="store_true", help="Rewrite every README still block, then rebuild the orbit view from the latest export")
    parser.add_argument("--verify-export", action="store_true",
                        help="Also check the export record against the source, still and mesh, and the orbit view, without writing")
    parser.add_argument("--template", type=Path, default=Path(__file__).resolve().parents[1] / "templates/cad-orbit.html")
    args = parser.parse_args()
    run(args.root.resolve(), args.update, args.template, args.verify_export)
