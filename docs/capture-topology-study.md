# Provisional feeder/drive/catcher topology comparison

This is a **separate downstream subsystem study**, initialized from the27 entry
speeds recorded by the reviewed controller-coupled stopping experiment. It is not
a new integrated robot simulation and does not inherit a capture claim from the
upstream beam-completion event. The piece's position is reset to a catcher datum;
rotor energy, spatial alignment, handoff collision and continuing upstream contact
are not transferred. Mechanical isolation at handoff is an unresolved requirement.

## Explicit candidate chains

| Candidate | Feeder and drive interface | Downstream model |
|---|---|---|
| A: open exit | External approach momentum; existing equivalent PWM roller bank | No catcher force |
| B: damped pinch | Same upstream chain; mechanically isolated downstream opposed-roller/grip concept | Linear velocity resistance, c=20 Ns/m; no elastic centering |
| C: guided compliant cradle | Same upstream chain; mechanical guide/attachment keeps piece coupled after engagement | Bilateral spring-damper, k=200 N/m and c=20 Ns/m |

B is not a characterized roller/brake or a static grip. C requires an actual guide,
attachment or latch to transmit both force directions, prevent release and supply
the assumed travel. Neither is a sourced or accepted mechanism. Coefficients are
hypothetical comparison inputs, not spring selections, brake ratings or component
specifications. All three initially receive the recorded piece speed, with a
hypothetical0.5 kg mass and no engagement delay. CandidateC is initially unstrained;
there is no hidden spring-preload energy.

A separate feeder-only work screen uses the common250 mm start-to-axis approach
span, not the actual first-contact location. Against assumed constant0.1 N
resistance, it requires0.025 J;0.2 m/s initial motion at0.5 kg supplies0.010 J.
Without roller assistance, another0.015 J is needed to cover that span. The ideal
initial-speed alternative is0.316 m/s. This is a boundary-condition calculation,
not a powered-feeder sizing result. An actual powered feeder must also establish
contact, limit force and disengage appropriately.

## Falsifiable provisional capture criterion

The owner has not approved this as an engineering requirement. It is a common,
explicit test for comparing options:

1. Sampled absolute displacement stays within50 mm of the engagement datum for2 s.
2. Speed remains below0.01 m/s throughout0.75–1.00 s.
3. Apply a positive0.2 Ns disturbance at1.00 s; speed must again remain below0.01 m/s
   throughout1.75–2.00 s, without violating the displacement window.

The disturbance is experimental, not a measured field impact. A force/speed limit,
structural check, release mechanism, energy/thermal capacity, arbitrary disturbance
or long-duration retention is not established by passing these clauses.

## Results and sensitivities

Each topology runs all27 upstream states at2,1 and0.5 ms steps (243 simulations).
Additional coefficient and disturbance screens add36 and12 cases.

- Open exit:0/81 pass.
- Damped pinch surrogate:63/81 pass. The highest-speed seeds fail after the
  disturbance: without centering, the asymptotic displacement is
  `(m*v_initial + impulse)/c`, about54.0 mm for the worst seed.
- Guided compliant cradle:81/81 pass the provisional screen under its exact
  linear/bilateral assumptions. This makes it a useful **next geometry/interface
  candidate to investigate**, not a selected hardware solution.

The coefficient screen uses k=100/200/400 N/m and c=5/10/20/40 Ns/m at the worst
seed. Several lower-damping combinations fail even when other combinations pass.
Increasing damping also raises modeled reaction peaks; those peaks must not be
used as component ratings without physical validation. Disturbance tests at
0/0.1/0.2/0.4 Ns show the viscous-only model losing the screen as impulse increases.
The candidate cradle passes those sampled disturbance cases, but this does not
establish an unlimited impact envelope.

## Independent analytic checks and energy accounting

The solver is implicit midpoint for `m*x'' + c*x' + k*x = 0`. Its discrete
quadratic mechanical-energy change equals negative `c*dt*v_mid^2`. Disturbance
work is added explicitly from the kinetic-energy jump. Tests check passive energy
accounting, free flight, the viscous asymptote and invalid inputs.

For the particular cradle k=200,c=20,m=0.5, the system is critically damped with
omega=20/s. Its displacement response is `v_initial*t*exp(-20*t)` plus the delayed
impulse response. A continuous-time triangle bound for the worst seed and0.2 Ns
impulse is39.728 mm. Analytic speed bounds during the two dwell windows are below
0.01 m/s. These bounds independently support the provisional criterion **only for
that exact unsaturated, bilateral linear subsystem**. They do not validate a real
cradle, delayed engagement, other parameter combinations or the missing handoff.

## Reproduce and remaining work

Run `python -B scripts/capture-topology-study.py --output <new-json-path>` and
`python -B scripts/test-capture-topologies.py`. The committed receipt pins its
source and upstream execution receipt; it records all cases, coefficient and
disturbance sweeps, analytic bound and explicit limitations.

The next useful work is a physically explicit cradle/guide and release concept,
including how it isolates from the spinning upstream roller and enters without
an idealized instantaneous bilateral attachment. Compare that geometry against
the three game pieces, then introduce unilateral contact, saturation, travel,
engagement delay and measured mass/load/friction data. Until those interfaces are
resolved, this remains a promising mathematical subsystem, not a simulation-ready
complete mechanism or procurement recommendation.
