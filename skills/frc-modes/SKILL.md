---
name: frc-modes
description: "Use when specifying or reviewing FRC teleop, autonomous, trigger or interruption behavior."
---
# Teleop and autonomous acceptance plan

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow modes --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

## Establish context

- Selected season/manual and operating modes.
- Operator binding and interruption priority.
- Start pose, frame, completion and failure conditions.

## Work through the evidence

1. Trace initial binding state, rising/falling edges, early finish and a new press.
2. Separate readiness entry gates from continued feed authorization.
3. Specify timeout, mode-transition cancellation and immediate versus next-periodic cleanup.

Inspect unmatchedQueries, omitted counts, source versions and review dates. Open relevant official/pinned sources before factual decisions. Keep source findings, recommendations and unknowns separate. Never infer compatibility from an empty season list or a matching keyword.

## Reviewable output

Deliver a mode/trigger transition matrix with expected software observations. For each material claim identify source URL/version, applicability and verification level. Record actual commands/results separately from proposed tests.

- Every routine has bounded completion or explicit interruption behavior.
- Driver Station disable is distinguished from scheduler.disable.
- Trajectory reference limits are separate from corrected actuator commands.

Exercise each transition offline using the project’s commands. Check scheduler ownership, cancellation, stale data, disable and re-enable against expected outputs.
