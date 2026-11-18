# First hypothetical robot envelopes

This slice adds two independently revisable packaging hypotheses, not verified complete robots or actual team inventory. Manufacturer AM14U6 guide dated January 10, 2026, page 8 provides square **26.3 in long × 26.5 in wide** and long **32.3 in long × 22.5 in wide** bare frames. The archived document hash and URL are recorded in `case-studies/2026/hypothetical-components.json`. Older 2025 square dimensions must not substitute for this source.

## Explicit proposals

Both candidates assume 3.5 inches bumper projection on every side. Square assumes 20 inches complete stowed height; long assumes 24 inches. These produce proposed bumper-inclusive bounding boxes of **33.3 × 33.5 × 20 inches** and **39.3 × 29.5 × 24 inches** (length × width × height). A positive 0.25 inch reserve on each complete dimension is a design assumption, not a measured tolerance. The upper mechanisms have not been packed or built. No compliance is inferred from a frame or bumper allowance.

The same guide supports six 6-inch wheels and the included gearbox configuration, but this is not a motor, traction, speed or power model. Mass, center of mass, battery current and power remain null. Physical inventory stays empty and unknown. No team capability, budget or build schedule is assumed.

## Repeatable workflow and integration contract

1. Pin an inspected manufacturer revision and distinguish bare-component facts from design assumptions.
2. Create branch-local `component-assumptions` artifacts. Each depends on exact Game Analysis and resource baseline revisions. Never put hypothetical purchases into physical inventory.
3. Derive a separate strategy and robot-envelope per branch. Full-box dimensions are arithmetic targets with explicit configuration and alignment; they are not a CAD packing result.
4. `exportStaticCandidate(study, id)` validates the graph, rejects stale descendants, and exports the exact final envelope pin. The external scalar evaluator records that pin but does not authenticate its existence; resolve it through this graph before exporting.
5. Review both branches against the same source revision, margin convention and calculation. Retain failures and unknowns. No winning design is selected.
6. Next replace assumptions with measured or CAD-checked bounds, establish mechanism stowage, and check mass/power/thermal budgets. Only then develop separately reviewed movement and mechanism models.

Changing one component record invalidates its strategy/envelope descendants, not its sibling. Changing Game Analysis invalidates both. A capability contract must consume the exact chosen-for-study strategy and envelope revisions through the existing graph contract. This is evaluation scope, not a team design decision.

## Human and agent safeguards

Work in isolated branches, state owned files and interfaces, and merge only reviewed changes onto the verified expected base. Validate graph hashes and dependency impact, source units/scope, null preservation, interface compatibility and full regressions before integration. Tests prove software consistency, not physical safety. Reviewers should reject hidden assumptions, direct-append feasibility promotion, stale exports, budget guesses and omitted failures.

Subsystem hardware/software contracts remain separate work: mounting and electrical interfaces, resource ownership, coordinate and timing conventions, command/state ownership, safe states and acceptance evidence must be specified before a physical system is claimed. This packaging slice neither deploys code nor operates a robot.
