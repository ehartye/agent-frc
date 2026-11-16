"""Scalar wheel-bank exploration, not native assembly or fit acceptance."""
import json
import unittest

def screen(spacer_mm, count=6):
    if spacer_mm < 0 or count < 2 or not isinstance(count, int):
        raise ValueError('nonnegative spacer and integer count >=2 required')
    boss_span = 28.575
    head_envelope = 2 * (13.49375 + 2.6)
    pitch = boss_span + spacer_mm
    return dict(spacerMm=spacer_mm, pitchMm=pitch,
                headEnvelopeMm=head_envelope,
                headEnvelopeSeparationMm=pitch-head_envelope,
                bankBossSpanMm=(count-1)*pitch+boss_span,
                bankHeadSpanMm=(count-1)*pitch+head_envelope,
                nativeAssemblyChecked=False, engineeringAcceptance='blocked')

class ScreenTests(unittest.TestCase):
    def test_eighth_fails_envelope(self):
        self.assertAlmostEqual(screen(3.175)['headEnvelopeSeparationMm'], -.4375)
    def test_quarter(self):
        q=screen(6.35)
        self.assertAlmostEqual(q['pitchMm'],34.925)
        self.assertAlmostEqual(q['headEnvelopeSeparationMm'],2.7375)
        self.assertAlmostEqual(q['bankBossSpanMm'],203.2)
        self.assertAlmostEqual(q['bankHeadSpanMm'],206.8125)
        self.assertEqual(q['engineeringAcceptance'],'blocked')
    def test_invalid(self):
        for spacer,n in [(-1,6),(1,1),(1,2.5)]:
            with self.assertRaises(ValueError):screen(spacer,n)

if __name__=='__main__':
    import sys
    if sys.argv[1:]==['--test']:unittest.main(argv=[sys.argv[0]])
    elif not sys.argv[1:]:print(json.dumps([screen(3.175),screen(6.35)],indent=2))
    else:raise ValueError('use no arguments or --test')
