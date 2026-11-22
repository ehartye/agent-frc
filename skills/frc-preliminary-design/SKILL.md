---
name: frc-preliminary-design
description: "Use for preliminary design of the whole robot: compare architectures, establish a shared top-down assembly layout, check motion and review weight and loaded-voltage budgets."
---

# Preliminary design of the whole robot

**Pre-read the current strategic narrative before sketching or revising the layout.** Read it end to end. Walk through the opening, repeated cycles, endgame, partner-dependent objectives and fallbacks that it calls for. Pin the project narrative in the review and record how each objective is represented, remains open, or was explicitly scoped out and why. Revisit this list at handoff. A subsystem experiment can cover a narrower question while the whole-robot review retains the other objectives.

For every placed member, write its **purpose** (the job it performs) and **rationale** (the requirement, interface, constraint or tradeoff that earns it space here). Include supports, controls, game pieces and service gauges. Use its placed ID in the [review presentation](references/presentation.md) so selecting it reveals both explanations.

When lifting or tipping a game piece, test retention separately from the animated path. At each change of support, project gravity into the holder frame, identify contacts that can push back, and sweep the entire piece toward a possible exit. Repeat with grip or power removed, including the worst loaded angle. Record a restraint, measured friction and preload, or an open retention finding. Use a free-piece simulation or load test to check dynamic capture, slip and release. [Contact and load evidence](../../docs/loaded-transfer.md)

When a successful transfer might justify removing a part, [isolate its contribution](../../docs/preliminary-design.md#isolate-the-cause-of-a-successful-transfer) under nominal and adverse conditions. Identify which motions were imposed and where load could change the result.

During preliminary design, use a top-down assembly layout. Share one moving layout, its checked clearance, complete weight estimate and loaded-voltage range before distributing detailed CAD. [Engineering detail and exit criteria for the three phases](../../docs/design-phase-detail.md)

Build the review inside the season project or active iteration. Use the [whole-robot review layout template](references/review-layout-template.md) for the viewer, figure strip, inventory, weight and electrical ledgers, and motion evidence. Trace each moving group to a frame attachment, actuator, usable travel and service path before distributing its datum. Commit the project-relative launcher, local assets, data and evidence so another designer can run the same review after cloning. Keep the static review publishable from main, show the latest issue by default and preserve earlier releases at stable `?release=` links. Each release is a work-in-progress preliminary design. It need not be detail-ready, but it deploys only with a layout-checked receipt and a declared mission-task case that plays a represented narrative objective. On a combined season site it stays secondary to the latest detailed design. [Preliminary release gate](../../docs/private-model-release.md#publish-work-in-progress-preliminary-releases) Use the [presentation reference](references/presentation.md) to commission the interaction and physics checks.

Start with the alliance role, scored event, reserve time and fallback. Walk one identifiable piece through approach, capture, retention, transfer, placement and reset. Include the robot's position, occupied volume, time, controls and energy. Mark the operations that can overlap and the shared resources that prevent overlap.

Before detailed CAD or purchase, name the premise most likely to invalidate the role. Set a modest work budget and a measurable stop condition for one nominal and one adverse test. Record the result, make a continue, revise or start-over decision, and commit the evidence. Mark common interfaces as provisional or verified with the loads, tolerances and changed conditions that reopen them. [Worked loaded-drivetrain decision](../../docs/whole-robot-comparison.md#decide-what-to-fix-before-detailing)

For a greenfield review, start from the mission, field and game-piece geometry, legal envelope and operating requirements. Establish new frame, joint and mounting datums in the preliminary layout. Carry forward an earlier CAD interface only when the project explicitly selects it and records the reason. Qualify the new design against its own motion, weight and electrical budgets.

Sketch competing allocations of these functions before choosing purchased mechanisms. Use a simple baseline. Try removing a transfer, reversing a path, using passive geometry or arranging parallel functions. A change in material or supplier alone provides little architectural contrast. State what each candidate deliberately gives up.

Create one editable blockout per plausible architecture in the project. Show the same drivetrain, datum, field targets, loaded mass and CG bounds, power source, wiring and service envelope. Mark the parts sharing a port, volume, current budget or driver action. Name the owner, trigger, clearance, failure behavior and recovery for each interface, including returning to a known state after servicing.

After conceptual design and role selection, own the [shared package layout checkpoint](../../docs/preliminary-design.md). Resolve the active issue, fixed geometry, loaded and simultaneous motions, park and service paths before dividing detailed Fusion work among subsystem designers. Record each premise’s scenario, accepted limit, evidence, owner phase and dependent interfaces. When rollers or a lip move the payload without a rigid carrier, [declare the contact transport](../../docs/preliminary-design.md#move-a-payload-by-contact-transport) and pin the trial that established its path. Reopen layout for a lost clearance. Reopen the matched field rehearsal when a changed capability violates its accepted approach, timing or height. Hold affected detailing until the current issue passes the repeat. When the held premise is a delivery position, move the scoring step in the field profile, re-run the series and [replay its stand-off](../../docs/preliminary-design.md#resume-a-held-delivery-position). Replay every attempt at the station when the held premise names no single step.

Trace both the support path from each moving load to the frame and its drive path from the actuator to the load. Include the occupied shafts, bearings, carriers, stops and mounts that govern clearance. Mark an absent connection in the layout and review.

Before fixing a mechanism footprint, choose its [attachment stock, pattern and tool side](../../docs/attachment-design.md). Sketch the signed load into the chassis, compare two placements on actual supporting members and reserve room for bracket stock, fasteners, tools and the complete removal path at the worst permitted combination of offsets.

At a meaningful CAD change or saved revision, [check the intended seats, loaded mass and CG, remaining reserve and worst concurrent voltage](../../docs/fusion-design-checkpoints.md). Record the controlling case and rerun the timed route if the change consumes its margin.

Select one architecture for the review handoff. Animate every mission-critical interaction on that same revision with the project’s dimensioned field fixtures, finite game pieces and applicable rule observer. Derive the motion that decides the outcome from a phase-appropriate physical model. Show the actual result and the first failed requirement. [Field interactions and physics playback](references/presentation.md#field-interactions-and-physics-playback)

Once a candidate is selected, [freeze its required articles and current functions](../../docs/article-functions.md) before opening a donor assembly. Give reused parts and fasteners a current interface and a planned physical site. Hand the approved roster to CAD with the architecture decision.

Run the [whole-robot comparison](../../docs/whole-robot-comparison.md) against common nominal and adverse conditions. Inspect integrated execution records and score the same external outcome. Reject an infeasible resource schedule even when its independent subsystems pass. Keep unresolved constraints visible and carry the most discriminating next experiment forward. Hand the selected assembly, rejected alternative, interface datums and measured margins to mechanism CAD and controls.

Use the student’s [saved role and refinement comparison](../../docs/whole-robot-comparison.md#test-a-refinement-against-the-selected-role) when revising an architecture. Read the actual window stock and role criterion. Show the before and after piece witnesses under the same peer setup, clock and source. If a shorter bench test addresses one interface, preserve that finding alongside the open full-robot requirement.

When a role relies on a partner, [compare the complete alliance service chain](../../docs/alliance-completion.md) before selecting the robot architecture. Track the same piece from finite supply through delivery and reset on the match clock. Change partner availability and inspect which design completes more cycles.

For a project with `iterations/active.json`, follow its active design root before recovering older records. After a decision to start over, use `frc-start-over` to preserve the evidence and open a fresh numbered design. [Design iterations](../../docs/design-iterations.md)
