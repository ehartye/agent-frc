# Source-sized FUEL against a hypothetical plane

This is a standalone numerical component foundation, not a new robot IO, intake, capture, scoring or official field-mesh simulation. No robot or roller geometry is included. In particular, the existing opposed roller nip is not silently relabeled as a ground pickup. The local infinite rigid plane at Z=0 is an explicit experiment definition, not a CAD registration, carpet measurement or verified field surface.

## Source versus assumptions

The source is the reviewed 2026 TU22 manual section5.10.1, pages32-33, SHA256 `5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139`. The model uses the displayed150mm metric nominal diameter, not the150.114mm conversion of the rounded5.91in alternative. The source mass range is0.20320938176 to0.226796185kg; the experiment explicitly chooses its midpoint. The runner checks exact cached PDF bytes against that pin and curated source/config facts. It does not automatically interpret PDF geometry or establish authenticity by hash alone.

Uniform solid-sphere inertia I=2/5*m*r^2 is an assumed mass distribution, not a measured FUEL interior. The infinite plane, gravity9.80665m/s2, friction coefficient0.2, perfectly inelastic normal law and initial conditions are separately declared hypotheses. Actual foam bounce, deformation, carpet stiffness/damping/roughness, rolling resistance and calibration remain unsupported. No normal preload is inferred from tangency. Gravity creates a support reaction only when the mathematical unilateral constraint is active.

## Equations and event boundaries

State is (x,z,vx,vz,omegaY). Bottom tangential slip is vx-r*omega. Free flight uses exact constant-gravity kinematics. A stable quadratic finds first sphere-plane contact, splitting the step there. Touching with positive vertical velocity departs and returns; negative vertical velocity impacts immediately; zero vertical velocity supports. Initial penetration is rejected rather than repaired. Normal restitution is explicitly zero, so impact removes normal velocity with impulse -m*vz; this is not a prediction of real FUEL bounce.

Tangential impulse is the unconstrained slip-stopping value clipped by mu times normal impulse. Updating vx by p/m and omega by -r*p/I preserves the signed angular impulse relation. At resting contact, support is mg; Coulomb sliding is integrated exactly until slip reaches zero, then motion rolls without loss. Zero friction with nonzero slip remains sliding, not falsely rolling. No repeated zero-time restitution loop or artificial vertical creep is introduced. The event-time comparison tolerates only1e-12seconds of floating-point boundary error.

Every step audits linear/normal/angular impulses and total kinetic plus gravitational potential energy against nonnegative modeled impact/friction loss. The energy loss is not a temperature prediction. A synthetic hand vector uses0.2kg,75mm radius,initial horizontal1m/s and zero spin with mu0.2: final rolling speed5/7m/s, angular speed200/21rad/s, slip duration0.145673744711s and dissipated energy1/35J. This mathematical test mass is separate from the source-bound FUEL experiment.

## Reproduction and evidence

Run `python scripts/run-fuel-plane.py --output NEW_DIRECTORY --manual REVIEWED_CACHED_MANUAL --java-home EXISTING_JDK17 --gradle-home EXISTING_OFFLINE_CACHE`. It requires three fail-closed Python contract checks and eight Java model tests with no failures/errors/skips. The opt-in `fuelPlaneTest` task is excluded from ordinary tests. Retained evidence pins source/config/manual/class bytes, actual dependency manifest, input, reports and trajectory. Missing or changed source, unknown assumptions, failed tests and optimization-removable gates cannot become success.

Tests cover both slip signs, impact and support, upward departure, immediate downward contact, zero friction, no penetration/creep, event/rolling-transition subdivision and source-bound1ms versus0.5ms trajectories. Separate position, velocity and angular-speed differences each must stay below1e-9 in their stated SI units for this semianalytic development check. This is numerical consistency, not physical tolerance or calibration.

All five-domain engineering acceptance remains blocked. Voltage/robot control is not run by this component, heat and robot weight distribution remain unsupported, friction is assumed and physical validity is uncalibrated. Contact or rest is neither capture/possession nor a scoring event. The previous three-season moving IO prototype remains a separate bounded experiment until this component is explicitly composed and independently reviewed.
