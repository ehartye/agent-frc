import { readFile } from 'node:fs/promises';

const rad = degrees => degrees * Math.PI / 180;
const pair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const positive = value => Number.isFinite(value) && value > 0;

function checkReplay(replay) {
  const { modules, wheelDiameterM, motorTurnsPerPulleyTurn, pulleyTurnsPerWheelTurn, velocityToleranceMps } = replay;
  if (replay.schema !== 'swerve-encoder-replay/v1' ||
      ![wheelDiameterM, motorTurnsPerPulleyTurn, pulleyTurnsPerWheelTurn, velocityToleranceMps].every(positive) ||
      !Array.isArray(modules) || modules.length !== 4 || !Array.isArray(replay.cases) || !replay.cases.length) {
    throw new Error('Expected four modules, positive conversion factors and tolerance, and at least one motion case.');
  }
  const ids = new Set();
  for (const module of modules) {
    if (!module || typeof module.id !== 'string' || !module.id || ids.has(module.id) ||
        ![module.xM, module.yM, module.encoderAtForwardDeg].every(Number.isFinite) ||
        ![-1, 1].includes(module.driveSign)) throw new Error('Invalid or duplicate module mapping.');
    ids.add(module.id);
  }
  const reduction = motorTurnsPerPulleyTurn * pulleyTurnsPerWheelTurn;
  const mpsPerRpm = Math.PI * wheelDiameterM / (60 * reduction);
  let passed = true;
  for (const sampleCase of replay.cases) {
    const { fieldVelocityMps, gyroDeg, yawRateRadPerSec, pivotM, samples } = sampleCase;
    if (!pair(fieldVelocityMps) || !pair(pivotM) || ![gyroDeg, yawRateRadPerSec].every(Number.isFinite) ||
        !Array.isArray(samples) || samples.length !== modules.length) throw new Error('Invalid motion case.');
    const heading = rad(gyroDeg);
    const [fx, fy] = fieldVelocityMps;
    const vx = fx * Math.cos(heading) + fy * Math.sin(heading);
    const vy = -fx * Math.sin(heading) + fy * Math.cos(heading);
    const errors = modules.map((module, index) => {
      const sample = samples[index];
      if (!Array.isArray(sample) || sample.length !== 3 || sample[0] !== module.id ||
          !sample.slice(1).every(Number.isFinite)) {
        throw new Error(sampleCase.name + ' expects [module ID, absolute degrees, drive RPM] for ' + module.id);
      }
      const angle = rad(sample[1] - module.encoderAtForwardDeg);
      const speed = sample[2] * module.driveSign * mpsPerRpm;
      const expectedX = vx - yawRateRadPerSec * (module.yM - pivotM[1]);
      const expectedY = vy + yawRateRadPerSec * (module.xM - pivotM[0]);
      const residual = Math.hypot(speed * Math.cos(angle) - expectedX, speed * Math.sin(angle) - expectedY);
      if (!Number.isFinite(residual) || residual > velocityToleranceMps) {
        console.error(sampleCase.name + ': ' + module.id + ' vector error ' + residual + ' m/s');
        passed = false;
      }
      return residual;
    });
    console.log(sampleCase.name + ': max vector error ' + Math.max(...errors).toExponential(3) + ' m/s');
  }
  return passed;
}

try {
  if (process.argv.length > 3) throw new Error('Usage: node check-encoders.mjs [record.json]');
  const input = process.argv[2] ?? new URL('encoder-replay.json', import.meta.url);
  const replay = JSON.parse(await readFile(input, 'utf8'));
  if (!checkReplay(replay)) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
