---
name: frc-mechanism-cad
description: "Use when planning an FRC intake, launcher, mechanism, Fusion CAD model or drawing."
---
# Mechanism and CAD evidence plan

When resuming an existing design, follow the [design continuation procedure](../../docs/strategy-first-continuation.md) before proposing the next CAD edit or mechanism experiment.

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow mechanism-cad --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

For a new kickoff design, use the [field lab and narrative handoff](../../docs/kickoff-field-lab.md) first. Identify the chosen match role, the student observation that supports it and the capability the proposed mechanism must satisfy.

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

Read [native Fusion handoff checks](../../docs/native-fusion-handoff.md) when Fusion is selected or required. Confirm the project-specific output requirement; scripts and MCP may author it, but a required Fusion file must actually be saved and reopened. Verify grounding, transforms, symmetric edits, stored joint limits and complete native/export inventories, preserving supplier-content privacy and imported-versus-parametric distinctions.

## Standing viewing convention

Use the [CAD color convention](../../docs/cad-color-convention.md) for new/revised robot views: consistent functional roles, visible legend and non-color labels, with documented project overrides. Preserve supplier appearances and physical material properties; appearance never means safety or verified performance. Recheck native persistence and body inventory after application.

## Project tidying

Use [safe project tidying](../../docs/project-tidying.md) when CAD tabs or audit copies obscure the active assembly. Inventory exact document identities, preserve unknown/unsaved work, reuse verified saved states, reopen before closing duplicates, and reconcile long-running operations before retrying. Keep one named active assembly without mandating redundant archives.

Before using generated primitives for clearance, verify actual world bounds/registration and analytic volume with translated/axis/near-axis controls. Use the bounded placement-witness helper described in native-fusion-handoff.md; correct volume alone cannot establish correct placement, and matching witnesses do not establish clearance.

For an authorized official local Fusion session, use the [guarded disposable recipe](../../examples/fusion-guarded/README.md): unique document match plus job marker, expected geometry/revision, durable intent, no uncertain replay, feature health and separate native/STEP reopen evidence. Do not generalize the executed sideplate test to a full robot or untested client crash recovery.

## Portable export, articulation and viewer contracts

Use the [native viewer contract guide](../../docs/native-viewer-contracts.md) for independent expected/observed JSON comparisons. The native:export and native:articulation commands require exact inventories, archive identity, explicit frames/units and finite witnesses. The viewer:controls command checks supplied post-engine observations and collision-only restoration policy; it never hooks real input. Expected input comes first for these three commands. Preserve synthetic, native-observed, interactive-observed and human-reported evidence boundaries as allowed by each contract; a match does not execute CAD, prove a reopen or qualify a viewer/robot.
