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
