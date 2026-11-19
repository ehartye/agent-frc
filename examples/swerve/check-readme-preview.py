"""Verify the root workflow plate and the embedded Fusion previews in project READMEs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "examples/swerve/independent-swerve.f3d"
IMAGE = MODEL.with_name("assembly.png")
HEADER = MODEL.with_name("workflow-header.png")
HEADER_INPUTS = (MODEL, ROOT / "references/cad-color-convention.json",
                 ROOT / "examples/kickoff/training-field.json", MODEL.with_name("check_four_corners.py"))
MODULE_ALT = "Original teaching swerve module rendered in Fusion"
MODULE_CAPTION = "*Plugin teaching example · Independent-axis swerve module, as saved in Fusion.*"
HEADER_ALT = ("From game rules to robot design. Red and blue routes cross a practice field beside "
              "a four-module drivetrain layout and a close-up of its wheel and steering assembly.")
HEADER_CAPTION = ("*Classroom field study and original swerve teaching assembly, shown at four mounting "
                  "positions and in detail. [Open the editable Fusion model](examples/swerve/independent-swerve.f3d).*")
GUIDE = "https://ehartye.github.io/agent-frc/"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--update", action="store_true")
update = parser.parse_args().update

expected_hashes = {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                   for path in (*HEADER_INPUTS, HEADER)}
if json.loads(HEADER.with_suffix(".json").read_text(encoding="utf-8")) != expected_hashes:
    raise SystemExit("Workflow header or source changed. Regenerate the plate with .github/readme/render_header.py.")

with ZipFile(MODEL) as archive:
    expected = archive.read("FusionAssetName[Active]/Previews/big.png")
if update:
    IMAGE.write_bytes(expected)
if IMAGE.read_bytes() != expected:
    raise SystemExit("Teaching preview differs from the native Fusion archive")

paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
for name in paths:
    if Path(name).name.lower() != "readme.md":
        continue
    file = ROOT / name
    text = file.read_text(encoding="utf-8")
    title, body = text.split("\n", 1)
    if not title.startswith("# "):
        raise SystemExit("Missing title in " + name)
    if file == ROOT / "README.md":
        block = f"[![{HEADER_ALT}](examples/swerve/workflow-header.png)]({GUIDE})\n\n{HEADER_CAPTION}"
    else:
        image = Path(os.path.relpath(IMAGE, file.parent)).as_posix()
        model = Path(os.path.relpath(MODEL, file.parent)).as_posix()
        block = f"[![{MODULE_ALT}]({image})]({model})\n\n{MODULE_CAPTION}"
    body = body.lstrip("\n")
    for alt, caption in ((MODULE_ALT, MODULE_CAPTION), (HEADER_ALT, HEADER_CAPTION)):
        if body.startswith(f"[![{alt}]"):
            _, separator, remainder = body.partition("\n\n")
            if separator and remainder.startswith(caption):
                body = remainder[len(caption):].lstrip("\n")
            break
    current = title + "\n\n" + block + "\n\n" + body
    if text != current:
        if not update:
            raise SystemExit("Missing or stale CAD preview in " + name)
        file.write_text(current, encoding="utf-8", newline="\n")
