# Native Fusion authoring and handoff checks

Use Fusion for the student design and handoff. Verify a saved and reopened native design, including any linked components. Agree on the authorized project location and archive form with the team. Record a concrete engineering reason for any external shape authoring and how the selected result returns to Fusion. Use exact manufacturer models for purchased parts wherever available.

## Before changing a document

As soon as an imported design becomes the active draft, follow the [draft naming and save checks](project-tidying.md#decide-what-actually-needs-keeping). Record the visible Fusion document name and saved version so the operator can resume the correct design.

Inspect the target document identity, design mode and existing state. Define the native script entrypoint explicitly (run(context) for the audited Python execution interface); do not rely on prior globals. Query the current version's API rather than assuming a property exists across classes. Direct imported designs may not offer timeline/user-parameter operations. Preserve partial-execution evidence and inspect it before retrying creation, so retries do not duplicate assemblies.

## Placement and parameter edits must be observed

Record local/world frames, unit conversions, occurrence hierarchy and expected body bounds. Grounded-to-parent and grounded/pinned state may differ; changing one flag is not proof an occurrence can move. Only change owned fixture grounding intentionally. Capture positions through the design's native snapshot interface when required, then verify world transforms and bounds after recompute. A successful assignment is not an observed result.

A centered rectangle may need explicit symmetry/half-width constraints for subsequent parameter edits. Test a nominal dimension, a valid alternative and a deliberately invalid interfering dimension. Read resulting geometric coordinates instead of trusting the parameter name. Read stored joint limits back after assignment: native precision/rounding can differ from a requested limit, and an out-of-range command may silently leave the prior pose. Do not widen limits to hide mismatch; record requested, stored and achieved values with geometry evidence.

Native joint pose readback and recompute semantics must be tested in the actual tool version. A temporary joint rotation can be reset by a recompute. Confirm both joint state and actual transformed geometry at each sampled pose and after return. Kinematic placement does not establish force-driven cam following, powered motion or retention.

## Inventory, semantics and evidence

STEP roots, bodies and occurrences are different counts: compound parts can split into multiple solids. Compare source-root hierarchy and body manifests, not only flattened counts. Map semantic names by verified hierarchy or unique geometric witnesses; centroid/volume matching requires ambiguity rejection rather than picking the first match. Preserve source hash, representation kind and original/imported/proxy/parametric status as in-file metadata. Imported BRep is not a reconstructed editable feature history.

Scope interference queries explicitly: whole-occurrence queries can include internal supplier-solid intersections. Separate cross-component pairs from within-part representations and intentional threaded/contact interfaces. Native versus independent-kernel agreement is useful bounded evidence, not physical qualification. Preserve mismatches, failing parameter states and rejected poses.

## Save, reopen and compare

Use [native revision persistence](native-revision.md) for independently expected inventories before edit, immediately after edit, after recompute and after exact-archive reopen. A successful direct delete can be transient in a history-based design. Inspect the supported persistent Remove-feature route where appropriate, then verify target, feature health and body-state persistence. Never delete by a colliding source index alone. Keep game-piece route checks and baseline/revised assembly-interface checks separate; one can pass while the other fails.

Deliver the native file with meaningful component names, required editable parameters/features and joints, plus explicit remaining imported/proxy content. Reopen it and verify document identity, full body/source inventory, parameter values, joints/limits, transforms and representation metadata. Hidden reference bodies can survive native save while disappearing from a default exchange export. Verify each exported file's actual inventory independently; file existence is insufficient. Do not treat a successful STEP round trip as native history/joint preservation.

Supplier CAD and supplier-derived native files need item-level sharing permission. Keep them private unless authorized; publish original scripts, authorized authored geometry and sanitized evidence summaries instead. A native-file requirement does not authorize redistributing third-party solids.

## Reusable audit record

For each operation retain: source/version; intended document; requested edit; actual readback; post-recompute bounds; body/joint/parameter inventory; negative control; save/reopen result; unresolved differences; and elapsed time. Separate narrow operation runtime from loading, semantic annotation and exploratory debugging effort. One fast sweep is not a whole-project productivity benchmark.

Keep project-specific native adapters, source files and execution receipts with the owning project. This reference does not install an automatic Fusion executor. Repository use, installed plugin version and availability of Fusion itself are separate checks.

Use the [standing CAD viewing-color convention](cad-color-convention.md) through reversible appearance/view mappings. Preserve material assignments and supplier semantics; save/reopen the legend mapping and confirm geometry, joints and full body inventory are unchanged.

For tab/resource cleanup and timeout reconciliation, follow [safe project tidying](project-tidying.md). A timed-out request may still be running; verify staged progress and recoverability before retrying or closing documents.

## Appearance and scene diagnostics: readback is not a render

Treat API appearance values, saved geometry and the actual viewport as three distinct observations. If a reopened design reports the expected colors/bodies but the image shows an older state, do not deliver that image as proof. Verify exact active document identity, timeline position, body/occurrence visibility and current source/result geometry; record which operation was observed rather than assuming refresh repaired it.

After finishing a native edit, verify whether retained source-body references still identify the displayed result before assigning appearance. Reacquire resulting bodies by a verified identity/geometry mapping, never a guessed index in a multi-body assembly. Keep native extrusion, nested-component and STEP-reimport controls to isolate whether a failure is general or assembly-specific.

Inspect the actual appearance shader and its editable color properties. A metallic appearance can render a role color nearly black; copying a matte appearance and setting its supported color properties may make the viewing convention legible. Property IDs vary by appearance; query their availability rather than assuming a universal color slot. This changes appearance only, never physical material, density or simulation properties. Verify material identifiers and geometric volume/inventory before and after.

Inspect both body-level and occurrence-level visibility and the actual render. Do not hide physical/source geometry to conceal a failed fit. Explicitly segregate display-only covers or numbering from physical mass/contact inputs and keep them distinguishable in manifests.

If a display recovery requires replacement visualization geometry, work in a separate recoverable copy, retain the failed case, preserve physical source bodies and compare before/after invariants. Do not repeatedly add replacement bodies until the viewport looks plausible. Save/reopen and inspect actual images before declaring recovery; a workaround alone does not establish the root cause.

Use [project tidying](project-tidying.md) to isolate documents safely: preserve unknown/unsaved work, archive only when needed, verify recovery before closing exact known copies and reconcile long-running operations before retry. Importing an F3D as a new document may immediately mark it modified; that flag alone does not prove tessellation or inspection changed its geometry. Likewise an OS not-responding flag during a progressing native operation is not sufficient evidence of a hang.

Retain minimal native/nested/imported controls, failed appearance attempts, material/volume invariants and final save/reopen captures with any reported graphics recovery. No automated scene-repair tool is installed by this reference.

## Check volume on the operand being measured

Use the native component solid to measure material volume and the occurrence transform to register it in the assembly. Compare its native direct volume and very-high-accuracy physical properties to an independent calculation. On a temporary copy, record both readings again. The [disposable Fusion volume and machining study](fusion-volume-study.md) reproduces a rotated and translated 24 cm³ plate whose temporary physical properties report zero, including a true 2 cm³ Boolean intersection with six faces. The separate control returns an empty face set across a known 2 cm gap.

For scripted machining, set `participantBodies` to the intended native bodies before adding the extrusion. Check the target against its finished volume and verify that every neighboring solid crossed by the tool keeps its own pre-cut volume after a fresh reopen. The study includes an unrestricted cut whose neighbor loses material while its outside dimensions stay unchanged.

## Verify primitive world placement before clearance queries

A valid solid and correct analytic volume do not prove a primitive was placed at the requested center or orientation. Before using generated test geometry, compare requested versus observed world bounds, validated geometric center and analytic extents in explicit units. Check translated, axis-aligned, nearly axis-aligned and tilted cases, with an intentionally wrong-location negative control. A volume-only test is invariant under translation and cannot catch this failure.

For primitives such as a torus, exercise translated vertical, nearly vertical and tilted cases against independently expected bounds. Do not use temporary-body center-of-mass readback as a trusted world-position witness without validation. An origin construction plus transform is only a candidate workaround until its own bounds and negative controls pass. If a construction fails its placement gate, supersede dependent clearance rows rather than retaining them as successful scans.

For a centrally symmetric primitive, bounds-center and analytic oriented extents can provide independent checks; for arbitrary geometry use an appropriate independently validated registration witness. Never silently assume a temporary physical-properties center is in the expected frame. Record API/build, requested units/center/axis/radii, actual bounds, transform, construction method, volume and negative controls with the scan's source identity. Invalidate dependent clearance results if a placement gate fails; do not patch only the displayed receipt.

The pure exported comparePlacement(expected, observed, tolerances) helper in scripts/placement-witness.mjs compares supplied center, minimum, maximum and volume witnesses. Both inputs require the same explicit mm/cm/m units; volume uses cubed length units. lengthTolerance and volumeTolerance must be explicit, finite and nonnegative. Supply center as a verified geometric registration point appropriate to the primitive, not an unverified COM field. Unit mismatch, malformed values and derived numeric overflow reject; mismatches identify fields/axes. WITNESSES_CONSISTENT is never acceptance, shape equivalence or clearance. Expected witnesses must be prepared independently of the output being checked. The helper does not execute Fusion, calculate analytic bounds, authenticate source evidence or validate a workaround.

## Portable checks for handoff receipts

The [native viewer contract guide](native-viewer-contracts.md) provides executable export-inventory, archive-bound articulation and control-policy comparisons. Prepare expectations independently; keep mesh identity separate from physical motion group, account for excluded bodies, and bind joint axes, origins, sign/offset, limits and saved/reopened readbacks to the exact archive. Preserve mass/inertia provenance separately from appearance. These checks assess supplied finite observations and never replace actual save/reopen, native measurement or interactive host verification.
