"""The invented starter, made ready to be marked effective: a tray, a wall and a ball with one deciding interaction and
its planar trial backing the mission case, with no mechanical adjustment. The starter already holds the cycle and a closed risk register.

    python test/fixtures/ready_example.py PROJECT RELEASE NAME

builds the solids, runs the trial with the design library, measures and judges the layout, builds its page and
stages the release as a draft under the architecture NAME. Synthetic teaching fixture: invented parts with no relation to any game."""
import json
from pathlib import Path
import subprocess
import sys

PLUGIN = Path(__file__).resolve().parents[2]
TRIAL = "ball stays at the wall"


def tray(source):
    """The invented field parts, piece, material, adjustment, interaction and trial, added to the starter's source."""
    source["parameters"]["wall_x"] = 300
    source["groups"]["field"] = {"role": "fixture"}
    source["fixtures"] += [dict(name="tray", group="field", shape=dict(kind="box", fromMm=[100, -50, 0], toMm=[298, 50, 10])),
                           dict(name="wall", group="field", shape=dict(kind="box", fromMm=["=wall_x", -50, 0], toMm=["=wall_x + 10", 50, 60]))]
    source["pieces"] = {"ball": {"shape": {"kind": "sphere", "centerMm": [0, 0, 0], "radiusMm": 40}, "massKg": {"value": 0.2, "assumed": [0.15, 0.25]}}}
    source["materials"] = {"felt": {"stiffnessNPerM": {"value": 50000, "assumed": [25000, 100000]}, "restitution": {"value": 0.2, "assumed": [0.1, 0.4]},
                                    "friction": {"value": 0.5, "assumed": [0.3, 0.8]}}}
    source["adjustments"] = {"wall position": {"input": "parameters.wall_x", "kind": "mechanical", "range": [300, 306], "note": "Invented slotted wall"}}
    source["interactions"] = {"tray stop": {"piece": "ball", "plane": {"normal": "y", "atMm": 0}, "solids": ["tray", "wall"],
                                            "pieceAtMm": [["=wall_x - 40", 0, 50]], "approach": {"angleDeg": [-5, 5], "offsetMm": [-5, 5]},
                                            "targetOffPlane": False}}
    source["trials"] = {TRIAL: {
        "assumes": [{"id": "flat-tray", "text": "Invented: the tray is flat and level."}],
        "plane": {"normal": "y", "atMm": 0}, "stepS": 0.0002, "durationS": 1.5, "traceS": 0.01, "fitToleranceMm": 2,
        "piece": {"use": "ball", "start": {"atMm": ["=wall_x - 40", 50]}},
        "surfaces": [{"solid": "tray", "material": "felt"}, {"solid": "wall", "material": "felt"}],
        "loads": [{"name": "push", "along": [-1, 0], "accelerationMps2": 3, "startS": 0.2, "durationS": 0.3}],
        "events": [{"name": "rolled off", "when": {"signal": "zMm", "below": 20}, "outcome": "rolled off"},
                   {"name": "stayed", "when": {"all": [{"signal": "tS", "above": 0.8}, {"restFor": 0.3}]}, "outcome": "stayed"}],
        "pass": {"outcomes": ["stayed"]},
        "control": {"change": {"loads.push.accelerationMps2": -6}, "note": "Pushed away from the wall, the ball rolls off the tray."},
        "brackets": [{"input": "loads.push.accelerationMps2", "unit": "m/s2", "values": [1, 3, 6]}],
        "adjustments": ["wall position"]}}
    return source


def judged(judgement):
    """The judgement of the starter with the tray interaction and its trial backing the mission case."""
    judgement["interactions"] = {"tray stop": dict(decides="Invented: whether the wall needs a lip", trial=TRIAL)}
    judgement["missionCases"] = [dict(name="deliver", trial=TRIAL, accomplishes="delivered", objective="Acquire, turn and release")]
    return judgement


def ready(project, release, name):
    """Add the tray interaction and its trial to the starter at RELEASE, run the library's records, judge it and stage it."""
    project = Path(project).resolve()
    rel = "cad/preliminary-design/releases/" + release
    folder = project / rel

    def edit(name, change):
        data = change(json.loads((folder / name).read_text(encoding="utf-8")))
        (folder / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")

    def without_adjustment(source):
        # The library's status does not read the measured ends of a mechanical adjustment, so a design that has them cannot be gated.
        source.pop("adjustments")
        source["trials"][TRIAL].pop("adjustments")
        return source

    edit("design.json", lambda source: without_adjustment(tray(source)))
    edit("judgement.json", judged)
    for args in (["build", rel + "/design.json", "--out", rel + "/generated"], ["try", rel + "/design.json", "--out", rel + "/records"]):
        subprocess.run([sys.executable, "-m", "frc_design_kernel", *args], cwd=project, check=True, capture_output=True)
    for command in (["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", ".", rel + "/judgement.json", "--require-checked", "--quiet"],
                    ["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-page", ".", rel + "/judgement.json", "--quiet"],
                    [sys.executable, "-B", str(PLUGIN / "scripts/stage_preliminary_review.py"), release, "--design-name", name]):
        done = subprocess.run(command, cwd=project, capture_output=True, text=True)
        if done.returncode:
            raise SystemExit(" ".join(command[:3]) + " failed:\n" + done.stdout + done.stderr)


if __name__ == "__main__":
    ready(*sys.argv[1:4])
