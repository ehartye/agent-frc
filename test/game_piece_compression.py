"""Analytic indentation and between-frame adverse control for an invented soft payload."""
import unittest

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeSphere, BRepPrimAPI_MakeTorus
from OCP.gp import gp_Pnt
from mechanical_motion import distance, transform
from payload_compression import interfaces, section, sweep


class GamePieceCompression(unittest.TestCase):
    def test_torus_depth_and_spherical_payload_limits(self):
        rail = BRepPrimAPI_MakeBox(gp_Pnt(24, -2, -2), gp_Pnt(30, 2, 2)).Shape()
        scene = {"ring": BRepPrimAPI_MakeTorus(20, 5).Shape(), "rail": rail}
        rule = dict(payload="ring", contact="rail", basis="Fixture radial limit", maxDepthMm=1.1)
        def check():
            entry = interfaces({"payloadCompression": [rule]}, scene, {})["rail", "ring"]
            return sweep(entry, scene, {}, {}, 0, transform, distance)
        self.assertAlmostEqual(check()["upperBoundMm"], 1.)
        rule["maxDepthMm"] = .9
        self.assertEqual(check()["status"], "fail")
        self.assertAlmostEqual(section(BRepPrimAPI_MakeSphere(10).Shape())[1], 10.)
        with self.assertRaises(ValueError):
            section(rail)

    def test_midstroke_obstruction_and_unbounded_interval(self):
        ball = BRepPrimAPI_MakeSphere(gp_Pnt(-12, 0, 0), 5).Shape()
        moves = {"ball": [dict(kind="translation", travelMm=[24, 0, 0])]}
        for height, status in [(3., "fail"), (4.75, "open")]:
            rail = BRepPrimAPI_MakeBox(gp_Pnt(-1, height, -2), gp_Pnt(1, 10, 2)).Shape()
            scene = {"ball": ball, "rail": rail}
            rule = dict(payload="ball", contact="rail", basis="Fixture allowance", maxDepthMm=1.)
            entry = interfaces({"payloadCompression": [rule]}, scene, {})["ball", "rail"]
            self.assertEqual(sweep(entry, scene, moves, {"ball":24}, 0, transform, distance)["status"], status)
            if status == "open":
                self.assertEqual(sweep(entry, scene, moves, {"ball":24}, 8, transform, distance)["status"], "pass")
