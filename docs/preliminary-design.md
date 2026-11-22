# Preliminary design of the shared assembly layout

[Follow the three design phases and their exit criteria](design-phase-detail.md). During conceptual design, field rehearsal uses a robot-sized prism, gross headings, approach faces and assumed acquisition, shot and reset times. Compare roles cheaply on the same field clock. Carry the chosen cycle, pickup and release poses, interaction faces and uncertain times into whole-robot design.

**The whole-robot designer owns the preliminary design checkpoint.** The shared layout establishes the top-down assembly layout for detailed design. Establish one robot datum and one revision of the proposed arrangement. Share the editable blockout with subsystem designers. On a common placed STEP, represent fixed structure and bumpers, mounts, moving members, a finite payload, adjacent moving mechanisms and the service envelope. Simple conservative solids are suitable for an early decision. Record what they bound and what geometry is missing. A saved issue identifies the geometry. Its endpoints alone leave the intervening path untested.

## Rehearse the field interaction

Hand off one selected architecture. Play each mission-critical duty in its registered, full-scale field area and inspect the finite article or robot through the applicable outcome and assessment time. Use the projectâ€™s rules edition and fixture dimensions. Preserve failed trials alongside successful ones. The [presentation reference](../skills/frc-preliminary-design/references/presentation.md#field-interactions-and-physics-playback) describes the required physics playback and controls. The geometric clearance command checks a different question and can be reviewed alongside those trials.

## Isolate the cause of a successful transfer

When deciding whether a contact or actuator earns its place, first record what the model commands and what it solves. A free article can reach its seat while a drive maintains an imposed surface speed. That trial establishes transport at the stated speed. Predicting whether the drive can sustain it calls for loaded speed or force measurements, or a model that feeds contact reaction back into motor speed, current and bus voltage.

Repeat the same approach from the same initial state, changing only the proposed cause. For a removable guide, compare it installed and removed. For a drive, state whether its surface is locked, free to coast with inertia and drag, or powered. Preserve the other contact surfaces, timing and endpoint criterion. Trace first contact, subsequent support or powered contact, and whether the article stays at its destination for the required interval. First touch alone cannot identify which member completed the transfer.

Repeat the comparison at a plausible adverse value of the uncertain input that could change the selection. Report the passing and failing values with units and the conditions held fixed. For a repeatable, monotonic response, they bracket a limiting value. With intermittent or nonmonotonic behavior, retain the individual outcomes and avoid extrapolating a single operating limit. If the selection changes, carry the default geometry forward provisionally and identify the physical measurement that would decide it. For interchangeable candidates, use the same mount and drive settings on the bench so the changed contact profile remains the variable under test.

## Launch and share the season review

Use the [whole-robot review layout template](../skills/frc-preliminary-design/references/review-layout-template.md) to place the viewer, resource figures, component ledgers and checked paths. Keep the UI, scene and evidence in the season project. From the season root run `python PLUGIN/examples/preliminary-design/create.py . --project-review --release layout-001`. Launch with `python cad/preliminary-design/serve.py` and open `http://127.0.0.1:8000/`. For a LAN review, supply the host address with `--bind`. The season-owned site under `docs/preliminary-design/` opens the latest issue. Select an archived issue with `?release=layout-001`. The starter includes a main-branch GitHub Pages workflow. Each release identifies itself as preliminary design and carries a design status in the release index: in progress, effective, superseded or withdrawn. Staging requires a `layout-checked` receipt and a `missions.json` that names a passing operating case for a represented narrative objective. It writes the digest-bound `release.json`. On a site that also serves a detailed showcase, the [preliminary release class](private-model-release.md#publish-preliminary-design-releases) deploys these releases without a mechanical signature while the detailed model stays front and center. A season field-interaction or physics player ships inside its release at `field/NAME.html`, pinned and self-contained, as mission-task evidence.

Every season uses the same [stock review page](../skills/frc-preliminary-design/references/review-layout-template.md); the project supplies data, not markup. The review opens with the viewer column (view controls above the model, playback controls directly below it) and the inspector column side by side, with the resource figures below. They stack only on pages 960 px wide or narrower. [Page order and layout](../skills/frc-preliminary-design/references/review-layout-template.md#page-order)

## Work a synthetic package

With the pluginâ€™s geometry Python environment selected, create a new example folder and run the normal design command.

```sh
python examples/preliminary-design/create.py layout-trial
node scripts/design.mjs preliminary-check layout-trial layout.json --require-checked
```

The carrier rotates 90Â° with a finite article while a neighboring slide travels 12 mm. A separate park case returns the carrier and slide. The service case withdraws the group 80 mm. Each case reserves 1 mm between unrelated bodies. The proposed layout clears acquisition, the loaded turn, release, parking and service withdrawal. As a control, moving a fixed rail 50 mm into the arc leaves both operating endpoints clear and produces about 52.04 mmÂ³ shared material at half travel. Read the actual pair and path fraction in the receipt. The example uses invented figures and simple shapes.

## Commission the project paths

1. Pin the editable `design.json` produced by the design CLI, the selected millimetre STEP and the project motion study. Use project-relative files and SHA-256 throughout. The study repeats the design digest as `layoutDesignSha256` and the exact `layoutDatum`. Give the datum a physical name and a proper row-major `robotToStepMm` transform with translations in millimetres. Express all mount points, rotation axes, starting poses, fixtures, travel and offsets in the same STEP world frame. The transform records the projectâ€™s registration. Validate it against the mounting datums on the first Fusion issue.
2. Assign every selected solid and fixture to one group. Record the proposed mounting host and point for each mechanism. The checker compares that point with the hostâ€™s parked bounding box. Surface seating, hole alignment and strength need separate checks. Include complete stock and protection, the moving head and payload, neighboring mechanisms and a service tool wherever it occupies the path. Reserve wiring, tolerance, deflection or dressing with conservative geometry or a sourced minimum gap. List missing inputs explicitly.
3. Give each operating, park and service case its own signed start and travel. Use the existing mechanical-motion format for rotations, translations, fixtures and staged extractions. Declare all simultaneously moving groups. Use `carriedWith` for a payload that follows its carrier. Use `transportedBy` for a payload moved by contact, such as rollers or a lip, when no mechanism shares its motion. Use `freePath` for a payload that has left every mechanism. Independent moving groups retain their own motion. Tie `minGapMm` to each caseâ€™s `allowanceBasis`. Make the service case withdraw the complete group from the installed scene. A case that relies on a previous removal must name that proved extraction in the same history. [Motion and service evidence](mechanical-methods.md)
4. Select a matched displaced control. Move one named stationary article by a measured world offset, replay the same nominal moving group and check the specified pair. An unrelated collision cannot validate the control. The checker tests endpoints and bounds the path between them. It retains a collision witness or an unresolved interval when clearance cannot be established within the subdivision budget.
5. Save the checkpoint receipt with the issue. `layout-checked` applies to the represented package, cases and reserves. `blocked` identifies a nominal violation. `reopen` identifies an upstream premise outside its accepted condition. `provisional` keeps partial layouts useful and identifies missing evidence. Use `--require-checked` for an accepted handoff. A malformed or stale registration exits with a diagnostic. For an early concept, omit the STEP or motion reference, identify the missing input and retain the provisional receipt.

### Move a payload by contact transport

A fixed pocket, powered rollers or a deployable lip can move the article while no mechanism moves rigidly with it. Give the payload its own signed start and travel in the case and declare the transport in the stage:

```json
"transportedBy": {
  "carried article": {
    "mechanisms": ["carrier"],
    "drive": {"carrier": "Roller surface held at a fixed powered speed"},
    "evidence": {"file": "acquire-trial.json", "sha256": "..."},
    "basis": "The article rolls in on the powered carrier surface"
  }
}
```

Each transporter must be a `mechanism` group. A transporter that does not move in the case needs a named `drive`. Pin the field-interaction or contact trial that established the path. Its `transport` record must equal the case ID, payload group, sorted transporters and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose. When every condition holds, an operating case satisfies the loaded-operating requirement. A missing or unpinned trial, a trial for another path or an undeclared stationary drive is listed in `missingInputs`, and the case does not count. The review stops with an error for a transporter that is not a mechanism, an empty transporter list, a drive for a group that is not transporting, a payload that does not move in the case, or a payload that is both `carriedWith` and `transportedBy` in one stage. A changed trial file is refused like other pinned evidence. The checker binds the declared path to its trial. It does not re-run the trial or evaluate contact forces, slip or drive capacity; [isolate the cause of the transfer](#isolate-the-cause-of-a-successful-transfer) separately.

### Save the receipt while others read the package

Add `--output receipt.json`, a path relative to the project, to save the receipt instead of printing it. The checker writes a temporary file beside the target and renames it over the target, so a reviewer or another agent reading the package finds the previous receipt or the new one, never an empty or partial file. A run that ends in an error leaves the previous receipt in place. A shell redirect such as `> receipt.json` empties the file as the run starts. `--write-view` writes the page and its scene the same way: each appears whole. On Windows a reader that opens a file during the rename itself can get a brief sharing error; it should retry.

The checker never replaces an existing page or scene. A project that deletes and regenerates them, or that rewrites other package files with its own scripts, opens a gap for concurrent readers. Regenerate into a new issue folder, or pause readers, when that matters.

### Pin the trial behind a free payload path

A released, launched or dropped article is carried by nothing: its path comes from a trial. Give the payload its own signed start and travel in the case and declare the free path in the stage:

```json
"freePath": {
  "carried article": {
    "evidence": {"file": "release-trial.json", "sha256": "..."},
    "basis": "The article leaves the carrier and flies free"
  }
}
```

The payload must be a moving `payload` group that the same stage does not list under `carriedWith` or `transportedBy`. Pin the trial that established the path. Its `freePath` record must equal the case ID, payload group and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose. A missing or unpinned trial, or a trial for another path, is listed in `missingInputs`. A free path never satisfies the loaded-operating requirement by itself: another operating case, or a carried or transported payload in the same case, must show the mechanism moving the article. The review scene names the trial in the case's evidence method and lists it under the row's `freePath`. A release may publish that trial as the `field-interaction-trial` of a mission case.

### Follow progress and stop at the first blocking case

While the check runs, it writes one line to stderr as each motion case finishes. The receipt on stdout is unchanged. Each line gives the case's position in the study, its ID and status, the failing and open pair rows, the `bounded`, `broadPhase` and `constantPoseBroadPhase` counts, and the case and total elapsed seconds. The displaced control is the last line. Lines mark the start and finish of the budget review. When 30 seconds pass inside a case, the next pair or sample writes a `[heartbeat]` line with the pairs visited, the active pair, its subdivision depth and samples; set the interval with `--heartbeat SECONDS`. A `[motion] warning` line names a body whose rotation cannot change its swept volume, or a body listed in the motion study's optional `sweptEnvelopes` whose rotation does change it. Add `--quiet` to omit all of these lines.

```text
[motion] 2/6 park-loaded status=pass failing=0 open=0 bounded=3 broadPhase=10 constantPoseBroadPhase=14 case=0.03s total=0.07s
[heartbeat] motion 3/6 lift-loaded pairs=41/120 pair=carriage|rail depth=7 samples=93 case=30.02s total=31.40s
[motion] warning turn-loaded roller: the body is unchanged by its rotation about its own axis, so the move cannot change its swept volume and only adds refinement cost; unless another body shares the move, model it as a static envelope and remove the rotation
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

Serve the generated `package-motion.html` and its `review-scene.json.gz` over HTTP, for example with `python -m http.server` in that directory, and open the page. The page is the plugin's stock review page; it fetches and decompresses the scene, which holds every value it shows. Opened from `file://` it cannot load the scene. Check the scene with `node PLUGIN/scripts/review-scene.mjs validate review-scene.json.gz --receipt RECEIPT.json`. Select a case, orbit and pan around its solid volumes, then play or scrub the position on path. Cylinders, spheres, swept profiles and solids with bores or cutouts can preserve the occupied space that determines fit. The viewer tessellates the placed STEP faces for display. The player uses the same starting poses and ordered rigid transformations as the interval checker, including simultaneous motion. The frames illustrate the stroke. The separate clearance receipt gives the numerical bound, obstruction or open interval. Stationary pairs are checked in each retained scene. Pairs whose relative pose stays constant, including members carried by the same motion, are cleared without an exact query when their bounding boxes are more than `minGapMm` plus 0.001 mm apart. The receipt omits these rows and counts them in the case's `counts.constantPoseBroadPhase`. An exact constant-pose result is reused across cases only when both bodies have the same source solid and initial pose, and `counts.constantPoseReused` records each reuse. A `package-motion.html` saved before version 0.100.0 is the retired player rather than the stock review page; to regenerate it, delete it and any `*.geometry.json.gz` and run `--write-view` again. A qualified intended interface must name its exact pair, stage and separately pinned evidence.

List the operating and park cases in performance order in `cycle`. The checker compares each member's attained end pose with its next starting pose. Show the finite article entering, travelling with the head, leaving and resetting as appropriate for the chosen cycle. Include the drivetrain and battery as occupied groups. Service cases start from their commissioned assembled state. For a new trajectory choose a new project-relative HTML filename and generate it with `--write-view`. A saved player earns credit only if its bytes reproduce from the current issue.

Register the whole-robot mass inventory and operating requirements independently in the budget study. Record one weighed mass interval per contributor, the represented block members, and named allowances for wiring, controls and unmodeled robot hardware. Keep the payload separate to obtain the running mass range. Commission simultaneous **battery-side** current ranges per source in each operating and park stage, including a weak pack. The checker bounds bus voltage using open-circuit voltage minus the simultaneous total current times series resistance. It compares the low end against the project's operating limit and the minimum needed for the modeled duty. The designer justifies each duty minimum, current interval, source condition and omitted-stock allowance. The calculation covers nonnegative discharge on this lumped bus. Verify time-resolved inlet voltage, controller limits and attained motion when they control the decision. [Review the loaded route](whole-robot-comparison.md) and [shared electrical loads](shared-power-review.md).

The synthetic robot weighs 11 to 13.5 kg against its invented 15 kg limit. Its 11.2 to 14 kg running estimate includes the article. Simultaneous demand of 32 to 50 A leaves 10.0 to 11.264 V in the weak-pack case, above the 9.2 V required. Increase the drive upper estimate from 30 A to 80 A in the loaded turn and the low end falls to 8.5 V. That change reopens the layout decision, even with identical animation and clear paths. Detailed CAD still needs actual joints, accurate supplier articles and the applicable fabrication and readiness evidence.

## Reopen the phase that chose the premise

Use the machine-readable phase names `conceptual-design` and `preliminary-design`. Register each premise under `premises`. Its independently pinned acceptance records a named scenario, unit, source, numeric interval or categorical condition, affected groups and the phase that chose it. Pin a current observation with the same identity and unit, the current issue and geometry hashes, and the actual field containing its value in a source measurement. Unknown data or an earlier issue leaves the decision provisional. The example accepts the front approach and 2â€“3 s acquisition only for its selected cycle.

A nominal clearance violation reopens **preliminary design** for the moving groups and implicated neighbors. Pause their detailing, move or reshape the layout, then rerun those paths and the control on the new revision. A change from the front approach to a side approach, or acquisition above 3 s in the example, makes the old field conclusion stale and reopens the **conceptual design trade study** for the dependent interfaces. Rerun the matched field route with the revised capabilities and compare the objective and time reserve. Independent work can continue against its own verified interfaces.

Keep the held receipt in project custody and pass it separately on resubmission.

```sh
node scripts/design.mjs preliminary-check PROJECT revised-layout.json --previous held-layout.json --require-checked
```

The package checker repeats the affected package cases. For a held field premise it checks the current issue and the original registered actor, match and input, replays the pinned first-party field profile and compares the full saved result. The upstream decision must identify the held plan hash. Supported replay inputs include a named program stepâ€™s dwell, a named scoring stepâ€™s delivery stand-off, robot speed, height and heading, and a modeled front pickup mouth. An independently chosen different face needs a rehearsal that actually represents it. An unsupported repeat stays open. The project chooses the duty, threshold and acceptance of the resulting field strategy. An initial review without a supplied prior receipt cannot clear a historical hold.

### Move a file the held receipt pins

A held receipt pins each premise acceptance and its evidence by project-relative path and SHA-256. If the project later moves one of those files, for example into an allowed project folder, declare the move on the revised layout plan:

```json
"relocations": {"premise-delivery-accepted.json": "experiments/premises/premise-delivery-accepted.json"}
```

The checker follows a relocation only for a file read from the held receipt: a held premise acceptance, or the evidence a legacy held acceptance cites. It follows it only when the file at the new path has exactly the pinned SHA-256. Each followed relocation is recorded on its prior decision under `relocated` and in the receipt's `heldRelocations`, with the old path, new path and hash, whether or not the hold clears. A new path must stay inside the project. A relocated file with different bytes leaves the hold open with `Relocated held file OLD -> NEW does not match its pinned SHA-256`. A relocation is rejected outright when it names a file that the revised plan or its premise records pin, or when no `--previous` receipt is supplied. Without `relocations`, a moved held file stops the review as before.

### Resume a held delivery position

When the held premise is the distance the robot delivers from, move that scoring step in the field profile, then re-run the match series with `scripts/rehearsal-series.mjs`. Check the run for [permanent robot wait cycles](match-series.md#find-and-resolve-robot-wait-cycles) before relying on its result. Register the premise in inches (`"unit": "in"`) and name the step in `fieldInput`, identically in the original and repeated decisions:

```json
{"match": "trial-1", "actor": "B1", "input": "stepPosition", "period": "Main play",
 "stepIndex": 1, "stepLabel": "Deliver to bay", "station": "blue-bay"}
```

The upstream `fieldReplay` adds the pinned `profile` and saved `result` to the same fields. The checker reproduces the full saved result, then resolves the step for that robot's alliance and slot on the same profile bytes. The step must be a scoring `attempt` at the named scoring station. The premise value must equal the planar distance from the resolved point to the station's center, within 1e-6 in. The rehearsal's own wall and obstacle test must clear the robot footprint at that point in the match setup. In the saved match the robot must also deliver at least one carried piece at that station during the named period. The game records a delivery only from inside the station's release radius or area. A displaced, blocked or out-of-station position, a different step or station, or another unit leaves the hold open. Inspect a step directly with:

```sh
node scripts/rehearsal-step-pose.mjs PROFILE.json trial-1 B1 "Main play" 1
```

The stand-off is a center-to-center planar distance. It does not represent approach heading, release height or mechanism reach.

A held delivery-position acceptance saved before `fieldInput` records may still name its step in its own pinned `source`, under `fieldReplay` or `fieldInput`. The checker derives the held input from that evidence. It must name the same match, actor, period, step index, step label and station as the `stepPosition` repeat, with the same value types. It may also name the input and a `program`, and nothing else. A named program must be the one the actor runs in that period of the saved result. Every named step record must agree, and the held and repeated premises must share a scenario and unit. When nothing in the evidence identifies the step, the hold stays open and the receipt lists `Held premise ID predates fieldInput and its evidence does not identify the step`. A record naming a different step lists `evidence identifies a different field step`.

A generic held premise names no step. Its evidence might be the whole field profile, for example. It needs a series-wide repeat that names only the actor and scoring station:

```json
{"input": "stationPosition", "actor": "B1", "station": "blue-bay"}
```

The revised premise carries its own unit and range, in inches from the station center. The held premise may use another unit or reference, and the checker does not compare values between the two premises. It compares the premise ID, phase, scenario and held plan hash. The saved series result must reproduce exactly. Every scoring attempt that actor's programs make at that station, in every period of every series match, must stand off within the revised range and leave the footprint clear. In each match where the actor attempts there, at least one attempt must deliver a carried piece. Attempts that find no cargo after a supply empties count for position but not for delivery. Each failure is listed with the prefix `Station replay:`, naming the match, period and step where it applies. A premise accepted with this `fieldInput` repeats the same way. A single-step `stepPosition` repeat cannot clear a generic premise. List the attempts directly with:

```sh
node scripts/rehearsal-step-pose.mjs PROFILE.json --station B1 blue-bay
```

A field replay clears only a `conceptual-design` hold. A stale field conclusion reopens the conceptual trade study. Clearance, weight and voltage holds in preliminary design clear through their own repeated cases.

## Narrative pre-read and component intent

Before placing solids, read the project's current strategic narrative from opening through endgame, including contingencies. In the layout plan, set `narrativeReview.source` to its project-relative file and SHA-256. Under `narrativeReview.objectives`, give each objective and fallback an `objective`, a `disposition` (`represented`, `open` or `out-of-scope`) and a `basis` naming its case, gap or explicit scope decision. The author reconciles the list with the complete narrative. The checker verifies the source pin and recorded coverage.

For each placed ID, including fixtures, set `presentation.components[ID].purpose` and `.rationale`. Explain the function and the reason this architecture needs the member. These appear in the generated player's inspector. Missing explanations or an open narrative objective leave the review provisional unless another finding already blocks it. Older plans can still be inspected and completed.

## Game-piece compression

In a mechanical-motion case, declare `payloadCompression` for each intended contact between an analytic spherical or round-section toroidal payload and a named solid. For example, a synthetic fixture can use `{"payload":"Practice ball","contact":"Feed tread","maxDepthMm":2,"basis":"Selected radial indentation limit from the fixture load test"}` inside that array. Identify whether the limit comes from a measured forceâ€“deflection curve or a preliminary design assumption. Specify a one-sided indentation in millimeters. Diametral squeeze across two surfaces is a separate measurement.

The checker takes the section radius from the registered solid and measures from its center or circular centerline to the other solid. The result records the largest observed radial intrusion and, on a pass, a conservative upper bound for the entire commissioned interval. A sampled excess fails. An interval that cannot be bounded stays open. Register other surfaces individually if they intentionally contact the piece. Preserve the unloaded display geometry, test a displaced surface beyond the allowance, and record load, friction and rebound evidence separately.
