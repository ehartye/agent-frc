# Contact refinement evidence before prediction

`npm run contact:convergence -- expected-manifest.json observed-receipt.json` checks supplied summary results against independently declared refinement studies. Exit 0 means only `within-declared-bounds`; exit 1 means `not-converged`; exit 2 means `unknown` or invalid input. Every result keeps `engineeringAcceptance: blocked`, `calibration: not-assessed` and `integrity: not-independently-verified`. The tool neither executes physics nor authenticates traces. Synthetic evidence stays synthetic.

## Declare the numerical question before running

Use at least three ordered levels for timestep and at least one contact refinement axis. Include every relevant geometry/contact-search axis, not merely the easiest one to pass. An analytic surface can still depend on finite contact search. Refine search points and iteration counts without silently reducing another control. The tool cannot discover an omitted numerical control, verify that a declared control reached the solver, or prove a limiting solution.

Hold the scenario, physical constitutive law, inputs, initial state/energy, runtime and outcome definition fixed. Bind the held solver settings separately for each study and the exact model/settings artifacts for every level. Changing a contact law, friction, damping, preload, rotor energy or input policy is a different experiment unless a separately justified discretization mapping preserves the same physical law. Matching force at one pose or local damping at one velocity does not prove the full displacement/velocity response is preserved. Check those response curves independently across the relevant domain.

Use predeclared metric definitions, units and absolute tolerances. Compare the same time window and precisely defined events. A last-contact speed, boundary-crossing speed and terminal speed are different metrics. Keep complete histories and intermediate extrema for independent review; summary agreement can conceal transient divergence. The checker reports all adjacent metric differences but gates only the two finest values against the declared tolerance. This finite check is not an error estimate, convergence order, monotonicity proof or full-history comparison.

Discrete outcomes must agree across all levels and required studies. A change from release to continued contact blocks the prediction even when numerical summaries or integrity checks look favorable. `HORIZON` is only a termination label. Independently define sustained release/contact events and mark an unresolved outcome as such; never infer capture, release or failure merely from elapsed time or a single zero-contact sample.

## Manifest contract

The independent manifest has exactly:

- `schema`: `agent-frc/contact-convergence-manifest@1`.
- `comparisonPins`: SHA-256 values for `scenario`, `constitutiveLaw`, `initialState`, `inputs`, `runtime`, `outcomeDefinition`. Retain the original records and hashing convention. Include all relevant initial kinetic/stored energy in the initial-state record.
- `windowEndSeconds`: finite positive common observation-window end.
- `metrics`: unique `{id, units, definition, absoluteTolerance}` rows; finite nonnegative tolerances. There is no universal accuracy threshold.
- `studies`: unique `{id, axis, resolutionParameters, fixedSettingsSha256, levels}` rows. Axis is `timestep`, `contact-geometry` or `contact-search`. Name each resolution coordinate, such as `dtSeconds`, `segments`, `searchPoints` or `iterations`. Each level has exactly `{runId, resolution, modelSha256, settingsSha256}`. A timestep resolution has one decreasing positive coordinate; contact coordinates increase refinement effort, with none decreasing and at least one strictly increasing at each level. Use a consistent parameter order. A mesh spacing can instead be represented by its documented reciprocal refinement density.

There must be timestep and contact studies, with at least three levels each. Run IDs may be reused across studies only when the same supplied run meets every referenced source and held-settings expectation. The manifest defines the exact union of required runs; omitted or extra runs remain unknown. Do not trim failed/coarse cases after seeing outcomes to manufacture agreement. A new study plan must retain the old counterexample and explain its changed scope.

## Receipt contract

The receipt has exactly `schema` (`agent-frc/contact-convergence-receipt@1`), `basis` (`synthetic` or `simulation-observed`) and `runs`. Each run contains exactly:

- `id`, `comparisonPins`, `fixedSettingsSha256`, `modelSha256`, `settingsSha256`, `windowEndSeconds`, matching independent expectations.
- `completion`: `complete`, `failed` or `cancelled`.
- `termination`: a nonempty producer label, retained without interpreting it as an outcome.
- `outcome`: `released`, `contact-at-horizon` or `unresolved`, evaluated under the pinned definition.
- `reportedIntegrityPassed`: Boolean declaration. False blocks comparison; true is not authenticated by this tool and cannot override numerical disagreement.
- `metrics`: exactly the expected `{id, units, value}` rows. Values must be finite or explicitly null when unavailable. A missing required value prevents a passing study; if outcomes already disagree, the changed outcome is itself a decisive failure and the null value stays visible.

Malformed schemas, duplicate IDs, invalid refinements and nonfinite inputs reject. Stale/mismatched pins, windows or units, missing runs, incomplete execution and unresolved outcomes remain unknown. Numerical overflow also remains unknown. Raw files are read only, bounded to 5 MB each. The checker follows no asset paths or URLs named in input.

## Numerical credibility is not calibration

Retain meaningful no-drive/no-traction, free-motion and force/energy counterexamples appropriate to the model. Account for initial rotor, elastic and other stored energy; a pre-energized release does not demonstrate spin-up, acquisition or continuous transfer. A motor power identity or center-of-mass balance can pass while contact geometry/search remains unresolved. A partial work residual is not a complete compliant-contact energy proof.

Only after numerical credibility is established should prediction be compared with suitable measurements and uncertainty. Calibration must identify material/condition, apparatus, parameter estimation, withheld validation cases and operating domain. Do not tune hardware or fit one favorable exit result to conceal numerical instability. Keep uncalibrated assumptions visible even when the declared refinement bounds pass. This helper does not weaken the [physics evidence gate](physics-evidence-gate.md), establish a solver's correctness, or authorize robot operation.
