"""An original two-request job with a delayed module import and a non-code dependency."""
import stat
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import native_job as job


class Job(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.package, self.project, self.station, self.archive = [base / n for n in ("cache", "project", "station", "retired")]
        for path in [self.package, self.project, self.station, self.archive]:
            path.mkdir()
        def write(path, data):
            path.parent.mkdir(exist_ok=True, parents=True)
            path.write_text(data, encoding="utf8")
            return {"path": path.relative_to(self.package).as_posix(), "sha256": job.sha(path)}
        self.member = "scripts/late_trial_part.py"
        pins = [
            write(self.package / self.member, "from pathlib import Path\ndef cold():\n    return (Path(__file__).resolve().parents[1]/'templates'/'result.txt').read_text()\n"),
            write(self.package / "templates/result.txt", "pinned resource"),
            write(self.package / "plugin.json", "{}"),
        ]
        commit = "a"*40
        marker = self.package/job.MARKER
        marker.write_text(json.dumps({"schema":"agent-frc/local-stage@1","sourceHead":commit,"files":pins}))
        recipe = self.project/"trial.py"
        recipe.write_text("def run(context):\n    if context=='create': return CONFIG['plugin']\n    import late_trial_part\n    return late_trial_part.cold()\n")
        self.reg = base/"registration.json"
        self.reg.write_text(json.dumps({"schema":"agent-frc/native-job@1","jobId":"trial","pluginInventorySha256":job.sha(marker),
                  "pluginCommit":commit,"recipe":"inputs/trial.py","inputs":[{"path":"trial.py","sha256":job.sha(recipe)}]}))
        self.digest = job.sha(self.reg)
        self.bundle = self.station/"trial"
        self.release = self.project/"release.json"

    def stage(self):
        return job.stage(self.package, self.project, self.reg, self.digest, self.station)

    def finish(self, restore=True):
        native, step, readback = [self.project/n for n in ("part.f3d","part.step","reopen.json")]
        native.write_text("synthetic native"); step.write_text("synthetic STEP")
        readback.write_text(json.dumps({"archiveSha256":job.sha(native),"stepSha256":job.sha(step),"restored":True}))
        docs = {"active":"existing","documents":["existing"]}
        release = {"schema":"agent-frc/native-job-release@1","jobId":"trial","registrationSha256":self.digest,
                   "nativeReleased":True,"outcome":"completed","before":docs,"after":docs if restore else {},
                   "evidence":{k:{"path":p.name,"sha256":job.sha(p)} for k,p in (("native",native),("step",step),("readback",readback))}}
        self.release.write_text(json.dumps(release))
        return job.sha(self.release)

    def test_late_import_uses_same_bytes_after_original_cache_and_recipe_disappear(self):
        self.stage()
        self.assertEqual(self.stage()["registrationSha256"], self.digest)
        script = job.fusion_script(self.bundle,self.digest,{"jobId":"trial","plugin":str(self.package/"scripts")})
        namespace={}; exec(script,namespace)
        self.assertEqual(Path(namespace["run"]("create")),self.bundle/"plugin/scripts")
        shutil.rmtree(self.package);(self.project/"trial.py").unlink()
        namespace={};exec(script,namespace)
        self.assertEqual(namespace["run"]("readback"),"pinned resource")
        self.assertNotIn("late_trial_part",sys.modules)
        self.assertFalse(list(self.bundle.rglob("__pycache__")))
        with self.assertRaisesRegex(ValueError,"restored"):
            job.retire(self.bundle,self.digest,self.release,self.finish(False),self.archive)
        digest=self.finish()
        with job.using_job(self.bundle,self.digest):
            with self.assertRaisesRegex(ValueError,"active"):
                job.retire(self.bundle,self.digest,self.release,digest,self.archive)
        (self.project/"part.step").write_text("changed output")
        with self.assertRaisesRegex(ValueError,"terminal evidence"):
            job.retire(self.bundle,self.digest,self.release,digest,self.archive)
        self.assertTrue(self.bundle.exists())
        archived=job.retire(self.bundle,self.digest,self.release,self.finish(),self.archive)
        self.assertFalse(self.bundle.exists())
        self.assertEqual(job.verify(archived,self.digest)["jobId"],"trial")

    def test_interrupted_publication_can_retry_without_exposing_a_partial_job(self):
        original = Path.rename
        def interrupted(source, target):
            if target == self.bundle:
                raise OSError("Interrupted before publishing")
            return original(source, target)
        with patch.object(Path, "rename", interrupted):
            with self.assertRaisesRegex(OSError, "Interrupted"):
                self.stage()
        self.assertFalse(self.bundle.exists())
        with job.lease(self.bundle, publication=True):
            with self.assertRaisesRegex(ValueError, "active"):
                self.stage()
        first = self.stage()
        preserved = job.sha(self.bundle/"job.json")
        self.assertEqual(first, self.stage())
        plan = json.loads(self.reg.read_bytes())
        plan["inputs"] = []
        self.reg.write_text(json.dumps(plan))
        with self.assertRaisesRegex(ValueError,"Changed input"):
            job.stage(self.package,self.project,self.reg,job.sha(self.reg),self.station)
        self.assertEqual(job.sha(self.bundle/"job.json"),preserved)

    def test_changed_private_or_original_dependencies_stop_before_execution(self):
        self.stage()
        path=self.bundle/"plugin"/self.member;original=path.read_bytes(); path.chmod(stat.S_IREAD | stat.S_IWRITE)
        path.write_text("raise RuntimeError('changed module must never run')")
        with self.assertRaisesRegex(ValueError,"changed job dependency"):
            job.fusion_script(self.bundle,self.digest,{"jobId":"trial"})
        path.write_bytes(original)
        (self.bundle/"plugin/scripts/shadow.py").write_text("")
        with self.assertRaisesRegex(ValueError,"Unexpected"):
            job.verify(self.bundle,self.digest)
        (self.package/"templates/result.txt").write_text("replacement cache")
        another=self.station/"another";another.mkdir()
        with self.assertRaisesRegex(ValueError,"changed job dependency"):
            job.stage(self.package,self.project,self.reg,self.digest,another)
        self.assertFalse((another/"trial").exists())


if __name__ == "__main__":
    unittest.main()
