# Dynamic simulation roadmap and development benchmark

## The acceptance boundary

Relevant robot code and CAD changes require actual simulation evidence covering physics, voltage, heat, friction and weight distribution under the owner's standard. Current metadata, aperture checks and idealized inventory/scoring fixtures do not satisfy that standard. The numerical benchmark below is implemented development infrastructure, **not candidate verification or an accepted design baseline**. All engineering acceptance remains blocked. No authorization to deploy, energize or operate hardware follows.

## Implemented numerical slice

`npm run physics:benchmark -- case-studies/2026/motor-physics-benchmark.json` executes a coupled, deterministic RK4 initial-value problem, not a label-based proxy or animation. All fixture parameters are synthetic. The fixture's repeated-digit code/CAD hashes are explicit placeholders, not hashes of actual robot artifacts; recorded subjects are unverified and cannot satisfy the candidate-binding gate.

State variables are rotor angular speed, one lumped motor temperature and integrated energy flows. Initial speed is zero; temperature starts at scenario ambient. One direct-drive motor has ideal SI torque/back-EMF constant K, inertia J, viscous coefficient b, thermal capacitance C and cooling conductance h:

- R(T) = R0 * [1 + alpha * (T - ambient)]. **R0 is specified at this scenario's ambient**, not a fixed manufacturer reference temperature. An ambient sweep must supply consistently translated resistance parameters; this model does not perform that translation.
- I = (Voc - K * omega) / (R(T) + Rbattery).
- Vterminal = Voc - I * Rbattery.
- d(omega)/dt = (K * I - b * omega) / J.
- d(T)/dt = [I^2 * R(T) - h * (T - ambient)] / C.

Battery and viscous losses leave the modeled motor thermal node. Their integrated energies are retained, along with source energy and cooling. Energy balance compares supplied energy with kinetic energy, stored heat and all three loss integrals. Electrical inductance, PWM/controller behavior, regeneration, battery depletion, stiction, chassis contact and weight transfer are excluded. Out-of-domain states throw, never silently clip into a passing result.

The benchmark executes baseline and changed parameter sets against exactly the same scenario, each at the requested timestep and half timestep. It compares the complete aligned speed/temperature trajectories. Fixed numerical-development checks are: energy relative residual <=1e-5 (normalized by max(1 J, source energy)), speed relative discrepancy <=1e-4 (normalized by max(1 rad/s, reference speed)), temperature discrepancy <=1e-5 C. These are implementation accuracy checks, not hardware performance limits. Their tests include an independent constant-resistance analytical solution, initial-current arithmetic, calorimetry, zero-input equilibrium, replay and fail-closed bounds.

At most5000 coarse steps per subject, dt from0.000002 to0.01s and duration<=30s. Step-size guards constrain nominal mechanical and cooling rates; they are not a general stiff-solver guarantee. State-domain checks and timestep-halving tests remain required. A numerical check can fail while execution completed; that is not an engineering pass.

Receipt records exact model source/config/scenario/parameter/trace hashes and Node runtime; full coarse/fine traces remain available. `validateMotorReceipt(config, receipt)` recomputes this registered model and compares the complete receipt. It cannot authenticate arbitrary hardware data or prove execution of a code/CAD hash merely mentioned by a caller. Same-runtime replay is exact; different runtime revisions need new evidence.

## Next executable steps, in order

1. **Actual candidate-code coupling.** Adapt the existing pinned GradleRIO2026.2.1 Java simulation harness. Compile the exact baseline and changed source trees separately with locked dependency manifests. Instantiate the real subsystem/controller, drive outputs through the actuator/controller simulation interface, and inject plant-generated encoder/current/voltage measurements through production-facing sensor APIs. Remove direct ideal-state bypasses. Log requested versus applied voltage, timing and state. Candidate commands must actually change plant behavior; deliberate controller mutations must fail predeclared tests. Never deploy to hardware from this workflow.
2. **Actual CAD-to-model binding.** Export exact assembly/version/configuration mass properties, density/material assignments, inertia tensor/reference frame, center of mass, geometry and omissions. Record the export file hash and reviewed units/transforms. Parameter derivation must consume those bytes, not a hand-entered lookalike. Missing materials, suppressed components, deployed mechanisms and payload alternatives remain blockers. Compare independently calculated simple mass/inertia cases.
3. **Coupled drivetrain/contact model.** Extend beyond a single rotor to wheel/gear dynamics, rigid-body mass/inertia, suspension/contact assumptions and traction/slip. Include static/kinetic friction or justified alternatives, normal-force distribution and load transfer across support geometry. Analyze CoM/payload/configuration changes and slopes without treating nominal feature references as collision geometry. Use reviewed field coverage only.
4. **Shared electrical/thermal/control limits.** Combine simultaneous motor loads, battery state/internal resistance, wiring/controller losses, current limiting and brownout/recovery. Use device-specific winding/case or justified reduced thermal models, repeated duty cycles, jams and recovery. Include thermal effects on resistance/torque, rather than only reporting an invented temperature threshold. Thresholds must come from requirements and component limits before runs.
5. **Calibration then independent validation.** Obtain separately authorized controlled measurements: speed/current/voltage transients, battery loaded behavior, coastdown/friction, heating/cooling curves, actual mass/CoM and contact tests. Fit parameters on training runs, validate residuals and uncertainty on distinct holdouts. Record range of validity. Missing calibration, poor fit or extrapolation blocks real-robot acceptance. Measurement plans require their own qualified safety review and authorization.
6. **Change-gated evidence.** Before running, map every relevant change to mandatory domains/scenarios and thresholds. Replay exact integrated code+CAD+model revisions, bounded sensitivity/fault cases and coupled scenarios. Not-run, missing, crashed, unsupported, stale, unbound or unvalidated evidence stays blocked. Save baseline and changed outputs, including failed cases. Registered adapters determine coverage; callers cannot grant themselves a pass. Independent review covers applicability and physical evidence, not only JSON shape.

## Primary technical grounding

- [WPILib physics simulation](https://docs.wpilib.org/en/stable/docs/software/wpilib-tools/robot-simulation/physics-sim.html): plant evolution is driven by motor outputs, with simulated sensors returned to user code. A WPILib class alone does not establish complete robot coverage.
- [WPILib drivetrain model inputs](https://docs.wpilib.org/en/stable/docs/software/wpilib-tools/robot-simulation/drivesim-tutorial/drivetrain-model.html): physical parameters and measurement-derived models are necessary for meaningful response estimates.
- [Pinned WPILib2026.2.1 DCMotor](https://github.com/wpilibsuite/allwpilib/blob/v2026.2.1/wpimath/src/main/java/edu/wpi/first/math/system/plant/DCMotor.java) and [BatterySim](https://github.com/wpilibsuite/allwpilib/blob/v2026.2.1/wpilibj/src/main/java/edu/wpi/first/wpilibj/simulation/BatterySim.java): primary references for back-EMF/torque relationships and resistive supply sag. This benchmark is original equations-based code, not a claim to execute WPILib.
- [MathWorks DC motor model](https://www.mathworks.com/help/simscape-electrical/ref/dcmotor.html) and [thermal mass](https://www.mathworks.com/help/simscape/ref/thermalmass.html): physical modeling context for electrical loss and lumped thermal energy. The one-node approximation here is intentionally less complete than a calibrated motor thermal network.
- [WPILib system identification](https://docs.wpilib.org/en/stable/docs/software/advanced-controls/system-identification/introduction.html): input/output measurements support fitted models; fitting and independent validation are different steps.

These sources motivate the model structure; they do not supply the synthetic fixture's parameters or certify its applicability to any robot.

## Effect-by-effect library coverage audit

Documentation checked2026-11-16; the REV and MapleSim pages below are rolling documentation, not pinned installed releases. Before adopting them, pin the actual library/vendor dependency version and inspect its corresponding implementation. No such integration is claimed here.

[REV simulation guidance](https://docs.revrobotics.com/revlib/spark/sim/simulation-getting-started) permits manually setting simulated motor temperature. Therefore a temperature telemetry field alone is not evidence of a thermal differential equation, loss model or calibration. Its controller iteration consumes plant velocity and supplied bus voltage; trace how each quantity was produced rather than crediting the interface with missing physics.

[MapleSim's introduction](https://shenzhen-robotics-alliance.github.io/maple-sim/) describes a dyn4j-based2D force/collision engine. That is not, by itself, evidence of thermal behavior or3D pitch/roll/tipping coverage. Such effects remain unknown until the exact version, model and candidate coupling have been inspected and tested separately.

A required future shared-battery regression must run at least two coupled subsystem loads on one bus: verify the bus uses the sum of modeled supply currents, compare isolated versus simultaneous operation, and confirm the resulting bus voltage changes both subsystems' applied voltage and subsequent states. Include wiring/controller losses and brownout behavior when required. Feeding each subsystem its own independent12V supply or overwriting the shared voltage once per subsystem must fail this test. This coupled regression is planned, not implemented in the single-rotor benchmark. Battery sag estimation alone does not satisfy the whole voltage/power domain.
