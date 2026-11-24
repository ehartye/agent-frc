"""An invented project to judge: a real Git checkout whose structure project-layout.mjs init made, holding the starter design.

Nothing is copied into it: the starter writes its files, and Git holds them. Synthetic teaching fixture."""
from contextlib import contextmanager
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[2]
RELEASE = "cad/preliminary-design/releases/1.0"
LOG = RELEASE + "/judge-log.json"
EXAMPLE = PLUGIN / "examples/design-source/create.py"
LAYOUT = PLUGIN / "scripts/project-layout.mjs"


def git(root, *args):
    done = subprocess.run(["git", "-C", str(root), "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.autocrlf=false",
                           "-c", "commit.gpgsign=false", *args], capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError("git " + " ".join(args) + ": " + done.stderr)
    return done.stdout.strip()


def put(root, name, data):
    path = Path(root) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")


def get(root, name):
    return json.loads((Path(root) / name).read_text(encoding="utf-8"))


def commit(root, message="Invented"):
    git(root, "add", "-A")
    git(root, "commit", "-q", "--allow-empty", "-m", message)


def project(folder, change=None):
    """A committed project in `folder` with the starter at release 1.0. change(source, judgement), when given, edits both first."""
    root = Path(folder).resolve()
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-q")
    done = subprocess.run(["node", str(LAYOUT), "init", str(root)], capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError(done.stdout + done.stderr)
    runpy.run_path(str(EXAMPLE))["create"](root, "1.0", "Turning carrier")
    if change:
        source, judgement = get(root, RELEASE + "/design.json"), get(root, RELEASE + "/judgement.json")
        change(source, judgement)
        put(root, RELEASE + "/design.json", source)
        put(root, RELEASE + "/judgement.json", judgement)
    commit(root)
    return root


def restore(root):
    """The project as committed: edits undone, and every file a run wrote removed."""
    git(root, "reset", "-q", "--hard")
    git(root, "clean", "-fdqx")


def judge(root, *args, env=None):
    """Run design judge in the project, as an agent does. Returns the finished process."""
    return subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "judge", *args], cwd=root, capture_output=True, text=True, encoding="utf-8", env=env)


def verdict_of(run):
    return json.loads(run.stdout) if run.stdout.strip() else None


sys.path.insert(0, str(PLUGIN / "scripts"))


def solid(source, name):
    return next(s for s in source["solids"] + source["fixtures"] if s["name"] == name)


def snapshot(folder):
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in sorted(Path(folder).rglob("*")) if p.is_file() and ".git" not in p.parts}


class Counts:
    """What the library was asked: designs built, jobs measured, pairs limited to solids, adjustment ends and trials run."""

    def __init__(self):
        self.built, self.jobs, self.focus, self.ends, self.tried = 0, [], [], [], []

    @property
    def motions(self):
        return sorted({j["motion"] for j in self.jobs if j["kind"] == "clearance" and "motion" in j and not j.get("displace")})


@contextmanager
def counted():
    from frc_design_kernel.builder import assembly
    from frc_design_kernel.measure import extremes, records
    from frc_design_kernel.trials import campaign
    found, real = Counts(), (assembly.build, records.record, records.answers, extremes.at_extremes, campaign.run_campaign)

    def build(*args, **kwargs):
        found.built += 1
        return real[0](*args, **kwargs)

    def record(bench, jobs, *args, **kwargs):
        found.jobs += jobs
        return real[1](bench, jobs, *args, **kwargs)

    def answers(bench, jobs, focus=None, **kwargs):
        found.jobs += jobs
        found.focus.append(focus)
        return real[2](bench, jobs, focus, **kwargs)

    def at_extremes(*args, **kwargs):
        found.ends.append(kwargs.get("adjustments"))
        return real[3](*args, **kwargs)

    def run_campaign(design, names=None, *args, **kwargs):
        found.tried += names
        return real[4](design, names, *args, **kwargs)

    assembly.build, records.record, records.answers, extremes.at_extremes, campaign.run_campaign = build, record, answers, at_extremes, run_campaign
    try:
        yield found
    finally:
        assembly.build, records.record, records.answers, extremes.at_extremes, campaign.run_campaign = real


def with_tray(source, judgement):
    """The starter with its invented tray, ball, interaction, planar trial and mechanical adjustment, as a ready design holds them."""
    import ready_example as tray
    tray.tray(source)
    tray.judged(judgement)


class Judge(unittest.TestCase):
    change = None

    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory(ignore_cleanup_errors=True)
        cls.root = project(Path(cls.folder.name) / "project", cls.change)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def tearDown(self):
        restore(self.root)

    def edit(self, name, change):
        data = get(self.root, name)
        change(data)
        put(self.root, name, data)

    def source(self, change):
        self.edit(RELEASE + "/design.json", change)

    def judgement(self, change):
        self.edit(RELEASE + "/judgement.json", change)

    def judge(self, **asked):
        """Judge in this process and return the verdict. Raises run.Refused when nothing may be judged."""
        from kernel_layout import run
        full, page, where = asked.pop("full", False), asked.pop("page", False), asked.pop("root", self.root)
        return run.judge(where, "1.0", run.Asked(**asked), full=full, page=page, workers=1, say=lambda line: None)

    def refused(self, **asked):
        from kernel_layout import run
        with self.assertRaises(run.Refused) as raised:
            self.judge(**asked)
        return str(raised.exception)

    def rows(self):
        return {(r["check"], r["subject"]): r for r in get(self.root, LOG)["rows"]}

    def record(self, name):
        return get(self.root, RELEASE + "/results/measurements/" + name + ".json")
