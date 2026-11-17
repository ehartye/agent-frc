---
name: frc-mechanism-cad
description: "Use when planning an FRC intake, launcher, mechanism, Fusion CAD model or drawing."
---
# Mechanism and CAD evidence plan

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow mechanism-cad --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

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

## Operating-space iteration

Use [define, check and iterate the operating space](../../docs/operating-space.md) when the student needs to set functional ranges, assess tolerances or recheck a changed design. Reuse the existing narrative/artifact; maintain the linked worksheet as a sidecar, classify physical versus study/model limits, and invalidate affected evidence after changes. Keep consequential choices with the student.

## Native deliverable contract

Read [native Fusion handoff checks](../../docs/native-fusion-handoff.md) when Fusion is selected or required. Confirm the project-specific output requirement; scripts and MCP may author it, but a required Fusion file must actually be saved and reopened. Verify grounding, transforms, symmetric edits, stored joint limits and complete native/export inventories, preserving supplier-content privacy and imported-versus-parametric distinctions.
