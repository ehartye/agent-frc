# Engineering detail by design phase

Use the least detail that can answer the decision for the current phase. At each handoff, name the revision, the assumptions the next phase may rely on, the permitted ranges and the result that would reopen the decision.

## 1. Conceptual design

Write the concept of operations (ConOps) for the proposed match role. Describe how the robot, partners and operators would carry out a scoring cycle in typical and adverse match scenarios. Use field rehearsal for a trade study of competing cycles. Represent the robot as a movable prism with rough length, width and height. Mark the proposed pickup and release zones relative to the robot. Keep the approach face independent of the direction the robot is driving. Represent the game piece, target and field obstacles at a scale that matters to the route.

Rehearse the same scoring opportunity with competing approaches. Show headings, clearance on the field, partner traffic, pickup and delivery heights, travel speed, acquisition time, release rate, reset time and the cost of retrying after a miss. Label each value as required, assumed or observed. Where pickup behavior is outside the rehearsal tool's support, record that assumption and leave its result open.

Move to **preliminary design** when the team can replay its chosen cycle, explain why it chose that approach and say how much slower, larger or less accurate the robot could be before the choice would change.

## 2. Preliminary design

Develop a top-down assembly layout around agreed mounting and motion references. One available CAD technique is a skeleton model containing the common datums, interface geometry and joint axes. Place labeled representative solids for the frame, bumpers, drivetrain, mechanisms, game piece, battery and other occupied space in one editable robot coordinate system. Give each block dimensions, a function and a fixed or moving parent. Set provisional mounting locations, pivot axes, angles, strokes and handoff poses. Reserve room for cables, tools and part removal where those paths constrain placement.

Animate gross mechanism motion through stow, acquisition, loaded transfer, release and reset. Show mechanisms that run together moving on the same clock. Show the piece entering, transferring and leaving. Include any service withdrawal that drives the layout. Use the animation to review the motion and a clearance check on the same geometry and trajectory to verify it between frames. Unrelated occupied volumes must remain separate with the required allowance. Identify intended contact at a particular interface and pose, such as a roller touching the piece.

Keep the layout a blockout: as guidelines, about 30 to 80 solids, clearances answered to about 10 mm, and about ten minutes for a whole-cycle check or a trial campaign. Fasteners, bearings, shafts, lines and brackets wait for detailed design unless one is the risk being examined. [Scope guidelines and the check-in](preliminary-design.md#keep-the-layout-a-blockout)

A preliminary design publishes as `in-progress` as soon as its layout check passes and it plays one mission case. It is then revised in place, draft by draft. The layout check covers the motion and the two whole-robot budgets below, each for the proposed operating range.

Preliminary design ends, and **detailed design** begins, when the design is marked `effective` against the [exit criteria](#exit-criteria-for-an-effective-preliminary-design). There is one exit. An unknown input that could overturn the decision stays on the risk list with its bench test.

| Budget | What the review must show |
| --- | --- |
| Weight | Estimated subsystem masses, allowances for unmodeled parts and a complete robot mass range. Compare the upper estimate with the applicable inspection limit. Use the loaded running mass for duty calculations. |
| Voltage | Estimated battery-bus voltage under simultaneous drive and mechanism loads across the selected cycle, including the weak-battery case. Compare the minimum with the project's operating threshold and verify enough voltage remains to perform the required motion. |

## 3. Detailed design

Build on the effective preliminary design and its [handoff](#what-preliminary-design-hands-to-detailed-design). Use manufacturer CAD for purchased components in the selected revision and configuration wherever available. Identify any dimensional substitute, its source and uncertainty. Model fabricated parts with their actual material, joints, fasteners, tolerances and fabrication features. Resolve critical interfaces that a substitute cannot establish.

A detailed design can publish as `in-progress` once it links the effective preliminary design, the STEP exported from the registered Fusion design passes the layout check on that design's motion cases, and a mission animation plays on the detailed geometry. It becomes `effective` in a reviewed pull request that carries a passing mechanical-readiness review. [Publish a detailed design](design-publication.md#publish-a-detailed-design)

Animate the installed Fusion mechanisms using their actual joints and limits. Recheck the complete loaded cycle and service motions against the saved, reopened assembly. Update the mass and electrical budgets from the selected components and actual load cases.

Detailed design owns the detail a blockout leaves out: the parts list, shafts, bearings, fasteners, attachment stock and tool side, tolerances, wiring space and the Fusion mass and voltage checkpoints. [Order of work](../skills/frc-detailed-design/SKILL.md#order-of-work)

The mechanical-readiness review can accept the fabrication package as **build-ready** when the project has the drawings or machining definitions, bill of materials and assembly sequence needed to build it. All applicable mechanical-readiness checks have passing evidence on this issue, including attachment and retention, interference and allowed contact, clearances under tolerance and load, strength and stiffness, manufacturability, assembly and service access. Record whether each result came from calculation, simulation, native inspection or a physical test. A failed or unresolved required check keeps the build-ready claim open. The review result reports one verdict under two names, `buildReadiness` and `showcaseEligibility`, so a design cannot hold one without the other. [Mechanical-readiness review](mechanical-readiness.md)

## When to return to an earlier phase

If detailed design cannot keep a reserved envelope, path, allowance, mass reserve or loaded-voltage margin, return it to preliminary design. An effective design does not change, so the fix is the next minor version of the same architecture, started from the effective one, with the affected cases rerun. A fix that needs a different architecture is the next major version. If the revised layout changes a field assumption beyond its accepted range, repeat the conceptual trade study with the new height, approach, rate or speed. Pause the downstream decisions that rely on the failed assumption. Resume them when the revised design is effective and detailed design has adopted it.

## Design status

Every design phase uses the same four statuses for a published design. They apply to [preliminary designs](design-publication.md#publish-a-preliminary-design-release) and to [detailed designs](design-publication.md#publish-a-detailed-design).

| Status | Meaning |
| --- | --- |
| `in-progress` | Passes the phase's automated checks and may be shown, labelled as in progress. |
| `effective` | The project has accepted it as the current design for that phase. At most one design per phase is effective; marking a new one effective marks the previous one `superseded` automatically. For preliminary design, the effective design is what detailed design builds on. |
| `superseded` | Replaced by a newer effective design. An in-progress design that was never accepted is marked superseded by hand when a different one replaces it. It stays viewable as history. |
| `withdrawn` | Pulled with no replacement. The index keeps its reason and the last commit that held its files. The files leave the site and stay in Git. It is never shown as current. |

A design also has a name and a version, such as "Tilting carriage 1.0": the major number is the architecture, the minor number counts its effective baselines, and a draft is work in progress toward the next baseline. Drafts do not consume numbers; a new number is only for a new effective baseline or a new architecture. The status stays separate from the number. A detailed design takes the same name as its preliminary design, the same major number and its own minor number, so the catalog reads "Tilting carriage 1.0 · effective", built on preliminary design "Tilting carriage 1.1". [Name and number a design](design-publication.md#name-and-number-a-design)

A new design enters `in-progress`. While it is in progress it is [revised in place](design-publication.md#revise-an-in-progress-release-in-place) under its one version, each publish counted as a draft. It stops changing when it is marked effective. A new minor version is for the design that follows an effective one, and a new major version is for a different architecture.

The usual changes are in-progress to effective, effective to superseded (automatic), in-progress to superseded once a different design is current (`--set-status VERSION superseded`) and any status to withdrawn.

The status lives in the index, never in a design's own record, so changing it never rewrites published evidence. Every status change is an index edit in a reviewed pull request, and Git history records it. [One check covers every published design](design-publication.md)

### Exit criteria for an effective preliminary design

A preliminary design is ready to be marked effective when all three hold:

1. **Whole mission cycle.** Every phase of the mission cycle has a passing case in a layout-checked receipt, so clearance, mass and loaded voltage are checked for the whole cycle: acquire, retain, transfer, deliver, reset, endgame, park and service. A fragment of the cycle does not qualify. One coarse case for each phase is the starting plan.
2. **Interactions meet their bar.** Every interaction that decides the design meets the bar its screen verdict sets: a planar trial where one section answers it, a 3D trial where it does not, and, where a simulated result is only a best guess, a passing best-guess case with a declared adjustment that covers the assumed range. Each trial rejects its control, holds across its ranges and agrees at half the step. Every mission case is backed by one of these interactions.
3. **Risks resolved.** Every open risk is closed by a design change or recorded as a bench test with pass and fail numbers.

The library's campaign does the method for each trial: the nominal run, the control, each assumed range at its ends, the half step and the coverage of each adjustment. [The effective bar](../skills/frc-preliminary-design/references/trials.md#what-the-effective-bar-asks-of-each-trial)

Publishing an in-progress draft asks less: a passing layout check and one mission case, which may follow a prescribed path.

Physical bench results are not required. They are listed as verification items for the build, and detailed design takes each one up as a [bench-test record](design-publication.md#bench-tests-handed-over-from-preliminary-design): a result for the tests that gate the build and an owner and a plan for the tests run on the robot, before the detailed design is effective. The [effective-readiness report](preliminary-design.md#judge-readiness-to-be-marked-effective) lists each criterion as met or not met with the reason. It is informational: the publication check prints it and does not fail on it, and the decision stays with the reviewed pull request.

### What preliminary design hands to detailed design

The handoff is the effective preliminary design's folder plus one short note, `HANDOFF.md`, in that folder. The note says where each item is and what to do first.

| Item | Where it is |
| --- | --- |
| The design source and the solids generated from it, one named solid per functional volume | The design's folder |
| Robot frame and datums: origin, forward, floor height, each pivot axis, travel and mounting face | The design source and the note |
| Envelopes: frame perimeter, bumpers, parked height, greatest reach | The note |
| Interfaces with allowances: each fit tighter than about 10 mm, each intended contact or squeeze, each connection not yet drawn | The design source, the judgement file and the note |
| Operating point and windows: the setpoints the trials passed at, with the passing and failing value on each side | Trial records and the note |
| Motion cases: the whole cycle, the displaced control and the path tolerance of each case | The design source and the judgement file |
| Budgets with reserve: mass by subsystem, loaded voltage by duty | `budgets.json` and `limits.json` |
| Open risks, each closed by a design change or listed as a bench test with pass and fail numbers | `missions.json` |
| Trials and replays, and which must be repeated on real parts | Trial records and the judgement file |
| First work items, riskiest first | The note |

Detailed design keeps the handoff's frame and datums, stays inside its envelopes, allowances and reserves, and takes up every open risk and bench test. [Write the handoff note](../skills/frc-preliminary-design/references/commands.md#write-the-handoff-note)
