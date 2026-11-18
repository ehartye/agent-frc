# agent-frc

Version **0.7.0**, strategy and previsualization release. Ten FRC engineering skills connect rules, strategy, subsystems, working Java code, Fusion inputs and simulator evidence. Independent educational work; no FIRST/vendor endorsement. Installation and native CAD execution require separate verification.

Start with the [end-to-end case workflow](case-studies/README.md): [2024 CRESCENDO](case-studies/2024/README.md), [2025 REEFSCAPE](case-studies/2025/README.md), or [2026 REBUILT](case-studies/2026/README.md). Each compares three strategies and implements a deliberately bounded mechanism slice. Complete robot design remains future work.

- [Java laboratory](examples/java-2026-sim/README.md): Java 17 / WPILib 2026.2.1, **42 JUnit tests plus one bounded demo passed**. [Case evidence](case-studies/validation.json) includes actual ideal-plant outputs.
- [Fusion concept package](examples/fusion-case-concepts/README.md): three generated DXF/SVG sideplates and an original Python script. See the dated concept evidence and the guarded native recipe below for their separate execution status; neither establishes a complete robot or full CAD validation.
- [Electrical review](docs/electrical-review.md) and [13 worksheets](worksheets/README.md) separate evidence, assumptions and physical checks.

## Use and validate

Node 20.11+; no Node dependencies. Run `npm test`, `npm run validate`, `npm run evaluate` and `npm run cases:validate`. The current Node regression suite is run with npm test; 29 deterministic grounding cases are available separately. They do not establish model/learner effectiveness.

`npm run case -- --season 2025`

`npm run brief -- --workflow case-study --season 2025 --as-of 2026-11-15`

[Learning briefs](docs/briefs.md) expose incomplete metadata grounding; open official sources before decisions. The optional FRC_VAULT_PATH is explicit-only. No default vault scan, automatic download/sync, source-body retrieval or upload exists.

## Boundaries

See [experimental studies and verification scope](docs/experimental-studies.md) before replaying preserved contact, acquisition or target studies. Historical receipts retain their original source pins; integration does not make them fresh evidence for the combined checkout.

Historical game analysis uses a common pinned 2026 teaching runtime, not historical robot binaries. Selected requirements are not complete rule compliance. Final 2027 game rules and production Systemcore compatibility remain unverified. No physical IO, deploy target, robot operation, plugin installation or model-effectiveness test is provided.

Original code, prose and concept vectors are MIT. FIRST manuals and manufacturer documentation stay link-only. [Manual fingerprints](case-studies/manual-fingerprints.json) identify retrieved bytes without bundling them. [Third-party notices](examples/java-2026-sim/THIRD_PARTY.md) cover selected build/wrapper sources; dependencies are not bundled. No private catalog, team data or credentials are shipped.

[Hardware rules and Java evidence](docs/rulebook-hardware-review.md) adds a dated, event-aware reading map; use `npm run rules -- --season 2026 --as-of 2026-11-15 --event-stage archive-study`.

The [strategy-to-previsualization workflow](docs/design-artifact.md) adds conversational skills for strategic narratives and previsualization. Students preserve alternatives, scaffold pseudocode and fabrication questions, then iterate a versioned JSON blockout before CAD. `npm run design -- new design.json` starts a portable artifact; validation and millimetre OpenSCAD handoff are spatial planning tools, not fabrication or rule-compliance certification.

## Setup and installed libraries

Use the [setup skill](skills/frc-setup/SKILL.md) and [task-specific health check](docs/setup-health.md) before choosing an interpreter or proposing dependency changes. npm run setup:check -- --task core needs no Python physics packages; select --task physics with the project Python executable to inspect MuJoCo and NumPy versions/import health. Optional libraries stay optional. Nothing is silently installed.

The plugin now drives a [Game-to-Robot Strategy Brief](docs/game-to-robot-strategy.md) for all three historical cases. Run `npm run strategy -- --season 2026`; recommendations remain unselected proposals. The [guarded local Fusion recipe](examples/fusion-guarded/README.md) has bounded 2026 sideplate execution evidence. These retained experimental studies do not establish a new published release or complete robot validation.

The local [parallel decision-chain workflow](docs/decision-chain.md) now includes an explicit resource baseline and source-pinned 2026 preliminary envelopes. `npm run --silent envelope -- templates/resource-baseline.json` emits three unselected branches with unknown inventory/geometry kept explicit; `npm run chain -- case-studies/2026/envelope-study.json` reports dependency freshness. This is planning and provenance tooling, not a match simulator or a completed robot design.
