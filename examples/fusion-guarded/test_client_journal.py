import contextlib, hashlib, io, json, pathlib, tempfile, unittest
from unittest.mock import patch
from guarded_client import main

class Journal(unittest.TestCase):
    def fixture(self,root):
        config={'jobId':'job','requestId':'read','stage':'inspect'}
        cfg=root/'request.json';cfg.write_text(json.dumps(config))
        journal=root/'journal';journal.mkdir()
        recipe=pathlib.Path(__file__).with_name('guarded_case.py').read_text()
        digest=hashlib.sha256((recipe+json.dumps(config,sort_keys=True)).encode()).hexdigest()
        intent=journal/'job--read.intent.json';intent.write_text(json.dumps({'digest':digest}))
        return cfg,journal,intent
    def test_pending_intent_blocks_network_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg,journal,_=self.fixture(pathlib.Path(tmp))
            with patch('urllib.request.urlopen',side_effect=AssertionError('Network must not run')):
                with self.assertRaisesRegex(RuntimeError,'Pending or unknown'):main(cfg,journal)
            self.assertFalse((journal/'writer.lock').exists())
    def test_changed_payload_under_same_id_blocks_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg,journal,_=self.fixture(pathlib.Path(tmp))
            value=json.loads(cfg.read_text());value['unexpected']='changed';cfg.write_text(json.dumps(value))
            with patch('urllib.request.urlopen',side_effect=AssertionError('Network must not run')):
                with self.assertRaisesRegex(ValueError,'changed recipe or payload'):main(cfg,journal)
    def test_complete_journal_returns_explicitly_cached_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg,journal,_=self.fixture(pathlib.Path(tmp))
            (journal/'job--read.result.json').write_text(json.dumps({'revision':4}))
            output=io.StringIO()
            with patch('urllib.request.urlopen',side_effect=AssertionError('Network must not run')),contextlib.redirect_stdout(output):main(cfg,journal)
            result=json.loads(output.getvalue());self.assertTrue(result['cachedReceipt']);self.assertFalse(result['freshInspection'])

if __name__=='__main__':unittest.main()
