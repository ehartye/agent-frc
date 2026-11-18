import unittest
from guarded_case import authorize, fingerprint

class Guards(unittest.TestCase):
    def setUp(self):
        self.c={'expectedDocumentId':'doc','jobId':'job','expectedRevision':2,'stage':'update','thicknessMm':7}
    def test_identity_and_revision(self):
        for identity,job,revision in [('other','job',2),('doc','other',2),('doc','job',1)]:
            with self.assertRaises(ValueError):authorize(self.c,identity,job,revision,None)
    def test_exact_completed_duplicate(self):
        receipt={'state':'complete','fingerprint':fingerprint(self.c),'revision':3}
        self.assertEqual(receipt,authorize(self.c,'doc','job',3,receipt))
    def test_changed_payload_cannot_reuse_request(self):
        receipt={'state':'complete','fingerprint':fingerprint(self.c)}
        with self.assertRaises(ValueError):authorize(dict(self.c,thicknessMm=8),'doc','job',3,receipt)
    def test_unknown_outcome_is_not_retried(self):
        receipt={'state':'in-flight','fingerprint':fingerprint(self.c)}
        with self.assertRaisesRegex(ValueError,'do not replay'):authorize(self.c,'doc','job',2,receipt)

if __name__=='__main__':unittest.main()
