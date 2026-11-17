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

## Maple-sim arena and MuJoCo mechanism roles

For the current project, Maple-sim is being evaluated for the match arena, with MuJoCo retained where a targeted 3D mechanism experiment is useful. Prefer one simulator when it answers the questions adequately; justify a second by demonstrated value and a third only by unique value. This is a project preference, not a permanent stack decision, universal engine rule or calibration claim. A bounded headless Maple integration now exists; completed match simulation and validated cross-engine coupling are not claimed.

Maple-sim's documented foundation is Java/dyn4j planar rigid-body interaction. Use it as a candidate for field navigation, cycle/traffic scenarios and robot/game-piece interactions within its modeled scope. Its official opponent guide describes auto-cycling and joystick-controlled opponents as one approach, with version-sensitive example APIs. Scripted opponents can test strategy exposure, not establish realistic adversary skill. [Maple-sim overview](https://shenzhen-robotics-alliance.github.io/maple-sim/), [opponent guide](https://shenzhen-robotics-alliance.github.io/maple-sim/simulating-opponent-robots/).

MuJoCo is a general articulated-body/contact engine, useful for targeted 3D hypotheses such as out-of-plane piece motion, mechanism interaction and actuator/constraint coupling. That suitability is an engineering choice, not evidence its contact defaults reproduce foam pressure or that a visually plausible mechanism is validated. [Official MuJoCo overview](https://mujoco.readthedocs.io/en/stable/overview.html).

Keep the question boundary explicit: a planar arena does not by itself establish pitch/roll clearance, elastic deformation or mechanism grip. A detailed local 3D fixture does not by itself establish season scoring, autonomous cycles or opponent behavior. Projectile/airborne features must be inspected in the selected version rather than inferred from either “2D” or “3D” branding; neither implies calibrated aerodynamics.

Before adopting either integration, pin its version, season field geometry and relevant Java/WPILib/vendor or Python dependencies; verify actual setup and APIs. The current setup:check physics profile probes MuJoCo/NumPy only, not Maple-sim/Gradle dependencies. Do not interpret that profile as an engine recommendation or require MuJoCo for Maple arena work. Inspect the project's Java build and vendordep files separately without silent installs.

If exchanging data between arena and mechanism models, define frame/unit/time contracts and who owns each body, force, state and event. Do not double-integrate motion or double-apply reactions. A separately validated mechanism outcome may inform a clearly labeled bounded arena abstraction; it is not automatically a live co-simulation. Preserve uncertainties, fail states and sensitivity rather than replacing an unresolved intake with guaranteed pickup. Require paired negative controls and source-bound receipts before marking either adapter usable.


### Bounded integration evidence and reusable checks

The original [2024 integration at immutable revision 36bede84](https://github.com/ehartye/frc-2024-poc/tree/36bede844eb2a175a92a920c7d4a44ef7b22d010/sim/maple) uses pinned upstream Maple revision `1b1e8ea7278de01d40a5ea14dffbaaf13381512a`. Inspection of its README and harness supports six scenario groups inside one JUnit test: force-driven differential motion, actual arena wall and stage-post collision, two robots sharing one NOTE body, fresh-arena reset, and seeded adapter free-drive replay. The integration's independent review reported a fresh headless build and stable source pins; this plugin documentation update inspected the frozen source, not another physics replay.

Reuse the community arena rather than rebuilding it without cause, but do not equate a successful build with season-rule correctness. This adapter explicitly excludes scoring acceptance and uses a fresh arena because the documented pinned in-place reset leaves state/handlers. A reset check should compare bodies, game pieces, handler counts and relevant rule state, not just robot pose. A shared-object check should preserve actual identity/count, not merely draw two matching pieces. A seed claim must name the controlled random source; this trial seeds its own scenario generator, not every upstream random source. Compare parsed structured results where JSON object key order differs; keep exact raw hashes separately for provenance.

The reviewed adapter remains planar, fixed-12-V and reduced drivetrain physics. Its sampled force-dot-velocity work is not a full energy ledger. Shared NOTE pushing is not collection, ownership or capture; a reset score check does not qualify scoring rules. No GUI input, 3D mechanism, aerodynamic accuracy or calibrated match outcome follows from these scenarios. Preserve these exclusions when comparing alternative engines, and require a new source-bound test for any added capability rather than promoting the whole stack from one passing fixture.
