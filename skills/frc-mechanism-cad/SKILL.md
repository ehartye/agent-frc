---
name: frc-mechanism-cad
description: "Use when designing FRC intakes, indexers, launchers, drivetrains or Fusion assemblies."
---
# frc-mechanism-cad

Read [grounding policy](../../docs/grounding.md) and [public source links](../../references/public-sources.json). Optional vault use must be explicit; absence is normal.

Establish game constraints, interfaces, motion envelope, load and manufacturing capability. Propose alternatives and measurable selection criteria. Organize Fusion components and joints; verify units, references and export reopen behavior. Track acquisition/index/feed states and jam recovery. Require qualified review of stored energy, pinch points and projectile paths. Do not prescribe unsupported universal gearing, compression, launch speed or material dimensions.

Output a concise scope/version statement, evidence links, original guidance, validation performed and remaining gaps. Include only relevant safety constraints. Do not claim runtime verification from documentation.

Optional vault coverage keys: fusion-cad, intakes-launchers, drivetrain, safety. Resolve through the configured catalog, never a hard-coded path.

## Developed learning tools

Use the original [drawing release](../../worksheets/drawing-release.csv), [motion envelope](../../worksheets/motion-envelope.csv), [interference log](../../worksheets/interference-log.csv) and [mechanism experiment](../../worksheets/mechanism-experiment.csv) templates. Do not mark rows complete without measurements or inspection. Compare continuous readiness against one-time transition checks.

## Version 0.3 evidence workflow

Trace source files with [case worksheet](../../worksheets/mechanism-case-trace.csv): requested goal, sensor state, readiness entry gate, continuous readiness, interruption cleanup and caller dependencies. Use pinned2024 Team254/6328 links as historical patterns. Do not infer CAD geometry, physical stop or jam-clearing safety from Java goals.

## Caller and evidence review

For historical caller studies, trace readiness entry, continued authorization, end callbacks, defaults and subsequent periodic output separately. Team254 file-level BSD notices can differ from root MIT; check each artifact before copying. The original cleanup tests do not execute team code.
