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
