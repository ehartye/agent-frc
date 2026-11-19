// Synthetic fixture: a tabletop carrier presents two marked blocks to a reader.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function makeDemo(directory) {
  fs.mkdirSync(directory);
  const write = (file, value) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    fs.writeFileSync(path.join(directory, file), bytes);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const revisions = Object.fromEntries(
    ['controller', 'scorer', 'geometry', 'observationPolicy'].map((role) => [
      role,
      write(role + '.json', { role, revision: 'synthetic demo A' }),
    ]),
  );
  const pins = Object.fromEntries(Object.entries(revisions).map(([k, v]) => [k, v.sha256]));
  const attempts = Array.from({ length: 20 }, (_, i) => {
    const id = 'trial-' + (i + 1),
      values = { offset: i - 9.5 };
    return { id, values, initial: write(id + '-start.json', { offsetMm: values.offset, carriageMm: 0 }) };
  });
  const manifest = {
    schema: 'agent-frc/mission-cohort@1',
    id: 'tabletop-reader',
    basis: 'modeled',
    revisions,
    inputs: [
      {
        id: 'offset',
        unit: 'mm',
        min: -10,
        max: 10,
        provenance: 'Invented evenly spaced sensitivity inputs',
        access: {
          simulator: { when: 'initial', basis: 'Fixture offset' },
          controller: { when: 'observed', basis: 'First reader edge' },
          scorer: { when: 'initial', basis: 'Independent fixture frame' },
        },
      },
    ],
    stages: ['present'],
    itemChecks: ['edge'],
    missionChecks: ['stopped'],
    requiredItems: 2,
    deadlineS: 4,
    requiredPasses: 19,
    tuningIds: ['setup'],
    attempts,
  };
  const frozen = write('manifest.json', manifest);
  const entries = attempts.map((attempt, i) => {
    const runId = 'execution-' + (i + 1);
    const source = write(attempt.id + '-readings.json', {
      offsetMm: attempt.values.offset,
      readEdgesS: i === 19 ? [1] : [1, 3],
      stoppedS: 4,
    });
    const decision =
      i === 19
        ? { verdict: 'mission-failure', firstFailedCheck: 'second edge absent', failureTimeS: 4 }
        : {
            verdict: 'pass',
            completionS: 4,
            checks: { stopped: true },
            items: ['a', 'b'].map((id, j) => ({ id, timeS: 1 + j * 2, checks: { edge: true } })),
          };
    const outputState = write(attempt.id + '-end.json', { offsetMm: attempt.values.offset, stopped: true });
    const stage = write(attempt.id + '-stage.json', {
      schema: 'agent-frc/mission-stage@1',
      attemptId: attempt.id,
      runId,
      stage: 'present',
      parentSha256: attempt.initial.sha256,
      inputStateSha256: attempt.initial.sha256,
      outputState,
      timeS: 4,
      source,
      decision,
    });
    const receipt = write(attempt.id + '-receipt.json', {
      schema: 'agent-frc/mission-attempt@1',
      attemptId: attempt.id,
      runId,
      manifestSha256: frozen.sha256,
      revisions: pins,
      initialSha256: attempt.initial.sha256,
      values: attempt.values,
      controllerInitialInputs: {},
      status: 'finished',
      chain: [stage],
    });
    return { attemptId: attempt.id, receipt };
  });
  write('journal.json', { schema: 'agent-frc/mission-journal@1', manifestSha256: frozen.sha256, entries });
  return frozen.sha256;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Give a new output directory');
  console.log(makeDemo(process.argv[2]));
}
