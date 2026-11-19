"""Render the README plate from a native STEP export, its Fusion body census and the training field.

Usage: python render_header.py teaching-module.step teaching-module-native.json --fonts DISPLAY MONO
Needs cadquery-ocp, vtk, numpy and Pillow. The published plate uses Franklin Gothic Demi
Condensed and Consolas. Export the packaged Fusion design with export_header_geometry.py.
"""
import argparse
import ast
import hashlib
import json
import math
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import vtk
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.StlAPI import StlAPI_Writer
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from vtk.util.numpy_support import vtk_to_numpy

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "examples/swerve"
MODEL = EXAMPLE / "independent-swerve.f3d"
FIELD = ROOT / "examples/kickoff/training-field.json"
PLACEMENT = EXAMPLE / "check_four_corners.py"
PALETTE = ROOT / "references/cad-color-convention.json"
OUTPUT = EXAMPLE / "workflow-header.png"
SOURCES = (MODEL, FIELD, PLACEMENT, PALETTE)
W, H = 1600, 612


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cad_meshes(step, census, tmp):
    data = json.loads(census.read_text())
    if data["sourceSha256"] != digest(MODEL) or data["exportSha256"] != digest(step):
        raise ValueError("Native export and source archive must match the Fusion census")
    pending = {item["body"]: item["boundsMm"] for item in data["bodies"]}
    if len(pending) != 19:
        raise ValueError("Expected 19 named Fusion teaching solids")
    reader = STEPControl_Reader()
    if reader.ReadFile(str(step)) != IFSelect_RetDone:
        raise ValueError("Unreadable STEP export")
    reader.TransferRoots()
    solids = TopExp_Explorer(reader.OneShape(), TopAbs_SOLID)
    meshes = {}
    while solids.More():
        shape = solids.Current()
        box = Bnd_Box()
        BRepBndLib.AddOptimal_s(shape, box, False, False)
        bounds = np.array((*box.CornerMin().Coord(), *box.CornerMax().Coord()))
        matches = [name for name, expected in pending.items()
                   if np.max(np.abs(bounds - expected)) < 0.5]
        if len(matches) != 1:
            raise ValueError(f"Ambiguous native solid at {bounds}: {matches}")
        name = matches[0]
        del pending[name]
        mesh_file = tmp / "solid.stl"
        BRepMesh_IncrementalMesh(shape, 0.08, False, 0.08, False)
        if not StlAPI_Writer().Write(shape, str(mesh_file)):
            raise RuntimeError(f"Failed to tessellate {name}")
        stl = vtk.vtkSTLReader()
        stl.SetFileName(str(mesh_file))
        normals = vtk.vtkPolyDataNormals()
        normals.SetInputConnection(stl.GetOutputPort())
        normals.SetFeatureAngle(35)
        normals.Update()
        meshes[name] = normals.GetOutput()
        solids.Next()
    if pending:
        raise ValueError(f"Missing native bodies: {list(pending)}")
    return meshes


def body_color(name, colors):
    if "motor envelope" in name:
        return colors["electrical"]
    if "Mounting plate" in name or name == "Fork bridge":
        return colors["structure"]
    if name == "Tread annulus" or "belt span" in name:
        return "#353e49"
    if "pitch envelope" in name or "shaft" in name or name in ("Axle", "Azimuth spindle"):
        return colors["reference"]
    return colors["mechanism"]


def station_positions():
    for stmt in ast.parse(PLACEMENT.read_text()).body:
        if isinstance(stmt, ast.Assign) and any(getattr(t, "id", "") == "STATIONS" for t in stmt.targets):
            return ast.literal_eval(stmt.value)
    raise ValueError("Fusion station placements missing")


def render(meshes, colors, stations, focus, camera_offset, scale, size):
    renderer = vtk.vtkRenderer()
    renderer.SetBackground(0, 0, 0)
    renderer.SetBackgroundAlpha(0)
    win = vtk.vtkRenderWindow()
    win.SetOffScreenRendering(1)
    win.SetAlphaBitPlanes(1)
    win.SetMultiSamples(0)
    win.SetSize(*size)
    win.AddRenderer(renderer)
    for x, y, yaw in stations:
        for name, mesh in meshes.items():
            mapper = vtk.vtkPolyDataMapper()
            mapper.SetInputData(mesh)
            actor = vtk.vtkActor()
            actor.SetMapper(mapper)
            actor.SetPosition(x, y, 0)
            actor.RotateZ(yaw)
            prop = actor.GetProperty()
            color = bytes.fromhex(body_color(name, colors)[1:])
            prop.SetColor(*(v / 255 for v in color))
            prop.SetInterpolationToPhong()
            prop.SetAmbient(0.28)
            prop.SetDiffuse(0.78)
            prop.SetSpecular(0.32)
            prop.SetSpecularPower(34)
            renderer.AddActor(actor)
    cam = renderer.GetActiveCamera()
    cam.SetFocalPoint(*focus)
    cam.SetPosition(*(np.array(focus) + camera_offset))
    cam.SetViewUp(0, 0, 1)
    cam.ParallelProjectionOn()
    cam.SetParallelScale(scale)
    renderer.ResetCameraClippingRange()
    for direction, intensity in [((-0.5, 0.8, 1.5), 0.90), ((0.8, 0.3, 0.3), 0.52),
                                 ((-0.8, -0.6, 0.8), 0.70)]:
        light = vtk.vtkLight()
        light.SetLightTypeToSceneLight()
        light.SetPosition(*(np.array(focus) + np.array(direction)*1000))
        light.SetFocalPoint(*focus)
        light.SetIntensity(intensity)
        renderer.AddLight(light)
    win.Render()
    capture = vtk.vtkWindowToImageFilter()
    capture.SetInput(win)
    capture.SetInputBufferTypeToRGBA()
    capture.ReadFrontBufferOff()
    capture.Update()
    pixels = vtk_to_numpy(capture.GetOutput().GetPointData().GetScalars())
    image = Image.fromarray(pixels.reshape(size[1], size[0], 4)[::-1].copy())
    projected = []
    for x, y, _ in stations:
        renderer.SetWorldPoint(x, y, 3, 1)
        renderer.WorldToDisplay()
        px, py, _ = renderer.GetDisplayPoint()
        projected.append((px, size[1] - py))
    win.Finalize()
    return image, projected


def field_plan(draw, data, xy, width):
    length, height = data["field"]["length"], data["field"]["width"]
    scale = width / length
    def point(p):
        return (round(xy[0] + p[0]*scale), round(xy[1] + (height-p[1])*scale))
    draw.rectangle([point((0, height)), point((length, 0))], fill="#132e47", outline="#91b5ca", width=2)
    for gx in range(24, length, 24):
        for gy in range(24, height, 24):
            draw.point(point((gx, gy)), fill="#62829b")
    draw.line([point((length/2, 0)), point((length/2, height))], fill="#607f96", width=2)
    for landmark in data["landmarks"]:
        radius = landmark["acrossFlats"]/(2*math.cos(math.pi/landmark["sides"]))
        polygon = [point((landmark["x"] + radius*math.cos(i*math.tau/landmark["sides"]),
                          landmark["y"] + radius*math.sin(i*math.tau/landmark["sides"])))
                   for i in range(landmark["sides"])]
        draw.polygon(polygon, fill="#38576e", outline="#abc6d0", width=2)
    exercise = data["rehearsal"]
    for rail in exercise["obstacles"]:
        draw.polygon([point(v) for v in rail["poly"]], fill="#adc0ca")
    steps = exercise["programs"]["cross"]["steps"]
    for side, color in [("blue", "#74baff"), ("red", "#fa8c85")]:
        start = exercise["starts"][0]
        if side == "red":
            start = (length-start[0], height-start[1])
        path = [point(start), *(point(s["at"][side]) for s in steps)]
        draw.line(path, fill=color, width=4, joint="curve")
        x, y = path[0]
        draw.rectangle((x-5, y-5, x+5, y+5), fill=color)
        x, y = path[-1]
        draw.ellipse((x-5, y-5, x+5, y+5), fill=color)


def compose(meshes, fonts):
    palette = {r["id"]: r["color"] for r in json.loads(PALETTE.read_text())["roles"]}
    field = json.loads(FIELD.read_text())
    row, col = np.mgrid[0:H, 0:W]
    light = np.exp(-(((col-1245)/580)**2 + ((row-240)/485)**2))
    background = np.array([13, 31, 55]) + light[..., None]*np.array([31, 54, 69])
    canvas = Image.fromarray(background.astype("uint8")).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    mono = ImageFont.truetype(str(fonts[1]), 21)
    face = ImageFont.truetype(str(fonts[0]), 83)
    gold = "#f6c96c"
    paper = "#f3f6ed"
    for x in range(516, W, 42):
        for y in range(30, H-54, 42):
            draw.point((x, y), fill="#7b9bb1")
    draw.line((50, 61, 100, 61), fill=gold, width=4)
    draw.text((117, 46), "ROBOT DESIGN FIELD GUIDE", font=mono, fill="#cfe0e7")
    draw.text((45, 85), "From game rules", font=face, fill=paper, stroke_width=0)
    draw.text((45, 174), "to robot design.", font=face, fill=gold)
    field_plan(draw, field, (53, 301), 388)
    stations = station_positions()
    group, contact = render(meshes, palette, stations, (0, 0, 75), [680, 820, 630], 352, (1160, 940))
    origin = (495, 106)
    group = group.resize((580, 470), Image.Resampling.LANCZOS)
    points = [(origin[0]+x/2, origin[1]+y/2) for x,y in contact]
    corners = [points[i] for i in (0,1,3,2)]
    draw.polygon(corners, fill="#263f54", outline="#75a0b7", width=2)
    draw.line((corners[0], corners[2]), fill="#43627a", width=1)
    draw.line((corners[1], corners[3]), fill="#43627a", width=1)
    shadows = Image.new("RGBA", canvas.size)
    shadow = ImageDraw.Draw(shadows)
    for x, y in points:
        shadow.ellipse((x-32, y-6, x+34, y+9), fill=(4, 15, 23, 145))
    canvas.alpha_composite(shadows.filter(ImageFilter.GaussianBlur(6)))
    canvas.alpha_composite(group, origin)
    detail, _ = render(meshes, palette, [(0,0,0)], (12, 0, 90), [350, 680, 310], 116, (1070, 1030))
    shadows = Image.new("RGBA", canvas.size)
    ImageDraw.Draw(shadows).ellipse((1215, 457, 1403, 487), fill=(4, 15, 23, 145))
    canvas.alpha_composite(shadows.filter(ImageFilter.GaussianBlur(14)))
    canvas.alpha_composite(detail.resize((535,515), Image.Resampling.LANCZOS), (1029, 22))
    draw.line((52, 551, W-52, 551), fill="#648096", width=1)
    for x, label in [(52,"Field routes"), (518,"Four-module layout"), (1100,"Wheel and azimuth")]:
        draw.line((x, 577, x+21, 577), fill=gold, width=3)
        draw.text((x+36, 562), label, font=mono, fill=paper)
    return canvas.convert("RGB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("step", type=Path)
    parser.add_argument("census", type=Path)
    parser.add_argument("--fonts", nargs=2, type=Path, metavar=("DISPLAY", "MONO"), required=True)
    args = parser.parse_args()
    with TemporaryDirectory() as tmp:
        still = compose(cad_meshes(args.step, args.census, Path(tmp)), args.fonts)
    still.save(OUTPUT, optimize=True)
    receipt = {p.relative_to(ROOT).as_posix(): digest(p) for p in (*SOURCES, OUTPUT)}
    OUTPUT.with_suffix(".json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
