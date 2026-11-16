# Segmented season prototype status

These studies replace unsupported round-sleeve shaft interfaces with explicit profiled research candidates. They do not declare calibrated simulation-ready robots. All work is offline; no robot deployment or hardware operations.

| Season | Native geometry evidence | Contact evidence | Still missing |
| --- | --- | --- | --- |
|2024 NOTE|Pinned four-inch MAXSpline wheel/hub/shaft representative unit|Flat-torus finite-wheel gap bracket|Complete bank/support assembly, force law, material and load evidence|
|2025 CORAL|Pinned direct-hex wheel, clocked shaft and spacer representative unit|Restricted fixed-X tube upper-exterior finite-wheel gap|Complete bank/support assembly, bore/end-face/angular model, material and loads|
|2026 FUEL|42-instance bank pair classification via38 native local-frame operations plus explicit equivalences; separate local housing study|Exact ideal sphere/finite-cylinder geometric gaps|Combined fastened housing/drive, thread engagement/end float, material, loads and dynamic calibration|

Start with `shaft-sleeve-audit.md` and `profiled-wheel-candidates.md`. Those are original research hypotheses, not a procurement-approved BOM. Later native evidence is in `native-wheel-stack.md`, `native-accessory-stack.md`, `native-support-stack.md`, `season-units-and-housing.md` and `combined-bank-native.md`. The earlier30mm FUEL pitch and stock spacer/button-head combinations must not be promoted after the later native interference findings.

The contact redesign is documented in `segmented-season-contact.md`. The raw-stock machining route and unfilled tolerance/load gates are in `custom-spacer-research.md`. Force, friction and material calibration remain unset; prior continuous-sleeve validation cannot fill those gates.

Native scripts require existing OCP and network access to exact public manufacturer STEP URLs. They hash-check temporary assets and retain numeric evidence only. Python tests that read receipts explicitly do not count as fresh native replays. Ordinary `npm test` covers the integrated interface/candidate contracts; it does not execute native CAD, physical dynamics or season compliance validation.

Next defensible work: complete constrained fastening/drive geometry and source reconciliation, then define an explicitly uncalibrated dynamic sensitivity experiment or supply calibration evidence before any physical performance claim. No fabrication, strength, capture, scoring or engineering acceptance is established by zero nominal common volumes.

## Prescribed geometry/IO milestone

`segmented-contact-replay.md` now records a runnable three-season, six-trace prescribed-motion experiment through the existing WPILib simulated IO controller. It preserves uncertain NOTE proximity and unsupported CORAL end crossings rather than inventing contact. This adds time-varying geometry/control integration evidence, not force-coupled dynamics or calibration. Beam completion in the nominal no-confirmed-contact control explicitly prevents interpreting replay completion as physical transport.

## Assumption-bounded tangential force experiment

See [segmented-force-sensitivity.md](segmented-force-sensitivity.md). All three
season envelopes now gate a two-coordinate force-coupled sensitivity model with
external aggregate normal load. Motion is caused by its ideal drive and contact
impulses, not prescribed positions. This does not close normal mechanics,
calibration, actual motor topology, controller integration or mechanical
acceptance. The separately validated prescribed WPILib IO replay remains distinct.

## Controller-coupled hypothetical entry experiment

[Segmented entry coupling](segmented-entry-coupling.md) now uses actual simulated
controller IO in feedback with a reduced tangential plant for all three seasons.
A declared initial feeder velocity resolves the clear-beam startup handoff without
changing fault guards. The fixed-pose CORAL partial-end overlap predicate is now
covered. This does not resolve actual feeder design, normal/contact mechanics,
physical drive topology, calibration or acceptance.

## Post-completion and sensitivity screen

[Stopping sensitivity](segmented-stop-sensitivity.md) now covers42 native
controller/plant scenarios across timestep, feeder speed, approach resistance and
hypothetical post-completion stopping resistance. Logical beam completion is
explicitly separate from capture. The nominal-case stopping screen fails at other
feeder speeds; no physical brake/retention mechanism or acceptance is established.

## Provisional downstream capture topology screen

[Capture topology study](capture-topology-study.md) compares open exit, a viscous
pinch surrogate and a guided compliant cradle under an explicit provisional
position/dwell/disturbance criterion. The cradle model passes its linear-subsystem
screen, with an independent analytic bound, but physical attachment, unilateral
contact, upstream isolation and release remain unresolved. This independent
subsystem result is not an integrated robot or hardware acceptance claim.

## Unilateral catcher and native interface envelopes

[Unilateral catcher interfaces](unilateral-catcher-interfaces.md) replace ideal
bilateral attachment with force-limited bumper/gate contacts and explicitly test
closure delay and local release. A retractable damping-pad hypothesis improves
the provisional screen; its normal load/friction and actuators remain unverified.
Original native guide/gate/pad envelope layouts establish nominal downstream
clearances, not a constrained assembly or complete controller-to-catcher run.

## Continuous world-coordinate handoff

[World catcher handoff](world-catcher-handoff.md) now keeps piece/rotor state through
intake, downstream transport, guarded catcher closure, provisional hold and local
release using actual simulated controller IO. Nine positive and21 negative
trajectories execute with fresh runtime-bound evidence. This removes the previous
position/velocity reset boundary but does not validate real gate motion, actuator
loads, sensors, friction, structure or calibrated hardware acceptance.

## Swept-envelope and uncertainty limits

[Catcher uncertainty](catcher-sweep-uncertainty.md) adds30 native pose/swept-envelope
screens and90 native sensor observations. Rotated CORAL and pitched/offset pieces
provide concrete counterexamples to transferring nominal gate/pad assumptions.
Post-HOLD gate-feedback loss now faults explicitly, with a failing-then-passing
regression and freshly regenerated original world evidence. These are bounded
screens, not coupled6DOF contact or real actuator validation.

## Conditional pose contract and interval-certified closure

[Pose/time closure](pose-time-closure.md) adds conservative gate/guide permission
bounds and18 native moving-piece/gate trajectories. Four collision witnesses
preserve the earlier limitations;14 paths have inter-sample2mm distance proofs
under prescribed rigid motion. Nine pad strokes still show contact gaps or
required compression. The contract is not yet controller input from actual
sensing and does not qualify capture, preload or hardware.

## Bounded virtual supervisor

See [protocol integration](bounded-virtual-supervisor.md) for the opt-in HAL adapter: bounded pose/age clearance permission plus independent bilateral pad-contact/load validity before and throughout HOLD. Thirty-three protocol paths and 30 formula vectors are not continuous-world capture validation. No real sensors, calibrated loads or hardware safety claims. Existing world controller and receipts are unchanged.

## Staged continuous-world supervision

See [staged world integration](staged-world-supervision.md): conditional virtual pose and separate pad-travel/load observations now gate the continuous three-season approach/hold/release model. Stuck-high pad evidence still causes false HOLD, and missed updates leave closure commanded until a later fault. These are preserved counterexamples, not hardware safety or calibration claims.

## Virtual diagnostics and command lease

See [diagnostics and fault-output study](virtual-diagnostics-watchdog.md): separate virtual analog readbacks reject single-channel pad contradictions, but coordinated false readings still authorize false HOLD. An independently ticked command lease changes applied outputs during controller silence; alternative zero-output mechanical mappings produce different outcomes, including window escape. No real hardware safety guarantee.
