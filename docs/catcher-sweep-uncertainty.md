# Catcher swept envelopes, pose uncertainty and sensor faults

This investigation separates two bounded studies: native3D static-pose swept-volume
screens, and axis-aligned world-coordinate sensor uncertainty tests. It does **not**
claim a coupled6DOF, deformable-body or time-resolved gate collision simulation.

## Gate/pad strokes and pose counterexamples

`native-catcher-sweep.py` constructs exact box unions for the prescribed straight
vertical gate stroke and lateral pad strokes. Those conservative swept volumes
are tested against30 rigid game-piece poses: nominal, near-tail closure, yaw,
pitch, lateral offsets and a combined perturbation across the three seasons.
Poses are raised to ideal floor tangency; gravity and guide contact do not determine
the pose dynamically. Offsets/angles are experiment choices, not measured tolerances.

Nominal poses have zero intersection with the tested swept volumes and guides.
Positive overlap means possible obstruction or required material compression, not
proof that collision occurs at the same instant in a moving system. Zero overlap
certifies separation only for the tested static pose throughout that ideal stroke.

Important counterexamples:

- **CORAL at3 degrees yaw and-17.9 mm feed offset** remains clear of both side
  guides, and the nominal1D gate guard would allow closing. Nevertheless its
  rigid tube intersects the gate swept envelope by147.56 mm³. The nominal pose
  model is not a conservative closure check for this rotated geometry. Real
  orientation-aware beam occupancy or other pose evidence could inhibit closing;
  the current axis-aligned sensor model does not establish that protection.
- At5 degrees yaw the tested CORAL also interferes with the current guides.
  The guide geometry cannot simply be assumed to maintain the modeled pose without
  contact/deformation analysis.
- **NOTE pitched10 degrees** has about2.106 mm clearance to each nominal closed
  side pad. The assumed continuous damping contact is therefore not established.
- A5 mm lateral shift creates a5 mm gap on one pad side and swept-pad intrusion on
  the other for all three pieces. Actual pad preload/compliance and friction cannot
  be inferred from the nominal tangency layout.

These results falsify transfer of the nominal capture result to all nearby poses.
They do not establish a manufacturing tolerance or an allowed operating envelope.

## Sensor placement and observation latency

`CatcherSensorUncertaintyTest` keeps the dynamic piece axis-aligned and varies:

- Arrival-beam placement by-20/0/+20 mm.
- Tail-beam placement independently by-20/0/+20 mm.
- Shared observation latency0/20/100 ms.

At fixed external0.2 m/s feeder speed, the81 distinct combinations produce63
provisional capture/release outcomes and18 faults. Three additional nominal
controls pass. These are deterministic hypothetical cases, **not** a statistical
reliability estimate or proof that the mechanism tolerates those placement errors.
All simulated gate motion, force, damping and sensor assumptions remain explicit.

A spurious early tail pulse is also injected for each season. Exact expected pulse
counting rejects closure rather than treating the extra pulse as clearance.

## Corrected post-HOLD feedback loss

Independent review requested coverage after the gate had already reported closed.
The added native regression first failed against the previous controller: loss of
closed feedback during HOLD was ignored, and it still proceeded to release.

`CatcherHandoffController` now transitions from HOLD to FAULT when closed feedback
is lost. The three season tests verify that HOLD was actually entered before the
fault, then require no accepted capture or local release. Fault retains an earlier
closure request as defined by the logical protocol; this is not proof that a real
gate remains closed or that power-loss behavior is safe. The original30 world
trajectories were freshly rerun and their source/runtime-bound receipt regenerated
for the changed controller. No old passing XML was relabeled.

The new fresh-run receipt contains four native tests and90 observations:81 matrix
cases, three nominal controls, three post-HOLD feedback losses and three spurious
pulse cases. The native geometry receipt independently records all30 poses and
CAD runtime/source pins. Python checks verify source pins, counts, counterexamples
and fault outcomes.

## Reproduce and next engineering work

- `native-catcher-sweep.py --output <new-json-path>` executes the native geometry.
- `run-catcher-uncertainty.py --output <new-directory> --java-home <existing-jdk>
  --gradle-home <existing-cache>` executes fresh offline sensor tests with runtime
  token/class binding and atomic evidence publication.
- `python -B scripts/test-catcher-uncertainty.py` checks the committed evidence.

Next: revise the gate/guide/pad geometry or define an observed pose-validity gate;
model beam occupancy and swept closure with moving, rotated pieces; establish
pad preload/contact over that envelope; then select/characterize actuation and
feedback. The nominal continuous simulation remains useful, but neither these
screens nor the feedback fix supply physical calibration, structural acceptance
or permission to deploy hardware.
