# Does the surviving holder still support both sides?

Trace the load down each side of the mechanism with drive power removed. Mark the actual attachment of every brake, belt, nut, catch, cross-link, guide and mount. A link between two shafts can share load when one holder fails. A broken local belt can leave the load disconnected from both linked shafts.

## Run the tabletop model

```sh
node examples/design-methods/make-lift-fault-fixture.mjs artifacts/lift-faults
npm run mechanism:review -- paths artifacts/lift-faults/study.json
```

Two loaded tiers descend on damped guides. Compare a spring connecting the shafts with the same spring connecting the tiers. Open the right belt. The shaft connection leaves the right tier uncoupled. Moving the connector to the tiers gives a modeled path through the left belt and holder. Increase lost motion and one tier reaches the racking limit even with a connected path. Release both holders and both tiers move downward together.

## Apply this to an installed revision

Register the installed topology and complete test plan in the robot project. Pin JSON evidence with its relative path, SHA-256 and pointer. Identify the two load stations and what supports the external anchor. A freely moving shaft can transfer differential force and still provide no absolute support. Document the load direction, gear sense, engaged interfaces and subassembly boundary. Add directed edges from load toward anchor under the selected unpowered load direction. List every component each edge requires. An interconnection that works in either direction needs both edges. Represent a shared mount, engagement or attachment with the same component ID wherever it is needed. Mark uncertain edges unresolved. A partial inventory leaves an untraced path open.

Save the plan digest before testing and pass it back with `--freeze-sha256 PLAN_DIGEST`. Freeze the original control, each holder lost, simultaneous loss of both holders, broken local transfers and every shared component removed on its own. Match starting load, backlash, friction, initial pose and boundary conditions. The coverage inventory shows any missing cuts. Add combined faults and bounded perturbations when they challenge the proposed protection. The graph reports the surviving component route for each load node. A connected graph still needs reaction sharing, torque, load ratings, engagement time, continued retention and service evidence. Where the governing travel limits or paired native history are unavailable, use `mode: "topology-only"` in the plan and an empty `runs` array. For a single load station, inspect its real series path without inventing a second displacement.

Bind every paired-motion record to the frozen topology, case, control state and power-cut event. In a separate pinned native control record, map each changed component to its actual executed state channel. Retain the complete interval history of drive power and applied fault state through termination, including any re-energization. Preserve typed values, integration or measurement interval, calibrated coordinate datums, the initial paired sample, sample count and actual stopping clock. The working example emits the plan, topologies, control records, paired motion and execution journal. Keep original native sources and adapter evidence in the project. Physical observations require justified measurement bandwidth.

At each native instant convert both signed coordinates to the same downward-positive frame. **Racking** is the absolute difference between the aligned positions, including initial skew. **Common descent** is the mean of the two displacements from the cut. **Individual descent** is the displacement on each side from the cut. Compare each measure with its own first-unacceptable threshold. Record the first crossing and stop interpreting the dynamics if the model terminates at guide contact or exhausted stroke. A positive conclusion requires the complete frozen hold interval.

Repeat a governing case with a smaller native step. Use project-specific tolerances for the change in peak travel and crossing time, alongside the first violated criterion. A repeat at a smaller step checks numerical sensitivity. Validate the transfer loads with the [coupled contact review](coupled-support.md), and check obstruction, actual holder engagement and working capacity with the [three-duty review](actuator-duty-review.md).
