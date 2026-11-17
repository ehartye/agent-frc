# Native Fusion authoring and handoff checks

Choose the required deliverable with the project owner. If the project requires a native Fusion file, scripts, MCP and headless geometry are implementation methods, not substitutes for that file. Verify an actual saved/reopened Fusion design. This is a project-specific requirement, not a universal restriction on every Agent FRC project. The current 2024 robot project requires Fusion; standalone OpenSCAD/blockout/STEP outputs remain supporting artifacts only.

## Before changing a document

Inspect the target document identity, design mode and existing state. Define the native script entrypoint explicitly (run(context) for the audited Python execution interface); do not rely on prior globals. Query the current version's API rather than assuming a property exists across classes. Direct imported designs may not offer timeline/user-parameter operations. Preserve partial-execution evidence and inspect it before retrying creation, so retries do not duplicate assemblies.

## Placement and parameter edits must be observed

Record local/world frames, unit conversions, occurrence hierarchy and expected body bounds. Grounded-to-parent and grounded/pinned state may differ; changing one flag is not proof an occurrence can move. Only change owned fixture grounding intentionally. Capture positions through the design's native snapshot interface when required, then verify world transforms and bounds after recompute. A successful assignment is not an observed result.

A centered rectangle may need explicit symmetry/half-width constraints for subsequent parameter edits. Test a nominal dimension, a valid alternative and a deliberately invalid interfering dimension. Read resulting geometric coordinates instead of trusting the parameter name. Read stored joint limits back after assignment: native precision/rounding can differ from a requested limit, and an out-of-range command may silently leave the prior pose. Do not widen limits to hide mismatch; record requested, stored and achieved values with geometry evidence.

Native joint pose readback and recompute semantics must be tested in the actual tool version. A temporary joint rotation can be reset by a recompute. Confirm both joint state and actual transformed geometry at each sampled pose and after return. Kinematic placement does not establish force-driven cam following, powered motion or retention.

## Inventory, semantics and evidence

STEP roots, bodies and occurrences are different counts: compound parts can split into multiple solids. Compare source-root hierarchy and body manifests, not only flattened counts. Map semantic names by verified hierarchy or unique geometric witnesses; centroid/volume matching requires ambiguity rejection rather than picking the first match. Preserve source hash, representation kind and original/imported/proxy/parametric status as in-file metadata. Imported BRep is not a reconstructed editable feature history.

Scope interference queries explicitly: whole-occurrence queries can include internal supplier-solid intersections. Separate cross-component pairs from within-part representations and intentional threaded/contact interfaces. Native versus independent-kernel agreement is useful bounded evidence, not physical qualification. Preserve mismatches, failing parameter states and rejected poses.

## Save, reopen and compare

Deliver the native file with meaningful component names, required editable parameters/features and joints, plus explicit remaining imported/proxy content. Reopen it and verify document identity, full body/source inventory, parameter values, joints/limits, transforms and representation metadata. Hidden reference bodies can survive native save while disappearing from a default exchange export. Verify each exported file's actual inventory independently; file existence is insufficient. Do not treat a successful STEP round trip as native history/joint preservation.

Supplier CAD and supplier-derived native files need item-level sharing permission. Keep them private unless authorized; publish original scripts, authorized authored geometry and sanitized evidence summaries instead. A native-file requirement does not authorize redistributing third-party solids.

## Reusable audit record

For each operation retain: source/version; intended document; requested edit; actual readback; post-recompute bounds; body/joint/parameter inventory; negative control; save/reopen result; unresolved differences; and elapsed time. Separate narrow operation runtime from loading, semantic annotation and exploratory debugging effort. One fast sweep is not a whole-project productivity benchmark.

This reference was harvested from a representative native supplier-interface and full one-side cassette audition. It does not claim the complete robot migration is finished or all imported parts have native feature histories. The native adapter and source files are maintained in the robot project; no automatic Fusion executor is installed by this reference. Repository use, installed plugin version and availability of Fusion itself are separate checks.

Use the [standing CAD viewing-color convention](cad-color-convention.md) through reversible appearance/view mappings. Preserve material assignments and supplier semantics; save/reopen the legend mapping and confirm geometry, joints and full body inventory are unchanged.

For tab/resource cleanup and timeout reconciliation, follow [safe project tidying](project-tidying.md). A timed-out request may still be running; verify staged progress and recoverability before retrying or closing documents.

## Appearance and scene diagnostics: readback is not a render

Treat API appearance values, saved geometry and the actual viewport as three distinct observations. If a reopened design reports the expected colors/bodies but the image shows an older state, do not deliver that image as proof. Verify exact active document identity, timeline position, body/occurrence visibility and current source/result geometry; record which operation was observed rather than assuming refresh repaired it.

A minimal audited TemporaryBRep-to-BaseFeature example returned a source-body reference during editing. After finishEdit, assigning appearance through that retained reference did not color the displayed result; reacquiring the resulting component body did. This is a specific reproducible source/result distinction, not a claim that all retained API references are invalid. Reacquire by a verified identity/geometry mapping, never a guessed index in a multi-body assembly. Keep native extrusion, nested component and STEP-reimport controls to isolate whether the failure is general or assembly-specific.

Inspect the actual appearance shader and its editable color properties. A metallic appearance can render a role color nearly black; copying a matte appearance and setting its supported color properties may make the viewing convention legible. Property IDs vary by appearance; query their availability rather than assuming a universal color slot. This changes appearance only, never physical material, density or simulation properties. Verify material identifiers and geometric volume/inventory before and after.

In the audited assembly, body-level visibility changes were needed to make old visual references disappear; occurrence-only state did not match the observed viewport. Record both levels and inspect the render. Do not hide physical/source geometry simply to conceal a failed fit. Any display-only cover/numbering must be explicitly segregated from physical mass/contact inputs and remain distinguishable in manifests.

A separately authored minimal native cover made previously absent cover/number visuals appear in one affected assembly. This is an observed recovery workaround, not a proven root-cause diagnosis or universal instruction to rebuild geometry. If considered, work in a separate recoverable copy, retain the failed case, preserve physical source bodies and compare before/after invariants. Do not repeatedly add replacement bodies until the viewport looks plausible. Save/reopen and inspect actual images before declaring recovery.

Use [project tidying](project-tidying.md) to isolate documents safely: preserve unknown/unsaved work, archive only when needed, verify recovery before closing exact known copies and reconcile long-running operations before retry. Importing an F3D as a new document may immediately mark it modified; that flag alone does not prove tessellation or inspection changed its geometry. Likewise an OS not-responding flag during a progressing native operation is not sufficient evidence of a hang.

Evidence for this lesson comprised minimal native/nested/imported controls, retained failed appearance attempts, a material/volume invariant receipt and final save/reopen captures. It does not establish that every graphics inconsistency has the same cause, and no automated scene-repair tool is installed by this reference.
