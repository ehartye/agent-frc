---
name: frc-mechanism-hardening
description: "Challenge an installed mechanism's repeatability, sustainable scoring rate, robot-elevation load paths and service recovery before making readiness claims."
---

# Does the installed mechanism keep working?

Start with the capability contract, selected assembly revision and match-role demand. State the observable event that earns credit. Freeze the cohort and acceptance criteria before rerunning the candidate. Preserve unsuccessful and unknown attempts.

1. **Bench model.** Map failure modes and perturb input position, friction, backlash, voltage or timing within documented bounds. Find the boundary where useful function stops.
2. **Installed model.** Include the adjacent structure, connectors, sensor visibility, loaded pose, drivetrain motion, simultaneous demand and collision envelope. Run the [load-path and full-window rate studies](../../docs/mechanism-hardening.md). Check every project-listed assembly that elevates the robot. Attribute accepted events to the correct actor and match objective.
3. **Fault and return.** Inject an interruption or unavailable support where applicable. Time isolation, part access and replacement. Check whether datums and sensor references return to tolerance; repeat the original acceptance run after reassembly. For fatigue and wear, record cycle duty, stress range, material and limiting rated life or mark service life unknown.

Record the governing margin, first violated requirement, causal change to the design and rerun on the original and a held-out condition. Report simulated, rated and measured evidence separately. A prebuild design can conclude with an explicit failure or unknown and a specific refinement.
