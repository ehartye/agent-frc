# Engineering detail by design phase

Use the least detail that can answer the decision for the current phase. At each handoff, name the revision, the assumptions the next phase may rely on, the permitted ranges and the result that would reopen the decision.

## 1. Pre-vis — field movement and required performance

Represent the robot as a moveable prism with rough length, width and height. Mark the proposed pickup and release zones relative to the robot. Keep the approach face independent of the direction the robot is driving. Represent the game piece, target and field obstacles at a scale that matters to the route.

Rehearse the same scoring opportunity with competing approaches. Show headings, clearance on the field, partner traffic, pickup and delivery heights, travel speed, acquisition time, release rate and reset time. Label each value as required, assumed or observed. Where pickup behavior is outside the rehearsal tool's support, record that assumption and leave its result open.

**Ready for component blocking:** the team can replay its chosen cycle, explain why it chose that approach and say how much slower, larger or less accurate the robot could be before the choice would change.

## 2. Component blocking — one shared moving layout

Place labeled polyhedra for the frame, bumpers, drivetrain, mechanisms, game piece, battery and other occupied space in one editable robot coordinate system. Give each block dimensions, a function and a fixed or moving parent. Set provisional mounting locations, pivot axes, angles, strokes and handoff poses. Reserve room for cables, tools and part removal where those paths constrain placement.

Animate gross mechanism motion through stow, acquisition, loaded transfer, release and reset. Show mechanisms that run together moving on the same clock. Show the piece entering, transferring and leaving. Include any service withdrawal that drives the layout. Use the animation to review the motion and a clearance check on the same geometry and trajectory to verify it between frames. Unrelated occupied volumes must remain separate with the required allowance. Identify intended contact at a particular interface and pose, such as a roller touching the piece.

**Ready for detailed CAD:** the shared issue includes the labeled layout, viewable motion, checked paths and the two whole-robot budgets below. Each passes for the proposed operating range. An unknown input that could overturn the decision keeps its dependent interface provisional.

| Budget | What the review must show |
| --- | --- |
| Weight | Estimated subsystem masses, allowances for unmodeled parts and a complete robot mass range. Compare the upper estimate with the applicable inspection limit. Use the loaded running mass for duty calculations. |
| Voltage | Estimated battery-bus voltage under simultaneous drive and mechanism loads across the selected cycle, including the weak-battery case. Compare the minimum with the project's operating threshold and verify enough voltage remains to perform the required motion. |

## 3. Detailed CAD — build-ready mechanical definition

Use the current editable Fusion assembly. Use manufacturer CAD for purchased components in the selected revision and configuration wherever available. Identify any dimensional substitute, its source and uncertainty. Model fabricated parts with their actual material, joints, fasteners, tolerances and fabrication features. Resolve critical interfaces that a substitute cannot establish.

Animate the installed Fusion mechanisms using their actual joints and limits. Recheck the complete loaded cycle and service motions against the saved, reopened assembly. Update the mass and electrical budgets from the selected components and actual load cases.

**Ready for fabrication:** the project has the drawings or machining definitions, bill of materials and assembly sequence needed to build it. All applicable mechanical-readiness checks have passing evidence on this issue, including attachment and retention, interference and allowed contact, clearances under tolerance and load, strength and stiffness, manufacturability, assembly and service access. Record whether each result came from calculation, simulation, native inspection or a physical test. A failed or unresolved required check keeps the build-ready claim open. [Mechanical-readiness review](mechanical-readiness.md)

## When to return to an earlier phase

If detailed CAD violates a reserved volume, path, mass allowance or loaded-voltage range, reopen the affected component blocking and repeat its checks. If the revised layout changes a field assumption beyond its accepted range, repeat pre-vis with the new height, approach, rate or speed. Pause the downstream decisions that rely on the failed assumption. Resume them when the revised shared issue passes and its consumers have adopted it.
