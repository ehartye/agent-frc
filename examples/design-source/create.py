"""Start a preliminary design from an invented example: a design source and a judgement file, as data.

    python PLUGIN/examples/design-source/create.py . --project-review --release 1.0 --design-name "Turning carrier"

writes the example into cad/preliminary-design/releases/1.0/, builds its solids with the design library, runs the
layout check and stages it. Without --project-review it writes the folder cad/preliminary-design/releases/ID under
a new directory and stops there. Every name and number is invented: replace them with the project's own.

This file draws nothing. The design source it writes is the library's input; the judgement file is the plugin's.
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


def spin(deg):
    return [dict(kind="rotation", originMm=[0, 0, 20], axis=[0, 0, 1], travelDeg=deg)]


def travel(v):
    return [dict(kind="translation", travelMm=v)]


def box(name, group, lo, hi):
    return dict(name=name, group=group, shape=dict(kind="box", fromMm=lo, toMm=hi))


def design_source(name):
    """The design source: what is drawn, how it is grouped and mounted, and how it moves."""
    return {
        "schema": "frc-design-kernel/design@1", "name": name, "units": {"length": "mm", "mass": "kg"},
        "frame": "Invented mounting block axis on the floor plane, +X forward, +Y left, +Z up, millimetres",
        "parameters": {"turn": 90, "slide": 12},
        "groups": {"structure": {"role": "structure"}, "bumper": {"role": "bumper"}, "carrier": {"role": "mechanism"},
                   "carried article": {"role": "payload"}, "neighbor": {"role": "mechanism"}, "drive": {"role": "drive"},
                   "battery": {"role": "battery"}},
        "solids": [box("mount", "structure", [-8, -8, 0], [8, 8, 6]), box("rail", "structure", [19, 70, 18], [24, 75, 23]),
                   box("bumper", "bumper", [-20, -20, 0], [-16, 20, 4]), box("head", "carrier", [28, -2, 18], [32, 2, 22]),
                   box("sample", "carried article", [36, -2, 18], [40, 2, 22]), box("gate", "neighbor", [55, -10, 15], [58, -7, 24]),
                   box("drive", "drive", [-14, -11, 0], [-10, -2, 6]), box("battery", "battery", [9, -10, 0], [17, -3, 4])],
        "fixtures": [],
        "mounts": [dict(group="carrier", on="mount", atMm=[0, 0, 6], note="Sketch origin of the pedestal"),
                   dict(group="neighbor", on="rail", atMm=[22, 72, 20], note="Proposed slide attachment datum")],
        "contacts": [],
        "poses": {"offered": {"carried article": travel([0, -10, 0])},
                  "turned": {"carrier": spin("=turn"), "carried article": spin("=turn"), "neighbor": travel([0, "=slide", 0])},
                  "released": {"carrier": spin("=turn"), "carried article": spin("=turn") + travel([0, 12, 0]), "neighbor": travel([0, "=slide", 0])}},
        "motions": {
            "acquire": {"from": "offered", "moves": {"carried article": travel([0, 10, 0])}},
            "loaded-turn": {"to": "turned", "moves": {"carrier": spin("=turn"), "carried article": spin("=turn"), "neighbor": travel([0, "=slide", 0])}},
            "release": {"from": "turned", "to": "released", "moves": {"carried article": travel([0, 12, 0])}},
            "park-loaded": {"from": "released", "moves": {"carrier": spin("=-turn"), "neighbor": travel([0, "=-slide", 0])}},
            "remove-carrier": {"moves": {"carrier": travel([0, 0, 80]), "carried article": travel([0, 0, 80])}}}}


def stages():
    """One stage per motion of the source: why it is checked, against what allowance, and what carries the payload."""
    reserve = "Invented 1 mm packaging reserve"
    return {
        "acquire": dict(purpose="operating", basis="Bring the article to the carrier", minGapMm=1, allowanceBasis=reserve, pathToleranceMm=40),
        "loaded-turn": dict(purpose="operating", basis="Sweep the head and sample while the adjacent gate slides", minGapMm=1, allowanceBasis=reserve,
                            pathToleranceMm=40, carriedWith={"carried article": "carrier"}),
        "release": dict(purpose="operating", basis="Move the article clear of the turned carrier", minGapMm=1, allowanceBasis=reserve, pathToleranceMm=40),
        "park-loaded": dict(purpose="park", basis="Return from the reached posture", minGapMm=1, allowanceBasis=reserve, pathToleranceMm=40),
        "remove-carrier": dict(purpose="service", basis="Withdraw the parked carrier and representative payload vertically", minGapMm=1,
                               allowanceBasis=reserve, pathToleranceMm=40, extract=True, carriedWith={"carried article": "carrier"})}


def presentation():
    words = {"mount": ("Locate the carrier pivot.", "Its fixed face establishes the repeatable attachment datum.", "Aluminum", "Carrier"),
             "rail": ("Support the sliding gate.", "Its proximity to the turning head governs clearance at midstroke.", "Steel", "Gate"),
             "head": ("Carry the sample during the turn.", "A single rotating carrier connects pickup to release.", "Aluminum", "Carrier"),
             "sample": ("Represent the article being transferred.", "Its overhang sets the loaded clearance.", "Polymer", "Carried article"),
             "gate": ("Control access to the release lane.", "Its concurrent slide can obstruct the loaded turn.", "Polymer", "Gate"),
             "drive": ("Represent the propulsion package.", "The carrier must clear running gear during withdrawal.", "Purchased assembly", "Drivetrain"),
             "battery": ("Supply the robot bus.", "The selected supply occupies space near the service path.", "Purchased assembly", "Power"),
             "bumper": ("Represent the outer protective structure.", "Its fixed envelope constrains the approach.", "Foam and backing", "Frame and bumper")}
    return {
        "components": {n: dict(purpose=p, rationale=r, material=m, subsystem=s, volumeType="material") for n, (p, r, m, s) in words.items()},
        "required": {"propulsion": ["drive"], "supply": ["battery"]},
        "loadMembers": {"drive": ["drive"], "carrier": ["head"], "gate": ["gate"]},
        "architecture": "Invented pivoting carrier beside a sliding gate (teaching layout)",
        "title": "Acquire, turn and release past a sliding gate", "context": "Invented teaching project",
        "focus": "Check the loaded head against the sliding gate, then play the displaced control.",
        "notes": ["Invented teaching layout. Boxes stand in for the carrier, gate, rail and running gear.",
                  "Carried-article motion is prescribed. Retention under gravity is not modelled."],
        "runningAdditions": [dict(name="carried sample", kg=[0.2, 0.5], members=["sample"])], "runningBasis": "the carried sample",
        "loadPaths": {"head": "Pivot on the mount block; the mount bolts to the invented frame plate.",
                      "gate": "Slides on the rail; the rail bolts to the frame plate."},
        "caseKinds": {"park-loaded": "inhibited"},
        "phases": {"loaded-turn": dict(title="Turn the loaded carrier"), "park-loaded": dict(title="Return to park with the sample held")},
        "uncoveredCases": [dict(id="gate-closes-mid-turn", condition="The gate closes while the loaded head is turning",
                                reason="No interlock timing is modelled; the narrative stops before the turn instead")]}


def create(root, release_id="1.0", project=None, name="Turning carrier"):
    """Write the example into the release folder `root`, naming every file by its path from `project`. Returns the judgement."""
    root = Path(root).resolve()
    project = root.parent if project is None else Path(project).resolve()
    if root == project:
        raise ValueError("Keep the release folder inside the project, not at its root")
    prefix = root.relative_to(project).as_posix() + "/"
    root.mkdir(parents=True, exist_ok=False)

    def write(file, data):
        (root / file).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")
        return {"file": prefix + file}

    cycle = ["acquire", "loaded-turn", "release", "park-loaded"]
    issue = "invented-design-" + release_id
    source = write("design.json", design_source(name + " " + release_id))
    (root / "narrative.md").write_text("Acquire a sample from the front and turn it past the gate for release. At the finish, park the carrier. "
                                       "If the gate stays closed, stop before the turn.\n", encoding="utf-8", newline="\n")
    limits = write("limits.json", dict(basis="Invented design brief and loaded operating estimates", inspectionLimitKg=15, operatingMinV=9,
                                       massLines=["running gear", "power", "body", "mechanisms", "remaining robot"],
                                       electricalCases={stage + "-" + condition: dict(stage=stage, duty="Drive and operate the mechanism during " + stage,
                                                                                      batteryCondition=condition, requiredMotionMinV=9.2,
                                                                                      sources=["drive", "carrier", "gate", "controls"])
                                                        for stage in cycle for condition in ("nominal", "weak")}))
    masses = [("running gear", ["drive"], [4, 5]), ("power", ["battery"], [2, 2.2]), ("body", ["mount", "rail", "bumper"], [2, 2.4]),
              ("mechanisms", ["head", "gate"], [2, 2.4]), ("remaining robot", [], [1, 1.5])]
    amps = {"drive": [20, 30], "carrier": [8, 13], "gate": [2, 3], "controls": [2, 4]}
    budgets = write("budgets.json", dict(
        issue=issue, requirements=limits, runningPayloadKg=[0.2, 0.5],
        masses=[dict(id=k, members=items, kg=kg, basis="Invented subtotal, including unmodelled items") for k, items, kg in masses],
        electricalCases={stage + "-" + k: dict(basis="Simultaneous estimated source currents at loaded operating mass", loadedKg=[11.2, 14.0],
                                               batterySideA=amps, openCircuitV=v, resistanceOhm=r)
                         for stage in cycle for k, v, r in (("nominal", [12.3, 12.6], [.012, .017]), ("weak", [11.5, 12], [.023, .03]))}))
    role = write("role-cycle.json", dict(cycle="Acquire at the front; budget 2.0 to 3.0 s for acquisition"))
    estimate = write("capability-estimate.json", dict(acquireSeconds=2.4, basis="Invented timing estimate"))
    accepted = write("acquire-time-accepted.json", dict(id="acquire-time", unit="s", scenario="selected cycle", criterion={"range": [2.0, 3.0]},
                                                        phase="conceptual-design", interfaces=["carrier", "carried article"], source=role,
                                                        basis="Matched coarse role comparison"))
    current = write("acquire-time-current.json", dict(id="acquire-time", unit="s", scenario="selected cycle", value=2.4, issue=issue,
                                                      source=estimate, valueField="acquireSeconds"))
    judgement = {
        "schema": "agent-frc/layout-judgement@1", "issue": issue, "source": source, "generated": {"file": prefix + "generated/manifest.json"},
        "view": prefix + "package-motion.html", "budgets": budgets,
        "narrativeReview": dict(source={"file": prefix + "narrative.md"}, objectives=[
            dict(objective="Acquire, turn and release", disposition="represented", basis="The acquire, loaded-turn and release stages follow the sample."),
            dict(objective="Park at the finish", disposition="represented", basis="The park-loaded stage returns the carrier."),
            dict(objective="Stop for a closed gate", disposition="represented", basis="The parked head clears the closed gate before the turn.")]),
        "premises": [dict(accepted=accepted, current=current)], "missingInputs": [],
        # Nothing floats: the rail's support is deliberately not drawn in this teaching layout, so it is labelled with the reason.
        "attachment": {"unmounted": {"rail": "Invented teaching layout: the frame member that carries the rail is not drawn."}},
        "cycle": cycle,
        "control": dict(case="loaded-turn", displaced="rail", moving="head", offsetMm=[0, -50, 0],
                        basis="Move the fixed rail into the arc between the same clear endpoints"),
        "stages": stages(), "presentation": presentation()}
    write("judgement.json", judgement)
    write("missions.json", dict(missionCases=[dict(case="release", kind="operating-case", accomplishes="delivered", objective="Acquire, turn and release")]))
    return judgement


def run(command, cwd):
    done = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError(" ".join(str(part) for part in command[:3]) + " failed:\n" + done.stderr + done.stdout)
    return done


def build_and_check(project, folder):
    """Generate the solids with the design library, then run the layout check and save its receipt."""
    rel = folder.relative_to(project).as_posix()
    run([sys.executable, "-m", "frc_design_kernel", "build", rel + "/design.json", "--out", rel + "/generated"], project)
    run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", ".", rel + "/judgement.json", "--write-view", "--require-checked",
         "--output", rel + "/receipt.json"], project)


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
          + ("" if args.no_check else " Its solids are built, its layout check passed" + (" and it is staged as a draft." if args.project_review else ".")))
