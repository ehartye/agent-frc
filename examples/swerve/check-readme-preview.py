"""Verify the embedded Fusion previews in the example READMEs."""
import argparse
import os
from pathlib import Path
import subprocess
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "examples/swerve/independent-swerve.f3d"
IMAGE = MODEL.with_name("assembly.png")
MODULE_ALT = "Original teaching swerve module rendered in Fusion"
MODULE_CAPTION = "*Plugin teaching example · Independent-axis swerve module, as saved in Fusion.*"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--update", action="store_true")
update = parser.parse_args().update

with ZipFile(MODEL) as archive:
    expected = archive.read("FusionAssetName[Active]/Previews/big.png")
if update:
    IMAGE.write_bytes(expected)
if IMAGE.read_bytes() != expected:
    raise SystemExit("Teaching preview differs from the native Fusion archive")

paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
for name in paths:
    if Path(name).name.lower() != "readme.md" or name == "README.md":
        continue
    file = ROOT / name
    text = file.read_text(encoding="utf-8")
    title, body = text.split("\n", 1)
    if not title.startswith("# "):
        raise SystemExit("Missing title in " + name)
    image = Path(os.path.relpath(IMAGE, file.parent)).as_posix()
    model = Path(os.path.relpath(MODEL, file.parent)).as_posix()
    block = f"[![{MODULE_ALT}]({image})]({model})\n\n{MODULE_CAPTION}"
    body = body.lstrip("\n")
    if body.startswith(f"[![{MODULE_ALT}]"):
        _, separator, remainder = body.partition("\n\n")
        if separator and remainder.startswith(MODULE_CAPTION):
            body = remainder[len(MODULE_CAPTION):].lstrip("\n")
    current = title + "\n\n" + block + "\n\n" + body
    if text != current:
        if not update:
            raise SystemExit("Missing or stale CAD preview in " + name)
        file.write_text(current, encoding="utf-8", newline="\n")
