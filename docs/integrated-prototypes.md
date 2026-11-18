# Runnable three-season pregrip prototypes

Run from PowerShell with an existing JDK17 and populated WPILib2026.2.1 Gradle cache selected in `JAVA_HOME` and `GRADLE_USER_HOME`:

```powershell
./scripts/run-prototype.ps1
```

The command runs offline and writes a fresh execution receipt plus `targets.json` in a new ignored build directory. It does not install software, deploy robot code or change the tracked baseline. The `frc-java` skill points to this entry point.

## What is connected

An initially retained body â†’ prescribed nip closure â†’ fresh two-sided virtual contact dwell â†’ virtual gate opening feedback â†’ two actual WPILib NEO motor models sharing battery sag â†’ constrained guide translation â†’ actual exit speed/time â†’ season-specific local target flight. There is no injected feed velocity or release impulse; the rollers and body start stopped. Energy accounting includes motor work, rotor/body kinetic energy, gravity and slip loss. 100/50 microsecond steps are compared.

The prototype has eight heavy-inertia baseline scenarios, plus 24 lower-inertia sensitivity cases (32 total): NOTE and FUEL at 9/12 V, and both sourced CORAL mass boundaries at 9/12 V. The supervisor’s validated configured duty is delivered to the plant only after motion-enable and gate feedback authorization. Zero-demand and changed-demand regressions verify that this is not merely a state check. No old side-pad capture dynamics are reused. This is a usable retained-body-to-target subassembly simulation, not a complete driving/intake/field robot or a claim of physical calibration.

## Explicit simulation design inputs

- Ideal rigid guide/rail attachments; separately mounted straight guide at 50Â° NOTE, 0Â° CORAL, 60Â° FUEL. Prior floor-resting CAD clearance does not automatically transfer to this mounting.
- Prescribed 60 mm nip travel in 0.35 s, 15 N normal force per side, friction coefficient 0.8, inertia 0.004 kg mÂ² per roller. These are informed working hypotheses, not measured component specifications.
- Guide lengths 0.3/0.15/0.3 m; roller radii 0.0508/0.0254/0.0381 m; duty 0.6/0.08/0.6. Body mass NOTE0.235 kg/FUEL0.215 kg, CORAL0.498951607â€“0.816466266 kg.
- Ideal valid pose/support observations, 60 ms gate response and nominal downstream exit feedback. These are virtual model outputs, not real sensor assurance.
- Existing explicit target-frame hypotheses, including 0.7 m NOTE/FUEL exit height. No installed registration or official score is inferred.

## Current result and next design iteration

All 32 cases reach the modeled guide exit. NOTE exits at 2.48â€“2.91 m/s, FUEL at 2.17â€“2.54 m/s, CORAL at 0.432â€“0.518 m/s. NOTE/FUEL do **not** reach their elevated target planes at the current mounting assumption. This is a useful design failure, not a reason to stop simulation: stopped rollers spend the short stroke accelerating their own inertia. The first informed improvement compares lower single-roller inertia without changing body velocity or hiding energy. At 12 V, FUEL with 0.0005 kg m² reaches 5.748 m/s and passes one conditional whole-sphere thin-plane projection; NOTE with 0.0003 reaches 7.071 m/s and passes one center-plane projection. These are different fidelity claims: NOTE whole-body passage and all official scoring remain unknown. Higher exit speed can overshoot a fixed aim point, so target placement is a design input, not an automatic success.

Missing contact, missing gate-open feedback, closure too slow for the dwell deadline and post-release grip loss remain negative controls. A fault terminates this run with potentially nonzero rotor speed; it does not establish physical safe stopping. The earlier single-block rail escape, collar collision and moving-FUEL no-contact counterexamples remain retained in their reports.

Native rail mating supports the geometric design choice, but ideal joints are used for this simulation. Preload, actual attachment stiffness, actuator response and contact calibration can improve fidelity later without blocking this exploratory prototype.

The mirrored block and correct fastener layout is recorded in [the fastened-pair study](maxlift-fastened-pair.md). Its ideal rigid-joint simulation contract supports this model's attachment assumption; native clearance and thread proxies are not translated into calibrated stiffness or force limits.

## Physically informed inertia inputs

[REV wheel masses](https://www.revrobotics.com/ION-Compliant-Wheels/) are 128/18/84 g for the selected NOTE/CORAL/FUEL families. Nominal outer-ring inertias are 0.000330322/0.000011613/0.000121935 kg m². A disk distribution is a hypothesis, not a lower bound. The [NEO V1.1](https://www.revrobotics.com/rev-21-1650/) complete 425 g mass and 60 mm casing bound its contained rotor at 0.0003825 kg m² if all motor mass is placed at the casing radius. Direct drive G=1 is explicit; other gearing would reflect rotor inertia by G².

NOTE wheel, hub/collar ring estimates, shaft envelope and this complete-motor bound total about 0.0007234 kg m², leaving about 0.0002766 under the 0.001 model ceiling for unspecified rotating hardware. This is conditional on that allowance, not an unconditional assembly upper bound. The 0.0003/0.0005 points are working hypotheses; actual mass distribution and rotor/accessory inertia remain unmeasured. Exact snapshot pins and arithmetic are in `case-studies/direct-drive-inertia-inputs.json`.

The zero-demand regression ends at the authorization boundary without energizing the motor model. It checks command routing, not gravity-driven drift, retention or safe behavior after an open gate. Demand is configured per run; continuous mid-run duty changes are not modeled by this constant-demand plant.

## Finite-body target iteration

The same command now also writes `note-body.json` and `coral-placement.json`, both bound to that run's fresh receipt and target report. [NOTE full-extent analysis](note-prototype-body.md) rejects all original center-only candidates and finds one bounded aim/attitude hypothesis with 20.9 mm nominal whole-torus thin-plane margin. [CORAL placement](coral-placement.md) checks the finite tube on the isolated floor patch and compares explicit axial sliding/friction hypotheses, preserving low-friction and nonaxial failures. Neither output is an official score or a calibrated contact/settling model.

For platform, toolchain/cache prerequisites and the distinction from a clean-machine bootstrap or historical team-code build, see [prototype setup](prototype-setup.md).
