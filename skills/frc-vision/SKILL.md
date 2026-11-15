---
name: frc-vision
description: "Use when planning or debugging FRC localization, AprilTags or targeting."
---
# frc-vision

Read [grounding policy](../../docs/grounding.md) and [public source links](../../references/public-sources.json). Optional vault use must be explicit; absence is normal.

Pin camera firmware, vision library, field layout and robot software. Define all frames, transform direction, units and timestamp clock. Review calibration, latency, uncertainty, invalid observations and logging. Distinguish pose estimation from mechanism aiming. Define readiness and loss-of-target behavior; do not transfer vendor sample rejection thresholds across versions. Use synthetic/replay evidence before proposing supervised physical validation.

Output a concise scope/version statement, evidence links, original guidance, validation performed and remaining gaps. Include only relevant safety constraints. Do not claim runtime verification from documentation.

Optional vault coverage keys: vision-targeting, field-robot-fundamentals. Resolve through the configured catalog, never a hard-coded path.

## Developed learning tools

Use the [calibration worksheet](../../worksheets/vision-calibration.csv). Distinguish camera/resolution identity, transform direction and timestamp clock. The desktop lesson demonstrates a synthetic freshness gate only, not camera calibration or delayed estimator fusion.
