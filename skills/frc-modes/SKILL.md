---
name: frc-modes
description: "Use when specifying or reviewing FRC teleop and autonomous behavior."
---
# frc-modes

Read [grounding policy](../../docs/grounding.md) and [public source links](../../references/public-sources.json). Optional vault use must be explicit; absence is normal.

Get selected manual edition and mode requirements. Define operator bindings, override/interruption priority, state transitions and diagnostics. For autonomous define selected routine, start pose, alliance/frame, bounded time, sensor completion, failure branches and cleanup. Review mode transition cancellation. Treat historic paths and examples as educational evidence, not current legal routines. Never execute robot motion or deployment.

Output a concise scope/version statement, evidence links, original guidance, validation performed and remaining gaps. Include only relevant safety constraints. Do not claim runtime verification from documentation.

Optional vault coverage keys: teleop-autonomous, java-architecture, example-projects. Resolve through the configured catalog, never a hard-coded path.

## Developed learning tools

Use the [mode acceptance worksheet](../../worksheets/mode-acceptance.csv). For trajectories, verify time-sampled reference state and separate chassis, module and mechanism layers. The desktop lesson tests cancellation/timeouts only; never present it as a full-field routine.

## Version 0.3 evidence workflow

Use [trajectory/pose exercise](../../examples/java-2026-sim/NAVIGATION.md) for software evidence. Require bounded completion, cancellation cleanup and a separate actuator-output policy. An ideal trajectory pass does not establish obstacle clearance or drivetrain dynamics.

## Caller and evidence review

Require an explicit completion/interrupt path. A feed helper may rely on a caller readiness gate; timed preparation does not prove readiness. The [lifecycle worksheet](../../worksheets/command-lifecycle.csv) separates immediate and next-periodic output observations.
