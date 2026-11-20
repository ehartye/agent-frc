# Compare whole-robot architectures

Before detailing a subsystem, ask a student to follow one match objective through the complete robot and back to its ready state. Sketch different ways to allocate the functions. A reversible common path can save parts but occupy the receiver while it resets. An independent side path can free the receiver but consume width, wiring and service space. Compare each with the simplest role the team could still play.

Use the project’s native assembly datum, footprint and field setup for every concept. Show piece and wire paths, sensors, released/retained states, robot and field clearances, installed mass and CG, simultaneous current and timing, tool access, replacement path and recalibration. Give each interface an owner, exchanged quantity, limits and failure response. Capture the dated geometry, executable strategy and metric definitions with the results.

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
