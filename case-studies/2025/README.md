# 2025 REEFSCAPE: Short-travel CORAL-placement teaching mechanism

[Official manual](https://firstfrc.blob.core.windows.net/frc2025/Manual/2025GameManual.pdf) — 164-page retrieved PDF; section 6 V13, section 7 V11. Reviewed 2026-11-15. The [case manifest](case.json) holds selected rule facts and trace IDs. This is an original educational design case, not a reproduced team robot or complete competition design.

## Strategy alternatives

| Candidate | Tradeoff |
|---|---|
| Low-level CORAL placement | Reduced lift travel; limited scoring flexibility. |
| Multi-level elevator/wrist | Broader placement reach; higher mass, stability and collision-control burden. |
| ALGAE-focused processor/net | Different end-effector and release demands; alliance role must be evaluated. |

Selected: **Short-travel CORAL-placement teaching mechanism**. Study gravity-loaded position control and release sequencing without claiming full reef reach. The fixture target is an arbitrary travel coordinate, not an official field height.

Before choosing for a real team, estimate task success probability, cycle time, downtime, mass, available fabrication time and alliance contribution. Use measured evidence rather than invented match scores. Do not optimize one point value while ignoring reliability or penalties.

## Subsystems and interfaces

| Subsystem | Contract and remaining work |
|---|---|
| Drive/alignment | Provide reviewed zone/pose validity; geometric zone detection is not implemented. |
| Intake/end effector | Single retained item and gentle-release request; real grip force unknown. |
| Lift | Gravity-enabled simulated carriage with travel bounds. |
| Safety/mode | Stop electrical requests, jam latch and travel checks; real gravity restraint still required. |

The implemented slice accepts enabled/score-request/availability/alignment inputs, estimates actuator state in a desktop plant and gates release. Inventory and jam behavior are synthetic. Drive, complete autonomous routes, real sensors and actuator IO remain integration work.

## Code, CAD and simulation

Run the shared [Java case laboratory](../../examples/java-2026-sim/CASES.md). All cases use the explicitly pinned 2026 software baseline; that does not verify historical deployment compatibility. Synthetic setpoints and CAD dimensions are design assumptions, never official dimensions.

[CAD package](../../examples/fusion-case-concepts/README.md) contains the shared geometry generator, sideplate DXF/SVG outputs and native Fusion script. The script was not executed because Fusion reported Sign in Failure. No native F3D, STEP export/reopen or CAD interference result is claimed.

CAD inputs feed the simplified plant through generated properties: flywheel inertia uses an assumed solid cylinder; the lift uses assumed mass, gearing, drum radius and travel. This coupling validates parameter consistency, not CAD-derived mass properties or contact behavior.

## Acceptance and remaining gates

- Require reviewed trace IDs before implementing a strategy change. Read complete rules and updates before actual design decisions.
- Test normal operation, unknown/invalid gates, disabled requests, jam timeout and voltage reduction. Report numeric simulator results separately from proposed physical checks.
- Confirm geometry, material, bearings, fasteners, guarding, frame envelope and service access in Fusion before treating the concept as manufacturable.
- No coral contact, reef collision or structural/stability analysis.
- Zero voltage does not hold a gravity-loaded carriage; mechanical retention is unverified.

[End-to-end workflow](../README.md).

## Hardware reading map

Use the [selected rule locators and evidence tasks](rule-reading-map.json) with the [cross-season review workflow](../../docs/rulebook-hardware-review.md). Do not transfer 2024 limits or radio exceptions. Full height/zone, bumper, motor/controller and power rules remain a manual review.

[Sensor/model boundary](../../examples/java-2026-sim/SIMULATION-BOUNDARIES.md): controller feedback comes directly from the mathematical plant. CAN encoder integration and physical parameter identification are unverified.
