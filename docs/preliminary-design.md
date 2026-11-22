# Preliminary design of the shared assembly layout

[Follow the three design phases and their exit criteria](design-phase-detail.md). During conceptual design, field rehearsal uses a robot-sized prism, gross headings, approach faces and assumed acquisition, shot and reset times. Compare roles cheaply on the same field clock. Carry the chosen cycle, pickup and release poses, interaction faces and uncertain times into whole-robot design.

**The whole-robot designer owns the preliminary design checkpoint.** The shared layout establishes the top-down assembly layout for detailed design. Establish one robot datum and one revision of the proposed arrangement. Share the editable blockout with subsystem designers. On a common placed STEP, represent fixed structure and bumpers, mounts, moving members, a finite payload, adjacent moving mechanisms and the service envelope. Simple conservative solids are suitable for an early decision. Record what they bound and what geometry is missing. A saved issue identifies the geometry. Its endpoints alone leave the intervening path untested.

## Rehearse the field interaction

Hand off one selected architecture. Play each mission-critical duty in its registered, full-scale field area and inspect the finite article or robot through the applicable outcome and assessment time. Use the project’s rules edition and fixture dimensions. Preserve failed trials alongside successful ones. The [presentation reference](../skills/frc-preliminary-design/references/presentation.md#field-interactions-and-physics-playback) describes the required physics playback and controls. The geometric clearance command checks a different question and can be reviewed alongside those trials.

## Isolate the cause of a successful transfer

When deciding whether a contact or actuator earns its place, first record what the model commands and what it solves. A free article can reach its seat while a drive maintains an imposed surface speed. That trial establishes transport at the stated speed. Predicting whether the drive can sustain it calls for loaded speed or force measurements, or a model that feeds contact reaction back into motor speed, current and bus voltage.

Repeat the same approach from the same initial state, changing only the proposed cause. For a removable guide, compare it installed and removed. For a drive, state whether its surface is locked, free to coast with inertia and drag, or powered. Preserve the other contact surfaces, timing and endpoint criterion. Trace first contact, subsequent support or powered contact, and whether the article stays at its destination for the required interval. First touch alone cannot identify which member completed the transfer.

Repeat the comparison at a plausible adverse value of the uncertain input that could change the selection. Two trials with opposite outcomes bound a transition only if the response is monotonic over that interval. Otherwise report the tested cases individually. If the selection changes, carry the default geometry forward provisionally and identify the physical measurement that would decide it. For interchangeable candidates, use the same mount and drive settings on the bench so the changed contact profile remains the variable under test.

## Work a synthetic package

With the plugin’s geometry Python environment selected, create a new example folder and run the normal design command.

```sh
python examples/preliminary-design/create.py layout-trial
node scripts/design.mjs preliminary-check layout-trial layout.json --require-checked
```

The carrier rotates 90° with a finite article while a neighboring slide travels 12 mm. A separate park case returns the carrier and slide. The service case withdraws the group 80 mm. Each case reserves 1 mm between unrelated bodies. The proposed layout clears acquisition, the loaded turn, release, parking and service withdrawal. As a control, moving a fixed rail 50 mm into the arc leaves both operating endpoints clear and produces about 52.04 mm³ shared material at half travel. Read the actual pair and path fraction in the receipt. The example uses invented figures and simple shapes.

## Commission the project paths

1. Pin the editable `design.json` produced by the design CLI, the selected millimetre STEP and the project motion study. Use project-relative files and SHA-256 throughout. The study repeats the design digest as `layoutDesignSha256` and the exact `layoutDatum`. Give the datum a physical name and a proper row-major `robotToStepMm` transform with translations in millimetres. Express all mount points, rotation axes, starting poses, fixtures, travel and offsets in the same STEP world frame. The transform records the project’s registration. Validate it against the mounting datums on the first Fusion issue.
2. Assign every selected solid and fixture to one group. Record the proposed mounting host and point for each mechanism. The checker compares that point with the host’s parked bounding box. Surface seating, hole alignment and strength need separate checks. Include complete stock and protection, the moving head and payload, neighboring mechanisms and a service tool wherever it occupies the path. Reserve wiring, tolerance, deflection or dressing with conservative geometry or a sourced minimum gap. List missing inputs explicitly.
3. Give each operating, park and service case its own signed start and travel. Use the existing mechanical-motion format for rotations, translations, fixtures and staged extractions. Declare all simultaneously moving groups. Use `carriedWith` for a payload that follows its carrier. Independent moving groups retain their own motion. Tie `minGapMm` to each case’s `allowanceBasis`. Make the service case withdraw the complete group from the installed scene. A case that relies on a previous removal must name that proved extraction in the same history. [Motion and service evidence](mechanical-methods.md)
4. Select a matched displaced control. Move one named stationary article by a measured world offset, replay the same nominal moving group and check the specified pair. An unrelated collision cannot validate the control. The checker tests endpoints and bounds the path between them. It retains a collision witness or an unresolved interval when clearance cannot be established within the subdivision budget.
5. Save the checkpoint receipt with the issue. `layout-checked` applies to the represented package, cases and reserves. `blocked` identifies a nominal violation. `reopen` identifies an upstream premise outside its accepted condition. `provisional` keeps partial layouts useful and identifies missing evidence. Use `--require-checked` for an accepted handoff. A malformed or stale registration exits with a diagnostic. For an early concept, omit the STEP or motion reference, identify the missing input and retain the provisional receipt.

### Follow progress and stop at the first blocking case

While the check runs, it writes one line to stderr as each motion case finishes. The receipt on stdout is unchanged. Each line gives the case's position in the study, its ID and status, the failing and open pair rows, the `bounded`, `broadPhase` and `constantPoseBroadPhase` counts, and the case and total elapsed seconds. The displaced control is the last line. Lines mark the start and finish of the budget review. Add `--quiet` to omit these lines.

```text
[motion] 2/6 park-loaded status=pass failing=0 open=0 bounded=3 broadPhase=10 constantPoseBroadPhase=14 case=0.03s total=0.07s
[budgets] done mass=pass electrical=pass 0.00s
```

To revise a layout quickly, add `--fail-fast`.

```sh
node scripts/design.mjs preliminary-check PROJECT layout.json --fail-fast
```

The run stops after the first nominal case with a status other than `pass`. That status comes from a failing or open pair, a failing or unresolved required contact, a seat, a visibility check or an incomplete extraction. The remaining cases, the displaced control, the budgets and the view are skipped. The receipt sets `"partial": true` and lists `stoppedAt`, `checkedCases` and `skippedCases`. A stopping failure gives `blocked` and reopens the case as usual. An open finding gives `provisional`, or `reopen` when a premise already reopened. A missing-input entry names the skipped work, so a partial receipt can never be `layout-checked`. `--require-checked` exits non-zero for a partial receipt. The checker evaluates skipped cases only in a full run.

The displaced control is expected to collide, so it never stops a run. It runs last, only when every nominal case passes. A clean `--fail-fast` run therefore checks the control and returns the same full receipt as a run without the flag. After a stop, `control.status` is `skipped` and `control.witness` is `null`. Only a full run can show that the control rejects the displaced pair. A partial run never writes a player and never credits an existing one. With `--write-view`, it reports on stderr that it did not write the view and records `view.verified: false`. Use a full run without `--fail-fast` for the issued receipt, the control and the player.

Give every downstream designer the issue name, design and STEP hashes, host and mount points, motion study, status and open inputs. If one interface changes, identify its neighbors through the group roster. Recheck the affected loaded, park and withdrawal paths on the revised package, repeat the adverse control and issue the updated receipt before another designer takes the old clearance as available. The executable rechecks every commissioned case. Detailed seat geometry, loads, tolerances, retention, actuator dynamics and physical performance require their own commissioned evidence.

## Examine the moving blocks and budgets

Open the generated `package-motion.html` locally. Select a case, orbit and pan around its solid volumes, then play or scrub the stroke. Cylinders, spheres, swept profiles and solids with bores or cutouts can preserve the occupied space that determines fit. The viewer tessellates the placed STEP faces for display. The player uses the same starting poses and ordered rigid transformations as the interval checker, including simultaneous motion. The frames illustrate the stroke. The separate clearance receipt gives the numerical bound, obstruction or open interval. Stationary pairs are checked in each retained scene. Pairs whose relative pose stays constant, including members carried by the same motion, are cleared without an exact query when their bounding boxes are more than `minGapMm` plus 0.001 mm apart. The receipt omits these rows and counts them in the case's `counts.constantPoseBroadPhase`. An exact constant-pose result is reused across cases only when both bodies have the same source solid and initial pose, and `counts.constantPoseReused` records each reuse. A `package-motion.html` saved before version 0.79.0 embeds the omitted rows. To regenerate it, delete it and run `--write-view` again. A qualified intended interface must name its exact pair, stage and separately pinned evidence.

List the operating and park cases in performance order in `cycle`. The checker compares each member's attained end pose with its next starting pose. Show the finite article entering, travelling with the head, leaving and resetting as appropriate for the chosen cycle. Include the drivetrain and battery as occupied groups. Service cases start from their commissioned assembled state. For a new trajectory choose a new project-relative HTML filename and generate it with `--write-view`. A saved player earns credit only if its bytes reproduce from the current issue.

Register the whole-robot mass inventory and operating requirements independently in the budget study. Record one weighed mass interval per contributor, the represented block members, and named allowances for wiring, controls and unmodeled robot hardware. Keep the payload separate to obtain the running mass range. Commission simultaneous **battery-side** current ranges per source in each operating and park stage, including a weak pack. The checker bounds bus voltage using open-circuit voltage minus the simultaneous total current times series resistance. It compares the low end against the project's operating limit and the minimum needed for the modeled duty. The designer justifies each duty minimum, current interval, source condition and omitted-stock allowance. The calculation covers nonnegative discharge on this lumped bus. Verify time-resolved inlet voltage, controller limits and attained motion when they control the decision. [Review the loaded route](whole-robot-comparison.md) and [shared electrical loads](shared-power-review.md).

The synthetic robot weighs 11 to 13.5 kg against its invented 15 kg limit. Its 11.2 to 14 kg running estimate includes the article. Simultaneous demand of 32 to 50 A leaves 10.0 to 11.264 V in the weak-pack case, above the 9.2 V required. Increase the drive upper estimate from 30 A to 80 A in the loaded turn and the low end falls to 8.5 V. That change reopens the layout decision, even with identical animation and clear paths. Detailed CAD still needs actual joints, accurate supplier articles and the applicable fabrication and readiness evidence.

## Reopen the phase that chose the premise

Use the machine-readable phase names `conceptual-design` and `preliminary-design`. Register each premise under `premises`. Its independently pinned acceptance records a named scenario, unit, source, numeric interval or categorical condition, affected groups and the phase that chose it. Pin a current observation with the same identity and unit, the current issue and geometry hashes, and the actual field containing its value in a source measurement. Unknown data or an earlier issue leaves the decision provisional. The example accepts the front approach and 2–3 s acquisition only for its selected cycle.

A nominal clearance violation reopens **preliminary design** for the moving groups and implicated neighbors. Pause their detailing, move or reshape the layout, then rerun those paths and the control on the new revision. A change from the front approach to a side approach, or acquisition above 3 s in the example, makes the old field conclusion stale and reopens the **conceptual design trade study** for the dependent interfaces. Rerun the matched field route with the revised capabilities and compare the objective and time reserve. Independent work can continue against its own verified interfaces.

Keep the held receipt in project custody and pass it separately on resubmission.

```sh
node scripts/design.mjs preliminary-check PROJECT revised-layout.json --previous held-layout.json --require-checked
```

The package checker repeats the affected package cases. For a held field premise it checks the current issue and the original registered actor, match and input, replays the pinned first-party field profile and compares the full saved result. The upstream decision must identify the held plan hash. Supported replay inputs include a named program step’s dwell, robot speed, height and heading, and a modeled front pickup mouth. An independently chosen different face needs a rehearsal that actually represents it. An unsupported repeat stays open. The project chooses the duty, threshold and acceptance of the resulting field strategy. An initial review without a supplied prior receipt cannot clear a historical hold.

## Narrative pre-read and component intent

Before placing solids, read the project's current strategic narrative from opening through endgame, including contingencies. In the layout plan, set `narrativeReview.source` to its project-relative file and SHA-256. Under `narrativeReview.objectives`, give each objective and fallback an `objective`, a `disposition` (`represented`, `open` or `out-of-scope`) and a `basis` naming its case, gap or explicit scope decision. The author reconciles the list with the complete narrative. The checker verifies the source pin and recorded coverage.

For each placed ID, including fixtures, set `presentation.components[ID].purpose` and `.rationale`. Explain the function and the reason this architecture needs the member. These appear in the generated player's inspector. Missing explanations or an open narrative objective leave the review provisional unless another finding already blocks it. Older plans can still be inspected and completed.
