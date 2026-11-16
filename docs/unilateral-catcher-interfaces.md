# Unilateral catcher, gate and release interfaces

The ideal bilateral cradle has been replaced in this experiment by separate
unilateral front-bumper and rear-gate contacts. A second candidate adds retractable
side pads represented by velocity damping. This remains an **independent downstream
subsystem**, not a calibrated complete robot. Existing controller/entry tests and
interrupted work are unchanged.

## Original native envelope layouts

`native-catcher-envelopes.py` executes OpenCascade geometry and Boolean checks for
all three game pieces. It generates original STEP envelope layouts in the ignored
build evidence directory; no vendor CAD is copied into the repository.

The proposed entry center is X=400 mm downstream of the upstream roller axis:

- Two side guides leave nominal10 mm lateral clearance per side.
- A6 mm thick rear gate has its downstream face20 mm behind the initial trailing
  game-piece extent. Its raised lower face is20 mm above piece height.
- The front bumper initially touches the forward game-piece extent, with a
  provisional50 mm travel envelope. Spring mounts and carriage hardware are absent.
- Side pads span140 mm along feed and30 mm vertically, centered at piece midheight.
  They retract10 mm into original guide slots. Closed pads are nominally tangent;
  the2 mm compression variant is only a positive intersection diagnostic, **not**
  a selected preload or a calibrated friction force.

The geometry uses a flat torus for NOTE, hollow finite tube for CORAL and sphere
for FUEL. Native checks confirm nominal piece/guide/gate/pad separation or tangency,
clear raised-gate release at100 mm backward displacement, and positive collision
controls for closed-gate intrusion and inward pad motion. STEP exports are static
envelope compounds, not constrained mechanical assemblies or manufacturing drawings.

At this station, even100 mm backward displacement leaves a positive full-envelope
X gap to the upstream ideal wheel:71.4 mm NOTE,123.7875 mm CORAL,186.9 mm FUEL.
This is an explicit **geometric isolation hypothesis**, not verification against
the actual robot chassis, housing, transmission, or swept game-piece orientations.
The400 mm packaging choice is not an approved robot layout.

## Contact, saturation and control hypotheses

The front bumper uses hypothetical k=200 N/m and c=20 Ns/m. The rear gate contact
uses k=1000 N/m and c=20 Ns/m at a20 mm rear gap. Contact forces act only in the
compressive direction and are capped at10/20/50 N in separate cases. These are
model parameters, not component ratings. The compliant gate/bumper mounting and
required physical travel have not been designed.

The saturated spring force is the derivative of a quadratic-then-linear potential.
A discrete-gradient midpoint solve accounts for its stored energy. Projected
damping is passive. Contact damping and force caps are weighted by the fraction
of a step actually in contact, preventing a spurious whole-step damping impulse
when contact begins at the step endpoint. A regression test reproduces that
boundary case. No tensile attachment is silently restored on rebound.

Gate closure completes at the specified hypothetical delay. Closure is inhibited
unless the trailing piece clears the closed gate face by2 mm. The vertical gate
motion is not simulated; this is a collision guard and delay test, not an actuator
or timing qualification. Release at2 s is allowed only if rear contact is unloaded.
The gate and optional holding pads then open. A backward0.2 Ns external impulse
at2.1 s probes local release. Simulation stops after clearing50 mm rearward; it
does not claim a complete return through the upstream mechanism.

The optional gated damping pocket adds10 Ns/m velocity resistance, capped at2 N,
only while the gate is closed and the piece center is within the140 mm pad span.
It is a dissipative side-pinch surrogate, **not static friction**, a normal-force
calibration or a selected actuator. Its force must ultimately be justified by
pad geometry, compliance, normal preload and measured friction. Nominal tangency
in CAD cannot supply that evidence.

## Falsification and improvement

The same provisional50 mm position,0.01 m/s dwell and0.2 Ns disturbance criterion
is retained. Nine incoming seed states span the three seasons and feeder speeds.
There are45 topology cases plus48 delay/cap/timestep/holding-damping sensitivity
cases.

- Bumper only:0/9 capture passes. The unilateral system rebounds; the ideal
  bilateral cradle's previous result does not transfer.
- Fast rear gate without side damping:0/9. It bounds travel much better, but does
  not meet the settling/disturbance criterion. Keeping a piece in a pocket is not
  the same as satisfying the full capture criterion.
- Delayed gate:0/9; closure is inhibited after rebound places the piece in the
  gate's closing region. It is not allowed to close magically through the piece.
- Force-limited fast gate without side damping:0/9; overtravel is worse for the
  higher-speed seeds.
- Fast gate with retractable damping pads:9/9 pass the provisional capture and
  local release screen under the stated hypotheses. This is a useful mechanism
  concept to develop, not hardware or mechanical acceptance.

All runs account for external disturbance/release-impulse work and check passive
contact energy. Force saturation, contact separation, gate closure guards and
unloaded release are explicit. Source pins, full case results, native CAD runtime
and STEP hashes are retained in the receipts.

## What remains before integration or hardware claims

Incoming velocities still come from upstream completion evidence. Transport from
that event to the proposed400 mm station, including remaining roller contact,
floor/guide resistance and a new catcher-arrival sensor, is **not integrated**.
The isolated catch dynamics must not be presented as a continuous robot run.

Next: integrate the handoff in world coordinates, define the arrival/closure and
release controller, design pad/gate/bumper actuation and support travel, and verify
swept geometry through closure. Then test contact/load/drive parameters against
measured behavior. All force and timing values here remain provisional. No part
selection, procurement, deployment or physical acceptance follows from these tests.

Reproduce with `unilateral-catcher-study.py --output <new-json-path>` and
`native-catcher-envelopes.py --output <new-directory>`; run
`python -B scripts/test-unilateral-catcher.py`. Native originals remain in the
ignored build directory, with safe summary receipts committed in `case-studies`.
