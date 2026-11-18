# Mechanism exit continuity and registration boundary

This milestone replays the existing continuous one-dimensional intake/catcher model through real simulated WPILib DIO/PWM control and exports nine end-of-step reverse-release states. It does not turn the catcher into a launcher.

## What is now connected

- Fresh 15-test, 66-trajectory HAL execution binds input hashes, runtime class hashes and the run token through the existing atomic recorder. The new receipt is `case-studies/mechanism-exit-world-replay.json`; the original diagnostic receipt is preserved.
- Each of the three seasons has three release samples after the original intake, capture, dwell and release sequence. Every sample checks RELEASED, physically open toy gate, no valid toy pad contact, and negative velocity. Time and position are the actual integrator state, not a reset to a desired launch point.
- The existing model uses an external 0.2 Ns reverse impulse on its hypothetical 0.5 kg body. That assumption is now explicit in the exit record. The resulting approximately -0.400 m/s is not motor-generated launch evidence, not a full-body-clear exit, and not an exact interpolated plane crossing.
- `mechanism-exit-registration.py` requires an explicit, right-handed, rigid, metre-unit, season-matching hypothesis before embedding the 1D state in 3D. Translation affects position, not velocity. It does not fill missing orientation, installed transforms, scores or sensing.

## Useful negative result

Under the separately declared 0.7 m exit-height hypothesis, these release velocities have less than 9 mm of gravitational rise even if their entire velocity is rotated vertically upward. Thus none of the six NOTE/FUEL samples can reach the selected elevated target center-height thresholds without additional energy. This bound does not depend on selecting a favorable yaw/pitch. It assumes gravity only, no new force or energy source, and applies to this toy reverse-release behavior, not every possible robot.

The nominal SPEAKER low-edge datum remains assembly-bottom-relative and its drawing tolerance is not propagated. The HUB threshold uses 72 minus 0.5 inches in the existing hypothetical floor frame. Neither is an installed/world registration. CORAL reachability remains unknown because the installed trough pose and actual placement mechanism are missing.

## Next engineering work

1. NOTE: model an explicitly powered feeder/launcher with wheel inertia, slip/contact and exit orientation, rather than repurposing the reverse impulse. Register the launcher to the source-bounded speaker side profile before roof/wall and sensor tests.
2. FUEL: model powered elevated exit and wheel-to-sphere contact; connect it to the existing HUB local-plane model, then funnel/rim and sensor geometry. Current gate drive limitations remain independent.
3. CORAL: resolve source-backed bracket/floor/back/lip mating transforms, then model continuous guide-to-trough placement with robot-contact and other-level exclusions. A tangent cylinder on an isolated floor patch is not a scoring event.

No hardware was actuated, installed, purchased or deployed. All physical acceptance, installed registration and scores remain blocked/unknown. The original interrupted worktree is untouched.
