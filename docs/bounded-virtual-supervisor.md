# Bounded virtual supervisor: protocol integration, not real sensing

This opt-in adapter composes the unchanged `CatcherHandoffController` with a new bounded-observation supervisor. Existing world transport and uncertainty receipts remain evidence for their original unsupervised paths, not evidence that this adapter has run in those plants.

## What was executed

`run-supervised-catcher.py` ran seven fresh offline WPILib HAL tests, with a unique runtime token and hashes of seven selected runtime classes (including observation/decision records), source inputs and XML. The immutable receipt is `case-studies/bounded-virtual-supervisor.json`. The test fixture exercises 33 HAL protocol paths: three successful closure/HOLD/release sequences, 15 missing/unilateral/unloaded/stale pad cases, 12 post-HOLD pose/load/gate-feedback losses, and three wrong-season starts. Thirty Python-generated clearance vectors exercise the Java formula; additional unit cases cover invalid numbers, stale/future timestamps, reversed clocks, latched rejection and the prior rotated CORAL counterexample.

The signals are manually supplied virtual observations. The test fixture does not simulate a camera, load cell, actuator, continuous transport or physical pad compression. Positive paths are conditional protocol acceptance, NOT verified physical capture.

## Observation boundary

Position and projected-support geometry are in mm; velocity/acceleration in mm/s and mm/s²; yaw/pitch and their bounds in degrees. Observations carry their own timestamp. Pose age may not exceed the hypothetical 20 ms limit, and the clearance horizon includes that age plus a further 20 ms controller horizon. Clock reversal, future timestamps, season changes, missing/nonfinite/out-of-domain values and insufficient gate/guide clearance latch denial. The controller's configured season must match the observation.

Independent bilateral pad-contact bits and a separate load-valid bit, each under a fresh pad timestamp, are required before the CLOSING-to-HOLD transition and on every HOLD update, including a release-request update. Neither geometry, beam clearance, a closure command nor closed-gate feedback supplies these bits. No force threshold or sensor accuracy is invented: the virtual producer must explicitly assert load validity, and false/stuck-high assertions remain an unaddressed real-sensor failure mode.

At the start of CLOSING the adapter has clearance permission but not yet pad validity. On the following update it either has independent pad evidence or faults; there is no grace period that silently permits HOLD. Gate-feedback loss after HOLD is still rejected by the original controller.

## What fail-closed means here

Denial prevents HOLD/release acceptance and latches FAULT. The legacy protocol deliberately retains a previously requested closure in FAULT, and tests assert that behavior rather than claiming zero output. This is not collision avoidance after a failed assumption, safe mechanical stopping, power-loss safety, or an emergency-stop implementation. No software update arriving after an unbounded motion can retroactively guarantee clearance.

The adapter currently requires valid near-catcher pose bounds from initialization. It cannot simply replace the whole upstream transport rig, whose initial pose is outside this local domain. The next integration step needs explicit staging/arming without allowing arrival to bypass the supervisor, then continuous world replay with independently simulated contact/load observations. Actual sensing, actuator response, calibrated error/load bounds, sensor diagnostics, force-coupled closure, mechanical acceptance and procurement remain blocked pending evidence.
