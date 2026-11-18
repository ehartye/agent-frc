# Segmented entry and controller-coupled reduced model

## What now executes

`SegmentedEntryCouplingTest` closes the loop through the unchanged
`SeasonRollerController`, actual WPILib simulated encoders, digital beam and PWM.
The plant integrates one equivalent roller speed and piece translation at 5 ms;
the controller observes resulting motion every 20 ms. PWM changes roller force,
contact impulse changes piece speed, and that motion changes the beam and encoder
inputs. This is no longer a prescribed-trajectory IO replay.

It starts with a clear beam at X=-250 mm and an **externally supplied initial
0.2 m/s approach speed**. This is a declared feeder handoff, not a modeled feeder.
Its initial kinetic energy is accounted for. The controller is initialized before
entry, so CORAL/FUEL are not falsely presented as initially blocked; its original
startup fault remains intact and separately tested. NOTE traverses both annular
beam intervals, retaining the central hole.

The 15 scenarios across three seasons cover nominal handoff, no initial feeder
momentum, missing beam, zero friction, and disabled PWM. The last two deliberately
show why a beam completion or zero PWM does not prove motor-driven transport or a
physical stop: feeder momentum can carry the piece through without friction.
Without approach momentum there is no initial contact and the controller times
out. Missing beam also times out. No safety guard was bypassed.

The entire mechanism is still **not calibrated or mechanically accepted**. A
hypothetical scalar drive of 5 N per unit duty replaces a motor model. Piece mass
0.5 kg, equivalent rotor mass0.25 kg, normal load10 N and friction0.5 are controlled
assumptions, not measured properties. The complementary encoder/PWM adapter does
not establish a physical two-bank drive topology. There is no floor resistance,
normal reaction, rotation, load distribution, deformation, battery or thermal
model. Energy accounting applies only to the two tangential coordinates.

## CORAL partial-end geometry coverage

The new `coral-entry-geometry.py` closes the previous partial-end **overlap
predicate** for the exact fixed pose of the ideal cylinders. It does not return
Euclidean separation, normal penetration, contact normal or force.

Let the tube center be X=x, its half-length L=150.8125 mm, outer radius R=57.15 mm,
and center height zc=R. For a wheel of radius r=25.4 mm, axis height zw=134.7 mm
and lateral interval [yc-h,yc+h], choose

- nearest feasible X to the wheel axis: `a=max(abs(x)-L,0)`;
- nearest feasible Y to the tube axis: `b=max(abs(yc)-h,0)`.

If a>r or b>R there is separation on that axis. Otherwise the lowest wheel point
at feasible X is `zw-sqrt(r*r-a*a)` and the highest tube point at feasible Y is
`zc+sqrt(R*R-b*b)`. These independent coordinates maximize possible vertical
intersection. Their difference is a vertical separation certificate. A strictly
negative difference gives an intersection witness near the outer tube surface.
The wheel center is above the entire tube; therefore the wheel upper surface is
above that witness and the tube bore cannot remove the outer-shell intersection.
The hollow tube is **not replaced by a filled tube for dynamics**. Tangency is not
counted as positive overlap. This proof is restricted to the fixed axes and pose,
not yawed, pitched or rotated CORAL.

For the closest wheel band, b=3.175 mm. The compressed contact interval begins
before the ideal beam interval; the precise intervals and samples are recorded in
`case-studies/coral-entry-geometry.json`. Python tests cover the boundary, symmetry,
nominal separation and agreement with the old fully-spanning predicate. The Java
model uses the same analytic fixed-pose predicate and tests both sides of entry.

NOTE uses its torus/cylinder sampling interval, refined from720 to7200 to72000
angles only when ambiguous. Unresolved intervals throw rather than inventing
contact. FUEL retains the ideal sphere/finite-cylinder predicate. Neither uses
exact tread grooves or calibrated compression.

## Reproduce and next steps

Run `python -B scripts/coral-entry-geometry.py --test` for geometry checks.
Run `python -B scripts/run-segmented-entry.py --output <new-directory>
--java-home <existing-jdk> --gradle-home <existing-cache>` for a fresh offline
native run. The atomic evidence directory contains runtime run identity and
class hashes, XML, log and receipt. Sources and geometry pins must remain unchanged
across execution. `case-studies/segmented-entry-coupling.json` is the compact
committed receipt; source CAD remains external and pinned.

Next: test timestep and feeder-speed sensitivity, introduce explicit external
resistance and stopping/retention requirements, replace the equivalent drive with
the chosen physical topology, and provide measured mass/inertia/friction/normal
load evidence. The entry handoff is a simulation boundary condition, not a feeder
design, nor proof a real mechanism can supply that condition.
