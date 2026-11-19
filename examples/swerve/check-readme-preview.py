"""Keep the teaching module preview in project documentation synchronized with its Fusion archive."""
import argparse
import os
from pathlib import Path
import subprocess
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "examples/swerve/independent-swerve.f3d"
IMAGE = MODEL.with_name("assembly.png")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--update", action="store_true")
update = parser.parse_args().update
with ZipFile(MODEL) as archive:
    expected = archive.read("FusionAssetName[Active]/Previews/big.png")
if update:
    IMAGE.write_bytes(expected)
if IMAGE.read_bytes() != expected:
    raise SystemExit("Teaching preview differs from the native Fusion archive")
paths = subprocess.check_output(["git","ls-files","-z"],cwd=ROOT).decode().split("\0")
for name in paths:
    if Path(name).name.lower() != "readme.md":
        continue
    file = ROOT / name
    text = file.read_text(encoding="utf-8")
    title, body = text.split("\n", 1)
    if not title.startswith("# "):
        raise SystemExit("Missing title in " + name)
    link = lambda target: Path(os.path.relpath(target, file.parent)).as_posix()
    block = ("[![Original teaching swerve module rendered in Fusion](" + link(IMAGE) + ")](" + link(MODEL) + ")\n\n"
             "*Plugin teaching example · Independent-axis swerve module, as saved in Fusion.*")
    body = body.lstrip("\n")
    if body.startswith("[![Original teaching swerve module rendered in Fusion]"):
        body = body.split("*Plugin teaching example · Independent-axis swerve module, as saved in Fusion.*",1)[1].lstrip("\n")
    current = title + "\n\n" + block + "\n\n" + body
    if text != current:
        if not update:
            raise SystemExit("Missing or stale native preview in " + name)
        file.write_text(current, encoding="utf-8", newline="\n")
