/**
 * @lane merge
 * @subject examples/swerve/author_module.py
 * @subject examples/swerve/check-encoders.mjs
 * @subject examples/swerve/check_four_corners.py
 * @subject examples/swerve/check_fusion.py
 * @subject examples/swerve/loaded_motion.py
 * @subject examples/swerve/shaft_power.py
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const cwd = fileURLToPath(new URL('../examples/swerve/', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';

test('signed shaft work and each terminal expose failures hidden by aggregate power', () => {
  const data = JSON.parse(execFileSync(python, ['shaft_power.py'], {cwd}));
  assert.equal(data.signedTrials.length, 6);
  for (const trial of data.signedTrials) assert.ok(Math.abs(trial.residualW) < 1e-10);
  assert.ok(Math.abs(data.reversedTorqueMap.residualW + 4.8) < 1e-10);
  assert.equal(data.reversedBothMaps.residualW, 0);
  assert.equal(data.reversedBothMaps.shaftRadS[0], -3);
  assert.equal(data.shortedBraking.terminalW, 0);
  assert.equal(data.shortedBraking.copperW, -data.shortedBraking.shaftW);
  assert.equal(data.returningAtLeads.terminalW, -5);
  assert.deepEqual(data.hiddenSurplus.map(p => p.otherLossW), [-3, 4]);
});

test('matched attained chassis motion distinguishes a retained free piece from a dropped one', () => {
  const script = `
import json
from loaded_motion import simulate, review
results = []
for step in (.002, .001):
    strong, weak = (simulate((n,n), step) for n in (12.,3.))
    independent = ("pieceXM", "pieceYM", "pieceZM", "seatDistanceM", "relativeSpeedMS")
    for a, b in zip(strong, weak, strict=True):
        for k in a:
            if k.startswith(("request", "wheel", "chassis")) or k in ("timeS", "liftM", "yawRad"):
                assert a[k] == b[k]
    assert any(all(a[k] != b[k] for k in independent) for a,b in zip(strong,weak))
    missing = [dict(r, rightN=0) for r in strong]
    results.append([review(strong), review(weak), review(missing)])
print(json.dumps(results))
`;
  for (const [firm, weak, missing] of JSON.parse(execFileSync(python, ['-c', script], {cwd}))) {
    assert.equal(firm.firstDwellS, weak.firstDwellS);
    assert.equal(firm.attainedOverlapS, weak.attainedOverlapS);
    assert.ok(firm.loadedOverlapS > 1 && firm.loadedOverlapS < firm.attainedOverlapS);
    assert.equal(firm.firstClearOfPadsS, null);
    assert.ok(firm.finalHeld && firm.finalPieceHeightM > .22);
    assert.ok(weak.firstClearOfPadsS > weak.firstDwellS && weak.firstClearOfPadsS < 1.45);
    assert.equal(weak.finalHeld, false);
    assert.equal(weak.finalPieceHeightM, 0);
    assert.equal(weak.loadedOverlapS, 0);
    assert.equal(missing.firstDwellS, null);
    assert.equal(missing.loadedOverlapS, 0);
  }
});
