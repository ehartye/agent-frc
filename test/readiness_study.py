"""Write a synthetic passing readiness study whose registered geometry equals a fresh scan of its STEP."""
import json
from pathlib import Path
import sys

from mechanical_fixture import fixture, write
from mechanical_readiness import scan, scope_digest
from showcase_contacts import measure


def scanned_study(root):
    """Two invented boxes on an invented bench. The review command rescans the STEP, so the geometry is measured, not typed."""
    first = fixture(root)
    study = fixture(root, measured=measure(root/first["step"]["file"], .02, [], volumes=True))
    study["geometry"] = write(root, study["geometry"]["file"], scan(root, study))
    scope = json.loads((root/"test-scope.json").read_bytes())
    for observation in scope["observations"].values():
        observation["criteriaSha256"] = scope_digest(study)
    reviewed = write(root, "test-scope.json", scope)
    study["coverage"] = {k: {**reviewed, "id": k} for k in scope["observations"]}
    return study


if __name__ == "__main__":
    project = Path(sys.argv[1]).resolve()
    project.mkdir(parents=True, exist_ok=True)
    write(project, "readiness-study.json", scanned_study(project))
