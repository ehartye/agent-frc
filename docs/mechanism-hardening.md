# Check robot elevation and scoring throughput

Use the installed revision and the match narrative’s external scoring criterion. Simulate normal operation, adverse conditions, interruption and return to service. Keep bench evidence, integrated simulation and physical testing identifiable in the project.

For a powered lift, check working stroke, force at an obstruction and retention from the actual cutoff in the [three-duty carriage study](actuator-duty-review.md).

## Can every lifting assembly sustain the robot?

```sh
npm run mechanism:review -- elevation examples/design-methods/elevation.json
```

Pin a project-owned inventory of every mechanism that supports or raises the robot. Include its mating attachment and field contact. Record excluded shop fixtures separately. Declare the loaded mass and evidence for the upper bound across installed parts, battery, retained pieces and uncertainty. An assumed mass can expose an infeasible design while a passing scenario at that mass leaves actual capacity open.

In a common vertical plane choose positive horizontal x and upward vertical force. Supply support stations, CG coordinate, acceleration and the signed externally applied moment. With two simple supports a distance L apart, total upward demand W = m(g + a). The right reaction is [W(xCG − xLeft) + M] / L. The left reaction is the remainder. A negative reaction loses unilateral support. A single active support carries all of W. The residual applied moment W(xCG − xSupport) + M must be balanced for the specified pose. A freely hanging assembly may settle beneath its support. Analyze the reached pose and independently check the transition, swept clearance and retention before claiming that outcome.

Use `geometry: "single-support"` for a single hanger and `"two-simple-supports"` for separated stations. To simulate a missed support set `unavailableSupport` on that case. A simple point support with a residual moment fails pose equilibrium. For a verified bracket supply the active support’s `momentRestraint.path`, including member and anchor ratings for each mode. Each rating declares kind, unit Nm, signed applied-moment direction (positive, negative or both), working value and basis. Active elements credited on power loss need an unpowered rating. Geometries with additional unknown reactions require a project-specific model.

Trace each supported reaction through the transmission, member, anchor and actuator or lock. For every stage declare its load direction, mechanical advantage and efficiency for that geometry. Inclined chain legs need their actual tension from statics. Divide the vertical reaction by the effective mechanical advantage and efficiency, apply the stated design factor and use the actual radius for torque. For each of raise, hold and power-loss, specify applicable working/holding capacity or allowable analysis, units, load direction, and the source of the value. A basic dynamic bearing rating, motor stall value, powered holding torque or service fixture alone supplies insufficient evidence of retained robot weight.

Include worst extension, acceleration, off-center mass, hold and loss of power. Inspect all missing stages, negative force or torque margins and unbalanced moments. A result only covers its declared plane, poses and load paths. Lateral instability, impact, fatigue, section buckling, friction variability and brake-engagement transients require separate applicable evidence. See the [invented inventory and receipts](../examples/design-methods/fixture-results.json).

## Does the suspended pose resist pitch and roll?

A pair of vertical hooks can divide the weight and still leave the robot free to rotate about the line joining them. Use the project frame with +Z up. Draw the support stations and loaded CG in XY at the **same pose**. Start and settled hanging positions may have different world coordinates. A balanced final pose also needs a verified transition, clearance and continued retention.

```sh
npm run mechanism:review -- elevation examples/design-methods/spatial-elevation.json
```

The [diagonal support fixture](../examples/design-methods/spatial-fixture.json) has two supports a metre apart. With the CG halfway along their line they carry equal vertical force. Shifting a 20 kg load 100 mm perpendicular to the line keeps those forces equal while producing 19.61 N·m about the free axis. Its component capacities are left open so students can see the difference between balancing a pose and sustaining its load.

Set the model geometry to `spatial-vertical-supports` with one or two supports. Use `xyM: [x,y]` per station, `cgXYM` and `appliedMomentXYNm: [Mx,My]` per case. All coordinates use metres in the same right-handed frame. External couples use the right-hand rule in N·m. State `appliedMomentBasis` for a nonzero supplied couple. If claiming a brace or opposed contact pair produces that couple, independently verify the contact, direction, reaction force, strength and complete force balance at the same pose. A required reaction is a design demand, and crediting that demand as an input would make the equilibrium check circular. Missing coordinates or moments leave the calculation open.

At the first active station, the downward load gives the moment vector `[-WΔy, WΔx]`, where `W = m(g + az)`. Add the externally applied couple. For two stations, let `t` be the unit direction from first to second, `n = [-ty, tx]`, and `L` the separation. The second station carries `dot(moment,n)/L`; the first carries the remainder. Subtract `n × L × secondReaction` from the moment vector. The remainder is parallel to the support line. With one station, its vertical reaction carries the full load and both horizontal moments remain. Removing a support reruns that balance about the remaining contact. A negative unilateral reaction fails the pose.

Read `residualAfterVerticalForcesXYNm` as applied load still requiring restraint. `requiredRestraintReactionXYNm` gives the equal and opposite reaction. For a physical, rated moment restraint, supply the support’s `momentRestraint.axisXY`, its installation `basis` and its member/anchor rating path. Rating directions refer to the signed **applied demand** along that axis. With two stations a single rated restraint parallel to their line preserves the solved force split. A transverse restraint or multiple restraints can change that split and requires a project-specific stiffness model. Any remaining off-axis moment fails the stated pose.

The spatial check covers vertical reactions, acceleration along Z, and two horizontal moment equations. Horizontal forces, yaw, lateral slip, compliance, impacts and transient rotation require separate evidence. A moment-balanced pose can still fail a working load rating or retain an unknown capacity. Existing one-plane studies keep their original output and scope.

A horizontally braced or frictional suspension needs its [complete coupled contact wrench](coupled-support.md), including the signed yaw moment and contact capacities.

## Can the robot repeatedly score at the required rate?

```sh
npm run mechanism:review -- throughput examples/design-methods/throughput.json
```

The original `throughput-study@1` command above preserves rates, cycle intervals, misses, and the observed outcome for each submitted window. Its `observedStatus` describes those observations. The repeatability verdict stays open because those receipts do not bind a frozen native parameter or match-clock anchor.

### Freeze and replay a timing study

```sh
node examples/design-methods/make-throughput-cohort.mjs artifacts/rate-demo
npm run mechanism:review -- throughput artifacts/rate-demo/study.json
```

The original tabletop model waits for a shared aisle and transfers one identified block at a time. Its objective is two receiver-switch observations in the first ten seconds of the work phase. Compare a clear aisle, a two-second queue and a five-second held-out queue. The phase starts at match time 20 s, so only observations in [20, 30) count. The runs deliver three, two and one. The refinement fails its held-out requirement. Change the simulated wait or cycle, capture another complete cohort and compare all three settings.

1. Freeze an external demand or the Field Lab’s [downloaded role selection](whole-robot-comparison.md). A role selection recomputes its finite opportunity and uses its contract key as the outcome criterion ID. The native execution must reproduce its field conditions, opening inventory, held pieces, source identities and replenishment times. Arrival times are compared on the observed native clock. For a project-defined objective give `requiredPieces`, `windowS` in seconds, `focalRobot`, `station`, `criterionId`, `criterion`, `outcome` (acquired or credited), a source `basis`, and an `anchor`. Choose `{ "basis": "phase-start", "phase": "work", "offsetS": 0 }` or `{ "basis": "match-start", "offsetS": 12 }`. Missing source opportunities support no positive rate claim.
2. Save the `agent-frc/throughput-cohort@1` before execution. Pin the demand file and pointer, candidate revision, evidence class, case IDs, evaluation or held-out partition, typed parameter axes and values. Give each axis its units and its pointer into the runner’s native initial state. Supported types are number, boolean and enum with declared choices. Evaluation and held-out settings must be disjoint. A refinement requires at least one of each. Pin the original cohort file in the refinement’s `baseline`. Every original case ID and setting must reappear in the evaluation partition, with the same demand and parameter axes. Record a new freeze for each candidate revision. Keep the original freeze digest in an independent project log before running. The teaching generator writes freeze and receipts together.
3. Each original execution emits `agent-frc/throughput-execution@1` with that digest, its case/run IDs, revision, evidence class, focal robot, criterion and actual native inputs. Its ordered `clock` records observed match start/end, the named phase start/end when applicable, and observations at the selected window endpoints. Use times from one native clock for the entire trace. A window that starts at a later favorable time, even of equal duration, cannot qualify. A timing model, field rehearsal, integrated simulation and physical run each form a separate cohort.
4. Record stock, preloads and events using the existing piece ledger. Enter arrivals only when available. Record actor on every custody event. Each event for the outcome under review needs a station, criterion ID and observed witness. Count only matching outcomes. Failed attempts, waits and the final interval after the last success stay in the denominator. A returned piece needs a witnessed legal return before earning another credit. Source files and native sensor/scorer semantics belong to the project.
5. Point the `agent-frc/throughput-study@2` journal at the frozen file and the native receipt for each original case. Use file-relative paths, SHA-256 digests and JSON pointers for all references. Pass `--freeze-sha256 SAVED_DIGEST` to the CLI to compare the freeze with your independent record. Missing runs remain in the roster. Inspect each input, actual window, accepted count, failed attempts, intervals and reason for an open case. A passing cohort requires every frozen case to meet demand and at least two distinct qualified settings. Worst and lower-percentile rates describe the observed cohort. Population reliability and physical performance require separate evidence.
