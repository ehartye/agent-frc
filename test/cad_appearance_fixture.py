"""Exercise native geometry, direct cell colors and two independent appearance failures."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from OCP.BRep import BRep_Builder
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.gp import gp_Pnt
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.TopoDS import TopoDS_Compound
import vtk
from vtk.util.numpy_support import vtk_to_numpy

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def write(file, data):
    file.write_text(json.dumps(data), encoding="utf8")


def run(root, script, *args, ok=True):
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / script), str(root), *args],
        text=True,
        capture_output=True,
    )
    assert (result.returncode == 0) == ok, result.stdout + result.stderr
    return result.stderr


def fixture(root):
    root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    (root / "README.md").write_text("# Three-piece fixture\n", encoding="utf8")
    (root / "cad").mkdir(exist_ok=True)
    write(
        root / "cad/component-palette.json",
        {
            "schema": "agent-frc/component-palette@1",
            "colors": {"left-and-right": "#DC241F", "middle": "#00BD3E"},
        },
    )
    builder, compound = BRep_Builder(), TopoDS_Compound()
    builder.MakeCompound(compound)
    rows = []
    for i, x in enumerate([-50, 0, 50]):
        builder.Add(compound, BRepPrimAPI_MakeBox(gp_Pnt(x, 0, 0), 30, 30, 30).Shape())
        rows.append(
            {
                "id": f"block-{i}",
                "role": "middle" if i == 1 else "left-and-right",
                "boundsMm": [x, 0, 0, x + 30, 30, 30],
            }
        )
    for row in rows[:2]:
        row["representation"] = "appearance-overlay"
    source = root / "fixture.step"
    writer = STEPControl_Writer()
    assert writer.Transfer(compound, STEPControl_AsIs) == IFSelect_RetDone
    assert writer.Write(str(source)) == IFSelect_RetDone
    assign = {
        "schema": "agent-frc/assembly-appearances@1",
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "solids": rows,
    }
    write(root / "roles.json", assign)
    write(
        root / "cad-showcase.json",
        {
            "source": source.name,
            "title": "Three-block fixture",
            "scope": "Two distinct component roles",
            "appearances": "roles.json",
            "backdrop": {"center": "#738BA1", "edge": "#183857"},
        },
    )
    run(root, "export-showcase-cad.py")
    run(root, "cad-readmes.py", "--update")
    run(root, "cad-readmes.py")
    folder = root / "docs/robot/cad"
    record = json.loads((folder / "receipt.json").read_bytes())
    groups = record["appearances"]["groups"]
    assert [(g["color"], g["triangles"]) for g in groups] == [
        ("#DC241F", 24),
        ("#00BD3E", 12),
    ]
    png = vtk.vtkPNGReader()
    png.SetFileName(str(folder / "assembly.png"))
    png.Update()
    pixels = vtk_to_numpy(png.GetOutput().GetPointData().GetScalars()).astype(float)
    r, g = pixels[:, 0], pixels[:, 1]
    assert list(pixels[0, :3]) == [24, 56, 87], pixels[0]
    assert record["backdrop"]["center"] == "#738BA1"
    assert (r > 1.5 * g + 30).sum() > 500 and (g > 1.5 * r + 30).sum() > 500
    expected = [
        [24, "#DC241F", "left-and-right"], [12, "#00BD3E", "middle", "appearance-overlay"]
    ]
    assert json.dumps(expected) in (folder / "index.html").read_text(encoding="utf8")
    rows.reverse()
    write(root / "roles.json", assign)
    assert "Solid bounds disagree" in run(root, "export-showcase-cad.py", ok=False)
    rows.reverse()
    rows[0]["role"] = "misspelled-role"
    write(root / "roles.json", assign)
    assert "Unknown appearance role" in run(root, "export-showcase-cad.py", ok=False)
    assert json.loads((folder / "receipt.json").read_bytes()) == record
    rows[0]["role"] = "left-and-right"
    write(root / "roles.json", assign)


if __name__ == "__main__":
    fixture(Path(sys.argv[1]))
