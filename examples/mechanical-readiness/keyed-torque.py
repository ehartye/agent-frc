"""Replay a seated and two displaced synthetic key sections with the installed structural route evaluator."""
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.gp import gp_Pnt

from showcase_contacts import load_solids
from structural_path import evaluate


def block(lo, hi):
    return BRepPrimAPI_MakeBox(gp_Pnt(*lo), gp_Pnt(*hi)).Shape()


def placed_sections(folder, shift):
    # Three faces of a single bracket represent the shaft-side flank and radial support.
    bottom = block([-2, 0, -3], [6, 26, -1])
    bridge = block([-2, 0, -1], [-1, 26, 3])
    top = block([-2, 0, 3], [.5, 26, 5])
    shaft = BRepAlgoAPI_Fuse(BRepAlgoAPI_Fuse(bottom, bridge).Shape(), top).Shape()
    key = block([4, shift, -1], [6, shift + 12, 1])
    hub = block([-.5, 0, 1], [6, 12, 3])

    doc = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    tree = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    for name, shape in (("shaft", shaft), ("key", key), ("hub", hub)):
        label = tree.AddShape(shape, False)
        TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
    writer = STEPCAFControl_Writer()
    writer.Transfer(doc, STEPControl_AsIs)
    step = folder / "three-sections.step"
    writer.Write(str(step))
    return load_solids(step)[0], hashlib.sha256(step.read_bytes()).hexdigest()


def run_case(folder, offset):
    shapes, step_sha = placed_sections(folder, offset)
    case = "Positive moment about the shaft axis"
    # This exercise has no native Fusion authority and cannot be issued for shop or public use.
    scope = dict(archiveSha256="unissued teaching fixture", stepSha256=step_sha, case=case)
    route = dict(**scope, configuration="Original teaching sections", members=["key", "hub", "shaft"],
                 loaded="hub", chassis="shaft", direction=[0, 0, 1], loadN=0,
                 appliedForces=[], gravityMmS2=[0, 0, 0],
                 appliedMomentsNmm=[dict(body="hub", momentNmm=[0, 150, 0])], interfaces=[])
    permitted = set()
    for source, target, normal, pressure in (("key", "shaft", [0, 0, -1], 2),
                                             ("hub", "key", [0, 0, -1], 2),
                                             ("hub", "shaft", [0, 0, 1], 10)):
        pair = {"from": source, "to": target, "direction": normal}
        evidence = dict(**scope, **pair, kind="bearing-compression", allowablePressureMPa=pressure,
                        basis="Hypothetical fixed pressure limit for these teaching sections")
        file = folder / f"{source}-{target}.json"
        file.write_text(json.dumps(evidence), encoding="utf-8")
        pin = dict(file=file.name, sha256=hashlib.sha256(file.read_bytes()).hexdigest())
        route["interfaces"].append(dict(**pair, capacitySource=pin))
        permitted.add(frozenset((source, target)))
    result = evaluate(folder, route, shapes, permitted, "shaft", scope["archiveSha256"], step_sha)
    residual = result["loadCases"][0]["residualsN_Nmm"]["hub"]
    return dict(withdrawalMm=offset, status=result["status"], hubResidualAboutYNmm=residual[4])


if __name__ == "__main__":
    with TemporaryDirectory() as temporary:
        for label, offset, expected in (("seated", 0, "pass"), ("partial", 8, "open"), ("withdrawn", 14, "fail")):
            folder = Path(temporary) / label
            folder.mkdir()
            result = run_case(folder, offset)
            print(json.dumps(dict(case=label, **result)), flush=True)
            if result["status"] != expected:
                raise SystemExit(f"Unexpected structural route result for {label}")
