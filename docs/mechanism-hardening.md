# Check robot elevation and scoring throughput

Use the installed revision and the match narrative’s external scoring criterion. Simulate normal operation, adverse conditions, interruption and return to service. Keep bench evidence, integrated simulation and physical testing identifiable in the project.

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

## Can the robot repeatedly score at the required rate?

```sh
npm run mechanism:review -- throughput examples/design-methods/throughput.json
```

Pin the strategy demand’s piece count, complete time window, focal robot, window scope, scoring-criterion ID, meaning and source. A successful delivery to a partner can be a valid distinct objective. It earns direct scoring evidence only when the relevant scoring witness is observed. Source files live under the study directory or the optional project-root CLI argument.

Freeze runs from the same revision, external outcome criterion and evidence class. Vary actual starting or disturbance parameters. Supply the complete half-open window, unique pieces at stations, separate preloaded pieces in possession and timed arrivals, acquisitions, misses and witnessed acceptances. Count a returned piece again only when the rules allow recycling and the actual return is witnessed. Time spent retrieving, transporting, waiting, recovering and resetting stays in the denominator. Preserve all attempts and open windows.

Compare the observed worst and lower-percentile rates, failed attempts, each interval between acceptances and the remaining interval without acceptance. The lower percentile describes the supplied runs. Two distinct simulations can illustrate sensitivity without establishing a population reliability bound. Rerunning a renamed deterministic start adds no variation. Use the original cohort plus a held-out disturbance after refinement. Publish the exact criterion, rates, mechanisms with unknown capacities, service recovery result and physical verification still needed.
