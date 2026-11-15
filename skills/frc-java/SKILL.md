---
name: frc-java
description: "Use when designing, implementing or testing WPILib Java code."
---
# Java implementation and test plan

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow java --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

## Establish context

- WPILib/GradleRIO/JDK versions.
- Subsystem ownership and command requirements.
- Desktop test versus robot deployment scope.

## Work through the evidence

1. Trace inputs, units, subsystem state, command ownership and cleanup.
2. Build the isolated learning project at its pinned baseline.
3. Exercise timeout, interruption, disable and invalid-input paths before tuning.

Inspect unmatchedQueries, omitted counts, source versions and review dates. Open relevant official/pinned sources before factual decisions. Keep source findings, recommendations and unknowns separate. Never infer compatibility from an empty season list or a matching keyword.

## Reviewable output

Deliver a code/test change plan with source versions and failure-path assertions. For each material claim identify source URL/version, applicability and verification level. Record actual commands/results separately from proposed tests.

- Compile/test commands and actual results are recorded.
- Requested output and measured output are distinguished.
- Historical projects are not treated as reproduced by another release.

Use the [pinned desktop exercise](../../examples/java-2026-sim/README.md) only with its stated baseline. No hardware operation or deployment is authorized by this skill. Do not infer physical safety, CAD validity or model effectiveness from static review or passing software fixtures. Source/file/dependency licenses must be checked before copying.

Read [simulation interface boundaries](../../examples/java-2026-sim/SIMULATION-BOUNDARIES.md). Identify whether feedback comes from plant truth, a WPILib Encoder/EncoderSim pair, or a versioned vendor device adapter. EncoderSim is not a CAN-controller encoder substitute. Record adapter/library/firmware versions only when chosen and verified; test production-API readback and unit/sign/reset conversions separately from plant dynamics. Keep unknown physical parameters and unsupported faults explicit.
