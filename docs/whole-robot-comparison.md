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
