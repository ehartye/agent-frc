---
name: frc-mechanism-hardening
description: "Challenge an installed mechanism's repeatability, sustainable scoring rate, robot-elevation load paths and service recovery before making readiness claims."
---

# Does the installed mechanism keep working?

When a bracket relies on a bearing face, [screen its measured compression-only support](../../docs/operating-intent.md#test-a-compression-only-seat) against simultaneous forces and moments. Use an installed attachment with a qualified direction and allowable to justify extra shear or hold-down.

Start with the capability contract, selected assembly revision and match-role demand. State the observable event that earns credit. Freeze the cohort and acceptance criteria before rerunning the candidate. Preserve unsuccessful and unknown attempts.

1. **Bench model.** Map failure modes and perturb input position, friction, backlash, voltage or timing within documented bounds. Find the boundary where useful function stops.
2. **Installed model.** Include the adjacent structure, connectors, sensor visibility, loaded pose, drivetrain motion, simultaneous demand and collision envelope. Run the [load-path and full-window rate studies](../../docs/mechanism-hardening.md). Check every project-listed assembly that elevates the robot. Locate the CG and contacts in the installed horizontal frame. Check moments about both horizontal axes, and distinguish a free-to-rotate initial pose from a separately verified settled pose. For a pair of vertical supports, the support line can remain a free rotation axis. When a clamp, hook or bumper contributes opposed reactions, [review the coupled free body](../../docs/coupled-support.md) from one actual native sample. Check all three forces and moments, signed unilateral contact and the correctly rated interface. Distinguish measured reactions, assumed redistribution and required restraints. Sweep load and stiffness and challenge the numerical resolution when either changes the decision. Pin a throughput cohort before evaluation. Compare the frozen inputs with the native starting parameters, anchor the window to observed match or phase clock edges, and verify the actor, station, piece and criterion behind every credited event. Retain missing starts and held-out trials in the denominator.
3. **Fault and return.** For a powered lift, [run a three-duty comparison](../../docs/actuator-duty-review.md) on both normal and adverse starts. Inspect the loaded travel, peak branch force through a real protection action, then retention over the complete unpowered interval. Compare signed service capacities for each duty. Inject an interruption or unavailable support where applicable. Time isolation, part access and replacement. Check whether datums and sensor references return to tolerance; repeat the original acceptance run after reassembly. For fatigue and wear, record cycle duty, stress range, material and limiting rated life or mark service life unknown.

Record the governing margin, first violated requirement, causal change to the design and rerun on the original and a held-out condition. Report simulated, rated and measured evidence separately. A prebuild design can conclude with an explicit failure or unknown and a specific refinement.

For parallel lift stations, [trace each failed holding path](../../docs/lift-path-faults.md). Locate the proposed interconnection relative to every belt, nut, holder and shared mount. Replay each side lost, both lost and the governing loose or asymmetric case. Check racking, common descent and individual travel on one post-cut clock.

For loaded ground travel, [check the actual carried identities and robot footprint on the frozen 3v3 clock](../../docs/loaded-route.md). Record the first peer conflict and which later observations remain reachable. Qualify installed motion, downstream custody and scoring with their own evidence.

For a rotary mechanism, [calculate signed gravity and stop work](../../docs/actuator-duty-review.md#signed-rotary-gravity-and-stop-work) using the actual moving group and its payload at each registered pose. Carry the governing direction into the independent power-loss holding duty.
