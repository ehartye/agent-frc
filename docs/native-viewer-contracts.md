# Native export, articulation and viewer control evidence

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

Each joint has `id`, `parentBodyId`, `childBodyId`, `kind` (`revolute` or `prismatic`), `frameId`, coordinate `unit` (`rad` or `m`), unit-vector `axis`, XYZ `origin` in m, `sign` (+1 or -1), explicit `offset`, ordered `nativeLimits` and ordered `physicalLimits`. Mapping is `physical = sign * native + offset`; zero is never assumed. The manifest supplies nonnegative `tolerances: {axis, origin, coordinate}`. Axis component tolerance is dimensionless, origin tolerance is m, and coordinate tolerance uses the joint's unit. The mapped endpoint limits must agree even for negative sign.

Each witness names `jointId`, `poseId`, `frameId`, `native` and `physical` coordinates plus `reopen: {saved: true, reopened: true, archiveSha256}`. Every joint needs a witness. Archive identity must bind the same saved/reopened source, not an older model with plausible numbers. These markers are supplied observations: the comparator neither performs nor verifies the actual reopen. Matching axes, origins and readbacks do not establish actuator dynamics, load capacity or retention. Appearance colors and material names are not mass/inertia provenance.

## Control routing and display restoration

```sh
npm run viewer:controls -- test/fixtures/native-viewer/controls-expected.json test/fixtures/native-viewer/controls-observed.json
```

Expected result: `agent-frc/viewer-controls-result@1`, `matched`, synthetic basis, exit 0. The complete [manifest](../test/fixtures/native-viewer/controls-expected.json) and [receipt](../test/fixtures/native-viewer/controls-observed.json) cover a colliding drive/display key, repeat, keyup after a modifier change, an unrelated engine camera binding, focus loss and a late keyup.

Use `agent-frc/viewer-controls-manifest@1` and `agent-frc/viewer-controls-receipt@1`. The manifest owns:

- `sourcePins`, `allowedEvidenceBases`, `applicationBindings: [{code, modifiers, action}]` and `engineBindings: [{code, modifiers, optionIds}]`. Keys use exact DOM `code` names, with unique explicit `Alt`, `Control`, `Meta`, `Shift` modifiers; duplicate chords within either binding list are invalid. Common keyboard, navigation, function and numpad codes are supported; unsupported codes fail explicitly.
- `restoreValues`: finite scalar values for exactly the options belonging to colliding application/engine chords. It must not include unrelated engine/camera settings. `releaseOnFocusLoss` enumerates all application actions exactly once.
- Ordered `cases`, each with a unique `id`, `initialHeld: [{code, action}]` and named events. An event is `{id, type: "keydown"|"keyup", code, modifiers}` or `{id, type: "focus-loss"}`. Case order does not matter; event order does.

The receipt owns `sourcePins`, `evidenceBasis` and corresponding cases/events. Each transition reports `id`, `event` (without the ID), `priorHeld`, **observed** `postEngine` display state, `finalHeld` and `finalDisplay`. Display values are finite numbers, strings or booleans. Include all restored options and every unrelated option whose preservation is being checked. Missing post-engine state is invalid; omitted unlisted camera properties are outside the evidence scope.

The comparator checks the independent event sequence and prior-held continuity, then applies this policy:

1. Consume the captured state after engine handling; never predict engine side effects.
2. On keydown, activate a matching application chord if its physical code is not already held. Repeated keydown is idempotent. On keyup, release by physical code, even if modifiers have changed. Focus loss clears all held actions; a later keyup is inert.
3. For keydown or keyup whose **current chord** collides, restore only that chord's named options. Preserve every other post-engine observed value, including engine camera changes. Focus loss does not restore display options.
4. Compare the claimed final held/display state with that computed outcome. Do not use the claimed final state as the next transition's oracle.

Controls permits `synthetic`, `interactive-observed` and `human-reported` bases. It has no native-observed mode. The host must normalize input to the supported physical codes/modifiers, capture the correct engine → observation → application → restoration order, deliver focus-loss events, apply the calculated policy and retain source-bound real interactive evidence. This package does not attach callbacks, prevent engine shortcuts or demonstrate correct host integration. Human-reported and real interactive observations remain distinct from synthetic transitions.

## API and verification

Pure exports are `compareNativeExport(expected, observed)`, `compareNativeArticulation(expected, observed)` and `compareViewerControls(expected, observed)` from their corresponding scripts. They do not mutate the supplied objects. The small shared CLI performs bounded JSON reading and maps the result status to the exit code.

Run `npm test` and `npm run validate`. Focused suites are `test/native-export.test.mjs`, `test/native-articulation.test.mjs` and `test/viewer-controls.test.mjs`. They cover positive independent synthetic inputs, source/basis mismatches, missing inventories/witnesses, malformed values, policy violations and CLI failures. No native asset, CAD, physics or GUI runtime is required. The existing `agent-frc/native-witness@1` material-overlap and design-artifact schemas are unchanged.
