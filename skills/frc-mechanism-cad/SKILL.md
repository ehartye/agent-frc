---
name: frc-mechanism-cad
description: "Use when planning an FRC intake, launcher, mechanism, Fusion CAD model or drawing."
---
# Mechanism and CAD evidence plan

When the project has not specified a drivetrain, start with four-module swerve and use the [module selection workflow](../frc-swerve/SKILL.md) before committing mounting interfaces. Follow a specified drivetrain for that project.

Use **Autodesk Fusion as the student authoring environment**. Start from the project's active Fusion design. Maintain student-editable sketches, parameters, components, joints and drawings there. Hand off a saved version and a reopened F3D or F3Z archive with linked components resolved. Record which features a student can edit and which came from imported solids.

When a design agent creates, inserts or moves a part, run the [checked placement](../../docs/checked-placement.md) against the last accepted assembly before adopting the new pose. Keep rejected proposals and their named pair evidence with the experiment.

For each purchased part, look for the manufacturer's model of the exact part number, generation and installed configuration. Import an official STEP into Fusion when the supplier provides that format. Verify units, revision, mounting datums, occurrence count and installed orientation against the manufacturer drawing. Record the source, retrieval date, configuration, file digest and redistribution terms in the project's parts register. Keep restricted geometry in the authorized library and give students retrieval and relink instructions.

External shape authoring requires a project-specific reason why that operation is impractical in Fusion, the result it enables, and a path back into the student assembly. For a large scripted family of candidates, for example, preserve the generator and its inputs and import the chosen solid into Fusion. Where an exact purchased model cannot be obtained, record the failed lookup or mismatch, mark the replacement as a proxy, cite its dimensional basis and identify which design decisions remain open.

Before selecting parts or combining design changes, use the [assembly accounting check](../../docs/assembly-accounting.md) to reconcile installed instances, supplied articles and inspection mass. When a later revision replaces a candidate part, select the installing change first and record each revision’s own signed net mass. Trace the comparison limit to the project’s selected rule or budget before relying on a final margin.

For an issued engineering assembly, [reconcile the full reopened physical-material inventory with the configured BOM](../../docs/engineering-material-mass.md). Separate stock grades, complete purchased articles and display or fixture bodies. Reconstruct a critical fastened interface from the drawing and loose parts before making a fabrication claim.

When a saved assembly replaces a temporary CAD document, use the [native study replay procedure](../../docs/native-study-replay.md) to verify the destination, assembly revision and moving geometry before repeating a clearance query. Save the binding and pose inputs in the design project.

When resuming an existing design, follow the [design continuation procedure](../../docs/strategy-first-continuation.md) before proposing the next CAD edit or mechanism experiment.

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow mechanism-cad --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

For a new kickoff design, use the [field lab and narrative handoff](../../docs/kickoff-field-lab.md) first. Identify the chosen match role, the student observation that supports it and the capability the proposed mechanism must satisfy.

Before issuing a still, [verify the saved viewport or registered render](../../docs/cad-capture-review.md). Reopen and activate the selected assembly, restore only the intended display state and compare the resulting pixels with an independent view. Check the whole outline, visible mechanism, cover finish and readable markings promised in this pose. Keep failed captures and distinguish a verified renderer from a native viewport.

## Establish context

- Game-piece geometry and season envelope.
- Load cases, motion range and manufacturing process.
- CAD document/version and measurement provenance.

## Work through the evidence

1. Sketch acquisition, transfer, staging and release states.
2. Trace source-code caller/end/default/periodic paths independently of geometry.
3. Define CAD joints, clearances, drawing dimensions and an export/reopen check.

Inspect unmatchedQueries, omitted counts, source versions and review dates. Open relevant official/pinned sources before factual decisions. Keep source findings, recommendations and unknowns separate. Never infer compatibility from an empty season list or a matching keyword.

## Reviewable output

Deliver a state table, cad review checklist and proposed measurement sheet. For each material claim identify source URL/version, applicability and verification level. Record actual commands/results separately from proposed tests.

- Unmeasured dimensions and loads are marked assumptions.
- A command goal does not certify mechanical stopping or guarding.
- Source file and asset licenses are checked before reuse.

No hardware operation or deployment is authorized by this skill. Do not infer physical safety, CAD validity or model effectiveness from static review or passing software fixtures. Source/file/dependency licenses must be checked before copying.

## Native CAD evidence and long-running checks

Read [native CAD verification lessons](../../docs/native-cad-feedback.md) before claiming clearance or validating a mounting interface. Audit static support/cartridge interfaces separately from moving/game-piece sweeps; preserve baseline contacts and failing intermediate poses. Require method-qualified bounds, negative controls and source-bound incremental progress for expensive checks. Do not describe the proposed native backend optimizations as implemented by the portable blockout CLI.

Use `npm run native:witness -- receipt.json expected-manifest.json` for the bounded native-evidence contract. Independently prepare the expected manifest before the native run, including source pins, exact witness states/pairs/phase and method/tolerance policy; phase-unregistered rotating geometry, failed Booleans and incomplete receipts remain unknown. This is receipt checking, not native CAD execution. At every meaningful tool failure or result, send source-bound friction and a counterexample to the plugin feedback loop instead of postponing harvest until cleanup.

## Source identity and proxy-contact boundaries

For nested native assemblies, use [occurrence identity checking](../../docs/native-identity.md) before reusing body/source mappings. Capture actual ancestry, child overrides and the complete expected physical inventory, including hidden bodies. Never infer identity by display name alone.

For new proxy-contact evidence, use [native witness version 2](../../docs/native-cad-feedback.md). Declare both operand representations and independently checked installed-transform registration. Outer-envelope overlap and unregistered supplier-source orientation remain unknown for installed material contact. Preserve observed volumes and failed poses; do not omit unsupported contact from a physics model or downgrade the receipt schema to obtain clearance.

## Operating-space iteration

Use [define, check and iterate the operating space](../../docs/operating-space.md) when the student needs to set functional ranges, assess tolerances or recheck a changed design. Reuse the existing narrative/artifact; maintain the linked worksheet as a sidecar, classify physical versus study/model limits, and invalidate affected evidence after changes. Keep consequential choices with the student.

## Native deliverable contract

For replacements or removals, use [native revision persistence](../../docs/native-revision.md). Check exact occurrence/body instances, empty-container ancestry, after-edit/recompute/reopen inventories and required persistent features. A delete return value or equal body count is insufficient. Recheck assembly interfaces independently from the game-piece path and preserve all new or increased interference witnesses.

Use the [native Fusion handoff checks](../../docs/native-fusion-handoff.md) for the student assembly. Save and reopen the selected archive. Verify grounding, repeated physical placements, symmetric edits, stored joint limits and complete native/export inventories. Identify supplier access requirements and which features students can edit.

## Standing viewing convention

Use the [CAD color convention](../../docs/cad-color-convention.md) for new/revised robot views: consistent functional roles, visible legend and non-color labels, with documented project overrides. Preserve supplier appearances and physical material properties; appearance never means safety or verified performance. Recheck native persistence and body inventory after application.

## Loaded feed paths

For a loader, hopper or circulating carrier, sweep the loaded gate and adjacent pieces, record downstream acceptance and trace the return path on one clock. Check the next ID after reset and compare the achieved spacing with the required service rate. [Trace storage to the receiver](../../docs/storage-to-service.md).

## Project tidying

Use [safe project tidying](../../docs/project-tidying.md) when choosing an active Fusion draft or handing it back. Give the draft a recognizable name, verify the requested save in its authorized destination, and report the active tab. Inventory exact document identities, preserve unknown or unsaved work, reuse verified saved states, and reconcile long-running operations before closing inspection copies or retrying.

For a frame or bumper support, recover the complete installed backing inventory behind its cover and preserve display states. Measure finite mating area and separately reopen an explicitly identified replacement. [Check hidden backing and support fit](../../docs/hidden-backing-fit.md).

Before relying on a Fusion mass or Boolean result, compare direct native and temporary volume readings on a known solid, check a material-overlap control and a disjoint control, and inspect the face set. For a machining change, restrict the cut participants and reopen both the intended body and each neighbor crossed by the tool. [Run the two-plate Fusion experiment](../../docs/fusion-volume-study.md).

Before using generated primitives for clearance, verify actual world bounds/registration and analytic volume with translated/axis/near-axis controls. Use the bounded placement-witness helper described in native-fusion-handoff.md; correct volume alone cannot establish correct placement, and matching witnesses do not establish clearance.

For an authorized official local Fusion session, use the [guarded disposable recipe](../../examples/fusion-guarded/README.md): unique document match plus job marker, expected geometry/revision, durable intent, no uncertain replay, feature health and separate native/STEP reopen evidence. Do not generalize the executed sideplate test to a full robot or untested client crash recovery.

## Portable export, articulation and viewer contracts

For each new assembly, run `python <plugin>/scripts/component_palette.py <project>` to resolve the default viewing palette and any overrides under `cad/component-palette.json`. Assign project parts by stable role in Fusion. Preserve purchased appearances and use the same part mapping for the published CAD.

Use the [native viewer contract guide](../../docs/native-viewer-contracts.md) for independent expected/observed JSON comparisons. The native:export and native:articulation commands require exact inventories, archive identity, explicit frames/units and finite witnesses. The viewer:controls command checks supplied post-engine observations and collision-only restoration policy; it never hooks real input. Expected input comes first for these three commands. Preserve synthetic, native-observed, interactive-observed and human-reported evidence boundaries as allowed by each contract; a match does not execute CAD, prove a reopen or qualify a viewer/robot.

Before using a sensor to advance the mechanism, [check the mounted optical path and release evidence](../../docs/sensor-observability.md). Compare the seated and early-exit readings with the actual material and require an independent clearance observation for withdrawal.

Trace the same camera rays with the piece removed at pickup and during travel. Identify which rays still see a calibrated surface as the mechanism moves. Use those rays to distinguish a seated piece from an empty or shifted one. [Check the traveling camera view](../../docs/camera-reference.md).

For a publicly downloadable whole robot, bind the student archive to its own reopened component, feature and joint evidence. [Verify the public Fusion handoff](../../docs/public-fusion-handoff.md).

Begin detailed CAD from the selected [whole-robot architecture](../../docs/whole-robot-comparison.md). Check the installed revision against its [elevation loads, cycle rate and recovery](../../docs/mechanism-hardening.md).

Start a new chassis with [rear plan chamfers](../../docs/frame-profile.md). Use the generated Fusion-importable sketch for the frame and continuous backing, padding and cover. Preserve the ordinary side elevation and verify the actual joint, attachments and wheel clearances.

Use the [Fusion authority and revision handoff](../../docs/fusion-authority.md) to establish the one current saved native design, the STEP exported from that design and the identity of the engineering evidence. Recheck the register when resuming in another checkout or before replacing a published view.

Before dispatching long native work, [stage the complete pinned package and project inputs in private job storage](../../docs/native-job.md). Run the guarded access check in Fusion before starting the recipe. Reopen and inspect through that directory. Retire it after the station reports terminal release and restores its original open documents.

For a project with `iterations/active.json`, follow its active design root before recovering older records. After a decision to start over, use `frc-start-over` to preserve the evidence and open a fresh numbered design. [Design iterations](../../docs/design-iterations.md)
