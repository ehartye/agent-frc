# Native export and articulation evidence

These portable comparators read an independently prepared manifest and an observed receipt. They compare the supplied evidence; they do not open CAD, parse meshes, calculate physics, authenticate measurements or connect to a viewer. A matching synthetic fixture remains synthetic evidence.

Each command takes **expected first, observed second**, unlike the older material-overlap `native:witness` command. Inputs are regular UTF-8 JSON files, each at most 5,000,000 bytes. Referenced artifact paths and URLs are never opened. No native application or Python package is required.

| Result | Exit | Meaning |
|---|---|---|
| `matched` | 0 | Supplied, complete supported evidence agrees within the manifest's policy. |
| `mismatch` | 1 | Well-formed evidence contradicts an expectation. |
| `invalid` | 2 | Missing, incomplete, malformed or unsupported evidence cannot be assessed. |

Output is `{schema, status, issues, scope}`. Each issue has a stable `code`, a JSON-pointer `path` and a readable `reason`; issues are sorted deterministically. `invalid` takes precedence when a result also has mismatches. `scope.evidenceBasis` always retains the receipt's declared basis. This declaration is not authentication, and the comparator cannot prove that expectations were independently prepared.

All contracts require `sourcePins.archiveSha256` and `sourcePins.producerSha256`; additional named pins must be present on both sides. Pin values are exact lowercase SHA-256 strings. Missing pins are invalid; differing identities mismatch. Expected pins and expected artifact hashes must come from a separately reviewed source, never from copying the receipt under test. Synthetic fixtures below use explicit placeholder hashes and are not native asset evidence.

## Export inventory and finite witnesses

```sh
npm run native:export -- test/fixtures/native-viewer/export-expected.json test/fixtures/native-viewer/export-observed.json
```

Expected output has schema `agent-frc/native-export-result@1`, `status: "matched"`, no issues and `scope.evidenceBasis: "synthetic"`; exit 0. See the complete [manifest](../test/fixtures/native-viewer/export-expected.json) and independently authored [receipt](../test/fixtures/native-viewer/export-observed.json). They deliberately use different inventory ordering and equivalent opposite-sign quaternions.

The manifest schema is `agent-frc/native-export-manifest@1`; the receipt schema is `agent-frc/native-export-receipt@1`. Both declare:

- `units: {length: "m", angle: "rad"}`, named `frames`, `nativeBodies` and `motionGroups`.
- `meshes`: unique `id`, `bodyIds`, `groupId` and `sha256`. Multiple mesh IDs may share a group. Each native body belongs to exactly one mesh or exclusion; splitting one body across appearance meshes is unsupported in v1.
- `exclusions`: explicit `{bodyId, reason}` entries, or an empty array. Bodies cannot be both rendered and excluded; a lower rendered count alone is not an explanation.
- `witnesses`: unique `(meshId, poseId)`, `frameId`, XYZ `translation`, `[x,y,z,w]` unit quaternion `rotation`, and XYZ AABB `bounds: {min, max}`. Every exported mesh requires a witness. The manifest alone supplies finite nonnegative `tolerances: {position, angular, bounds}` in m/rad/m.

The manifest declares `allowedEvidenceBases`; the receipt declares `evidenceBasis`. Export permits `synthetic`, `native-observed` and `human-reported`. A declared but disallowed basis mismatches. Quaternion norm tolerance is 1e-9; `q` and `-q` represent the same orientation. No coordinate transform or unit conversion is inferred. A finite pose/bounds match does not prove complete geometry, continuous clearance, mass, correct rendering or a working GUI.

## Archive-bound articulation

```sh
npm run native:articulation -- test/fixtures/native-viewer/articulation-expected.json test/fixtures/native-viewer/articulation-observed.json
```

Expected result: `agent-frc/native-articulation-result@1`, `matched`, synthetic basis, exit 0. The complete [manifest](../test/fixtures/native-viewer/articulation-expected.json) and [receipt](../test/fixtures/native-viewer/articulation-observed.json) include a negative-sign revolute mapping with nonzero offset and a prismatic mapping.

Use `agent-frc/native-articulation-manifest@1` and `agent-frc/native-articulation-receipt@1`. Both declare source pins, SI `units`, `nativeBodies`, `frames`, `joints` and `witnesses`. Bases follow the export contract.

Each joint has `id`, `parentBodyId`, `childBodyId`, `kind` (`revolute` or `prismatic`), `frameId`, coordinate `unit` (`rad` or `m`), unit-vector `axis`, XYZ `origin` in m, `sign` (+1 or -1), explicit `offset`, ordered `nativeLimits` and ordered `physicalLimits`. Mapping is `physical = sign * native + offset`; zero is never assumed. The manifest supplies nonnegative `tolerances: {axis, origin, coordinate}`. Axis tolerance bounds the angular separation of the normalized axis directions in **radians**, not individual vector-component differences. Origin tolerance is m, and coordinate tolerance uses the joint's unit. The mapped endpoint limits must agree even for negative sign.

Each witness names `jointId`, `poseId`, `frameId`, `native` and `physical` coordinates plus `reopen: {saved: true, reopened: true, archiveSha256}`. Every joint needs a witness. Archive identity must bind the same saved/reopened source, not an older model with plausible numbers. These markers are supplied observations: the comparator neither performs nor verifies the actual reopen. Matching axes, origins and readbacks do not establish actuator dynamics, load capacity or retention. Appearance colors and material names are not mass/inertia provenance.

## API and verification

Pure exports are `compareNativeExport(expected, observed)` and `compareNativeArticulation(expected, observed)` from their corresponding scripts. They do not mutate the supplied objects. The small shared CLI performs bounded JSON reading and maps the result status to the exit code.

Run `npm test` and `npm run validate`. Focused suites are `test/native-export.test.mjs` and `test/native-articulation.test.mjs`. They cover positive independent synthetic inputs, source/basis mismatches, missing inventories/witnesses, malformed values, policy violations and CLI failures. No native asset, CAD, physics or GUI runtime is required. The existing `agent-frc/native-witness@1` material-overlap and design-artifact schemas are unchanged.
