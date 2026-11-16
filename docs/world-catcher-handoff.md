# Continuous world-coordinate intake/catcher handoff

This closes the previous reset-to-catcher boundary. `WorldCatcherHandoffTest`
integrates one piece position from X=-250 mm through the original intake and
onward to the proposed catcher station at X=400 mm. Rotor velocity and remaining
upstream contact are retained after the original beam-completion event. The piece
is not teleported, reinitialized or assigned a new downstream velocity.

The original `SeasonRollerController` remains unchanged. A separate offline
`CatcherHandoffController` observes actual WPILib simulated digital inputs and
issues a **normalized logical actuator-command protocol** through simulated PWM.
This is not motor wiring, a servo calibration, deployable robot firmware or a
selected actuator. Both controllers and the continuous plant run in the same
native test. The new controller rejects real-hardware execution before allocating
its IO.

## Arrival, tail clearance, closure and release

Two additional ideal transverse beams are defined relative to the reviewed native
envelope geometry:

- Arrival plane:5 mm before the nominal front bumper face.
- Tail-clear plane:2 mm beyond the closed rear gate's downstream face.

NOTE requires two tail-beam pulses before clearance can be trusted; its central
hole is not treated as proof that the entire piece has passed. CORAL/FUEL require
one. The controller starts only with clear beams, closes only after arrival and
the expected tail sequence, waits for gate-closed feedback, holds, and opens only
after a release request plus rear-unloaded feedback. Missing/inconsistent feedback
or timeout produces a fault, not a successful capture/release.

The simulated actuator completes closure/opening after an assumed20 ms and only
when the independent geometric/unloaded guards allow it. The negative test uses
500 ms closing lag. Gate movement is still a delayed state transition, not a swept
solid, linkage or actuator-force simulation. Gate-closed and unloaded feedback are
ideal virtual signals, not selected physical sensors. DIO/PWM channel assignments
are test protocol choices, not a wiring recommendation.

Fault behavior retains the requested closure if it was already commanded. That
is an explicit model policy; it is **not** a claim about power-loss safety,
zero-output behavior, mechanical latching or a real actuator's safe state. Test
runs terminate on fault and do not imply the physical piece instantly stops.

## Continuous physics and evidence

The plant uses the existing hypothetical piece mass0.5 kg, equivalent rotor
mass0.25 kg, scalar5 N/duty drive,10 N aggregate normal load and friction0.5.
The unilateral bumper/gate/side-damping model is ported to Java and checked against
18 independent Python solver vectors, including contact onset, saturation,
separation and rear-contact cases. Contact impulse, spring potential, projected
damping, rotor energy, motor work and external disturbance/release work are all
included in the modeled energy ledger.

Control updates every20 ms; the plant steps at2 ms. The initial feeder momentum
still comes from an explicit0.1/0.2/0.4 m/s boundary condition. No powered feeder,
floor/guide resistance, yaw, normal deformation, battery or thermal dynamics is
invented. The previously verified nominal native interface envelopes are pinned.
While the gate is closed, the full game-piece trailing extent remains separated
from the upstream ideal wheel X envelope. This does not verify actual chassis,
housing, transmission or moving gate clearance.

A0.2 Ns disturbance occurs one second after catcher arrival. The same provisional
50 mm position and0.01 m/s dwell criterion is evaluated relative to that arrival.
Release is requested after two seconds; a backward0.2 Ns external push is allowed
only after the gate reports open. The run ends after50 mm local rear clearance,
while still downstream of the original intake. Full reverse transport and a
physical release actuator are not claimed.

## Executed scenarios

Seven native tests execute30 world trajectories plus the18 solver-vector checks:

- Nine positive runs: three seasons × three initial feeder speeds. All complete
  intake, satisfy the provisional capture screen and clear the local rear release.
- Missing arrival or tail signal: six runs fault without reporting capture.
- Missing gate-closed feedback or excessive gate delay: six runs fault.
- Rear-unloaded indication withheld: three runs do not release and fault.
- No initial approach momentum: three runs remain outside contact and fault.
- Catcher disabled: three runs cannot report capture/release.

The loaded-indication negative test simulates a sensor reporting load; it does not
claim to have tested a physical loaded actuator. NOTE's pulse counter also sees
the expected extra reverse pulse on local release. Numerical ledger residuals are
small, but energy bookkeeping is not contact calibration or mechanical acceptance.

## Reproduction and remaining work

`python -B scripts/run-world-catcher.py --output <new-directory>
--java-home <existing-jdk> --gradle-home <existing-cache>` performs a fresh offline
run. A unique runtime token, five runtime class hashes, unchanged code/golden data
and interface pins, XML and log are checked before the evidence directory is
published atomically. The compact receipt is `case-studies/world-catcher-handoff.json`.
`test-world-catcher.py` verifies pins, positive/negative outcomes and golden-vector
regeneration. No physical robot IO was executed.

Remaining gates: swept closure/entry geometry and real gate/pad actuation;
position/orientation uncertainty and sensor faults beyond these cases; physical
normal/preload/friction/drive calibration; support, structural and thermal loads;
release/capture requirements approved for the intended robot. This is now a
continuous, falsifiable **uncalibrated simulation prototype**, not hardware ready
for procurement, deployment or engineering acceptance.
