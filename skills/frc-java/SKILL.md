---
name: frc-java
description: "Use when planning, reviewing or debugging Java WPILib architecture, tests or desktop simulation."
---
# frc-java

Read [grounding policy](../../docs/grounding.md) and [public source links](../../references/public-sources.json). Optional vault use must be explicit; absence is normal.

Read the selected release, project Gradle/vendordeps and local project instructions. Separate lifecycle, subsystem ownership, command composition and I/O. Check scheduler and mode cancellation. Prefer meaningful interlock, timeout, interruption and frame tests. Use the project wrapper only within authorized local work; report actual build/test/simulation output. Never mix 2026 stable imports with development APIs or claim simulation validates physical safety.

Output a concise scope/version statement, evidence links, original guidance, validation performed and remaining gaps. Include only relevant safety constraints. Do not claim runtime verification from documentation.

Optional vault coverage keys: java-architecture, testing-simulation, example-projects. Resolve through the configured catalog, never a hard-coded path.

## Developed learning tools

Use the [desktop lesson](../../examples/java-2026-sim/README.md) when a bounded runnable teaching example fits. Read its validation record and license boundaries. Its constants are synthetic fixtures; preserve that label. Run tests after behavior changes and keep robot deployment absent. Record failed attempts as well as final evidence.

## Version 0.3 evidence workflow

Use the [navigation lesson](../../examples/java-2026-sim/NAVIGATION.md) alongside mechanism tests. Pin2026.2.1 APIs; validate generated paths before tracking. Report reference and corrected wheel-speed limits separately. Run the stated tasks and retain aggregate results, not machine-specific build reports.
