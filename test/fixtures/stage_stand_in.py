"""Run the staging command on an invented project whose layout judgement is stood in for, as stand-in-cli.mjs does for
the Node commands. The shipped command takes no stand-in: this replaces what it calls, in process."""
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import stage_preliminary_review as stage  # noqa: E402

CLI = ["node", str(HERE / "stand-in-cli.mjs")]


def judged(season, file):
    run = subprocess.run([*CLI, "verdict", str(season), str(file)], capture_output=True, text=True, encoding="utf-8")
    if run.returncode:
        raise ValueError(run.stderr.strip())
    return json.loads(run.stdout)


stage.judged = judged
stage.GATE_COMMAND = [*CLI, "stage-gate.mjs"]
sys.exit(stage.main())
