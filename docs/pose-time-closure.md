# Conditional pose permission and time-resolved closure

This adds two bounded results without erasing the earlier counterexamples:

1. A conservative **gate/guide clearance contract** for bounded pose and motion.
2. Native time-resolved gate trajectories with clearance certified between samples,
   plus explicit pad-stroke tests.

Neither is a real sensor, calibrated actuator, capture qualification or full6DOF
force simulation. The permission contract is not yet wired into the controller;
its inputs must not be presented as observed facts merely because they were
chosen for an experiment.

## Conditional pose/clearance contract

`pose-clearance-contract.py` uses the exact rigid support functions of the ideal
NOTE torus, CORAL finite outer cylinder and FUEL sphere. It inflates X/Y extents
by a circumsphere-radius times the declared angular-error/rate bound. Position
errors must cover **relative piece-to-fixture** uncertainty. The lateral envelope
also includes a declared lateral-speed bound during closure.

For rear clearance, the worst permitted backward displacement is bounded by
`min(0, v_lower*T - 0.5*a_bound*T*T)`. This follows from a lower initial velocity
bound and an upper bound on deceleration; the minimum of the concave lower-bound
quadratic occurs at an interval endpoint. Rear-gate and side-guide lower clearance
bounds must both be at least2 mm. This2 mm value is a provisional study threshold,
not a production tolerance or owner-approved requirement.

The contract rejects the earlier rotated-CORAL near-gate counterexample. It can
also reject an otherwise nominal stationary pose when declared uncertainty and
possible deceleration make the interval too wide. That conservatism is intentional:
uncertainty is not silently set to zero to obtain permission. The example104000
mm/s² acceleration bound is a hypothetical input associated with the reduced
model's force scale, not a guarantee about real hardware.

A true `gateAndGuidePermission` means only that these conditional X/Y separation
bounds pass. Every result retains `captureQualified=false` and requires separate
pad-contact/load and actuator evidence. It does not certify retention height,
floor interaction, spring travel, contact preload, guide stiffness, or arbitrary
motion outside the declared bounds.

## Time-resolved native gate closure

`time-resolved-catcher-closure.py` prescribes a straight gate stroke and a rigid
piece moving at constant X velocity, with fixed orientation. For each interval,
the native distance between the shapes obeys the translation Lipschitz bound

`distance(t) >= min(endpoint distances) - relativeSpeed * intervalDuration / 2`.

Relative speed is the norm of the prescribed piece-X and gate-Z translations.
Adaptive subdivision either proves2 mm clearance over the entire interval, returns
a sampled positive-volume collision/clearance witness, or reports an unresolved
refinement limit. It does not declare safety merely because sampled poses missed
a collision. Tests independently reconstruct every certified interval from the
recorded samples and speed bound.

Across18 gate trajectories,14 have certified2 mm separation and four have native
collision witnesses. There are no unresolved cases in this particular set.

- A20 ms closure with the tested400 mm/s rebound remains clear from the chosen
  nominal start; a100 ms closure with that rebound collides for all three pieces.
- The stationary CORAL at3 degrees yaw and-17.9 mm offset still collides. The old
  counterexample is preserved.
- With that same initial CORAL pose but a prescribed400 mm/s forward translation
  during100 ms closure, the time-dependent path clears. The conservative
  full-stroke pose contract still refuses it because its initial X clearance is
  insufficient. This illustrates how known motion can change a result; it does
  **not** justify relaxing the controller's guard without reliable motion bounds.

The forward trajectory is a kinematic input, not a prediction that the bumper or
actuator can actually maintain that velocity. Force coupling, acceleration and
rotation during closure remain outside this native trajectory study.

## Pad strokes and retained limitations

Nine pad-stroke cases hold the posed piece stationary while the pad translates
from its retracted to nominal closed position. The exact swept box is also checked,
so absence of overlap is not inferred solely from the five time snapshots.

Nominal rigid tangency is not a preload measurement. A5 mm lateral offset still
creates swept intrusion/compression, and the10-degree pitched NOTE still ends with
about2.106 mm gap to the nominal pad. The receipt's geometric contact indicator
means rigid shapes touch/intersect; `forceOrPreloadEstablished` remains false.

## Reproduction and next integration gate

Run `pose-clearance-contract.py` for the conditional examples and
`time-resolved-catcher-closure.py --output <new-json-path>` for fresh native checks.
`python -B scripts/test-pose-closure.py` verifies support/uncertainty bounds, preserved
failures, source pins and the inter-sample certificates.

Next integration should obtain or explicitly simulate bounded relative pose and
motion observations, make closure permission fail closed when those bounds are
unavailable, and retain an independent pad-contact/load check before accepting
HOLD. Actual gate/pad motion and mounting uncertainty must then fit those bounds.
No sensor, actuator, spring or friction value has been selected or validated by
this study. Hardware procurement/deployment and engineering acceptance remain blocked.
