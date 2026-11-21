"""Exercise a private file handoff between two independent synthetic checkouts."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory

scripts = Path(__file__).resolve().parents[1] / "scripts"


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json.dumps(data).encode())


def ref(root, name):
    return {"file": name, "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest()}


def run(*args, succeeds=True):
    result = subprocess.run([sys.executable, "-B", str(scripts / "native_handoff.py"), *map(str, args)],
                            capture_output=True, text=True)
    assert (result.returncode == 0) == succeeds, (result.stdout, result.stderr)
    return json.loads(result.stdout) if succeeds else result.stderr


with TemporaryDirectory() as tmp:
    base = Path(tmp)
    origin, receiver, payload = [base / k for k in ("origin", "receiver elsewhere", "transfer")]
    for name, data in {"cad/robot.f3d": b"master", "cad/export.step": b"canonical neutral",
                       "inputs/part.f3d": b"child", "trials/other.step": b"diagnostic"}.items():
        for location in (origin, payload):
            file = location / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
    reg = "cad/fusion-authority.json"
    lineage = "cad/lineage.json"
    archive, step = ref(origin, "cad/robot.f3d"), ref(origin, "cad/export.step")
    identity = dict(id="article", revision="issue-1", configuration="parked", nativeConfiguration="unconfigured")
    write(origin/reg, dict(schema="agent-frc/fusion-authority@1", **identity, basis="synthetic datum",
                           source=dict(kind="offline", archive=archive)))
    write(origin/lineage, dict(schema="agent-frc/fusion-export-lineage@1", authority=ref(origin, reg),
          archive=archive, step=step, **identity, inspectedAt="synthetic observation", dirty=False,
          exporterSha256=ref(scripts, "fusion_authority.py")["sha256"], externalReferences=[],
          policy="registered-offline-archive"))
    selection, manifest = base/"selected.json", base/"inventory.json"
    extra = [dict(path="inputs/part.f3d", role="child-native", basis="insertion source"),
             dict(path="trials/other.step", role="diagnostic-step", basis="rejected configuration")]
    write(selection, extra)
    pin = run("record", origin, lineage, selection, manifest)["manifestSha256"]
    saved = manifest.read_bytes()
    rows = json.loads(saved)["files"]
    assert len(rows) == 4 and next(x for x in rows if x["role"] == "child-native")["bytes"] == 5
    shutil.copytree(origin, receiver)
    (receiver/"unrelated.txt").write_text("ordinary project file")
    def check(ok=True):
        return run("check", receiver, manifest, pin, "--payload", payload, succeeds=ok)
    assert check()["exactPayload"] is True
    extraFile = payload/"unlisted.step"
    extraFile.write_bytes(b"unregistered")
    check(False)
    extraFile.unlink()
    (receiver/"inputs/part.f3d").write_bytes(b"other")
    assert "inputs/part.f3d" in check(False)
    (receiver/"inputs/part.f3d").unlink()
    check(False)
    shutil.copy2(origin/"inputs/part.f3d", receiver/"inputs/part.f3d")
    (receiver/"cad/export.step").write_bytes(b"diagnostic")
    check(False)
    shutil.copy2(origin/"cad/export.step", receiver/"cad/export.step")
    write(manifest, {**json.loads(saved), "revision": "other"})
    check(False)
    manifest.write_bytes(saved)
    for bad, message in [
        (extra + [extra[0]], "Duplicate path"),
        ([dict(path="../outside", role="private-input", basis="input")], "Unsafe relative path")
    ]:
        fresh = base/"rejected.json"
        write(selection, bad)
        assert message in run("record", origin, lineage, selection, fresh, succeeds=False)
        assert not fresh.exists()
    write(selection, extra[:1])
    assert "Existing record differs" in run("record", origin, lineage, selection, manifest, succeeds=False)
    assert manifest.read_bytes() == saved
    write(selection, extra)
    assert run("record", origin, lineage, selection, manifest)["manifestSha256"] == pin
    assert check()["verifiedFiles"] == 4
