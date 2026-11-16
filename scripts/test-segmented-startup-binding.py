import pathlib,importlib.util,unittest
s=importlib.util.spec_from_file_location('r',pathlib.Path(__file__).with_name('record-segmented-startup.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class BindingTests(unittest.TestCase):
 def setUp(self):
  self.xml='<testsuite tests="3" failures="0" errors="0" skipped="0">'+''.join('<testcase name="'+n+'" />' for n in r.EXPECTED)+'</testsuite>'
  self.runtime={'runId':'fresh','controllerSha256':'abc'}
 def check(self,**kw):
  args=dict(run_id='fresh',runtime=self.runtime,xml=self.xml,source_before={'source':'pin'},source_after={'source':'pin'},compiled={'controller':'abc'});args.update(kw)
  return r.validate_binding(**args)
 def test_valid(self):self.assertEqual(len(self.check()),3)
 def test_stale_xml_without_fresh_runtime_rejected(self):
  with self.assertRaises(ValueError):self.check(runtime={})
 def test_previous_run_token_rejected(self):
  with self.assertRaises(ValueError):self.check(run_id='next-run')
 def test_changed_sources_rejected(self):
  with self.assertRaises(ValueError):self.check(source_after={'source':'changed'})
 def test_changed_class_rejected(self):
  with self.assertRaises(ValueError):self.check(compiled={'controller':'changed'})
 def test_failed_or_incomplete_xml_rejected(self):
  for bad in [self.xml.replace('failures="0"','failures="1"'),self.xml.replace('tests="3"','tests="0"')]:
   with self.assertRaises(ValueError):self.check(xml=bad)
if __name__=='__main__':unittest.main()
