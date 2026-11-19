# When the camera leaves its reference

A bright edge against a dark panel can help locate a held part while the robot is beside the panel. After the robot turns, that pixel can see a different surface. Compare the empty view at each pose. For every ray used by the observer, register which surface patch would appear behind the part, the camera and lens calibration, and the expected intensity range with and without the part. A CAD intersection can identify the backing surface. Lighting, gain, reflections and occluders still need their own bounds.

Run the invented tray study from the plugin root.

```sh
node examples/sensor-study/camera-reference.mjs examples/sensor-study/camera-frames.json
```

| Exposure | Which states fit the usable samples? | Decision |
| --- | --- | --- |
| At the bench | Seated | Permit |
| After leaving the bench, same side-pixel brightness | Empty or seated | Hold |
| In transit, center and rim visible against registered tray patches | Seated | Permit |
| In transit, bright rim and dark center | Shifted | Hold |

Copy the [study input](../examples/sensor-study/camera-frames.json) into the robot project. Each candidate state lists the rays occupied by the part. Each exposure supplies a measured byte intensity and the current empty-view patch identity per ray. Set the identity to `null` when its registration is unknown. Reusing an identity asserts that the same calibrated ray and patch registration, viewing geometry and radiometric bounds still apply. Determine this independently of the intensity being classified. A robot-owned surface can also move or fall into shadow. Mark a saturated, missing or unregistered ray unknown.

The [reviewer](../examples/sensor-study/camera-reference.mjs) keeps every modeled state consistent with the usable rays. Overlapping intensity ranges can leave multiple states possible. A permit requires at least one possible state and agreement from every such state. An image matching none of the modeled states also holds. Include credible empty, displaced, obstructed and look-alike cases, and test poses between samples or bound their projections. The exercise reviews one exposure at a time. Before granting motion, the project must also establish identity, independent witnesses where required, freshness on the control clock and the response to losing the observation.

## Could the premise be wrong?

Ask what has to be physically true for the next action. Seeing a part in its seat can establish its location. A loose part in the same seat can produce the same image and slide out as soon as the robot turns. Replay the identical four exposures with that additional possible state.

```sh
node examples/sensor-study/camera-reference.mjs examples/sensor-study/camera-frames.json --states examples/sensor-study/retention-states.json
```

Even the tray-backed observation now holds. For each ambiguous permit/hold pair the report lists registered rays that could distinguish the two states if recovered. It flags identical modeled silhouettes and overlapping intensity bands separately. An empty candidate list for identical silhouettes means recovering every ray at this view still leaves the decision unresolved. Test a new camera pose by projecting **both** states into that view. Two cameras that see the same outline can share the same blind spot.

| Candidate approach | Comparison on the same incoming state | What would rule it out? |
| --- | --- | --- |
| Move the camera or add a known backing surface | Project the mounted optical path over the whole maneuver, including moving parts, glare and expected pose error. Replay a shifted, empty or escaping part as well as a correctly held one. | A credible held and unsafe state still looks alike, or the usable view disappears before the action completes. |
| Confirm retention through another physical quantity | Compare a loaded and an empty capture, then vary grip or slip independently of appearance. Check what a force, travel or motion reading can actually distinguish. | The same reading occurs with an empty clamp or with insufficient holding force. |
| Change how the mechanism retains the part | Model a captured load through the required acceleration, then challenge release, escape paths and an incomplete latch. Determine when confirmation is needed next. | A disturbance can still eject the part without detection, or the constraint prevents the intended release. |

Record the failure that reopened the decision, which assumption it challenges, and the acceptance and rejection cases for each credible alternative. Compare cycle time including stops, risk of a false permit, packaging, implementation complexity and calibration or maintenance effort. Choose the simplest design that meets the physical requirement under those tests. If none has qualified, record the discriminating experiment and retain the safe stop.
