# Required physics evidence gate

Relevant robot code and CAD changes require **actual simulated physics**, bound to the exact baseline and candidate. Required domains are physics/dynamics, voltage, heat, friction and weight distribution. Missing, partial, unsupported, failed, stale, unrun or uncalibrated evidence blocks engineering acceptance. Static fit, contract lint, an attractive render and self-declared JSON pass fields do not meet this standard.

## What this implementation does

`reviewPhysicsEvidence` in `scripts/physics-evidence-gate.mjs` accepts `frc-physics-review-request/v1`:

- `changes`: a nonempty, duplicate-free array containing `code`, `cad` or both.
- `baseline` and `candidate`: exact `codeSha256` and `cadSha256` strings. Declared changed artifacts must differ.
- `evidence`: exactly `adapter`, `config`, `receipt`. The only adapter is `motor-physics-benchmark/v1`. Its configuration and receipt come from `scripts/motor-physics.mjs`.

The gate requires the benchmark's baseline/candidate subject hashes to match the review request exactly. It calls `validateMotorReceipt(config, receipt)`, which reruns the registered numerical model and compares its complete receipt. A made-up run status, changed result, different inputs, source drift or stale receipt is not accepted as an executed benchmark. No evidence may provide a module path, callback, implementation, domain waiver or pass override.

Replay is not a claim that numerical checks passed. The gate separately reports each baseline/candidate numerical energy/convergence result and adds a blocker for a failure. Then the gate reports coverage from its own adapter registry, not caller-authored coverage fields. This initial adapter has only partial dynamics, voltage, heat and friction coverage, and no chassis weight-distribution coverage. Rotational inertia is not weight distribution. Code/CAD hashes are attribution only: the benchmark does not execute robot code or extract/simulate CAD geometry. Its parameters are synthetic and uncalibrated. Even an exact successful replay always yields `engineeringAcceptance: blocked` and `robotOperationAuthorized: false`.

**This is a working fail-closed evidence screen, not a complete robot simulator. None of the current adapter's receipts can satisfy the engineering acceptance gate.** A baseline/candidate hash matching its declaration does not prove that those bytes caused the simulated behavior. The numerical model's own verification is distinct from calibration, candidate applicability and acceptance.

CLI: `node scripts/physics-evidence-gate.mjs request.json`. Invalid requests, unsupported adapters, mismatched subjects or failed replay exit 1. Replayed but incomplete evidence produces a structured blocked report and exits 2. There is no success/authorization exit in this first implementation. A failed or missing module/execution also cannot produce acceptance.

## Required next adapters before engineering acceptance

Develop separately reviewed adapters that actually couple the selected robot controller/configuration and CAD-derived or independently verified geometry/mass properties to a suitable model. Pin baseline/candidate code and CAD contents, model source/version, runtime, scenario, solver settings, calibrated parameters, uncertainty, output hashes and predeclared acceptance bounds. Review the mapping from source artifacts to model inputs; hashing a label is insufficient.

Required coverage must match the change's physical effects, including cross-subsystem coupling. Voltage needs applicable device/battery/wiring/load behavior; heat needs applicable thermal limits and conditions; friction needs relevant contact and mechanism behavior; weight distribution needs geometry, mass/center-of-mass, support/contact and dynamic load-transfer/stability behavior. These are scope requirements, not numeric thresholds or a claim that a single model fits every robot.

Record pass, fail and unknown per requirement and scenario. Do not use averages to hide a failed domain or permit an omitted domain to default to pass. Test baseline and candidate under the same stated exogenous conditions, including failure and boundary cases. Establish scenario and uncertainty coverage before interpreting favorable results. Hardware calibration, model validation, qualified inspection and physical verification remain distinct evidence gates.

A future acceptance path requires independently reviewed code and tests for the new adapter and its binding, numerical, scenario, calibration and domain checks. Do not weaken this first gate, falsify coverage or inject approval fields to make an unverified robot change look ready. Tool-source integration to add this guard is not approval of any robot code/CAD candidate; this module performs no deployment or physical operation.

## Relationship to other checks

The subsystem contract linter checks structure, declared pin linkage and stale dependencies. The static aperture screen checks bounded geometry only. Neither is the physics gate. This gate's successful replay establishes only that a registered synthetic numerical calculation was performed reproducibly. The broader integration safety case still needs independent review of the exact merged candidate and separate qualified physical release.

Domain coverage is effect-specific, not a simulator product name or a telemetry channel. Assigning a temperature field is not evidence of solving thermal behavior; executing 2D motion does not itself establish heat, center-of-mass load transfer or tipping coverage. Review the actual equations, input coupling, execution, calibration and acceptance evidence for each required effect.

Enforcement boundary: this is a callable API/CLI with regression tests. It has not installed CI rules, branch protection, repository-host merge blocking, authenticated reviewers or physical-release controls. A process that never invokes the gate is not enforced by it. Treat repository/tooling integration separately from acceptance of a robot design or hardware change.
