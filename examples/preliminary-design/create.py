"""Create a synthetic millimetre package and a matched obstruction for the design CLI."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import subprocess
import shutil
import re
import sys

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_AsIs
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.gp import gp_Pnt


def replay_set(write):
    """A synthetic recorded run and the replay set that plays it in the review's one motion list. Every number is invented."""
    frames, step = 61, 0.05
    ramp = lambda k, a, b: min(1.0, max(0.0, (k - a) / (b - a)))
    def pose(x, deg=0.0, shift=(0.0, 0.0, 0.0)):
        # Turn about the carrier axis through (0, 0, 20), then shift, then move with the robot along X.
        c, n = math.cos(math.radians(deg)), math.sin(math.radians(deg))
        return [c, -n, 0, x + shift[0], n, c, 0, shift[1], 0, 0, 1, shift[2]]
    drive = [60 * ramp(k, 0, 20) for k in range(frames)]
    turn = [90 * ramp(k, 20, 40) for k in range(frames)]
    leave = [ramp(k, 40, 56) for k in range(frames)]
    run = write("release-lane-run.json", dict(case="release-lane-run", basis="Synthetic, invented recorded run",
        timeS=[round(step * k, 2) for k in range(frames)], robotXMm=drive, carrierDeg=turn,
        sampleLeaveMm=[[0, round(58 * f, 3), round(-4 * f, 3)] for f in leave]))
    def hose(x):
        # A slack line from a fixed post to the moving robot; drawn for display only.
        a, b = (-60.0, 60.0, 30.0), (x - 8.0, 8.0, 6.0)
        return [[a[i] + (b[i] - a[i]) * t / 8 - (12 * math.sin(math.pi * t / 8) if i == 2 else 0) for i in range(3)] for t in range(9)]
    lo, hi = (44, 84, 8), (76, 140, 14)
    lane = dict(v=[[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]],
                   [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]],
                f=[[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]])
    return write("release-lane-replay.json", dict(schema="agent-frc/review-replays@1",
        fieldBodies={"lane": dict(name="Release lane", mesh=lane, purpose="Receive the released sample.",
                                  rationale="Invented field part that the recorded run delivers to.")},
        replays=[dict(id="release-lane-run", label="Release-lane run (recorded)", objective="Acquire, turn and release",
            basis="Synthetic recorded run: drive to the lane, turn the carrier and release the sample.", evidence=[dict(run, role="recorded run")],
            recorded=["Robot position", "Carrier angle", "Sample path after release"], display=["Supply hose shape"],
            time=[round(step * k, 2) for k in range(frames)], follow="robot",
            measure=["Robot " + str(round(drive[k])) + " mm along the lane · carrier " + str(round(turn[k])) + "°" for k in range(frames)],
            events=[dict(frame=20, label="Robot at the lane"), dict(frame=40, label="Carrier turned"), dict(frame=56, label="Sample on the lane")],
            bodies={**{n: "robot" for n in ("mount", "bumper", "rail", "gate", "drive", "battery")}, "head": "carrier", "sample": "sample", "lane": None},
            groups=dict(robot=[pose(drive[k]) for k in range(frames)], carrier=[pose(drive[k], turn[k]) for k in range(frames)],
                        sample=[pose(drive[k], turn[k], (0, 58 * leave[k], -4 * leave[k])) for k in range(frames)]),
            tubes=[dict(name="Supply hose", radiusMm=1.2, color="#c9a227", points=[hose(drive[k]) for k in range(frames)])])]))


RELEASES = "cad/preliminary-design/releases"


def create(root, release_id=None, project=None):
    """Write the package into the release folder `root`, with every pin written from `project`.

    The project is the repository: the layout plan, its inputs, the review page and the scene sit together in the
    release folder inside it, and nothing is generated at the project root. Without `project`, the release folder's
    parent stands for the repository."""
    root = Path(root).resolve()
    project = root.parent if project is None else Path(project).resolve()
    prefix = root.relative_to(project).as_posix() + "/"
    if root == project:
        raise ValueError("Keep the release folder inside the project, not at its root")
    root.mkdir(parents=True,exist_ok=False)
    cli=Path(__file__).resolve().parents[2]/"scripts/design.mjs"
    subprocess.run(["node",str(cli),"new",str(root/"design.json")],check=True)
    def pin(name):
        return {"file":prefix+name,"sha256":hashlib.sha256((root/name).read_bytes()).hexdigest()}
    def write(name,obj):
        (root/name).write_text(json.dumps(obj,indent=2)+"\n",encoding="utf-8")
        return pin(name)
    doc=TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    table=XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    boxes={"mount":([-8,-8,0],[8,8,6]),"bumper":([-20,-20,0],[-16,20,4]),
           "rail":([19,70,18],[24,75,23]),"head":([28,-2,18],[32,2,22]),
           "sample":([36,-2,18],[40,2,22]),"gate":([55,-10,15],[58,-7,24])}
    boxes.update(drive=([-14,-11,0],[-10,-2,6]), battery=([9,-10,0],[17,-3,4]))
    for name,(lo,hi) in boxes.items():
        shape=BRepPrimAPI_MakeBox(gp_Pnt(*lo),gp_Pnt(*hi)).Shape()
        TDataStd_Name.Set_s(table.AddShape(shape,False),TCollection_ExtendedString(name))
    writer=STEPCAFControl_Writer()
    assert writer.Transfer(doc,STEPControl_AsIs) and writer.Write(str(root/"package.step"))==IFSelect_RetDone
    design=pin("design.json");step=pin("package.step")
    datum=dict(name="Synthetic mounting block axis in parked STEP world, millimetres",
               robotToStepMm=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
    def spin(deg):return [dict(kind="rotation",originMm=[0,0,20],axis=[0,0,1],travelDeg=deg)]
    def travel(v):return [dict(kind="translation",travelMm=v)]
    duty=dict(id="loaded-turn",stage="operating",basis="Sweep the head and sample while the adjacent gate slides",
              moves={"head":spin(90),"sample":spin(90),"gate":travel([0,12,0])},minGapMm=1)
    park=dict(id="park-loaded",stage="park",basis="Return from the reached posture",
              initialPose=duty["moves"],moves={"head":spin(-90),"sample":spin(-90),"gate":travel([0,-12,0])},minGapMm=1)
    service=dict(id="remove-carrier",stage="service",basis="Withdraw the parked carrier and representative payload vertically",
                 moves={n:travel([0,0,80]) for n in ["head","sample"]},extract=["head","sample"],minGapMm=1)
    intake=dict(id="acquire",stage="operating",basis="Bring the article to the carrier",
                initialPose={"sample":travel([0,-10,0])},moves={"sample":travel([0,10,0])},minGapMm=1)
    release=dict(id="release",stage="operating",basis="Move the article clear of the turned carrier",
                 initialPose=duty["moves"],moves={"sample":travel([0,12,0])},minGapMm=1)
    park["initialPose"]={**duty["moves"],"sample":spin(90)+travel([0,12,0])}
    park["moves"]={k:v for k,v in park["moves"].items() if k!="sample"}
    cases=[duty,park,service,intake,release]
    motion=write("paths.json",dict(schema="agent-frc/mechanical-motion@1",step=step,layoutDesignSha256=design["sha256"],
                                    layoutDatum=datum,cases=cases))
    groups={key:dict(role=role,members=items) for key,role,items in [
        ("structure","structure",["mount","rail"]),("bumper","bumper",["bumper"]),
        ("carrier","mechanism",["head"]),("carried article","payload",["sample"]),("neighbor","mechanism",["gate"]),("drive","drive",["drive"]),("battery","battery",["battery"])]}
    mounts=[dict(group="carrier",on="mount",pointMm=[0,0,6],basis="Sketch origin of the pedestal"),
            dict(group="neighbor",on="rail",pointMm=[22,72,20],basis="Proposed slide attachment datum")]
    stages={}
    for c in cases:
        moving=[k for k,g in groups.items() if set(g["members"]) & c["moves"].keys()]
        carried={"carried article":"carrier"} if c in (duty,service) else {}
        stages[c["id"]]=dict(purpose=c["stage"],movingGroups=moving,carriedWith=carried,
                             allowanceBasis="Synthetic 1 mm packaging reserve")
    plan=dict(schema="agent-frc/preliminary-layout@1",issue="synthetic-package-" + (release_id or "A"),design=design,step=step,motion=motion,
              datum=datum,groups=groups,mounts=mounts,stages=stages,missingInputs=[],
              control=dict(case="loaded-turn",displaced="rail",moving="head",offsetMm=[0,-50,0],
                           basis="Move the fixed rail into the arc between the same clear endpoints"))
    plan.update(cycle=["acquire","loaded-turn","release","park-loaded"], view=prefix+"package-motion.html")
    (root/"narrative.md").write_text(
        "Acquire a sample from the front and turn it past the gate for release. "
        "At the finish, park the carrier. If the gate stays closed, stop before the turn.\n",
        encoding="utf-8")
    plan["narrativeReview"] = dict(source=pin("narrative.md"), objectives=[
        dict(objective="Acquire, turn and release", disposition="represented", basis="The acquire, loaded-turn and release cases follow the sample."),
        dict(objective="Park at the finish", disposition="represented", basis="The park-loaded case returns the carrier."),
        dict(objective="Stop for a closed gate", disposition="represented", basis="The parked head clears the closed gate before the turn.")])
    explanations = {
        "mount": ("Locate the carrier pivot.", "Its fixed face establishes the repeatable attachment datum."),
        "rail": ("Support the sliding gate.", "Its proximity to the turning head governs clearance at midstroke."),
        "head": ("Carry the sample during the turn.", "A single rotating carrier connects pickup to release."),
        "sample": ("Represent the article being transferred.", "Its overhang sets the loaded clearance."),
        "gate": ("Control access to the release lane.", "Its concurrent slide can obstruct the loaded turn."),
        "drive": ("Represent the propulsion package.", "The carrier must clear running gear during withdrawal."),
        "battery": ("Supply the robot bus.", "The selected supply occupies space near the service path."),
        "bumper": ("Represent the outer protective structure.", "Its fixed envelope constrains the approach.")}
    plan["presentation"] = {"components": {n: dict(purpose=p, rationale=r) for n,(p,r) in explanations.items()}}
    requirements=write("package-limits.json",dict(basis="Invented design brief and loaded operating estimates",
        inspectionLimitKg=15,operatingMinV=9,
        massLines=["running gear","power","body","mechanisms","remaining robot"],
        electricalCases={stage+"-"+condition:dict(stage=stage,duty="Drive and operate the mechanism during "+stage,
            batteryCondition=condition,
            requiredMotionMinV=9.2,sources=["drive","carrier","gate","controls"]) for stage in plan["cycle"] for condition in ("nominal","weak")}))
    sources={"drive":[20,30],"carrier":[8,13],"gate":[2,3],"controls":[2,4]}
    masses=[("running gear",["drive"],[4,5]),("power",["battery"],[2,2.2]),
            ("body",["mount","rail","bumper"],[2,2.4]),("mechanisms",["head","gate"],[2,2.4]),
            ("remaining robot",[],[1,1.5])]
    plan["budgets"]=write("budgets.json",dict(issue=plan["issue"],step=step,motion=motion,design=design,
        requirements=requirements,runningPayloadKg=[0.2,0.5],
        masses=[dict(id=k,members=items,kg=r,basis="Synthetic subtotal, including unmodeled items") for k,items,r in masses],
        electricalCases={stage+"-"+k:dict(basis="Simultaneous estimated source currents at loaded operating mass",
            loadedKg=[11.2,14.0],batterySideA=sources,openCircuitV=v,resistanceOhm=r)
            for stage in plan["cycle"] for k,v,r in (("nominal",[12.3,12.6],[.012,.017]),("weak",[11.5,12],[.023,.03]))}))
    role=write("role-cycle.json",dict(cycle="Acquire at the front; budget 2.0 to 3.0 s for acquisition"))
    current=write("capability-estimate.json",dict(face="front",acquireSeconds=2.4,basis="Synthetic timing estimate"))
    plan["premises"]=[]
    for key,unit,criterion,value in [("pickup-face","face",{"equals":"front"},"front"),
                                    ("acquire-time","s",{"range":[2.,3.]},2.4)]:
        identity=dict(id=key,unit=unit,scenario="selected cycle")
        field_input=dict(match="trial-1",actor="B1",input="pickupFace") if key=="pickup-face" else dict(
            match="trial-1",actor="B1",input="actionDwell",period="Opening",stepIndex=0,stepLabel="Pick up tile")
        accepted=write(key+"-accepted.json",dict(**identity,criterion=criterion,phase="conceptual-design",
                       interfaces=["carrier","carried article"],source=role,fieldInput=field_input,basis="Matched coarse role comparison"))
        measured=write(key+"-current.json",dict(**identity,value=value,issue=plan["issue"],
                       designSha256=design["sha256"],stepSha256=step["sha256"],source=current,
                       valueField="face" if key=="pickup-face" else "acquireSeconds"))
        plan["premises"].append(dict(accepted=accepted,current=measured))
    if release_id:
        plan["presentation"]["required"] = {"propulsion": ["drive"], "supply": ["battery"]}
        plan["presentation"]["loadMembers"] = {"drive": ["drive"], "carrier": ["head"], "gate": ["gate"]}
        materials = {"mount": "Aluminum", "rail": "Steel", "head": "Aluminum", "sample": "Polymer",
                     "gate": "Polymer", "drive": "Purchased assembly", "battery": "Purchased assembly",
                     "bumper": "Foam and backing"}
        for part, material in materials.items():
            plan["presentation"]["components"][part]["material"] = material
        subsystems = {"mount": "Carrier", "head": "Carrier", "sample": "Carried article", "rail": "Gate",
                      "gate": "Gate", "drive": "Drivetrain", "battery": "Power", "bumper": "Frame and bumper"}
        for part, subsystem in subsystems.items():
            plan["presentation"]["components"][part].update(subsystem=subsystem, volumeType="material")
        plan["presentation"]["architecture"] = "Synthetic pivoting carrier beside a sliding gate (invented teaching layout)"
        plan["presentation"]["title"] = "Acquire, turn and release past a sliding gate"
        plan["presentation"]["context"] = "Synthetic teaching project"
        plan["presentation"]["focus"] = "Check the loaded head against the sliding gate, then play the displaced control."
        plan["presentation"]["notes"] = [
            "Invented teaching layout. Boxes stand in for the carrier, gate, rail and running gear.",
            "Carried-article motion is prescribed. Retention under gravity is not modeled."]
        plan["presentation"]["runningAdditions"] = [dict(name="carried sample", kg=[0.2, 0.5], members=["sample"])]
        plan["presentation"]["runningBasis"] = "the carried sample"
        plan["presentation"]["loadPaths"] = {
            "head": "Pivot on the mount block; the mount bolts to the synthetic frame plate.",
            "gate": "Slides on the rail; the rail bolts to the frame plate."}
        frames = 25
        plan["presentation"]["caseTimelines"] = {"loaded-turn": dict(
            time=[round(0.1 * k, 2) for k in range(frames)],
            measure=["Head at " + str(round(90 * k / (frames - 1))) + "° of the turn" for k in range(frames)])}
        plan["presentation"]["caseKinds"] = {"park-loaded": "inhibited"}
        plan["presentation"]["uncoveredCases"] = [dict(id="gate-closes-mid-turn",
            condition="The gate closes while the loaded head is turning",
            reason="No interlock timing is modeled; the narrative stops before the turn instead")]
        # The synthetic, self-contained season player ships inside the release beside its view.
        (root / "field").mkdir(exist_ok=True)
        shutil.copyfile(Path(__file__).resolve().parents[2] / "templates/preliminary-review-field-interaction.html",
                        root / "field/release-lane.html")
        trial = write("release-lane-trial.json", dict(case="release", basis="Synthetic, invented field-interaction trial",
                                                     outcome="Sample leaves the turned carrier toward the lane"))
        plan["presentation"]["fieldInteractions"] = [dict(title="Synthetic release-lane interaction",
            href="field/release-lane.html", objective="Acquire, turn and release",
            evidence=trial, embed=True)]
        # A synthetic recorded run plays as one more entry of the review's motion list.
        plan["presentation"]["replays"] = [replay_set(write)]
    write("layout.json",plan)
    result = subprocess.run(["node", str(cli), "preliminary-check", str(project), prefix + "layout.json",
                             "--write-view", "--require-checked"], capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace") + result.stdout.decode(errors="replace"))
    if release_id:
        sys.path.insert(0, str(cli.parent))
        from atomic_file import write_atomic
        write_atomic(root / "receipt.json", result.stdout)
        # The synthetic mission task: the released article leaves the turned carrier.
        write("missions.json", dict(missionCases=[dict(case="release", kind="operating-case", accomplishes="delivered",
                                                       objective="Acquire, turn and release")]))
    return plan


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("new_directory",type=Path)
    parser.add_argument("--project-review", action="store_true", help="Include a season-local review bundle and launcher")
    parser.add_argument("--release", default="1.0", help="Release ID, a version MAJOR.MINOR: the package folder is cad/preliminary-design/releases/ID")
    parser.add_argument("--design-name", default="Turning carrier", help="The invented architecture's name, recorded the first time its major number is staged")
    args = parser.parse_args()
    version = re.fullmatch(r"[1-9][0-9]{0,3}\.(0|[1-9][0-9]{0,3})", args.release)
    if not version and not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", args.release):
        parser.error("Use a version as the release ID: MAJOR.MINOR, such as 1.0")
    if args.project_review:
        season = args.new_directory.resolve()
        author = season / "cad/preliminary-design"
        site = season / "docs/preliminary-design"
        site.mkdir(parents=True, exist_ok=True)
        author.mkdir(parents=True, exist_ok=True)
        templates = Path(__file__).resolve().parents[2] / "templates"
        if not (site / "fonts").exists():
            shutil.copytree(templates / "preliminary-review-fonts", site / "fonts")
        for source, dest in [("serve-preliminary-review.py", author / "serve.py"),
                             ("preliminary-review-gitignore", author / ".gitignore"),
                             ("stage-preliminary-review.py", author / "stage.py"),
                             ("preliminary-review-index.html", site / "index.html"),
                             # The one workflow a project runs: scan, publication check, registered checks and deploy.
                             ("design-publication.yml", season / ".github/workflows/design-publication.yml")]:
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(templates / source, dest)
        create(author / "releases" / args.release, release_id=args.release, project=season)
        subprocess.run([sys.executable, str(author / "stage.py"), args.release, *(["--design-name", args.design_name] if version else [])], check=True)
    else:
        # The new directory stands for a repository: the package sits in a release folder inside it.
        create(args.new_directory.resolve() / RELEASES / args.release, project=args.new_directory.resolve())
