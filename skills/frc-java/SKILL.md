---
name: frc-java
description: "Use when designing, implementing or testing WPILib Java code."
---
# Java implementation and test plan

For swerve kinematics, module conversions or odometry, use the [dedicated swerve skill](../frc-swerve/SKILL.md) to align geometry, software units and tests.

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

Run offline tests in the team project using its declared JDK and WPILib versions.

Identify the source of each feedback signal and state its units, frame and sample time.

## Simulator frame and fault checks

Read [rotating observation and fault-transition checks](../../docs/planar-observation.md). Differentiate body-frame observations with the rotational transport term; test nonzero yaw and common rigid rotation, not only straight motion. Faults change actuator policy while the plant continues integrating forces: do not reset momentum to manufacture a stop. The pure helpers are bounded virtual-model checks, not robot-control or full-physics validation.

## Optimization and continuation

Use [simulation checks](../../docs/simulation-checks.md) for replay inventories and shared-time comparisons.

When a simulation stops at a boundary, ask whether it is a study assumption, model-validity limit or physical interference. Follow the study-boundary and controller-clock contracts in simulator-equivalence.md: rebuild dependent obstacle filters, preserve held commands and absolute tick phase, and compare like-time timestep evidence before claiming progress.

For existing frozen simulation trace receipts, use [read-only trace diagnostics](../../docs/trace-diagnostics.md) and npm run trace:inspect to create an offline HTML timeline and JSON report. Inspect missing fields, PARTIAL state, actual sample times, rejected trials and inherited residuals before interpreting progress. Do not read actively rewritten files or infer capture from horizon/contact.

## Choose the simulation for the question

Use [iterative simulator selection](../../docs/simulator-selection.md) to compare block-bot rehearsal, kinematic checks, bounded mechanism/contact fixtures, controls/drive and integrated field/adversary scenarios. Select by decision and evidence needed, not visual complexity or a mandatory fidelity ladder. Preserve model limits and explicit transition gates.
## Verify the design project

Run the selected project experiment from its own entry point. Record code, inputs, toolchain and actual observations.

The same runner now includes preloaded season robot slices: ideal approach/docking, pose-stop authorization, mechanism and actual pose-derived target registration. Start with generated `HANDOFF.md`; see `docs/season-robot-handoff.md`. Keep acquisition, drive energy/sensor fidelity, complete field geometry and official scoring distinct from these runnable slices.

For a released game piece, use the [recorded height screen](../../docs/recorded-release-height.md) to determine whether to continue with a target-passage test.
