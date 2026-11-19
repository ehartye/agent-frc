---
name: frc-vision
description: "Use when planning or debugging FRC vision, localization or targeting."
---
# Vision and localization contract

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow vision --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

## Establish context

- Camera/firmware/library/field-layout versions.
- Transform direction, units and field/alliance convention.
- Capture clock, latency, frame ordering and reset epoch.

## Work through the evidence

1. Document frame transforms and timestamp origin before fusion.
2. Exercise stale/future/outlier/duplicate/pre-reset behavior.
3. Record calibration evidence separately from synthetic estimator tests.
4. [Challenge the field reference](../../docs/field-references.md#challenge-the-field-reference). Replay an achieved pose or release against an independently shifted target map. Compare the observer's decision with a geometric margin in the independent field frame. Record a missing observer verdict when the study supplies geometry alone.

Inspect unmatchedQueries, omitted counts, source versions and review dates. Open relevant official/pinned sources before factual decisions. Keep source findings, recommendations and unknowns separate. Never infer compatibility from an empty season list or a matching keyword.

## Reviewable output

Deliver a frame/time contract and rejection-policy test table. For each material claim identify source URL/version, applicability and verification level. Record actual commands/results separately from proposed tests.

- Capture time is not silently replaced by arrival time.
- Fixture thresholds are not recommendations for every camera.
- No vision accuracy claim follows solely from source review.

Replay the team’s observations with the project’s sensor calibration. Record timestamp, frame transform, uncertainty and the reason for each rejected measurement.
