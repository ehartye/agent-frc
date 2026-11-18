import unittest,pathlib,importlib.util,json,subprocess,sys,ast,tempfile
from unittest.mock import patch
P=pathlib.Path(__file__).with_name('run-passive-unload.py');s=importlib.util.spec_from_file_location('mode',P);r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class Contract(unittest.TestCase):
 def test_exact_separate_hypothesis(self):r.validate(json.loads(json.dumps(r.EXPECTED)))
 def test_promotions_and_baseline_changes_reject(self):
  for edit in (lambda e:e.update(capture=True),lambda e:e.update(engineeringAcceptance='passed'),lambda e:e.update(commandDelayTicks=[False,1]),lambda e:e.update(modeInterface='real-vendor-firmware'),lambda e:e['baselineCanonicalLfSourcePins'].update({'bogus':'0'*64})):
   e=json.loads(json.dumps(r.EXPECTED));edit(e)
   with self.assertRaises(ValueError):r.validate(e)
 def test_optimized_gates(self):
  self.assertFalse(any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(P.read_text()))));code="import importlib.util;s=importlib.util.spec_from_file_location('r',"+repr(str(P))+");r=importlib.util.module_from_spec(s);s.loader.exec_module(r);r.validate({})";self.assertNotEqual(subprocess.run([sys.executable,'-O','-c',code],capture_output=True).returncode,0)
 def test_pre_execution_failure_keeps_flags_false(self):
  original=r.sha
  with tempfile.TemporaryDirectory() as td:
   out=pathlib.Path(td)/'failed'
   with patch.object(sys,'argv',['runner','--output',str(out),'--java-home','unused','--gradle-home','unused']),patch.object(r,'sha',side_effect=lambda p:'0'*64 if pathlib.Path(p).name=='java.exe' else original(p)),patch.object(r,'validate',side_effect=ValueError('injected')),patch.object(r.subprocess,'run') as invoke:
    with self.assertRaisesRegex(ValueError,'injected'):r.main()
    invoke.assert_not_called()
   evidence=json.loads((out/'execution-receipt.json').read_text());self.assertEqual(evidence['status'],'failed');self.assertFalse(evidence['baselineIoExecuted']);self.assertFalse(evidence['newExperimentIoExecuted']);self.assertFalse(evidence['vendorNeutralModeExecuted'])

 def test_changed_live_nested_context_rejects(self):
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td);source=root/'nested-model.mjs';source.write_text('original');h=r.sha(source);out=root/'run'
   for variant in ('compressed','nominal'):
    dest=out/'baseline'/variant;dest.mkdir(parents=True);(dest/'receipt.json').write_text(json.dumps({'contextFileHashes':{'nested-model.mjs':h}}))
   with patch.object(r,'ROOT',root):
    r.verify_baseline_sources(out,{'sourcePins':{}});source.write_text('changed-after-baseline')
    with self.assertRaisesRegex(ValueError,'native context'):r.verify_baseline_sources(out,{'sourcePins':{}})
