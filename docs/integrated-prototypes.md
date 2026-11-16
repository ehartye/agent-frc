# Runnable three-season pregrip prototypes

Run from PowerShell with an existing JDK17 and populated WPILib2026.2.1 Gradle cache selected in `JAVA_HOME` and `GRADLE_USER_HOME`:

```powershell
./scripts/run-prototype.ps1
```

The command runs offline and writes a fresh execution receipt plus `targets.json` in a new ignored build directory. It does not install software, deploy robot code or change the tracked baseline. The `frc-java` skill points to this entry point.

## What is connected

An initially retained body → prescribed nip closure → fresh two-sided virtual contact dwell → virtual gate opening feedback → two actual WPILib NEO motor models sharing battery sag → constrained guide translation → actual exit speed/time → season-specific local target flight. There is no injected feed velocity or release impulse; the rollers and body start stopped. Energy accounting includes motor work, rotor/body kinetic energy, gravity and slip loss. 100/50 microsecond steps are compared.

The prototype has eight baseline scenarios: NOTE and FUEL at 9/12 V, and both sourced CORAL mass boundaries at 9/12 V. No old side-pad capture dynamics are reused. This is a usable retained-body-to-target subassembly simulation, not a complete driving/intake/field robot or a claim of physical calibration.

## Explicit simulation design inputs

- Ideal rigid guide/rail attachments; separately mounted straight guide at 50° NOTE, 0° CORAL, 60° FUEL. Prior floor-resting CAD clearance does not automatically transfer to this mounting.
- Prescribed 60 mm nip travel in 0.35 s, 15 N normal force per side, friction coefficient 0.8, inertia 0.004 kg m² per roller. These are informed working hypotheses, not measured component specifications.
- Guide lengths 0.3/0.15/0.3 m; roller radii 0.0508/0.0254/0.0381 m; duty 0.6/0.08/0.6. Body mass NOTE0.235 kg/FUEL0.215 kg, CORAL0.498951607–0.816466266 kg.
- Ideal valid pose/support observations, 60 ms gate response and nominal downstream exit feedback. These are virtual model outputs, not real sensor assurance.
- Existing explicit target-frame hypotheses, including 0.7 m NOTE/FUEL exit height. No installed registration or official score is inferred.

## Current result and next design iteration

All eight baseline cases reach the modeled guide exit. NOTE exits at 2.48–2.91 m/s, FUEL at 2.17–2.54 m/s, CORAL at 0.432–0.518 m/s. NOTE/FUEL do **not** reach their elevated target planes at the current mounting assumption. This is a useful design failure, not a reason to stop simulation: stopped rollers spend the short stroke accelerating their own inertia. The next architecture should test independently spun launch wheels with a controlled feed handoff, or explicitly compare longer guides/lower rotor inertia, without resetting body velocity or hiding energy.

Missing contact, missing gate-open feedback, closure too slow for the dwell deadline and post-release grip loss remain negative controls. A fault terminates this run with potentially nonzero rotor speed; it does not establish physical safe stopping. The earlier single-block rail escape, collar collision and moving-FUEL no-contact counterexamples remain retained in their reports.

Native rail mating supports the geometric design choice, but ideal joints are used for this simulation. Preload, actual attachment stiffness, actuator response and contact calibration can improve fidelity later without blocking this exploratory prototype.

The mirrored block and correct fastener layout is recorded in [the fastened-pair study](maxlift-fastened-pair.md). Its ideal rigid-joint simulation contract supports this model's attachment assumption; native clearance and thread proxies are not translated into calibrated stiffness or force limits.
