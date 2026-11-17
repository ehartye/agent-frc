# Iterative simulator types: choose by the question

Start with the student's strategic narrative and the decision that needs evidence, not a preferred engine or a demand for maximum fidelity. Use the cheapest model that can distinguish the alternatives without inventing the answer. These are complementary tools, not a mandatory linear ladder. Return to a blockout when strategy changes, isolate a mechanism when an integrated run fails, and keep simple negative controls beside more detailed models.

| Tool type | Useful question / phase | Useful artifact | Does not establish |
|---|---|---|---|
| Strategic block-bot rehearsal | Where must we face/reach? Where is time consumed or traffic likely? Early strategy, route and architecture comparison | Editable volumes, action/pose timeline, assumed durations, route alternatives and adversary footprints | Powered maneuverability, collisions/loads, achievable cycle time or scoring reliability |
| Kinematic and clearance checks | Can the intended geometry move from start to goal through the required space? Packaging, CAD and assembly iteration | Source-bound joints/poses, full-part inventory, tolerance ranges, intermediate-pose checks and failures | Force-driven motion, grip, durability or actuator sufficiency |
| Bounded mechanism/contact fixture | Can this local interaction produce the required force/work within a stated domain? Mechanism hypothesis testing | Contact/actuator model, measured or hypothetical parameters, energy accounting, domain stops and sensitivity fixtures | Whole-robot behavior, real material calibration or transfer outside the tested domain |
| Controls and drive simulation | Does feedback handle speed, timing, sensor validity, saturation, interruption and recovery? Control design/driver interface iteration | Production-like controller interfaces, observations, input/command events, plant state/work and fault tests | Accurate physical handling unless plant/sensors are calibrated; a responsive UI alone is not control evidence |
| Integrated field/adversary simulation | How do coupled subsystems, field geometry, shared power and opponent policies affect a strategy? Integration and viability comparison | Source-linked robot/field models, autonomous and teleoperated scenarios, adversary policy variants, reproducible seeds and performance distributions | Real competition results, opponent realism, injury safety or structural impact tolerance without corresponding validated models |

A detailed visual scene may still be a kinematic rehearsal. A simple-looking fixture may contain the relevant force model. Name what is actually simulated rather than calling everything “full physics.” Combining several uncalibrated models does not make them calibrated.

## Conversational selection loop

1. Ask: “What choice would this run help us make?” Record the requirement and observable outcome. Propose one or two suitable model types with their cost and blind spots; leave consequential strategy choices with the student.
2. Define operating space, assumptions, units, frames, input ranges and required measurements using [the operating-space reference](operating-space.md). Classify study extents separately from physical and unsupported-model limits.
3. Identify the smallest counterexample or negative control that could expose a misleading pass. For example: an intermediate interference missed by endpoint poses; zero-friction escape despite joint-stop reactions; a short actual keyboard press absent from the command stream; or an opponent crossing a planned route.
4. Run and inspect evidence at its proper times and scope. Separate accepted state from rejected trial, midpoint contact from endpoint force, contact-only wrench from total constraints, and partial progress from final outcome. Use [trace diagnostics](trace-diagnostics.md) for supported frozen trace receipts; it does not add missing physics.
5. Decide whether the evidence answers the question, suggests a targeted refinement, or demands a different model. Save both the result and the reason for the next choice. Do not repeatedly raise fidelity when a small experiment can resolve the uncertainty.

## Gates when connecting or changing models

- Carry compatible geometry, frames, source identity, complete obstacle inventory and actual state across the interface. A wider study range requires checking dependent filters, not just removing a rejection.
- Preserve momentum, cumulative energy/work, held commands and controller tick phase. A different constitutive law may require a fresh same-law acquisition rather than reusing a convenient checkpoint. Never snap a piece into an ideal attachment to bridge an unsupported transition.
- Partition masses with centers of mass, inertias and cross-coupling terms, not just total kilograms. If native contacts already apply equal/opposite reactions, do not apply the same reaction again externally.
- Preserve unsupported cases as UNKNOWN. Passing geometry, having a contact patch, and having sufficient force/work are distinct checks. No positive callback or completion flag substitutes for physical evidence.
- Check numerical refinement and sampling phase as well as energy consistency. Compare like-time quantities. A coarse contact grid can miss a patch even when discrete energy-gradient tests pass; endpoint force alone can misrepresent intermittent contact, so retain window-integrated impulse, duty and variation when available rather than smoothing away uncertainty.
- Before claiming interactive controls work, test actual tool input events through accepted keys, held command intervals, motor work and resulting state. Synthetic callback injection is a useful unit test, not a substitute for the actual desktop input path. Likewise verify visible native geometry against API state before delivering a screenshot.

## Calibration and adversary scope

Keep parameters marked sourced, measured, fitted, assumed or unknown. Fit and validation datasets should be distinguishable; state operating conditions and withheld cases. Report sensitivity to uncertain friction, compliance, battery and sensor parameters rather than choosing values that make the strategy succeed. Calibration of one subsystem does not validate another or qualify impact survival.

Begin adversaries as clearly labeled route/space obstacles when testing traffic. Add dynamics, contact or strategy only when the question needs them and the model supports them. Compare multiple bounded policies, starting states and seeds instead of selecting one cooperative opponent. A team of kitbot-like agents is a useful scenario hypothesis, not proof of match viability or a faithful competitor population. Do not infer impact durability from collision avoidance or a rigid-body collision animation.

## Save the model-choice record

For each iteration record: decision/question; selected simulator type; editable model/source revision; included and excluded physics; parameter provenance; operating domain; scenarios/controls; actual commands/results; uncertainties; acceptance level sought; and next refinement or rollback. Keep CAD deliverable requirements separate: if the project requires a Fusion file, a simulator scene or imported mesh does not replace it.

This reference captures reusable lessons from bounded robot experiments; it installs no engine, runs no robot and claims no complete field/adversary simulator. Use the existing skills and tools that match the question, with explicit validation of each transition.
