# Separate ideal passive-unload comparison

This experiment preserves the `97b81e5` intake plant, controller and rig unchanged. It does not repair their failed powered reverse release. A separately named plant/controller/rig compares ideal BRAKE and OPEN neutral modes after the same 1.2 s incoming/acquire/dwell prefix, using the same freshly extracted original native fixture and assumed contact laws.

## Interface and source boundary

The controller executes actual WPILib raw encoder, DIO and PWM code. Its additional neutral-mode request is a **simulation-only interface without a REV CAN hardware adapter**. PWM zero is not silently reinterpreted as coast. Commanded and applied mode are separately traced with interval-start/end timestamps (commands belong to the start, sampled states to the end), including explicitly assumed zero- or one-control-tick delay. The controller still updates every 20 ms; there is no hidden substep switching based on plant force, position, back-EMF or exceptions.

[REV's SPARK MAX operating-mode documentation](https://docs.revrobotics.com/brushless/spark-max/operating-modes), inspected 2026-11-16, describes neutral braking as shorting motor wires and coasting as disconnecting them. This supports the conceptual distinction, not the exact electrical boundary, response latency, charging behavior or firmware calibration used here. This code does not execute REVLib's CAN controller simulation. Body-diode conduction, switching transients, inductance, overvoltage clamps, thermal/current limits and real neutral transition timing remain unsupported.

OPEN rejects any nonzero duty. In the declared ideal open-circuit model, armature current, battery current and electromagnetic torque are zero even with nonzero back-EMF. Contact forces and roller inertia remain active. Transitioning mode does not reset velocity, remove spring energy or create an impulse. BRAKE retains the existing zero-duty short-circuit model. Signed driven branches still reject unsupported regeneration. Neither boundary is a claim of hardware-safe stopping.

Disable/fault takes immediate priority in this ideal interface, cancels pending mode changes, commands zero PWM plus BRAKE and latches the fault. This is a defined experiment rule, not measured device behavior. DONE retains the experiment's neutral mode until disabled; closing the offline controller is not a hardware operation.

## Observations versus qualification

Release requests occur only after the sampled nip beam and encoder-speed criteria have been stable. No powered reverse is commanded. The controller separately tracks the exit beam's clear-to-blocked-to-clear sequence; that sequence alone cannot establish release.

A separate plant-truth assessor first witnesses roller contact, arms only when the controller requests unload after its held prefix, validates finite strictly increasing timestamps, and then requires negative-side roller separation, at least 5 mm clearance, at least 0.01 m/s separating speed at the qualifying observation, and no recontact for 0.2 s of integrated samples. It never supplies those quantities to the controller. This is **model-local nip exit**, not capture, field ejection accuracy, usable scoring or continuous physical proof. The horizon is 3.9 s. A no-exit or unsupported result remains such, not a failed requirement converted into success.

Paired prefixes are checked exactly, including against the unchanged baseline. Whole trajectories are refined at 0.1 and 0.05 ms for states, bus voltage/current, losses and mechanical residual. Mode continuity, zero open current, delayed commands, disabled priority, corrupted/stuck sensors and recontact are separate checks. Numerical losses are not temperature predictions, and the empirical motor Kt/Ke discrepancy still prevents a global electromechanical energy claim.

Only the declared incoming state and hypothetical coefficients are evaluated. No disturbance envelope or material calibration is established. All five-domain engineering acceptance remains blocked; no whole robot, manufacturer controller, field mesh, capture or scoring is validated. The new outcome must be reported alongside, not instead of, the original unsupported powered-release baseline.

## Separate disabled/powered-off recovery gate

The reviewed 2026 TU22 manual R204 (section 8, page 82) requires the ROBOT design to allow removal of SCORING ELEMENTS and removal of the ROBOT from FIELD elements while disabled and powered off. This experiment still runs a powered controller commanding an ideal neutral interface; neither the failed powered reverse nor modeled passive exit demonstrates powerless recovery. The corresponding recovery gate remains unverified and needs a separately reviewed mechanical access/recovery design. No manual interaction or hardware action is authorized or simulated here.

R206's gamepiece-hazard requirement is also unresolved. No inspected rule supplies a numerical force/compression acceptance threshold. Model stiffness, normal force and penetration bounds are not a damage or rule-compliance qualification. Source pointer: official 2026 manual, TU22 SHA256 `5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139`; these rule facts are distinct from unvalidated contact-law assumptions.
