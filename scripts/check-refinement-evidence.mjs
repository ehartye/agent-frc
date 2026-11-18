import { createHash } from 'node:crypto';
import { readViewerBytes } from './native-viewer-cli.mjs';
import { assessRefinementEvidence } from './refinement-evidence.mjs';

const usage = 'check-refinement-evidence.mjs manifest.json receipt.json request.json evidence.json --request-sha256 HEX';
try {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[4] !== '--request-sha256' || !/^[a-f0-9]{64}$/i.test(args[5])) {
    throw Error('Expected independently retained request digest. Usage: ' + usage);
  }
  const documents = {};
  const digests = {};
  for (const [index, name] of ['manifest', 'receipt', 'request', 'evidence'].entries()) {
    try {
      const bytes = readViewerBytes(args[index]);
      documents[name] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      digests[name] = createHash('sha256').update(bytes).digest('hex');
    } catch (error) {
      throw Error(name + ': ' + error.message);
    }
  }
  const result = assessRefinementEvidence(documents, digests, args[5].toLowerCase());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
} catch (error) {
  console.log(JSON.stringify({ schema: 'agent-frc/refinement-result@1', exitCode: 2,
    engineeringAcceptance: 'blocked', issues: [error.message] }));
  process.exitCode = 2;
}
