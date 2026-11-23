# Hand a student an editable whole robot

Start from the exact archive a student can download, committed in the project. A layout study can use identified proxies. For a showcase model, use the exact official purchased geometry. A proxy cannot qualify as a complete student assembly. [Mechanical readiness](mechanical-readiness.md) Save the assembly and reopen a copy of those saved bytes in Fusion.

## Record the native reopen

Include the project-relative archive path in `source`, its SHA-256 in `sha256`, and set `opened` to true only after the reopen succeeds. Traverse the reopened assembly in its selected configuration. Record **all body-bearing installed occurrences** in `components`, using unique paths for repeated parts. For each, record its own native body count in `bodies`. For an editable feature claim, count the actual extrusions (`extrusions`) or other native editable features (`editableFeatures`). Direct models may report `baseFeatures`; label them as base-feature BReps and distinguish their editability from editable parametric extrusions. An assembly can establish editable motion through a successfully driven native joint even when its purchased or imported parts have no such features. For named-body claims, include the complete `bodyNames` list for that occurrence.

For nested assemblies, record the exact immediate `parent` ID on each non-root occurrence. Include empty assembly occurrences with `bodies: 0` in the reopen receipt. A joint can attach to such a parent when the native hierarchy leads to an inventoried body-bearing descendant. Keep the parent as the actual joint endpoint and count each body's native owning occurrence once. List the body-bearing occurrences in the independent manifest, with an optional expected `parent` to check a particular attachment. Missing parents, cycles and endpoints with no physical descendants fail the check.

Record each claimed native joint by stable ID in `joints`, with its actual `type` and native `occurrenceOne` and `occurrenceTwo` IDs. A rigid joint needs its endpoints. For a slider or revolute, drive the reopened assembly to two distinct valid coordinates and record the observed coordinates and the relative occurrence transforms after recomputation. Restore the initial state in the inspection copy. Use millimeters for slider positions and degrees for revolute positions, and right-handed row-major 4×4 transforms with translations at indices 3, 7 and 11. Translations default to millimeters. For Fusion matrices recorded in centimeters set `transformTranslationUnit: "cm"` at the receipt root. Keep the source capture method, actual driven values and any failed movements in the project. Setting a joint limit, moving a detached body or reading an animation clock cannot establish motion.

For example, this joint connects named occurrences in the reopened receipt:

```json
"transfer": {
  "type": "slider",
  "occurrenceOne": "frame",
  "occurrenceTwo": "carriage",
  "samples": [
    {"position": 0, "relativeTransform": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]},
    {"position": 8, "relativeTransform": [1,0,0,8, 0,1,0,0, 0,0,1,0, 0,0,0,1]}
  ]
}
```

Two poses measure movement type and magnitude. To claim that positive command direction matches the source design, name a separate project-owned direction contract with the joint's optional `direction: {file}`. Its JSON maps that exact joint ID to `{"frame":"frame","axis":[1,0,0],"sign":1}`. By default the frame is the named first occurrence, with the second expressed in the first occurrence's frame. For observations of the first occurrence in the second, set `relativeTransformFrame: "occurrenceTwo"` in the receipt and name that second occurrence in the contract. Express the source command convention in that frame. A world-axis measurement alone needs an independently registered transformation into the observation frame. The unit axis and sign define how a positive joint increment should translate or rotate in that frame under the right-hand rule. Take a nonzero sample below 180 degrees for a revolute joint. Reversing the endpoint order or commanding a negative movement under the positive convention will fail this comparison. Capture source design direction independently of the public sample. For limits, offsets and native-to-physical readback, use the [articulation checker](../scripts/check-native-articulation.mjs).

## Register the student download

Projects offering a public whole-robot handoff set `"publicFusionHandoff": "cad/public-handoff.json"` in their tracked `project-layout.json`. Use `*.f3d binary` and `*.f3z binary` in `.gitattributes` to preserve archive bytes. A team that offers no download skips this opt-in.

Build the component claims from the intended installed inventory, independently of what survived export. Map each ID to `frame`, `drive`, `mechanism` or `other`. Identify every physical occurrence as `project-original`, `project-proxy` or `authorized-supplier` and state its actual provenance or redistribution basis. Bind expected body names where they matter. Use `joints: []` when the archive claims no native joints. Working supplier electronics and mechanical realism require their own design evidence.

A small manifest has the following shape. It names the archive and the reopen receipt by path. The check reads both, and the reopen receipt, which Fusion's reopen writes, must hold the digest of the archive offered now. A `sha256` typed beside either file is still verified and is not required. Larger assemblies list every installed occurrence, including each repeated module.

```json
{
  "schema": "agent-frc/public-fusion-handoff@1",
  "revision": "Workshop assembly B",
  "shareable": true,
  "archive": {"file": "cad/student.f3d"},
  "reopen": {"file": "cad/student-reopen.json"},
  "components": [
    {"id":"frame","role":"frame","representation":"project-original","provenance":"Team rail drawing","editMetric":"extrusions","bodyNames":["crossmember"]},
    {"id":"drive","role":"drive","representation":"project-proxy","provenance":"Team-authored module envelope"},
    {"id":"carriage","role":"mechanism","representation":"project-original","provenance":"Team transfer sketch"}
  ],
  "joints": [{"id":"transfer","type":"slider","occurrenceOne":"frame","occurrenceTwo":"carriage"}]
}
```

Run `node scripts/project-layout.mjs check PROJECT` from the plugin checkout. The existing showcase builder reads the same opt-in and requires its revision to equal the showcase revision. Students receive a **Download the student assembly** link on the results page, to a copy published under the digest the check read. For a custom site, run the focused check with `node scripts/public-fusion-handoff.mjs PROJECT` and link the same tracked archive. Confirm the link from the public page in a browser. The portable checks compare the supplied native observations and the downloadable bytes. Their result depends on the project's native capture and component inventory.
