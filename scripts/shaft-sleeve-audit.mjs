import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const shaftEvidence = Object.freeze({
  sku: 'REV-21-2813', role: 'research-candidate-not-selected-or-owned',
  profile: 'rounded-hex', acrossFlatsMm: 12.7, cornerCircleMm: 13.75,
  lengthMm: 76.2, thread: '#10-32', threadDepthMm: 12.7,
  source: 'https://www.revrobotics.com/.5in-Rounded-Hex-Shafts/',
  locator: 'REV-21-2813 product option; Specifications; rounded-corner Features',
  kitSource: 'https://www.revrobotics.com/maxplanetary-system-kit/',
  kitLocator: 'REV-25-2109 base-kit contents, shaft REV-21-2813 and socket REV-21-2104',
  reviewed: '2026-11-16', revision: 'rolling-page-no-manufacturer-revision-supplied',
  verification: 'manufacturer-web-text-review-only',
  bodySha256: null, nativeCadInspected: false, tolerancesMm: null,
  historicSeasonAvailability: null
});
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const keys = (x, expected) => {
  if (!x || typeof x !== 'object' || Array.isArray(x) ||
      Object.keys(x).length !== expected.length ||
      !expected.every(k => Object.hasOwn(x,k))) throw Error('Exact nominal interface schema required');
};
// Deliberately a negative/unknown screen, never a physical fit or torque-capacity approval.
export function screenRoundedHexInRoundBore(input) {
  keys(input,['acrossFlatsMm','cornerCircleMm','boreDiameterMm']);
  const {acrossFlatsMm:a,cornerCircleMm:c,boreDiameterMm:d}=input;
  if (![a,c,d].every(positive) || c<a || c>a/Math.cos(Math.PI/6))
    throw Error('Finite positive rounded-hex dimensions required; not a sharp-hex substitution');
  return {
    nominalDiametralClearanceMm: d-c,
    geometryStatus: d<c ? 'nominal-interference' : 'nominal-envelope-only-fit-unverified',
    torqueTransfer: 'unverified-round-bore-has-no-defined-positive-drive-feature',
    radialSupport: 'unverified', axialRetention: 'unverified',
    toleranceStack: 'missing', engineeringAcceptance: 'blocked'
  };
}
const fixturePaths = [
  'case-studies/2024/note-fixture-nominal.json',
  'case-studies/2025/coral-fixture-nominal.json',
  'case-studies/2026/intake-fixture-nominal.json'
];
export function auditPrototypeInterfaces(root) {
  return {schema:'frc-shaft-sleeve-audit/v1', shaftEvidence, cases:fixturePaths.map(path=>{
    const bytes=readFileSync(resolve(root,path));
    const fixture=JSON.parse(bytes.toString('utf8'));
    if (fixture.frame?.unit!=='mm' || !positive(fixture.roller?.boreRadiusMm) ||
        !positive(fixture.roller?.lengthMm)) throw Error('Expected explicit millimetre sleeve fixture');
    const screen=screenRoundedHexInRoundBore({
      acrossFlatsMm:shaftEvidence.acrossFlatsMm,
      cornerCircleMm:shaftEvidence.cornerCircleMm,
      boreDiameterMm:2*fixture.roller.boreRadiusMm
    });
    return {season:Number(path.split('/')[1]), fixture:path,
      fixtureSha256:createHash('sha256').update(bytes).digest('hex'),
      pinBasis:'exact-working-tree-bytes-not-normalized',
      sleeveLengthMm:fixture.roller.lengthMm, ...screen,
      fullSpanShaftStatus:shaftEvidence.lengthMm<fixture.roller.lengthMm?
        'shaft-shorter-than-sleeve-even-before-engagement-and-retention':
        'unverified-support-layout-and-engagement',
      simulationInputsChanged:false, nativeCadExecuted:false
    };
  }), resolution:{
    status:'new-candidate-required-not-an-installed-fix',
    alternatives:[
      {id:'profiled-drive-hub',proposal:'Keep a separately supported shaft and design a positively driven hub with explicit sleeve attachment.',
       gaps:['exact hub SKU or original design','profile and tolerance stack','torque and jam load','hub-to-sleeve attachment','bearings and axial retention']},
      {id:'new-profiled-sleeve',proposal:'Create a separate sleeve candidate with a defined driven profile; do not overwrite the circular-bore baseline.',
       gaps:['manufacturing process and tolerances','shaft length and engagement','material and load capacity','new CAD and inertia evidence','support and retention']}
    ],
    rejectedShortcut:'Increasing only the round bore can remove nominal interference but does not define torque transmission.',
    requiredRevalidation:['native geometry/export/reopen','mass and inertia','mechanical interfaces','control and contact replay','all five engineering acceptance domains'],
    engineeringAcceptance:'blocked'
  }};
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if (process.argv.length!==2) throw Error('This read-only audit accepts no arguments');
  console.log(JSON.stringify(auditPrototypeInterfaces(fileURLToPath(new URL('../',import.meta.url))),null,2));
}
