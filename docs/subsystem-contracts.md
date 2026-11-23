# Subsystem contracts and independent integration review

Status: proposed engineering workflow, with a narrow offline structural linter. No robot code, interlock, deployment, human approval service or hardware verification is implemented. This package cannot authorize robot operation.

## One repeatable loop for humans and agents

1. Freeze the exact game/resource/strategy/envelope/capability/architecture revisions for a candidate. Name a hardware owner, software owner, and integration reviewer. An agent may prepare the record; a typed reviewer name is not authenticated approval.
2. Write the boundary contract before splitting implementation. Stable capability and interface IDs connect the hardware drawing, wiring description, software IO model and verification plan. An unknown is explicit and blocks any conclusion that needs it. Never supply an attractive guessed number as an actual component rating.
3. Assign independent work from the same contract pins. Keep competing designs on separate branches. Producers cannot silently change units, coordinate frames, sign convention, timing, connector, travel range or ownership and leave consumers on the old contract.
4. Submit implementation plus a change-impact packet. The packet includes base and candidate commit IDs, contract/source hashes, changed interfaces, downstream consumers, budgets, hazards, evidence and unresolved inputs. Include negatives and failed runs. Declare newly discovered dependencies, not just existing graph edges.
5. A reviewer other than the author checks the patch and packet. Hardware, controls and integration owners review their affected boundary. Run merge-candidate tests on the combined tree, not just each branch. A newer base, changed pin, conflicting contract or evidence mismatch invalidates the old review.
6. Keep release and physical commissioning separate. A source merge is not deployment, energization or permission to test. A qualified team process owns real hardware inspection, controlled commissioning, emergency response and release authorization.

## Boundary content, not just function signatures

| Boundary | Contract must state | Change invalidates |
| --- | --- | --- |
| Mechanical | Datum/frame, units, mounting/interface geometry, swept envelope and motion states, load assumptions, tolerance stack, mass/COM, service access, travel/stops and stored energy | CAD fit, clearance, stability, load and packaging evidence; connected mechanism alignment |
| Electrical | Exact device/firmware/connector identity, signal and power roles, allocated resources/addresses, documented applicable ratings, direction/polarity, power loss and reset behavior, measurement validity | Wiring review, configuration, current/power allocation, signal scaling and fault evidence |
| Software | Single output owner, request/ack IDs, state machine, units/frame/sign, validity/timestamp/clock model, timeout/freshness bounds, cancellation, scheduling/resource ownership, disabled/restart transitions | Consumer tests, IO adapters, command coordination, simulation model, integration/fault tests |
| Cross-system | Transfer geometry/timing, possession accounting, collision exclusions, shared power/mass/space budgets, arbitration priority, sensor trust, failure containment and recovery authority | Both endpoint contracts, whole-robot budgets, simultaneous-operation and emergency-response evidence |

Use one-way dependency direction where possible: upstream requirements -> interface definitions -> implementation -> evidence. For coordinated subsystems, place their shared interface definition at a common ancestor; both consumers pin it. Do not create a dependency cycle by making each subsystem specification require the other. The current graph does not provide arbitrary sibling joins; do not bypass its lineage rule to fake an integration branch.

Every measured/derived/assumed quantity retains its basis separately. An assumption is not promoted by being copied into CAD or passing a simulator test. Explicitly budget uncertainty and reserve rather than allocating all apparent capacity. The linter checks finite ordered bounds and the presence of units/frame/source text; it does not understand units, validate conversions, inspect drawings or establish plausible values.

## Change blast radius

Run the existing `impactReport` after each new revision. It propagates declared exact-pin staleness transitively and preserves history. It cannot discover an omitted physical dependency. Review the diff against the boundary table and update the dependency inventory as well.

Examples: changing a feed gate travel changes mechanical swept clearance, motor/sensor scaling, command completion timing and transfer assumptions. Changing the envelope or mass allocation can invalidate stability and maneuver assumptions even if no software file changed. Changing firmware, a sensor clock convention, or inversion requires a controls review even if a connector is unchanged. A shared budget/source update invalidates all consuming branches, not only the branch that noticed it.

A handoff packet must distinguish **stale**, **not run**, **failed**, **completed**, **independently reviewed**, and **released**. Completed does not mean passed. Re-pinning or re-labeling an old result is not a rerun. Exact evidence subject, tool/model/configuration, execution outputs and acceptance interpretation must be checked separately.

## Merge checks and overarching safeguard

The proposed safeguard is a small **independent integration safety case** tied to the exact candidate tree and physical configuration, not a powerful autonomous supervisor agent. It records claims, hazards, mitigation owners, evidence, counterexamples and open risks. Any author or agent can raise a stop; no author can self-clear a safety-critical disagreement.

Required review layers:

- Source/season applicability and actual component identity; no silent upgrade from historical examples.
- Contract lint, complete changed-boundary inventory and exact dependency pins.
- Budget/resource collision checks, including duplicate bus/resource ownership and aggregate allocations. These semantic checks are **not implemented** by the current linter.
- Unit and consumer-contract tests for nominal, boundary, stale, missing, duplicate, out-of-order and contradictory inputs; restart and cancellation; conflicting concurrent requests.
- Merge-candidate software build plus actual simulated-physics execution for relevant code/CAD changes, bound to the exact baseline and candidate artifacts. Required coverage includes physics/dynamics, voltage, heat, friction and weight distribution. Missing, partial, unsupported, failed, stale or unrun coverage blocks engineering integration; a structural lint or static fit screen cannot substitute. Pin the models, scenarios, calibration, outputs and predeclared acceptance criteria. Simulation evidence never closes a hardware gate. See [physics evidence gate](physics-evidence-gate.md).
- Independent CAD/mechanical/electrical and hazard review, with explicit unknowns. Real acceptance tests remain controlled by qualified people, outside this plugin.
- Verified human review of the exact candidate commit and contract bundle before integration; separate qualified release authority before hardware use. No automatic waiver or self-signed approval.

For real robot software, design explicit output arbitration and mechanism-specific fault states. A requested action is distinct from permission and actual output. Validate freshness/health and legal system state at the appropriate control boundary; latch faults and define recovery authority where the hazard analysis calls for it. Stopping or zeroing a motor is **not universally safe**: gravity, stored pneumatic energy and moving loads can require other independently designed measures. Software checks are not substitutes for applicable hardware protections, the official control system or the team's safety process. The repo implements none of these runtime safeguards, and this document supplies no operational test procedure or numeric safety thresholds.

## Implemented slice

`validateSubsystemContract` in `scripts/subsystem-contracts.mjs` validates the explicit `frc-subsystem-contract/v1` content schema. It catches unknown fields, duplicate IDs, invalid interface endpoints/check references, missing owner declarations, unlabelled unknowns, malformed pins, invalid quantity bounds and unsupported execution statuses. A completed check requires a declared evidence pin; the review API also checks that it names a subsystem `evidence` artifact. Evidence pin objects reject extra fields. This is **not evidence authentication or result validation**.

`reviewSubsystemContract(study, artifactId)` validates a graph and a subsystem-spec head, enforces equality between declared dependency pins and graph inputs, and returns unresolved/owner/not-run/failed/stale blockers plus the graph impact report. It always returns `human-review-required` and `robotOperationAuthorized: false`. Even an empty blocker list only says the limited declared checks found none; it is not a readiness or approval result. The general graph validator does not automatically invoke this opt-in linter.

The template is intentionally incomplete and uses a fake pin. Replace that pin with a real upstream architecture pin and append it as subsystem-spec content to a valid candidate branch. The template alone is structurally valid, but cannot form a valid graph until its dependencies exist. Do not commit private team data into this public package.

```
node --test test/subsystem-contracts.test.mjs
node scripts/subsystem-contracts.mjs study.json subsystem-artifact-id
npm run validate
npm run test:changed
```

CLI exit 1 means invalid input; exit 2 means a structurally valid review with declared blockers; exit 0 means no listed blockers, **never approval**. Authentication, automatic dependency discovery, semantic unit compatibility, whole-robot budget aggregation, CI branch protection, runtime interlocks and physical validation remain proposed work. Evidence records need a separate lineage/result review, including whether a reused old-spec result actually applies to the current implementation.

### Evidence lifecycle limitation

The current graph makes subsystem evidence depend on a specification. If specification revision 2 consumes evidence for revision 1, that evidence is stale because its subject was superseded; the review remains blocked. This is intentionally fail-closed. A coherent all-completed review of the same specification is not currently representable inside this contract record. A future separate verification/review record should pin the unchanged specification and its evidence without revising the subject merely to record completion. Do not strip history, substitute an architecture pin as evidence, or bypass staleness to obtain a green review.

### Required simulation evidence is a separate gate

Relevant code and CAD changes require actual physics execution, not merely a valid contract or simulation-shaped receipt. The structural contract linter above is not that gate. Each required domain needs explicit model/scenario coverage and exact baseline/candidate bindings; partial coverage of a component is not whole-robot coverage. A case with missing dynamics, voltage, heat, friction or weight-distribution evidence remains blocked rather than being averaged into a positive score. Lack of calibration or unresolved input/model suitability also blocks engineering acceptance. Mechanical/electrical inspection, controlled physical validation and qualified authorization remain independent requirements after any simulation result.
