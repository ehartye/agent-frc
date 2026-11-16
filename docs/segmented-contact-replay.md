# Segmented-contact prescribed-motion replay through WPILib IO

This bounded experiment advances the three season prototypes from static geometry probes to time-varying geometry and actual simulated encoder/beam/PWM controller interaction. It does NOT integrate a contact force law. Motion is prescribed, not caused by the controller or the indicated contacts.

Run with an existing Java17 and populated Gradle cache:

```text
python -B scripts/run-segmented-replay.py --output examples/java-2026-sim/build/segmented-replay-new --java-home <existing-jdk> --gradle-home <existing-cache>
```

The output directory must not exist. The runner uses the pinned offline Gradle project; it installs nothing and has no robot deployment target. It verifies six Python checks, five executed Java checks, input/output hashes, geometry evidence, and actual compiled controller/test class hashes. The repository receipt `case-studies/segmented-replay-execution.json` records one successful run; it is not automatically a fresh replay on another machine.

## What is exercised

Six traces cover2024 NOTE,2025 CORAL and2026 FUEL, each at the old nominal height and an original5mm-lowered-wheel hypothesis.160 ticks at20ms prescribe translation from X=-250mm to386mm at0.2m/s. Height, orientation and lateral position are externally fixed. Wheel envelopes and gamepiece dimensions are checked against pinned prior numeric evidence; the runner does not re-download CAD or re-review game manuals.

NOTE uses720 samples around the ideal torus center circle, with a conservative distance error bound. It preserves the hole. CORAL supports full-width upper-exterior contact and definite separation by feed-axis bounds; partial end crossings remain unknown. FUEL uses ideal sphere-to-finite-cylinder distance. Cylindrical wheel envelopes can overpredict real tread contact, and overlap is not a force or accepted material compression.

The existing offline `SeasonRollerController` receives independently prescribed complementary top/bottom encoder counts and ideal shape-derived beam signals through WPILib HAL simulation. This is a generic two-encoder/two-PWM protocol test adapter, not evidence that a second physical roller bank was designed. Motor outputs are logged but do not drive the prescribed motion. Tests cover expected NOTE two-pulse and CORAL/FUEL one-pulse sequences, missing beam, reversed encoder sign, and disabled PWM output. Disabled outputs do not stop the prescribed trajectory; logical controller state is not physical retention.

## Observed scope

All nominal traces have zero confirmed envelope-overlap ticks. The lowered-height traces have90 NOTE,62 CORAL and16 FUEL overlap ticks out of160. NOTE nominal has54 unresolved near-tangent samples at the selected angular bound; CORAL has26 unsupported partial-end samples in each variant. Unknown is not silently counted as separation or contact.

Both nominal and lowered-height beam sequences complete under prescribed motion. That negative control is essential: completion without confirmed overlap demonstrates that this replay does not establish contact-driven transport. No capture, scoring or grip outcome is claimed.

A subsequent force-coupled study still needs a declared local/aggregate load-sharing model, mass/inertia, stiffness/damping/friction and force/energy accounting. Measured calibration or explicitly labeled sensitivity assumptions are required before interpreting motion as physical performance. Source hardness/material conflicts and mechanical assembly gates remain open. Prior continuous-sleeve contact validity is not reused.
