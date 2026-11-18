# 2026 REBUILT: Small-buffer FUEL shooter with external availability gate

[Official manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf) — TU22; 166 pages. Reviewed 2026-11-15. The [case manifest](case.json) holds selected rule facts and trace IDs. This is an original educational design case, not a reproduced team robot or complete competition design.

## Strategy alternatives

| Candidate | Tradeoff |
|---|---|
| Small buffered shooter | Simpler indexing and bounded inventory; more collection cycles. |
| Large hopper throughput | More storage and burst capacity; jam, packaging and power costs. |
| Tower-oriented role plus modest scoring | Additional scoring role; climb load path and integration effort. |

Selected: **Small-buffer FUEL shooter with external availability gate**. Reuse the flywheel contract while making uncertain scoring-window state explicit. Fixture capacity is one for testing simplicity, not a 2026 possession-rule claim.

Before choosing for a real team, estimate task success probability, cycle time, downtime, mass, available fabrication time and alliance contribution. Use measured evidence rather than invented match scores. Do not optimize one point value while ignoring reliability or penalties.

## Subsystems and interfaces

| Subsystem | Contract and remaining work |
|---|---|
| Drive/collection | Acquire from a reviewed route; no full-field routing implemented. |
| Buffer/feed | One-pocket fixture with anti-jam timeout; hopper scale-up deferred. |
| Shooter/targeting | Synthetic speed target plus alignment validity. |
| Phase service | Supplies ACTIVE/INACTIVE/UNKNOWN; FMS parsing and flight-time scheduling unimplemented. |

The implemented slice accepts enabled/score-request/availability/alignment inputs, estimates actuator state in a desktop plant and gates release. Inventory and jam behavior are synthetic. Drive, complete autonomous routes, real sensors and actuator IO remain integration work.

## Code, CAD and simulation

Run the shared [Java case laboratory](../../examples/java-2026-sim/CASES.md). All cases use the explicitly pinned 2026 software baseline; that does not verify historical deployment compatibility. Synthetic setpoints and CAD dimensions are design assumptions, never official dimensions.

[CAD package](../../examples/fusion-case-concepts/README.md) contains the shared geometry generator, sideplate DXF/SVG outputs and native Fusion script. The original batch script remains unexecuted. A separate [guarded adaptation](../../examples/fusion-guarded/README.md) created these two sideplates, changed thickness from 6.35 to 7 mm and verified F3D/STEP geometry and native history on 2026-11-16. No full assembly, interference, loads or manufacturing approval is claimed.

CAD inputs feed the simplified plant through generated properties: flywheel inertia uses an assumed solid cylinder; the lift uses assumed mass, gearing, drum radius and travel. This coupling validates parameter consistency, not CAD-derived mass properties or contact behavior.

## Acceptance and remaining gates

- Require reviewed trace IDs before implementing a strategy change. Read complete rules and updates before actual design decisions.
- Test normal operation, unknown/invalid gates, disabled requests, jam timeout and voltage reduction. Report numeric simulator results separately from proposed physical checks.
- Confirm geometry, material, bearings, fasteners, guarding, frame envelope and service access in Fusion before treating the concept as manufacturable.
- No fuel flight, bounce, scoring sensor or full-field model.
- No FMS parser, phase-clock synchronization or scoring-window arrival-time verification.

[End-to-end workflow](../README.md).

## Hardware reading map

Use the [selected rule locators and evidence tasks](rule-reading-map.json) with the [cross-season review workflow](../../docs/rulebook-hardware-review.md). R106/R107 add direction and total-height constraints; a sideplate sketch is not a whole-robot envelope check. Radio exceptions and wiring depend on location and revision.

[Sensor/model boundary](../../examples/java-2026-sim/SIMULATION-BOUNDARIES.md): controller feedback comes directly from the mathematical plant. CAN encoder integration and physical parameter identification are unverified.

Review the [Game-to-Robot Strategy Brief](strategy-brief.md) before freezing subsystem choices. Its recommendation is a proposal; no user selection has been recorded.
