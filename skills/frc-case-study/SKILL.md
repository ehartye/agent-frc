---
name: frc-case-study
description: "Use when turning an FRC game description and rulebook into strategy options, robot subsystems, Java code, Fusion CAD and simulation evidence, including 2024, 2025 and 2026 case studies."
---
# Trace one season from rules to tested design

Read the [case workflow](../../case-studies/README.md) and [grounding policy](../../docs/grounding.md). Select exactly one season. Use `npm run case -- --season YEAR` for a supported case and the case-study learning brief for context. A missing season needs explicit source work, not copied requirements from another year.

1. Open the official manual and relevant updates. Record section versions, source date and exact requirement IDs. Distinguish rules, interpretations, design choices and assumptions. Do not redistribute manual bodies.
2. Use [strategic narrative](../frc-strategic-narrative/SKILL.md) and [previsualization](../frc-previsualization/SKILL.md) to involve programmers, designers and fabricators before CAD. Drive the [Game-to-Robot Strategy Brief workflow](../../docs/game-to-robot-strategy.md): run `npm run strategy -- --season YEAR`, present the alternatives, and test a changed assumption before deriving the [capability contract](../../templates/capability-contract.md). Keep the user decision unset until actually supplied. Compare task contribution, reliability, cycle budget, alliance fit and development cost. Explain the chosen teaching scope; do not present invented scores as measured optimization.
3. Break the robot into drive/pose, acquisition, storage/transport, scoring, endgame where relevant, power/control and safety/mode services. Define units, ownership, sensors, actuator outputs, failure states and interlocks. Mark unimplemented interfaces.
4. Implement a bounded Java slice and run relevant tests. Keep hardware IO separate. All provided cases use Java 17/WPILib 2026.2.1; this does not validate historical deployment. The [case laboratory](../../examples/java-2026-sim/CASES.md) includes gravity and flywheel models, inventory, release and mode/deadline policies.
5. Use the [Fusion concept package](../../examples/fusion-case-concepts/README.md). Distinguish generated vectors, syntax-checked script, native model creation, exports/reopen and interference/load analysis. If Fusion is unavailable, complete portable inputs and leave native steps unexecuted. Respect a user pause on Fusion.
6. Verify cross-file assumptions and trace links, then simulate nominal and fault cases. Report numerical results with model limitations; simulator success does not establish structural strength, launch accuracy or safe hardware.

Deliver the case manifest, strategy decision, subsystem interface table, working code/test evidence, CAD artifact status and a short unresolved-gates list. Never claim the whole robot is implemented when only a vertical slice runs. No deployment, hardware action, software installation or external publication is authorized by this skill.

Use the [hardware rule reading map](../../docs/rulebook-hardware-review.md) before selecting components. Require event stage and manual/update revision as well as year; the 2024 archive includes Championship radio and weight changes. A named event remains unresolved until its edition is matched.

## Parallel source-to-envelope workflow

Use [versioned decision chains](../../docs/decision-chain.md) when comparing simultaneous hypotheses. For the sourced 2026 slice run `npm run envelope -- templates/resource-baseline.json`. Supply an explicit season/team resource baseline, preserve unknown inventory, and keep kit-baseline, compact and payload candidates unselected. Never equate expected kit contents or credits with confirmed physical hardware. Field geometry and semantics feed the same pinned Game Analysis; do not invent global coordinates or robot reachability. Capability contracts pin a preliminary envelope as well as strategy, and changes invalidate downstream revisions. A passing graph check is not physical, simulation, legality or team approval.
