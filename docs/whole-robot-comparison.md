# Compare whole-robot architectures

Before detailing a subsystem, ask a student to follow one match objective through the complete robot and back to its ready state. Sketch different ways to allocate the functions. A reversible common path can save parts but occupy the receiver while it resets. An independent side path can free the receiver but consume width, wiring and service space. Compare each with the simplest role the team could still play.

Use the project’s native assembly datum, footprint and field setup for every concept. Show piece and wire paths, sensors, released/retained states, robot and field clearances, installed mass and CG, simultaneous current and timing, tool access, replacement path and recalibration. Give each interface an owner, exchanged quantity, limits and failure response. Capture the dated geometry, executable strategy and metric definitions with the results.

## Decide what to fix before detailing

While changes cost only CAD time, name one premise whose failure would eliminate a design for the selected role. Keep the original pieces, route, deadline and partner assumptions visible. Before ordering hardware or assigning other subsystems to fixed interfaces, write one row in the architecture decision:

| Premise and owner | Least costly credible test | Nominal and adverse inputs | Measure and stop criterion | Time budget | Result and decision |
| --- | --- | --- | --- | --- | --- |
| The loaded chassis can reach the exchange point and stop before its partner leaves | Screen a straight run with an optimistic traction and motor-force bound | Loaded mass and CG, fresh battery; repeat with lower charge and the upper mechanism running | Stop if the optimistic reachable distance falls short of the required route | One design session before sizing mounts | Record the limiting condition and choose continue, revise or restart |

A student can fix a common datum for comparing layouts while leaving the mount pattern provisional. Record each candidate foundation's owner, units and coordinate frame, exact mating hardware or envelope, supported loads and tolerances, electrical and control connections, tool access, removal space and the condition that would reopen it. A layout choice becomes verified only for the configuration and operating range actually tested. Keep adjustable mounting, a connector choice or a clear volume reversible where it buys a meaningful alternative. Commit sketches, assumptions and failed runs to version control throughout. The irreversible cost comes from purchases, fabrication and downstream dependence.

### Worked example: can the loaded drive meet the handoff clock?

In this invented prebuild exercise, a partner leaves in 2.5 s. The robot needs to cover at least 4 m from rest and finish stopped. Treat a straight, level route with instantaneous steering as an optimistic screen. Even with unlimited top speed, equal acceleration and braking limits require at least `4d/T² = 2.56 m/s²`. Where the limits differ, apply the acceleration limit from the start and the braking limit backward from the stop.

For each candidate wheel radius and gear ratio, calculate motor speed from wheel speed. Use the motor's torque/current and back-EMF curves, drivetrain efficiency and resistance to bound wheel force across speed. Bound that again by tire traction and the load on each driven wheel at the loaded CG. For each operating condition use the battery open-circuit voltage at its charge state, resistance of the battery and wiring, and simultaneous drive, steering and mechanism demands to estimate loaded bus voltage. Use battery-side current for sag and motor-side current for torque. Apply controller duty, current and voltage limits plus the actual breaker or protection time response. Check braking separately. Keep measured values, supplier data and assumed values visible with their ranges.

Suppose these inputs yield an optimistic **96 N** aggregate drawbar-force ceiling under the lower-voltage concurrent load, with a **48 kg** loaded robot. Acceleration can reach at most **2.0 m/s²**. If the registered braking bound is also **2.0 m/s²**, the greatest stop-to-stop distance in 2.5 s is **3.125 m**, short by **0.875 m**. Stop detailing this ratio for that role. Revise the role timing or drive arrangement and rerun both cases. If that changes the basic robot premise, [archive the design and start a new iteration](design-iterations.md).

#### Apply the loaded speed ceiling to the same route

Take a second candidate for the same 4 m, 2.5 s route. Its optimistic launch and braking bounds are both 3.2 m/s². An acceleration-only screen gives 5.0 m. Now use the actual strategy window: for this invented trial, a 12 V pack supplies at least 100 A to other loads through a shared 0.030 ohm path throughout the run. During positive drive the bus can supply at most 9 V. The wheel radius is 0.040 m, the reduction is 10 motor turns per wheel turn, and the motor back-EMF constant is 0.020 V per rad/s. At full duty, even ignoring drive sag, winding drop and drag, the drive cannot propel the robot above `9 × 0.040 / (10 × 0.020) = 1.8 m/s` on level ground from rest. This assumes no external assist or field weakening. For a loaded steady-speed estimate, include the motor current needed to balance resistance and solve for bus voltage at that same operating point.

Apply the speed ceiling to the entire stop-to-stop run. Reaching 1.8 m/s and braking from it consumes 0.5625 s each. That leaves 1.375 s at the speed ceiling. The two ramps and the cruise cover at most **3.4875 m**, short by **0.5125 m**. Revise this schedule or drivetrain before detailing. A single low-voltage sample would only bound speed at that instant. If the other load releases earlier, divide the route at that event and carry speed and position across the boundary.

Repeat the original strategy clock with the mechanism delayed. Include the mechanism's own completion and reset deadlines; moving its draw beyond the drive window can cost the next handoff. Run `npm run power:review -- path/to/comparison.json` on the two source-pinned schedules, then compare observed arrival, stop and mechanism completion in the [whole-robot comparison](#run-a-matched-review). Keep a passing voltage result and an unobserved route outcome separate.

A surviving screen justifies the next experiment. Check the speed where available wheel force balances resistance, then replay the acceleration, turns, stop and repeated duty at the original deadline. Specific shaft power limits acceleration at speed through `F = P/v`; wheel torque and traction bound launch, and thermal or protection limits can reduce repeated duty. Run `npm run power:review -- examples/power/comparison.json` to compare the same actuator schedule under two loads. Its voltage trace establishes an electrical margin. A timed trajectory with the actual payload, peer route and final stop supplies separate evidence for the role deadline. Record both margins and the observation that would reopen the choice. [Loaded route and peer occupancy](loaded-route.md) · [Loaded swerve simulation](../skills/frc-swerve/references/loaded-simulation.md) · [Shared power review](shared-power-review.md)

## Run a matched review

```sh
npm run architecture:compare -- examples/design-methods/architectures.json
```

The [invented comparison](../examples/design-methods/architectures.json) contains whole-robot objectives with one threshold and unit each, common nominal/adverse cases and candidate interface maps. In its [execution records](../examples/design-methods/fixture-results.json), one blocked shared channel misses the placement requirement and overlaps 16 A of driving with 12 A of transfer against a 24 A allowance. Follow that interval when deciding whether to reschedule the cycle or change the architecture.

Supply each run’s SHA-256 and project-relative JSON path. The optional last CLI argument supplies the project root when the study lives in a subfolder. `execution` points to the source object with the same `concept` and `case` IDs and a distinct `runId`. Every metric pointer must select a value within that execution. A missing case or metric stays open. Reusing a nominal result under a different case is rejected.

For a shared resource, declare its ID, units, capacity and basis in `resources`. Bind its usage to each source execution under `resourceUses`. Each use names its resource, activity, positive amount, startS and endS. Adjacent half-open intervals can share a resource. Simultaneous intervals add. Declare capacity one for an exclusive port or one fixture occupying a swept region, and use physical units for electrical or pneumatic budgets. Missing evidence for a declared budget stays open. Undeclared resources remain outside the comparison.

Read each governing margin alongside the trajectory and resource assumptions. A candidate qualifies only for the evaluated cases. Capture the selected concept, deliberate omissions, failed alternative, unresolved conditions and next physical or simulated experiment before issuing subsystem contracts.

## Test a refinement against the selected role

Ask the student which constraint could be wrong. In this example the receiver needs four seconds to reset. Must the whole robot wait with it? The reversible common channel keeps possession until reset finishes. The separate gate frees the drivetrain to fetch another piece. Draw the changed exchange and name what either architecture costs elsewhere in the robot.

```sh
node scripts/role-handoff.mjs examples/design-methods/role-selection.json .
node scripts/design-review.mjs examples/design-methods/role-architectures.json . --html design-decision.html
```

The [role selection](../examples/design-methods/role-selection.json) replays a 45 s field window. Four identified pieces remain at the supply and one is already aboard. Five credited placements give a target of 0.111 pieces/s. The [executable teaching model](../examples/design-methods/role-fixture.mjs) uses the same field conditions and stock in both designs. Their reset schedules give three versus five accepted pieces. Making the receiver unavailable for the first twelve seconds changes the comparison to three versus four. Open the generated HTML and select each case to see the design change, witnesses and remaining deficit. The model uses assumed timing. Student hardware needs its own integrated run.

In the [design manifest](../examples/design-methods/role-architectures.json), `roleHandoff.selection` identifies a source-pinned role selection. Each pair names before and after concept IDs, one common case, the challenged premise and the change made. The comparison shows the two interface maps. The student explains whether their physical paths really differ or whether this is a refinement of the same architecture.

Each native architecture execution can supply a `roleEpisode`, either a JSON pointer inside that execution or a pinned project-relative JSON reference. It must carry the execution’s concept, case and run ID, the distinct design revision, evidence class, actual field setup, peer plans, opening poses, cargo, queues and occupancy, and the role demand’s contract key, focal robot, period, station, criterion and window. Bind the executed clock start and cutoff to observations in `clockWitnesses`. Record the trial’s disturbance in `variation`, opening station stock in `initialPieces`, pieces aboard in `preloadedPieces`, and the time-ordered custody events. A credited outcome needs a witness from the focal robot at the selected station. New supply must agree with the field source, piece identity and return time. [Executable episode records](../examples/design-methods/role-fixture-results.json)

When two registered field policies illustrate the proposed change, supply their IDs in the pair’s optional `fieldPolicies.before` and `fieldPolicies.after`. The engine replays both for the selected station, phase, slot and context. It compares the window-entry conditions and shows their observed counts separately from the architecture trials. This can establish the value of an alternate route while installed transfer remains open.

Use the field actor, supply identity and clock in the installed experiment. A shorter bench clip, an incompatible stock mapping or a different scoring definition leaves the role-level delta open. Keep the narrower result in the existing objective table. A matched delta can support a refinement even while other whole-robot requirements fail. Repeatability needs the broader [hardening cohort](mechanism-hardening.md).

When a role relies on a partner, [compare the complete alliance service chain](alliance-completion.md) before selecting the robot architecture. Track the same piece from finite supply through delivery and reset on the match clock. Change partner availability and inspect which design completes more cycles.
