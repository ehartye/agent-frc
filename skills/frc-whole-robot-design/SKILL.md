---
name: frc-whole-robot-design
description: "Develop and compare original whole-robot architectures from a chosen match role, especially before allocating mechanisms or committing to detailed CAD."
---

# Choose how the whole robot works

Start with the alliance role, scored event, reserve time and fallback. Walk one identifiable piece through approach, capture, retention, transfer, placement and reset. Include the robot's position, occupied volume, time, controls and energy. Mark the operations that can overlap and the shared resources that prevent overlap.

Before detailed CAD or purchase, name the premise most likely to invalidate the role. Set a modest work budget and a measurable stop condition for one nominal and one adverse test. Record the result, make a continue, revise or start-over decision, and commit the evidence. Mark common interfaces as provisional or verified with the loads, tolerances and changed conditions that reopen them. [Worked loaded-drivetrain decision](../../docs/whole-robot-comparison.md#decide-what-to-fix-before-detailing)

Sketch competing allocations of these functions before choosing purchased mechanisms. Use a simple baseline. Try removing a transfer, reversing a path, using passive geometry or arranging parallel functions. A change in material or supplier alone provides little architectural contrast. State what each candidate deliberately gives up.

Create one editable blockout per plausible architecture in the project. Show the same drivetrain, datum, field targets, loaded mass and CG bounds, power source, wiring and service envelope. Mark the parts sharing a port, volume, current budget or driver action. Name the owner, trigger, clearance, failure behavior and recovery for each interface, including returning to a known state after servicing.

Before fixing a mechanism footprint, choose its [attachment stock, pattern and tool side](../../docs/attachment-design.md). Sketch the signed load into the chassis, compare two placements on actual supporting members and reserve room to remove the mechanism.

At a meaningful CAD change or saved revision, [check the intended seats, loaded mass and CG, remaining reserve and worst concurrent voltage](../../docs/fusion-design-checkpoints.md). Record the controlling case and rerun the timed route if the change consumes its margin.

Once a candidate is selected, [freeze its required articles and current functions](../../docs/article-functions.md) before opening a donor assembly. Give reused parts and fasteners a current interface and a planned physical site. Hand the approved roster to CAD with the architecture decision.

Run the [whole-robot comparison](../../docs/whole-robot-comparison.md) against common nominal and adverse conditions. Inspect integrated execution records and score the same external outcome. Reject an infeasible resource schedule even when its independent subsystems pass. Keep unresolved constraints visible and carry the most discriminating next experiment forward. Hand the selected assembly, rejected alternative, interface datums and measured margins to mechanism CAD and controls.

Use the student’s [saved role and refinement comparison](../../docs/whole-robot-comparison.md#test-a-refinement-against-the-selected-role) when revising an architecture. Read the actual window stock and role criterion. Show the before and after piece witnesses under the same peer setup, clock and source. If a shorter bench test addresses one interface, preserve that finding alongside the open full-robot requirement.

When a role relies on a partner, [compare the complete alliance service chain](../../docs/alliance-completion.md) before selecting the robot architecture. Track the same piece from finite supply through delivery and reset on the match clock. Change partner availability and inspect which design completes more cycles.

For a project with `iterations/active.json`, follow its active design root before recovering older records. After a decision to start over, use `frc-start-over` to preserve the evidence and open a fresh numbered design. [Design iterations](../../docs/design-iterations.md)
