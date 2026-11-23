# Preliminary design: the layout and its check

This page is the reference for the layout check: what the plan holds, what each flag does and how to read the result. For the order of work, the defaults and what to try when something fails, start from the [preliminary design skill](../skills/frc-preliminary-design/SKILL.md). For the commands in order, see [commands](../skills/frc-preliminary-design/references/commands.md).

A preliminary design is one robot datum and one layout. On a single placed STEP it represents fixed structure and bumpers, mounts, moving members, a finite game piece, the field parts the mission touches and the service envelope. Simple conservative solids are enough to decide an architecture. Record what each one bounds and what geometry is missing.

A saved layout identifies the geometry. Its end poses alone leave the path between them untested, so every motion is checked as a case.

## Contents

- [Work a synthetic example](#work-a-synthetic-example)
- [Write the plan](#write-the-plan)
- [Run the check](#run-the-check)
- [Nothing floats](#nothing-floats)
- [Keep the layout a blockout](#keep-the-layout-a-blockout)
- [Size the checks to the risk](#size-the-checks-to-the-risk)
- [Judge readiness to be marked effective](#judge-readiness-to-be-marked-effective)
- [Carry plugin updates into a season project](#carry-plugin-updates-into-a-season-project)

## Work a synthetic example

With the plugin's geometry Python environment selected, create a new example folder and run the check.

```sh
python examples/preliminary-design/create.py layout-trial
node scripts/design.mjs preliminary-check layout-trial cad/preliminary-design/releases/1.0/layout.json --require-checked
```

`layout-trial` stands for a repository. The design sits in the folder `cad/preliminary-design/releases/1.0/` inside it, with every file named from `layout-trial`, and nothing is generated at its top level.

The carrier rotates 90° with a finite article while a neighboring slide travels 12 mm. A separate park case returns the carrier and slide. The service case withdraws the group 80 mm. Each case reserves 1 mm between unrelated bodies. The proposed layout clears acquisition, the loaded turn, release, parking and service withdrawal.

As a control, moving a fixed rail 50 mm into the arc leaves both operating end poses clear and produces about 52.04 mm³ of shared material at half travel. Read the actual pair and path fraction in the receipt. The example uses invented figures and simple shapes.

The synthetic robot weighs 11 to 13.5 kg against its invented 15 kg limit. Its 11.2 to 14 kg running estimate includes the article. Simultaneous demand of 32 to 50 A leaves 10.0 to 11.264 V in the weak-pack case, above the 9.2 V required. Raise the drive's upper estimate from 30 A to 80 A in the loaded turn and the low end falls to 8.5 V. That change reopens the layout decision, even with identical animation and clear paths.

## Write the plan

The plan, `layout.json`, names the design's files and says how the solids are grouped, mounted and moved. Have the project's builder script write it. [The files in a design's folder](../skills/frc-preliminary-design/references/commands.md#build-the-inputs)

### Files, datum and frame

Name the editable `design.json`, the millimetre STEP and the motion study, each as `{"file": "..."}` with its project-relative path. [Type no hash](#name-files-by-path). The study names the same STEP and repeats the exact `layoutDatum`.

Give the datum a physical name and a proper row-major `robotToStepMm` transform with translations in millimetres. Express all mount points, rotation axes, starting poses, fixtures, travel and offsets in the same STEP world frame.

The transform records the project's registration. Detailed design keeps this frame and these datums.

### Name files by path

An author names a file by its project-relative path and types no hash:

```json
"design": {"file": "cad/preliminary-design/releases/1.0/design.json"},
"step": {"file": "cad/preliminary-design/releases/1.0/package.step"},
"motion": {"file": "cad/preliminary-design/releases/1.0/paths.json"}
```

The same form serves every reference in the plan and in the records it names: the budgets and their `requirements`, each premise acceptance, observation and `source`, `narrativeReview.source`, each `presentation.replays` entry and the `evidence` a replay lists, a field interaction's `evidence`, each trial behind `transportedBy`, `freePath` or `supportedBy`, each case fixture's `file`, an interface's `qualifiedBy` and a mission case's `trial` in `missions.json`.

A motion study, a budget ledger and an observation need not repeat a digest of the design or the STEP.

Git records what every file was. The checker reads each named file and writes the digest it found into the receipt and the review scene, so the receipt records what was checked.

Those digests are how `--view-only`, the publication check and the rerun at the stage gate tell that a result belongs to its inputs, and they cost the author nothing. A renamed file is one edited path.

A `sha256` beside a `file` is optional. When one is present the checker verifies it exactly as before and stops with `Changed evidence: FILE` when the file differs. Plans and published designs that carry hashes keep working unchanged, and a plan may mix both forms.

A named file that does not exist stops the check with `Unresolved project file: FILE`. A motion study checked by itself with the mechanical-motion or mechanical-readiness command still needs its hashes; path references belong to the layout plan and the records the preliminary check reads through it.

#### Drop the typed hashes of an in-progress release

Delete the `sha256` keys from `layout.json` and from the records it names, and the repeated `layoutDesignSha256`, `designSha256`, `stepSha256` and `previousPlanSha256` values. Rerun the check with `--write-view --output`, then publish the same version again. The plan digest changes, so the receipt is new; the verdicts are the same. Leave an effective design as it is.

### Groups and mounts

Assign every selected solid and fixture to one group. A case fixture that no group lists stops the check before any case runs, with `List each case fixture in a plan group. No group lists: ID`.

Record the proposed mounting host and point for each mechanism:

- Every mechanism group needs at least one mount. A mount entry may add `member` to name the one placed ID it supports, so each member of a mirrored pair cites its own point. Without `member` the entry stands for the whole group.
- Any group may register a mount. Give a `structure` member its joint to the frame the same way, with the host under `on`.
- When a group registers mounts for some members only, a `[mounts] note` line on stderr names the members left out. The note is advisory and never enters the receipt.
- The check compares each mount point with the host's parked bounding box. Surface seating, hole alignment and strength belong to detailed design.

[Nothing floats](#nothing-floats). Every physical solid touches, or is mounted to, something that traces to the frame. A support that is not drawn yet is labelled under `attachment.unmounted` with its reason.

Include complete stock and protection, the moving head and payload, neighboring mechanisms and a service tool wherever it occupies the path. Reserve wiring, tolerance, deflection or dressing with one conservative solid or a sourced minimum gap, not with modelled lines. List missing inputs explicitly.

### Field parts and game pieces

Register each field part as a fixture of the cases that use it, under `fixtures` in the motion study, and never as an ordinary robot member. A member counts as robot in the opening fit and the robot bounds.

Use the project's official field and game-piece models where it has them, at scale, in the robot's datum. Use a dimensioned stand-in otherwise and say so in its explanation.

### Cases

Give each operating, park and service case its own signed start and travel. Use the existing mechanical-motion format for rotations, translations, fixtures and extractions. [Motion and service evidence](mechanical-methods.md)

- Declare all groups that move at the same time.
- Tie `minGapMm` to each case's `allowanceBasis`.
- Record the path tolerance each case was split at as `pathToleranceMm` in its entry under `stages`.
- When a phase is split into several cases, name it as `phase` in each of their `stages` entries. The review plays the phase as [one animation](#animations-show-the-mission-the-check-list-shows-the-evidence) and lists its cases in the check results.
- Make the service case withdraw the complete group from the installed scene. A case that relies on a previous removal must name that proved extraction in the same history.
- List the operating and park cases in performance order in `cycle`. The check compares each member's attained end pose with its next starting pose.

Start with one coarse case for each mission phase: acquire, retain, transfer, deliver, reset, endgame, park and service. Show the finite piece entering, travelling, leaving and resetting. Include the drivetrain and battery as occupied groups.

Say what moves each game piece in every case:

| The piece | Declare in the case's `stages` entry |
| --- | --- |
| Follows its carrier rigidly | `carriedWith` |
| Is moved by contact, such as rollers or a lip | [`transportedBy`](#move-a-payload-by-contact-transport) |
| Has left every mechanism | [`freePath`](#a-free-payload-path) |
| Is supported or guided by a field fixture | [`supportedBy`](#a-payload-a-field-fixture-supports) |

### The displaced control

Select a matched displaced control. Move one named stationary article by a measured world offset, replay the same nominal moving group and check the specified pair. An unrelated collision cannot validate the control.

The check tests end poses and bounds the path between them. It keeps a collision witness, or an unresolved interval when clearance cannot be established within the subdivision budget.

### Narrative list and component explanations

Before placing solids, read the project's current strategic narrative from opening through endgame, including contingencies. In the plan, set `narrativeReview.source` to its project-relative file, as `{"file": "..."}`.

Under `narrativeReview.objectives`, give each objective and fallback an `objective`, a `disposition` (`represented`, `open` or `out-of-scope`) and a `basis` naming its case, gap or explicit scope decision. The author reconciles the list with the complete narrative. The check reads the source, records its digest in the receipt and verifies the recorded coverage.

For each placed ID, including fixtures, set `presentation.components[ID].purpose` and `.rationale`. Explain the function and the reason this architecture needs the member. These appear in the review page's inspector. The same entry takes the optional display `name`, `category`, `subsystem` and `material`, so a rename is a presentation edit.

A missing explanation or an open narrative objective leaves the receipt `provisional`, unless another finding already blocks it.

### Move a payload by contact transport

A fixed pocket, powered rollers or a deployable lip can move the article while no mechanism moves rigidly with it. Give the payload its own signed start and travel in the case and declare the transport in the stage:

```json
"transportedBy": {
  "carried article": {
    "mechanisms": ["carrier"],
    "drive": {"carrier": "Roller surface held at a fixed powered speed"},
    "evidence": {"file": "acquire-trial.json"},
    "basis": "The article rolls in on the powered carrier surface"
  }
}
```

- Each transporter must be a `mechanism` group. A transporter that does not move in the case needs a named `drive`.
- Name the contact trial that established the path, as `{"file": "..."}`. Its `transport` record must equal the case ID, payload group, sorted transporters and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose.
- When every condition holds, an operating case satisfies the loaded-operating requirement.

A missing trial, a trial for another path or an undeclared stationary drive is listed in `missingInputs`, and the case does not count. A trial file that differs from a typed `sha256` is refused.

The check stops with an error for a transporter that is not a mechanism, an empty transporter list, a drive for a group that is not transporting, a payload that does not move in the case, or a payload that is both `carriedWith` and `transportedBy` in one stage.

The check binds the declared path to its trial. It does not rerun the trial or evaluate contact forces, slip or drive capacity. [Find what moved the piece](../skills/frc-preliminary-design/references/trials.md#find-what-moved-the-piece)

### A free payload path

A released, launched or dropped article is carried by nothing: its path comes from a trial. Give the payload its own signed start and travel in the case and declare the free path in the stage:

```json
"freePath": {
  "carried article": {
    "evidence": {"file": "release-trial.json"},
    "basis": "The article leaves the carrier and flies free"
  }
}
```

The payload must be a moving `payload` group that the same stage does not list under `carriedWith`, `transportedBy` or `supportedBy`. The trial's `freePath` record must equal the case ID, payload group and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose. A missing trial, or a trial for another path, is listed in `missingInputs`.

A free path never satisfies the loaded-operating requirement by itself. Another operating case, or a carried or transported payload in the same case, must show the mechanism moving the article.

The review scene names the trial in the case's evidence method and lists it under the row's `freePath`. A design may publish that trial as the `field-interaction-trial` of a mission case.

### A payload a field fixture supports

An article that rolls down a field chute or rests in a field target is supported by the field and moved by no mechanism. Register the field part as a fixture of the case, give the payload its own signed start and travel, and declare the support in the stage:

```json
"supportedBy": {
  "carried article": {
    "fixtures": ["lane"],
    "evidence": {"file": "lane-trial.json"},
    "basis": "The article rolls down the lane"
  }
}
```

The payload must be a moving `payload` group that the same stage lists under no other relation. Each name in `fixtures` must be a fixture the case registers. A robot member, an unknown name or a fixture of another case stops the check with `Only a field fixture registered in CASE can support a payload`.

The trial's `support` record must equal the case ID, payload group, the sorted fixture IDs and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose. A missing trial, or a trial for another path or fixture, is listed in `missingInputs`.

Like a free path, a supported path never satisfies the loaded-operating requirement by itself. The review scene names the fixture and the trial in the case's evidence method and lists them under the row's `supportedBy`. A plan that declares no `supportedBy` keeps its receipt and scene.

### Declare an intended contact

Unrelated solids must stay `minGapMm` apart. Two solids that are meant to touch, seat or share material fail that test until the plan says so. Decide which of these applies:

| The two solids | Do this |
| --- | --- |
| Are one physical part drawn as two, such as a line and its termination | Merge them into one solid |
| Have coincident faces by accident, leaving a sliver overlap or a near-zero gap | Pull one back by the clearance allowance |
| Meet at a designed joint or seat | Declare the interface in the case |
| Squeeze a soft game piece | [Declare the compression](#game-piece-compression) |

Declare a designed interface under the case's `intendedInterfaces` in the motion study:

```json
"intendedInterfaces": [{"pair": ["carrier", "pivot"], "basis": "Carrier seats on the pivot", "qualifiedBy": {"file": "contacts.json"}}]
```

The record it names gives `case`, `pair` and `status: "pass"`. One file can qualify several rows: list each `{case, pair, status}` under `interfaces`. Every row is matched by its own case and pair, so many short strokes need one file, not one per row. A record may repeat the STEP digest as `stepSha256`; one that names another STEP is refused as stale.

Declare only what the design intends. A declared interface removes that pair from the clearance test in that case, so a real interference declared away is hidden.

### Game-piece compression

In a case, declare `payloadCompression` for each intended contact between an analytic spherical or round-section toroidal payload and a named solid. For example, a synthetic fixture can use this inside that array:

```json
{"payload": "Practice ball", "contact": "Feed tread", "maxDepthMm": 2, "basis": "Selected radial indentation from the fixture load test"}
```

Specify a one-sided indentation in millimetres. Diametral squeeze across two surfaces is a separate measurement. Say whether the figure comes from a measured force–deflection curve or is a preliminary design assumption.

To bind the figure to the trial that measured it, add `"evidence": {"file": "indentation-trial.json", "field": "radialIndentationMm"}`. The named top-level field of the trial record must be a number exactly equal to `maxDepthMm`, and the result row repeats the reference with the digest the check read. To allow less than the trial measured, record that chosen value in the trial file and name its field. A declaration without `evidence` works as before.

The check takes the section radius from the registered solid and measures from its center or circular centerline to the other solid. The result records the largest observed radial intrusion and, on a pass, a conservative upper bound for the whole interval. A sampled excess fails. An interval that cannot be bounded stays open.

Register other surfaces individually if they intentionally contact the piece. Keep the unloaded display geometry, test a displaced surface beyond the allowance, and record load, friction and rebound evidence separately.

### Mass and voltage budgets

Register the whole-robot mass inventory and operating requirements in the budget study, apart from the geometry.

- **Mass.** Record one mass interval per contributor, the solids it represents, and named allowances for wiring, controls and unmodeled hardware. Keep the payload separate to obtain the running mass range. Hold a reserve.
- **Current.** Record simultaneous **battery-side** current ranges per source in each operating and park case, including a weak pack.

The check bounds bus voltage as open-circuit voltage minus the simultaneous total current times series resistance. It compares the low end with the project's operating threshold and the minimum needed for the modeled duty.

The designer justifies each duty minimum, current interval, source condition and omitted-stock allowance. The calculation covers nonnegative discharge on this lumped bus. [Review the loaded route](whole-robot-comparison.md) and [shared electrical loads](shared-power-review.md).

After a geometry change, re-estimate every mass and current line whose solids changed. A ledger carried forward untouched describes the previous layout.

## Run the check

```sh
node scripts/design.mjs preliminary-check REPOSITORY cad/preliminary-design/releases/1.0/layout.json --write-view --output cad/preliminary-design/releases/1.0/receipt.json
```

The receipt's status says where the layout stands:

| Status | Meaning |
| --- | --- |
| `layout-checked` | Every represented case, reserve and budget passes and the displaced control is rejected |
| `provisional` | Nothing fails, and something is missing. `missingInputs` names it. A partial layout stays useful |
| `blocked` | A nominal case violates clearance, mass or voltage |
| `reopen` | A premise is outside its accepted condition. [Held premises](preliminary-design-holds.md) |

Use `--require-checked` to exit non-zero for anything but `layout-checked`. A malformed or stale registration exits with a diagnostic. For an early concept, omit the STEP or motion reference, name the missing input and keep the provisional receipt.

Detailed seat geometry, loads, tolerances, retention, actuator dynamics and physical performance are outside this check.

### Keep the view in its release folder

The project is the repository. A design keeps its plan, its inputs, the review page and the scene together in one folder inside it, `cad/preliminary-design/releases/VERSION/` in the stock layout. The plan's `view` names the page from the repository root, in the plan's own folder, such as `"view": "cad/preliminary-design/releases/1.0/package-motion.html"`. The scene is written beside it.

Save the receipt beside the page with `--output`, because the page reads `receipt.json` from its own folder. Keep a held receipt passed with `--previous` in the same folder, where the [publication check](design-publication.md#which-designs-are-checked) looks for it.

Two paths are refused, each with the expected path in the message:

- A view outside the plan's folder.
- With `--write-view`, a view at the project root. This happens when a design's folder is passed as `PROJECT`. Nothing generated lands at the top of a project.

One design has one review page. A new mission phase or a new trial is one more entry in that page's animation list, and a new case is one more row of its check results. Do not write a second page for it.

A design that was checked in its own folder by an earlier plugin version keeps verifying. To move one to the repository root for its next version, see the [migration guide](design-publication-migration.md#move-a-design-checked-in-its-own-folder-to-the-repository-root).

### Save the receipt while others read

Add `--output receipt.json`, a path relative to the project, to save the receipt instead of printing it. A shell redirect such as `> receipt.json` empties the file as the run starts, so use `--output`.

The check writes a temporary file beside the target and renames it over the target. A reviewer or another agent reading the folder finds the previous receipt or the new one, never an empty or partial file. A run that ends in an error leaves the previous receipt in place. `--write-view` writes the page and its scene the same way, and only after the last check that can stop the run.

On Windows a reader that opens a file during the rename itself can get a brief sharing error; it should retry. The check waits up to ten seconds for a reader that holds a target open, then stops with an error and leaves the previous file in place.

`--write-view` replaces a stale scene, so there is no need to delete it first. It never replaces an existing page. A project script that deletes and regenerates files opens a gap for concurrent readers; pause the readers when that matters.

### Follow progress and stop at the first blocking case

While the check runs, it writes one line to stderr as each motion case finishes. The receipt on stdout is unchanged. Each line gives the case's position in the study, its ID and status, the failing and open pair rows, the `bounded`, `broadPhase` and `constantPoseBroadPhase` counts, and the case and total elapsed seconds.

With one worker process the lines follow the study order and the displaced control is the last. Lines mark the start and finish of the budget review.

When 30 seconds pass inside a case, the next pair or sample writes a `[heartbeat]` line with the pairs visited, the active pair, its subdivision depth and samples; set the interval with `--heartbeat SECONDS`.

A `[motion] warning` line names a body whose rotation cannot change its swept volume, or a body listed in the motion study's optional `sweptEnvelopes` whose rotation does change it. Add `--quiet` to omit all of these lines.

```text
[motion] 2/6 park-loaded status=pass failing=0 open=0 bounded=3 broadPhase=10 constantPoseBroadPhase=14 case=0.03s total=0.07s
[heartbeat] motion 3/6 lift-loaded pairs=41/120 pair=carriage|rail depth=7 samples=93 case=30.02s total=31.40s
[motion] warning turn-loaded roller: the body is unchanged by its rotation about its own axis, so the move cannot change its swept volume and only adds refinement cost; unless another body shares the move, model it as a static envelope and remove the rotation
[budgets] done mass=pass electrical=pass 0.00s
```

The check shares the motion cases between worker processes. By default it starts one fewer than the machine's cores, and no more than the work and the free memory allow. Each worker loads the STEP file, so the check measures its own memory after loading and keeps the workers within four fifths of what is free. Set the number with `--jobs N`. When other work is running on the machine, pass half the cores.

```sh
node scripts/design.mjs preliminary-check PROJECT layout.json --jobs 4
```

The receipt is the same for every number of workers. A case with thousands of body pairs is divided between the workers, so one long case does not hold the others back; the slowest single pair of bodies sets the shortest possible run. Only the stderr lines differ. Cases report as they finish, in any order, and each line still gives the case's position in the study. A heartbeat line names the pair one of the case's workers is on. `--jobs 1` runs every case in order in one process. Use it to read the lines in study order, or when a worker ends for lack of memory.

To revise a layout quickly, add `--fail-fast`.

```sh
node scripts/design.mjs preliminary-check PROJECT layout.json --fail-fast
```

The run stops after the first nominal case with a status other than `pass`. That status comes from a failing or open pair, a failing or unresolved required contact, a seat, a visibility check or an incomplete extraction. The remaining cases, the displaced control, the budgets and the view are skipped.

The receipt sets `"partial": true` and lists `stoppedAt`, `checkedCases` and `skippedCases`. A stopping failure gives `blocked` and reopens the case as usual. An open finding gives `provisional`, or `reopen` when a premise already reopened. A missing-input entry names the skipped work, so a partial receipt can never be `layout-checked`. `--require-checked` exits non-zero for a partial receipt.

The checker evaluates skipped cases only in a full run. With several workers the run stops at the same case and writes the same receipt as with one. Workers on later cases are cancelled once an earlier case is known not to pass. Stderr may already hold the line of a later case that finished first; that case is not in the receipt.

The displaced control is expected to collide, so it never stops a run. It is the last case of the study, and it counts only when every nominal case passes. A clean `--fail-fast` run therefore checks the control and returns the same full receipt as a run without the flag. After a stop, `control.status` is `skipped` and `control.witness` is `null`. Only a full run can show that the control rejects the displaced pair. A partial run never writes a review page and never credits an existing one. With `--write-view`, it reports on stderr that it did not write the view and records `view.verified: false`. Use a full run without `--fail-fast` for the receipt you publish, the control and the review page.

To recheck the physics of a layout whose review is already written, add `--physics-only`. It checks every case, the displaced control and the budgets and does not read or write the review page or its scene. The receipt sets `"physicsOnly": true` and is not one to publish. A project's CI [reruns a layout this way when its design becomes effective](design-publication.md#when-the-layout-check-reruns) and compares the result with the committed receipt.

### Confirm the check read a fresh plan

The first stderr line of every check names the layout plan it read, when that file was last written (UTC) and its SHA-256, which is the receipt's `planSha256`:

```text
[plan] cad/preliminary-design/releases/1.0/layout.json modified 2031-03-04T18:22:07Z sha256=5f2c...
```

When a project script builds the plan, check that script's exit code before running the check. A builder that fails leaves the previous plan in place, and the check then passes on stale inputs. A pipe that filters the builder's output can hide its exit code; run the builder by itself, or keep the exit code, and stop when it is not zero. Then name the builder's sources with `--built-from`, a file or a folder relative to the project, repeated as needed:

```sh
node scripts/design.mjs preliminary-check PROJECT layout.json --built-from scripts/build_layout.py --built-from scripts/layout_parts
```

A plan last written before any named source changed draws a warning:

```text
[plan] warning: cad/preliminary-design/releases/1.0/layout.json was last written 2031-03-04T18:22:07Z, before scripts/build_layout.py changed at 2031-03-04T19:05:40Z. Its builder may have failed or not run since, so this check may be reading a stale plan. Check the builder's exit code and rebuild the plan before relying on the result.
```

The warning compares file times only. It never changes the receipt, the status or the exit code, and `--quiet` omits it. In a named folder the plan itself and `__pycache__` files are not counted; name a folder that holds sources, not one the builder writes other outputs into. A path that does not exist stops the run.

### Rebuild the review without rerunning the cases

`--write-view` checks every case before it writes the scene. When only the presentation changed, add `--view-only` instead:

```sh
node scripts/design.mjs preliminary-check REPOSITORY cad/preliminary-design/releases/1.0/layout.json --view-only --output cad/preliminary-design/releases/1.0/receipt.json
```

The run reads the earlier receipt, reuses its case results and its displaced control, and rebuilds the page and scene around them. It reads the receipt at the `--output` path, or `receipt.json` beside the layout plan when the receipt is printed. Name another with `--from-receipt FILE`, relative to the project. A `--physics-only` receipt serves too, so a layout can be iterated with `--physics-only` and its review written afterwards without a second check.

The case results stand only while the inputs that produced them are unchanged. The run compares the editable design, the STEP, the motion study and the plan's `issue` name with the digests and name in the receipt, the displaced control with the one the receipt recorded, and the weight and voltage budgets with the receipt's budget result. A plan that names its files by path changes none of this: the run reads each file and compares the digest it finds with the one the receipt recorded. A file with a typed `sha256` is also read against it as usual. When one differs the run stops, writes nothing and names it:

```text
--view-only reuses the checked cases of a receipt only while their inputs are unchanged. Changed since that receipt: the motion study. Run the full check with --write-view
```

Everything else is checked again as in a full run: the groups and their roles, mounts, stages, payload relations and their trial references, the cycle, premises, the narrative review, component explanations and the view itself. A reworded clearance basis, a renamed group or a new component explanation is therefore accepted, and a missing explanation still leaves the receipt provisional. For the same files the receipt and the scene are the ones a full `--write-view` check writes, so publishing and the publication check accept them unchanged. A project's CI still [reruns the cases](design-publication.md) of every published layout and compares the result with the committed receipt.

`--view-only` is refused with `--fail-fast` or `--physics-only`, for a partial `--fail-fast` receipt, and for a receipt whose displaced control was not rejected. It stays one process, so `--jobs` has no effect.

### Look at the result

Serve the generated `package-motion.html` and its `review-scene.json.gz` over HTTP and open the page. The project's `serve.py` does this; `python -m http.server` in that folder also works. Opened from `file://` the page cannot load the scene.

The page is the plugin's stock review page. It fetches and decompresses the scene, which holds every value it shows. Check a scene with `node PLUGIN/scripts/review-scene.mjs validate review-scene.json.gz --receipt RECEIPT.json`.

Select an animation, orbit and pan around its solids, then play or scrub the position on the path. The page uses the same starting poses and ordered rigid transformations as the check, including simultaneous motion. The frames illustrate the stroke. The receipt gives the numerical bound, obstruction or open interval.

How the check counts pairs:

- Stationary pairs are checked in each retained scene.
- Pairs whose relative pose stays constant, including members carried by the same motion, are cleared without an exact query when their bounding boxes are more than `minGapMm` plus 0.001 mm apart. The receipt omits these rows and counts them in the case's `counts.constantPoseBroadPhase`.
- An exact constant-pose result is reused across cases only when both bodies have the same source solid and initial pose. `counts.constantPoseReused` records each reuse.

The scene stores one tessellation per body in its placed STEP pose. Each case carries only its frame placements, so the scene grows with the number of bodies and frames, not with the number of cases.

If one interface changes later, find its neighbours through the group roster. Recheck the affected loaded, park and withdrawal cases, repeat the displaced control and publish the result as the next draft.

### Animations show the mission; the check list shows the evidence

The review page keeps two things apart.

- **The animation list** is what a reviewer plays to see the robot do its job. It holds one entry per mission phase, such as reset, acquire, lift, feed or climb. Each entry plays that phase's whole motion from start to end as one clip. The requirement that a published design plays a mission task is about these entries.
- **The check results** are the evidence that the motion clears. A case is one straight segment of a path, so a phase checked at a fine tolerance has many cases. They sit in the "Check results and decision" section, one row per phase: the number of cases checked, their results, the tightest clearance, the allowance and the path tolerance used. Open a phase to see its cases. From the tightest or a failing case, jump the viewer to that pose inside the phase's animation.

A segment is not an animation. Splitting a path more finely adds rows to the check results and adds nothing to the animation list.

Name the phase of each case in its entry under `stages`, and give a phase a title under `presentation.phases`:

```json
{
  "stages": {
    "acquire-01": {"purpose": "operating", "phase": "acquire", "pathToleranceMm": 10},
    "acquire-02": {"purpose": "operating", "phase": "acquire", "pathToleranceMm": 10},
    "lift": {"purpose": "operating"}
  },
  "presentation": {
    "phases": {
      "acquire": {"title": "Acquire a piece from the floor"},
      "lift": {"title": "Lift to the delivery height", "headline": true}
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `stages.CASE.phase` | The mission phase this case is a segment of. The cases of one phase are consecutive in `cycle`, because one animation plays one continuous motion. |
| `presentation.phases.PHASE.title` | The name shown in the animation list and the check results. Without one, the phase ID is shown as words. |
| `presentation.phases.package-displacement-control.title` | The name the displaced control takes in the animation list. Without one it reads "Displaced control". The control takes a title only. |
| `presentation.phases.PHASE.headline` | `true` lists the phase under **Mission animations**; `false` lists it under **Other checked motions**. Without it, a phase is a mission animation when it holds an operating case of the cycle. Park and service phases are other checked motions. |

A plan that names no phase needs no edit. The phase of a case is then its ID without a trailing segment number, so `acquire-01`, `acquire-02` and `acquire_3` are one phase, `acquire`, when they follow one another. Only a number after `-`, `_`, `.` or a space counts: `lift-l2` stays `lift-l2`. A derived phase that returns later in the cycle becomes a second animation, `acquire-run-2`. When this still leaves more than twelve animations, the check writes a `[view]` note that asks for phase names. The note is information and does not change the result.

The displaced control is listed once, under **Check control**, by its title. A replay is listed under **Trial replays**. A link to `?case=ID` opens an animation, a replay or a case; a case opens inside its animation at its own start.

The scene carries the list as `animations`: each entry holds `id`, `title`, `mission` and the `cases` it plays in order. Each check row carries the `pathToleranceMm` its stage declares. A tolerance declared or changed in the plan therefore changes the scene: rebuild the view, and `--view-only` is enough when the cases themselves have not changed. A scene written before 0.137.0 has no `animations`; the page derives the phases from the case IDs the same way, so an issued design keeps working.

## Nothing floats

Every physical robot solid in a preliminary layout is held by something. It touches another robot solid, or the plan registers its mount, and that chain of contacts and mounts leads to the frame. A solid that hangs in space reads as a mistake to a reviewer, so fix it before sharing the review page: add the support that carries it, or register its mount. Do not wait to be asked.

Sometimes a support is deliberately not drawn yet. Label that solid as an unmounted allowance in the layout plan and give the reason:

```json
"attachment": {
  "unmounted": {"control-panel": "Panel stand-offs are chosen with the electrical layout in detailed design"}
}
```

Place field parts as case fixtures, not as members of a robot group, so they are drawn as field and left out of the robot. A fixture reaches the floor, or rests on a fixture that does. Label one that really hangs, such as a chain or a hanging target:

```json
"attachment": {
  "suspended": {"hanging-target": "Hangs from the overhead truss, which this layout does not include"}
}
```

### Read the attachment section of the layout check

After the motion cases, the layout check writes an `[attachment]` section to stderr. It reads the opening case at its start pose, the pose the review opens on.

```text
[attachment] acquire start pose, touching within 3 mm: 41 robot solids checked, 2 floating, 3 held by a registered mount alone, 1 unmounted allowance, 1 field fixture off the floor (6 extra pair distances, 0.04s)
[attachment] floating: camera (sensors); nearest attached solid upright-left, 38.5 mm away
[attachment] floating: hopper-wall (hopper); nearest attached solid frame-rail-rear, 12 mm away
[attachment] held across a gap by a registered mount alone: arm, arm-roller, lift-carriage
[attachment] unmounted allowance: control-panel (electrical): Panel stand-offs are chosen with the electrical layout in detailed design
[attachment] field fixture off the floor: target-shelf, lowest point 410 mm above the floor at Z = 0 mm
[attachment] note: nothing floats. Give each floating solid a support that touches it and traces to the frame, or register its mount; ...
```

Read it after every check and clear each `floating` and `off the floor` line. How it decides:

- **Touching** means the surfaces are within 3 mm. State another figure as `attachment.gapMm`. A pair the case declares under `intendedInterfaces` touches.
- **The frame** is the connected set of solids that holds the most members of `structure` groups.
- **A registered mount** holds the member it names to its host. A mount without a member holds the member of its group that lies nearest the mount point. A solid held only this way, with no modelled solid touching it, is listed as held by a registered mount alone. That is not a finding, but it still looks detached in the review until its bracket or shaft is drawn.
- **An unmounted allowance** is listed apart with its reason, and so is anything it carries. When a labelled solid reaches the frame after all, the line says the label can go.
- **Left out:** field fixtures, game pieces (`payload` groups), `service` groups and components whose `volumeType` is `gauge`.
- **The floor** is Z = 0 in the STEP world. State another height as `attachment.floorZMm`.

The receipt carries the same report in its `attachment` field: `floating` (each with its `group`, `nearest` attached solid and `gapMm`), `heldByMountOnly`, `unmountedAllowances`, `onUnmountedAllowance`, `fixturesOffFloor` and `suspendedFixtures`.

The stock review page lists every row under **Attachment: nothing floats**, below the required components. Choose a row to select that solid in the model. An unmounted allowance is drawn hatched and the inspector shows its reason.

The report is information. It never changes a status, a missing input or an exit code, and the publication check does not read it. A receipt saved before the report existed still reproduces on a rerun.

It reuses the gaps the motion check has already measured and measures only the extra pairs it needs, so it adds little time. A partial `--fail-fast` run records that the report was skipped. `--quiet` omits the stderr lines.

## Keep the layout a blockout

Preliminary design is lightweight, fast iteration. These are guidelines for how much detail a preliminary layout carries. They keep the work at the level where an architecture is decided, and they tell the agent when to check in with the user before going deeper. Work may go past a guideline with an agreed, bounded budget.

- **A preliminary layout is a blockout.** Use one solid per functional volume, about 30 to 80 solids for a whole robot. Leave out fasteners, bearings, lines and brackets unless one of them is the risk being examined.
- **Answer clearance questions to about 10 mm.** A fit tighter than that becomes a listed interface, with its allowance, for detailed design.
- **Keep mass and power as estimates.** Estimate by subsystem and hold a reserve.
- **Run physics trials on the few interactions that decide the architecture.**

The 30 to 80 solids and the 10 mm figure are starting figures, not measured values. A project states its own under `scopeGuidelines` in the layout plan:

```json
"scopeGuidelines": {"solids": 60, "toleranceMm": 15}
```

### Check in before going deeper

The agent pauses and tells the user when either of these is about to happen:

- the work would refine a path or clearance tolerance below 10 mm, or
- the layout would exceed 80 solids.

The agent and the user then agree an extended budget before the work continues. The budget names four things:

1. what extra detail is added,
2. which question it answers,
3. how much time, or how many cases or solids, it may use, and
4. when it stops.

The check-in makes sure the work is not getting carried away. Once the budget is agreed the work continues, and the agent checks in again before going past it. Record the agreed budget in the layout plan so the next reader sees it:

```json
"scopeGuidelines": {
  "extendedBudget": {
    "detail": "Idler shafts on the carrier",
    "question": "Does the carrier clear the rail with its shafts in place?",
    "allowance": "Six more solids and one case refined to 2 mm",
    "stopsWhen": "The carrier and rail pair is resolved either way"
  }
}
```

### Read the scope line of the layout check

Record the path tolerance each case was split at as `pathToleranceMm` in its entry under `stages` in the layout plan. Before the first case runs, the layout check writes one `[scope]` line to stderr with the number of placed solids and the finest declared path tolerance, each beside its guideline. Field fixtures are counted apart from the solids. A second line says so plainly when a guideline is passed, and names the agreed budget when the plan records one.

```text
[scope] solids=96 (guideline: up to about 80 for a whole robot) finest path tolerance=2 mm in lift-loaded (guideline: 10 mm or coarser) figures=plugin default
[scope] note: the layout has 96 solids, past the guideline of about 80 and lift-loaded is checked to a 2 mm path tolerance, finer than the guideline of 10 mm. This is information and does not change the result. Check in with the user and agree a bounded extended budget (what detail, for which question, how much time or how many cases or solids, and when it stops) before going deeper, then record it under scopeGuidelines.extendedBudget in the layout plan.
```

The receipt carries the same figures in its `scope` field: `solids`, `fieldFixtures`, the `guideline` figures and whether they came from the plugin default or the layout plan, `finestPathToleranceMm` with its case, the number of cases with no declared tolerance, the guidelines `passed`, and the agreed `extendedBudget` when one is recorded. The report is information. It never changes a status, a missing input or an exit code, and the publication check does not read it. A plan that sets none of these keys is checked as before; its receipt gains only the `scope` field. `--quiet` omits the stderr lines and keeps the field.

## Size the checks to the risk

Preliminary design is fast iteration. A revised layout should be checked and back in front of a reviewer in minutes, so decide how much checking a question deserves before running anything. A slow loop hides design problems behind queue time.

**Set a time budget first.** As a guideline, aim for a whole-cycle check of about ten minutes and a trial campaign of about ten minutes on the machine in use. Let the budget set the case and trial counts. When a run would pass it, cut the plan before starting. If the cut plan still passes it, check in with the user and agree a bounded budget. Report the budget and the actual time with the result.

**Check the whole cycle coarsely, then refine where the margin is thin.** Start with one case for each mission phase. When a recorded or planned path needs splitting, split it into as few cases as follow it within a stated tolerance, starting near 40 mm. The check sweeps each case continuously, so a coarse case still covers its whole move.

Treat any pair whose clearance is smaller than the tolerance as unresolved. Rerun only the phase that holds that pair at a finer tolerance. Leave phases with ample margin coarse and record the tolerance each phase was checked at as `pathToleranceMm`. Before refining below about 10 mm, [check in and agree a budget](#check-in-before-going-deeper).

**A squeezed soft piece is the usual reason to go finer, and it needs a budget like any other.** Where a soft game piece is squeezed against rollers or guides, path error is spent directly against the indentation allowance. The default is to list the squeeze as an interface with its allowance for detailed design. Refine that one phase below 10 mm only when the architecture depends on the squeeze, and only with an agreed budget that says how fine and for which phase. A wider stated squeeze allowance and a bench test of the squeeze are usually better than dozens of fine segments. However finely a phase is split, it stays [one animation](#animations-show-the-mission-the-check-list-shows-the-evidence): the segments are rows of the check results.

Fewer cases are not always faster. A coarse case sweeps a longer move and takes longer, so judge the plan by its total time.

**Read a failure before changing the design.** A failing pair after a coarse run is one of three things:

| Cause | How to tell | What to do |
| --- | --- | --- |
| Path approximation | The overlap is smaller than the path tolerance and shrinks when that phase is rerun at half the tolerance | Keep the finer tolerance for that phase |
| An undeclared joint or intended contact | The two solids are meant to touch, or are one part | [Declare the contact](#declare-an-intended-contact), or merge the solids |
| Real interference | The overlap is larger than the tolerance, or stays as the tolerance is refined | Move or reshape a part |

Find out which before moving a part. A sliver of a few cubic millimetres between coincident faces is contact, not a design finding.

**Size each trial to its question.** Rank the risks, write down the decision each trial could change, and stop when the decision is made. [Trials and replays](../skills/frc-preliminary-design/references/trials.md#size-a-trial-to-the-question)

**Keep presentation separate from physics.** Names, colours, explanations and grouping do not change a clearance. After such an edit, [rebuild the review with `--view-only`](#rebuild-the-review-without-rerunning-the-cases): it reuses the checked cases of the saved receipt and writes the scene and a new receipt in seconds. Use `--physics-only` while only the layout or motion is changing, then `--view-only` to write the review page from that receipt. A change to a status needs no check run at all.

**Share the machine.** Pass `--jobs` at half the cores when other work is running, and cap trial scripts the same way. Commit results as each step finishes so an interrupted campaign keeps what it found.

**Do not wait on a run.** Start a long check or campaign in the background and work on something that does not depend on it. Check a builder's exit code before trusting the files it left.

**Publish the increment.** An in-progress design goes to the project's site as soon as it passes its coarse check, with open risks listed. Later results revise that same version as its next draft.

## Judge readiness to be marked effective

The [exit criteria](design-phase-detail.md#exit-criteria-for-an-effective-preliminary-design) say what an effective preliminary design must show. The report judges them from the files in one design's folder:

```sh
node scripts/design.mjs effective-readiness PROJECT
```

`PROJECT` is the folder that holds `layout.json`, its saved `receipt.json`, `missions.json` and the trial files they name. Name other files with `--plan`, `--receipt` and `--missions`, relative to that folder. When the project is the repository and the three files sit in a release folder, name it once: `effective-readiness REPOSITORY --release cad/preliminary-design/releases/1.0`. Add `--design "NAME 1.0"` to title the report with the design name and version, as the publication check and `stage.py` do. Trial paths still resolve from the project. Add `--json` for the machine-readable report. The command writes nothing, never changes a receipt and exits 0 whatever it finds. Only an unusable project folder is an error.

```text
Effective-readiness report for Turning carrier 1.0 (synthetic-package-1.0)
Informational: marking a design effective stays a project decision in a reviewed pull request.
[not met] 1. Whole mission cycle checked for clearance, mass and voltage
            - Narrative stage endgame has no case
[met]     2. Every mission-critical interaction driven by a qualified physics trial
            · acquire: motion driven by the trial (the layout check bound the checked path to it): intake-trial.json (matches its recorded SHA-256)
[not met] 3. Every open risk closed by a design change or carried as a bench test with numbers
            - Risk belt-slip has neither a closing design change (closedBy) nor a bench test with a measure, a pass value and a fail value
Bench tests to carry as verification items (results are not required to mark the design effective): none listed
Result: 1 of 3 criteria met.
```

Publishing a draft and being marked effective ask different things of the motion shown:

| To | The motion must be |
| --- | --- |
| Publish an in-progress draft | At least one mission case: a passing operating case for a represented objective. A prescribed path is enough |
| Be marked effective | For every mission-critical interaction, a case the report counts as trial-driven: its motion comes from a qualified trial, as listed under Trials below |

Declare what the report reads:

- **Cycle map.** In `missions.json`, map each mission phase (the report calls it a narrative stage) to its checked cases: `"cycle": {"acquire": {"cases": ["acquire"]}, "retain": {"cases": ["loaded-turn"]}, ...}` for `acquire`, `retain`, `transfer`, `deliver`, `reset`, `endgame`, `park` and `service`. Each case must pass in a whole `layout-checked` receipt of this exact plan, with no missing inputs, a passing inspection weight and passing loaded-voltage cases, so supply the budgets.

  The `service` stage needs a case checked as `service`, `park` a case checked as `park`, and every other stage an `operating` case. When the game has no such stage, state it alone: `{"notApplicable": "reason"}`. The report shows the reason.
- **Trials.** The report tells how each mission case's animation relates to its trial and says so in a note under the criterion:

  | Note | What the files declare | Criterion 2 |
  | --- | --- | --- |
  | `motion driven by the trial` | The case's stage names the trial through `transportedBy`, `freePath` or `supportedBy`, so the layout check bound the checked path to the trial's record. | Counts |
  | `animation played from the trial` | A review replay under `presentation.replays` names the trial as evidence, or a linked field interaction names it. The review plays the recorded run; the checked case motion is still prescribed. | Counts |
  | `prescribed motion with a trial attached` | Only the mission case's own `trial` reference, such as `{"file": "release-trial.json"}`, names the trial. The case moves on a prescribed stroke and nothing plays the trial. | `not met` |
  | `prescribed motion, no trial` | No trial is named. A case that only follows its carrier is a prescribed path. | `not met` |

  The exit criterion requires the mission animation to be driven by the named trial, so a qualified trial attached to a prescribed motion is reported as `not met` with the line `prescribed motion with a trial attached (FILE)`. Bind the payload path in the stage, or play the recorded run as a review replay. With `--json`, the criterion lists each case under `interactions` with `motion` set to `bound`, `played`, `attached` or `prescribed` and its trial files. Stage trials count only from a `layout-checked` receipt of this plan, and each trial record must name the mission case it ran (`case`, or the `case` inside its `transport`, `freePath` or `support` record). Each trial record carries its qualification:

  ```json
  "qualification": {
    "result": "pass",
    "control": {"condition": "Roller unpowered", "rejected": true},
    "brackets": [{"input": "roller speed", "unit": "rev/s", "passing": 20, "failing": 8}],
    "timestep": {"coarseS": 0.002, "fineS": 0.001, "sameOutcome": true}
  }
  ```

  The control is an adverse or disabled condition that the trial rejects. Each bracket names an input, its unit, a value that passes and a value that fails. The timestep check repeats the nominal run once at a finer step with the same outcome. [The smallest form of each part](../skills/frc-preliminary-design/references/trials.md#what-the-effective-bar-asks-of-each-trial)
- **Risk register.** In `missions.json`, list every open risk under `risks`, each with an `id` and the `risk`. Give `closedBy` for a design change that closes it, or `benchTest` with a `measure`, a `pass` value, a `fail` value and optionally a `unit` and a `tag` (`before-build` or `on-robot`). Detailed design [takes each one up as a record](design-publication.md#bench-tests-handed-over-from-preliminary-design). An empty list states that no risk remains. Every `presentation.uncoveredCases` ID needs an entry, and a narrative objective still marked `open` keeps the criterion unmet.

The report trusts the declarations it reads. It reads each trial file by its path. Where a reference carries a SHA-256, typed by an author or recorded in the receipt by the layout check, the file is also compared with it. Each note says which: `(matches its recorded SHA-256)` or `(read; no SHA-256 given to compare)`. It does not rerun a trial. `python cad/preliminary-design/stage.py --set-status RELEASE effective --readiness PLUGIN/scripts/effective-readiness.mjs` prints the report for the release's inputs after the status change, so the pull request reviewer sees it; without `--readiness` it prints the command to run. Attach the report to the pull request that marks the release effective. Staging ignores the `cycle` and `risks` keys.

## Carry plugin updates into a season project

A season pins a plugin revision and holds copies of some plugin files. After moving the pin, re-copy what changed:

| Plugin version | Re-copy or regenerate in the season project |
| --- | --- |
| 0.103.0 | `cad/preliminary-design/stage.py` from `templates/stage-preliminary-review.py` (index rename waits for a reader). |
| 0.105.0 | `stage.py` again (a mission trial pinned through `freePath`). |
| 0.107.0, 0.108.0 | The local review page: delete `package-motion.html` and rerun the check with `--write-view` (field-fit reason; member mounts in the inspector). A stale scene is replaced without deleting it from 0.110.0. |
| 0.111.1 | The committed detailed design catalog `index.html` from `templates/detailed-design-index.html`. |
| 0.112.0 | `stage.py` again (`--readiness` prints the effective-readiness report). |
| 0.114.0 | The local review scene: rerun the check with `--write-view`, which replaces the stale scene. A plan whose cases set a start pose now stores each body once, so its scene content and digest change; an issued release keeps its scene. |
| 0.116.0 | `stage.py`, the release index page and the detailed design catalog, then follow the [migration guide](design-publication-migration.md): one workflow, no policy files, signatures or repository variables. |
| 0.117.0 | `stage.py`. The project is now the repository. A new check keeps the layout plan, its inputs and its `view` together in a release folder such as `cad/preliminary-design/releases/ID/`, names the view from the repository root, as in `cad/preliminary-design/releases/ID/package-motion.html`, and writes every pin from the repository root. `--write-view` refuses a view at the project root; an issued release whose view sits there still verifies. See [Keep the view in its release folder](#keep-the-view-in-its-release-folder). `effective-readiness` takes `--release FOLDER`. |
| 0.118.0 | Nothing to re-copy. A stage may declare `supportedBy` for a payload a registered field fixture supports. |
| 0.122.1 | The release index page `docs/preliminary-design/index.html` from `templates/preliminary-review-index.html`. The note under the header is gone: the release picker names each design status and the review page shows the rest. |
| 0.123.0 | `stage.py`, the release index page and the local review page (delete `package-motion.html` and rerun the check with `--write-view`). Staging an in-progress release again revises it in place and counts a revision; an effective release is no longer restaged. Mark in-progress releases that a later release replaced `superseded`, and add `accepted` for a superseded release that was once effective. [Revise an in-progress release in place](design-publication.md#revise-an-in-progress-release-in-place) |
| 0.125.0 | Nothing to re-copy. The layout check reports the solid count and the finest declared path tolerance beside the [scope guidelines](#keep-the-layout-a-blockout). A stage may declare `pathToleranceMm`, and the plan may state its own figures and an agreed budget under `scopeGuidelines`. |
| 0.126.0 | Nothing to re-copy. `preliminary-check --view-only` [rebuilds the review page, scene and receipt](#rebuild-the-review-without-rerunning-the-cases) from the saved receipt after a presentation edit, without rerunning the cases. |
| 0.127.0 | `stage.py`, the release index page, the detailed design catalog and the local review page (delete `package-motion.html` and rebuild it with `--view-only`). A new release takes a version as its ID, `MAJOR.MINOR`, and its architecture is named once with `--design-name`; the pages show "NAME 1.1 · draft 3 · in progress". An existing ID keeps working. [Name and number a design](design-publication.md#name-and-number-a-design), [rename a release to a version](design-publication-migration.md#rename-a-release-to-a-version) |
| 0.128.0 | Nothing to re-copy. A layout plan and its records [name files by path](#name-files-by-path); a typed `sha256` is optional and still verified. To drop the typed hashes of an in-progress release, [delete the `sha256` keys, rerun the check and restage](#drop-the-typed-hashes-of-an-in-progress-release). `cad-readmes.py` without options [checks the README still by its block, image and caption](cad-color-convention.md#keep-the-readme-still-current) and compares no bytes: add `status` to `cad-showcase.json` and run it once with `--update`. |
| 0.130.0 | The local review page (delete `package-motion.html` and rerun the check with `--write-view`). The layout check reports [floating solids and field fixtures off the floor](#nothing-floats), and the plan may label an unmounted allowance or a suspended fixture under `attachment`. Field fixtures take the `field` colour and bumper covers the alliance colour, so a rebuilt scene differs from one built before; an issued release keeps its scene. |
| 0.131.0 | The detailed design catalog `docs/detailed-design/index.html` from `templates/detailed-design-index.html`, and the local review page (delete it and rebuild it with `--view-only`). A new detailed design takes the name of its preliminary design and its own version as its ID, as in `--design 1.0`; staging the same in-progress ID again counts a draft. An earlier ID such as `detail-003` keeps working. [Name and number a detailed design](design-publication.md#name-and-number-a-detailed-design) |
| 0.132.0 | The detailed design catalog `docs/detailed-design/index.html` and the local review page (delete it and rebuild it with `--view-only`). A detailed design has [one viewer, its design review](design-publication.md#one-viewer-for-one-design): the README still and the results page link to it, and the orbit view, the animated model link and the results page's embedded model are retired. [Move to one viewer](design-publication-migration.md#move-to-one-viewer) |
| 0.133.0 | Nothing to re-copy. The detailed-design tools [name files by path](design-publication-migration.md#drop-typed-hashes-rights-terms-and-outside-custody-on-the-detailed-path): the readiness study, a motion study run on its own, the article roster, checked placement, the public Fusion handoff and the highlights manifest need no typed `sha256`, and one that is typed is still verified. Rights terms on parts are no longer read. A Fusion archive is committed in the project and moves between computers with Git. |
| 0.134.0 | The detailed design catalog `docs/detailed-design/index.html`. Detailed design keeps the bench tests its preliminary design hands over as [one record](design-publication.md#bench-tests-handed-over-from-preliminary-design), seeded with `bench-tests.mjs seed`. A detailed design becomes effective only when every `before-build` test has a recorded passing result and every `on-robot` test has an owner and a plan. A risk's `benchTest` may carry a `tag`. |
| 0.136.0 | Nothing to re-copy. The preliminary design skill is an ordered workflow with a list of defaults and a table of what to try when something fails. Held premises moved to [their own page](preliminary-design-holds.md), and trial sizing to the skill's trials reference. `npm run validate` in the plugin now fails on text damaged by a wrong encoding. |
| 0.137.0 | The local review page (delete it and rebuild it with `--view-only`). The page lists [one animation per mission phase](#animations-show-the-mission-the-check-list-shows-the-evidence) and moves the checked cases into the check results, grouped by phase. No plan edit is needed: cases whose IDs differ by a trailing segment number form one phase. A stage may name its `phase`, and `presentation.phases` gives a phase a title and a `headline` flag. The rebuilt scene carries `animations` and the declared path tolerances, so its content and digest change; an issued design keeps its scene, and the new page derives the phases of an earlier scene. A mission case must be played by a mission animation. |
| 0.138.0 | Nothing to re-copy. The layout check names the plan it read on its first stderr line and warns when the plan is older than a `--built-from` source. The effective-readiness report no longer counts a mission case whose only trial is its own `trial` reference: it reports `prescribed motion with a trial attached` as `not met`. Bind the path in the stage or play the trial as a review replay. |
| 0.139.0 | `.github/workflows/design-publication.yml` from `templates/design-publication.yml`, and `stage.py`. CI reruns the layout check only [when a design becomes effective](design-publication.md#when-the-layout-check-reruns): a draft, a rename and a view refresh are not rerun, and nothing is kept between runs. An effective design whose physics changes in place is refused. `stage.py --refresh-view ID` [republishes the view of the effective release](design-publication.md#refresh-the-view-of-an-effective-release). The runner of the check is a repository variable. The displaced control reads "Displaced control" in the animation list, or the title the plan gives it. [What to do](design-publication-migration.md#move-to-the-stage-gate-rerun) |

An in-progress design takes the new page when it is published again under its version. An effective design takes it through a [view refresh](design-publication.md#refresh-the-view-of-an-effective-release), which leaves its physics as it was. A superseded or withdrawn design never changes.
