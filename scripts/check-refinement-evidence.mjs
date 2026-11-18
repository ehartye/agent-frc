import { createHash } from 'node:crypto';
import { readViewerBytes } from './native-viewer-cli.mjs';
import { assessRefinementEvidence } from './refinement-evidence.mjs';

const usage = 'check-refinement-evidence.mjs manifest.json receipt.json request.json evidence.json --request-sha256 HEX';
const args = process.argv.slice(2);
const issues = [];
const pinValid = args.length === 6 && args[4] === '--request-sha256' && /^[a-f0-9]{64}$/i.test(args[5]);
if (!pinValid) issues.push('Expected independently retained request digest. Usage: ' + usage);
const documents = {};
const digests = {};
for (const [index, name] of ['manifest', 'receipt', 'request', 'evidence'].entries()) {
  try {
    if (!args[index]) throw Error('missing file argument');
    const bytes = readViewerBytes(args[index]);
    digests[name] = createHash('sha256').update(bytes).digest('hex');
    documents[name] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    issues.push(name + ': ' + error.message);
  }
}
const result = assessRefinementEvidence(documents, digests, pinValid ? args[5].toLowerCase() : null, issues);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.exitCode;
