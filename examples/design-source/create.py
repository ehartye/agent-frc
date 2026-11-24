"""Start a preliminary design from an invented example: a design source and a judgement file, as data.

    python PLUGIN/examples/design-source/create.py . --project-review --release 1.0 --design-name "Turning carrier"

writes the example into cad/preliminary-design/releases/1.0/, builds its solids with the design library, measures and
judges it, builds its review page from the records, and stages it. Without --project-review it writes the folder cad/preliminary-design/releases/ID under a new
directory and stops there. Every name and number is invented: replace them with the project's own.

This file draws nothing. The design source it writes is the library's input: every solid with its weight, the motors
placed as solids, the battery, and each motion as the motor commands that make it or the cause that moves it. The
judgement file is the plugin's: the rules stated once, the cycle, the control and the pointers to the season's
requirements, the narrative, the accepted premises and the page file. The library's records go in records/. The page
file, page.json, holds the review page's words; it never reaches the verdict.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

PLUGIN = Path(__file__).resolve().parents[2]
RELEASES = "cad/preliminary-design/releases"
PHASES = ("acquire", "retain", "transfer", "deliver", "reset", "endgame", "park", "service")


def travel(v):
    return [dict(kind="translation", travelMm=v)]


def kg(value, low, high):
    return {"value": value, "assumed": [low, high]}


def box(name, group, lo, hi, mass):
    return dict(name=name, group=group, shape=dict(kind="box", fromMm=lo, toMm=hi), massKg=mass)


def motors():
    """One invented motor model, used by every drive. Each figure is an assumed range."""
    return {"small motor": {"note": "Invented brushless motor figures for teaching.", "ktNmPerA": kg(0.018, 0.017, 0.019),
                            "ohm": kg(0.05, 0.045, 0.06), "keVsPerRad": kg(0.018, 0.017, 0.019)}}


def drives():
    """Each motor is a placed solid; each drive turns or slides one group through its joint."""
    efficiency = kg(0.8, 0.7, 0.9)
    return {
        "pivot": dict(motor="small motor", motorSolid="pivot motor", gear=10, efficiency=efficiency, supplyLimitA=30,
                      joint=dict(group="carrier", kind="rotation", axis=[0, 0, 1], originMm=[0, 0, 20], travel=[-5, "=turn + 5"])),
        "gate": dict(motor="small motor", motorSolid="gate motor", gear=4, efficiency=efficiency, supplyLimitA=20,
                     joint=dict(group="neighbor", kind="slide", axis=[0, 1, 0], perOutputTurn=8, travel=[0, "=slide + 2"])),
        "ejector": dict(motor="small motor", motorSolid="ejector motor", gear=3, efficiency=efficiency, supplyLimitA=20,
                        joint=dict(group="carried article", kind="slide", axis=[1, 0, 0], perOutputTurn=10, travel=[0, 14])),
        "drivetrain": dict(motor="small motor", motorSolid="drive", count=4, gear=6, efficiency=efficiency, supplyLimitA=40, radiusMm=50, movingKg=kg(12, 10, 14),
                           note="The running gear. No motion of this teaching layout commands it; a motion lists it under alsoRunning when it drives at the same time.")}


def design_source(name):
    """The design source: what is drawn, what it weighs, how it is grouped and mounted, and what moves it."""
    seconds = lambda value, low, high: {"value": value, "assumed": [low, high]}
    return {
        "schema": "frc-design-kernel/design@1", "name": name, "units": {"length": "mm", "mass": "kg"},
        "frame": "Invented mounting block axis on the floor plane, +X forward, +Y left, +Z up, millimetres",
        "parameters": {"turn": 90, "slide": 12},
        "groups": {"structure": {"role": "structure"}, "bumper": {"role": "bumper"}, "carrier": {"role": "mechanism"},
                   "carried article": {"role": "payload", "carriedBy": "carrier"}, "neighbor": {"role": "mechanism"}, "drive": {"role": "drive"},
                   "battery": {"role": "battery"}},
        "solids": [box("mount", "structure", [-8, -8, 0], [8, 8, 6], kg(0.5, 0.4, 0.6)),
                   box("rail", "structure", [19, 70, 18], [24, 75, 23], kg(0.2, 0.15, 0.25)),
                   box("pivot motor", "structure", [-8, 9.5, 0], [0, 15, 6], kg(0.3, 0.28, 0.32)),
                   box("gate motor", "structure", [25, 70, 18], [30, 75, 23], kg(0.2, 0.18, 0.22)),
                   box("bumper", "bumper", [-20, -20, 0], [-16, 20, 4], kg(1.5, 1.3, 1.8)),
                   box("head", "carrier", [28, -2, 18], [32, 2, 22], kg(0.4, 0.3, 0.5)),
                   box("ejector motor", "carrier", [28, -2, 23.5], [32, 2, 26], kg(0.15, 0.14, 0.16)),
                   box("sample", "carried article", [36, -2, 18], [40, 2, 22], kg(0.3, 0.2, 0.5)),
                   box("gate", "neighbor", [55, -10, 15], [58, -7, 24], kg(0.2, 0.15, 0.25)),
                   box("drive", "drive", [-14, -11, 0], [-10, -2, 6], kg(4.5, 4.2, 4.8)),
                   box("battery", "battery", [9, -10, 0], [17, -3, 4], kg(2.0, 1.9, 2.1))],
        "extraMass": [dict(name="wiring", group="structure", massKg=kg(0.3, 0.2, 0.5), note="Invented loom, fasteners and controls; not drawn.")],
        "fixtures": [],
        "mounts": [dict(group="carrier", on="mount", atMm=[0, 0, 6], note="Sketch origin of the pedestal"),
                   dict(group="neighbor", on="rail", atMm=[22, 72, 20], note="Proposed slide attachment datum")],
        "contacts": [],
        "motors": motors(), "drives": drives(),
        "battery": {"openCircuitV": kg(12.6, 12.2, 12.9), "resistanceOhm": kg(0.02, 0.015, 0.03), "note": "Invented pack figures."},
        "poses": {"offered": {"carried article": travel([0, -10, 0])}},
        "motions": {
            "acquire": {"from": "offered", "by": "hand", "moves": {"carried article": travel([0, 10, 0])},
                        "note": "The sample is handed to the carrier: no motor moves it in this teaching layout."},
            "loaded-turn": {"from": {"after": "acquire"}, "drive": {"pivot": {"to": "=turn"}, "gate": {"to": "=slide"}},
                            "durationS": seconds(0.5, 0.4, 0.7)},
            "release": {"from": {"after": "loaded-turn"}, "drive": {"ejector": {"to": 12}}, "durationS": seconds(0.4, 0.3, 0.6)},
            "park-loaded": {"from": {"after": "release"}, "drive": {"pivot": {"to": 0}, "gate": {"to": 0}}, "durationS": seconds(0.5, 0.4, 0.7)},
            "remove-carrier": {"by": "hand", "moves": {"carrier": travel([0, 0, 80])},
                               "note": "Lifted out by hand in the pit, with the representative sample on it."}}}


def cycle():
    """One cycle, in order: each phase names its motions or why it does not apply."""
    listed = {"acquire": ["acquire"], "transfer": ["loaded-turn"], "deliver": ["release"], "park": ["park-loaded"], "service": ["remove-carrier"]}
    return [dict(phase=p, motions=listed[p]) if p in listed else dict(phase=p, notApplicable="Invented: the teaching cycle has no " + p + " step")
            for p in PHASES]


def page(name):
    """The review page's words and display choices. Every field is optional and none reaches the verdict: a solid with no
    entry shows its name, its group and its note from the design source."""
    return {"schema": "agent-frc/review-page@1", "title": name + ": invented turning carrier",
            "context": "Invented teaching project", "architecture": "A pivoting carrier that turns a sample past a sliding gate",
            "focus": "Invented focus: the loaded head clears the rail and the gate through the turn.",
            "notes": ["Invented: every solid is a blockout box with an assumed weight range."],
            "phases": {"transfer": {"title": "Turn the loaded carrier past the gate"}, "service": {"title": "Lift the carrier out in the pit"}},
            "solids": {"head": {"description": "Invented carrier head that holds the sample through the turn."}}}


def requirements():
    """The season's requirements, shared by every release: the weight limits, each with what it leaves out, and the bus floor."""
    return {"schema": "agent-frc/season-requirements@1", "basis": "Invented design brief for teaching", "minBusV": 9,
            "weightLimits": [dict(name="inspection", limitKg=15, excludesGroups=["bumper", "battery"], basis="Invented rule: weighed without bumpers and battery"),
                             dict(name="with bumpers and battery", limitKg=20, excludesGroups=[], basis="Invented field estimate")]}


def requirements_file(root, project):
    """Where the season's requirements sit: beside the releases folder, shared by every release of the season."""
    return (root.parent.parent if root.parent.name == "releases" else root.parent) / "requirements.json"


def create(root, release_id="1.0", project=None, name="Turning carrier"):
    """Write the example into the release folder `root`, naming every file by its path from `project`. Returns the judgement."""
    root = Path(root).resolve()
    project = root.parent if project is None else Path(project).resolve()
    if root == project:
        raise ValueError("Keep the release folder inside the project, not at its root")
    prefix = root.relative_to(project).as_posix() + "/"
    root.mkdir(parents=True, exist_ok=False)
    (root / "premises").mkdir()

    def write(file, data):
        (root / file).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")
        return {"file": prefix + file}

    issue = "invented-design-" + release_id
    source = write("design.json", design_source(name + " " + release_id))
    season = requirements_file(root, project)
    if not season.exists():
        season.write_text(json.dumps(requirements(), indent=2) + "\n", encoding="utf-8", newline="\n")
    (root / "narrative.md").write_text("Acquire a sample from the front and turn it past the gate for release. At the finish, park the carrier. "
                                       "If the gate stays closed, stop before the turn.\n", encoding="utf-8", newline="\n")
    shown = write("page.json", page(name + " " + release_id))
    premise = write("premises/robot-mass.json", dict(
        id="robot-mass", phase="conceptual-design", scenario="selected cycle", unit="kg", interfaces=["robot"], criterion={"range": [0, 14]},
        observes="mass.rangeKg", betterDirection="lower", base=14, basis="Invented concept study: the drive and cycle assumptions hold for a robot of at most 14 kg"))
    judgement = {
        "schema": "agent-frc/layout-judgement@2", "issue": issue, "source": source, "records": {"folder": prefix + "records"},
        "requirements": {"file": season.relative_to(project).as_posix()},
        "narrative": dict(file=prefix + "narrative.md", objectives=[
            dict(objective="Acquire, turn and release", disposition="represented", basis="The acquire, loaded-turn and release motions follow the sample."),
            dict(objective="Park at the finish", disposition="represented", basis="The park-loaded motion returns the carrier."),
            dict(objective="Stop for a closed gate", disposition="represented", basis="The parked head clears the closed gate before the turn.")]),
        "premises": [premise],
        "rules": dict(minGapMm=1, depth=9, allowanceBasis="Invented 1 mm packaging reserve", pathToleranceMm=40),
        "purposes": {"park": ["park-loaded"], "service": {"remove-carrier": {"extract": True}}},
        "cycle": cycle(),
        # Nothing floats: the rail's support is deliberately not drawn in this teaching layout, so it is labelled with the reason.
        "attachment": {"unmounted": {"rail": "Invented teaching layout: the frame member that carries the rail is not drawn."}},
        "control": dict(motion="loaded-turn", displaced="rail", moving="head", offsetMm=[0, -50, 0],
                        basis="Move the fixed rail into the arc between the same clear endpoints"),
        "risks": [dict(id="gate-closes-mid-turn", risk="Invented: the gate closes while the loaded head is turning",
                       closedBy="Invented: the narrative stops before the turn when the gate is closed")],
        "page": shown}
    write("judgement.json", judgement)
    return judgement


def run(command, cwd):
    done = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError(" ".join(str(part) for part in command[:3]) + " failed:\n" + done.stderr + done.stdout)
    return done


def build_and_check(project, folder):
    """Generate the solids with the design library, measure and judge the design (the library writes its records), then build
    the review page from those records."""
    rel = folder.relative_to(project).as_posix()
    run([sys.executable, "-m", "frc_design_kernel", "build", rel + "/design.json", "--out", rel + "/generated"], project)
    run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", ".", rel + "/judgement.json", "--require-checked"], project)
    run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-page", ".", rel + "/judgement.json", "--quiet"], project)


def site(project, author):
    """The project's own published index, fonts and CI, copied from the references. They name no plugin."""
    templates, pages = PLUGIN / "templates", project / "docs/preliminary-design"
    pages.mkdir(parents=True, exist_ok=True)
    author.mkdir(parents=True, exist_ok=True)
    if not (pages / "fonts").exists():
        shutil.copytree(templates / "preliminary-review-fonts", pages / "fonts")
    for source, dest in [("preliminary-review-gitignore", author / ".gitignore"), ("preliminary-review-index.html", pages / "index.html"),
                         ("project-ci/ci.yml", project / ".github/workflows/ci.yml"), ("project-ci/scan.mjs", project / "scripts/ci/scan.mjs"),
                         ("project-ci/site-check.mjs", project / "scripts/ci/site-check.mjs")]:
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(templates / source, dest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("directory", type=Path, help="The project root with --project-review; otherwise a new directory that stands for one")
    parser.add_argument("--project-review", action="store_true", help="Also write the published index, fonts and CI, then build, check and stage the example")
    parser.add_argument("--release", default="1.0", help="The version, MAJOR.MINOR: the design's folder is " + RELEASES + "/ID")
    parser.add_argument("--design-name", default="Turning carrier", help="The architecture's name in words")
    parser.add_argument("--no-check", action="store_true", help="Write the files only: build nothing and check nothing")
    args = parser.parse_args()
    if not re.fullmatch(r"[1-9][0-9]{0,3}\.(0|[1-9][0-9]{0,3})", args.release):
        parser.error("Use a version as the release ID: MAJOR.MINOR, such as 1.0")
    project = args.directory.resolve()
    folder = project / RELEASES / args.release
    if args.project_review:
        site(project, project / "cad/preliminary-design")
    create(folder, args.release, project, args.design_name)
    if not args.no_check:
        build_and_check(project, folder)
        if args.project_review:
            run([sys.executable, str(PLUGIN / "scripts/stage_preliminary_review.py"), "--base", str(project / "cad/preliminary-design"), args.release,
                 "--design-name", args.design_name], project)
    print("Wrote " + folder.relative_to(project).as_posix() + ": design.json is the design source, judgement.json is the judgement file."
          + ("" if args.no_check else " Its solids are built, measured and judged layout-checked, and its review page is built" + (", and it is staged as a draft." if args.project_review else ".")))
