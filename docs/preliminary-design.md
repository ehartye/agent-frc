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

Use the [whole-robot review layout template](../skills/frc-preliminary-design/references/review-layout-template.md) to place the viewer, resource figures, component ledgers and checked paths. Keep the UI, scene and evidence in the season project. From the season root run `python PLUGIN/examples/preliminary-design/create.py . --project-review --release layout-001`. Launch with `python cad/preliminary-design/serve.py` and open `http://127.0.0.1:8000/`. For a LAN review, supply the host address with `--bind`. The season-owned site under `docs/preliminary-design/` opens the latest issue. Select an archived issue with `?release=layout-001`. The starter includes the [design publication workflow](design-publication.md#set-up-the-workflow), which checks every pushed branch and deploys the site from the default branch. Each release identifies itself as preliminary design and carries a design status in the release index: in progress, effective, superseded or withdrawn. Staging requires a `layout-checked` receipt and a `missions.json` that names a passing operating case for a represented narrative objective. It writes `release.json`, which records where the committed inputs are so CI can rerun the layout check. On a site that also serves a detailed showcase, a [preliminary design release](design-publication.md#publish-a-preliminary-design-release) stays secondary while the detailed model stays front and center. A season field-interaction or physics player ships inside its release at `field/NAME.html` as mission-task evidence.

Every season uses the same [stock review page](../skills/frc-preliminary-design/references/review-layout-template.md); the project supplies data, not markup. The review opens with the viewer column (view controls above the model, playback controls directly below it) and the inspector column side by side, with the resource figures below. They stack only on pages 960 px wide or narrower. [Page order and layout](../skills/frc-preliminary-design/references/review-layout-template.md#page-order)

## Work a synthetic package

With the pluginâ€™s geometry Python environment selected, create a new example folder and run the normal design command.

```sh
python examples/preliminary-design/create.py layout-trial
node scripts/design.mjs preliminary-check layout-trial cad/preliminary-design/releases/layout-001/layout.json --require-checked
```

`layout-trial` stands for a repository. The package sits in the release folder `cad/preliminary-design/releases/layout-001/` inside it, with every pin written from `layout-trial`, and nothing is generated at its top level.

The carrier rotates 90Â° with a finite article while a neighboring slide travels 12 mm. A separate park case returns the carrier and slide. The service case withdraws the group 80 mm. Each case reserves 1 mm between unrelated bodies. The proposed layout clears acquisition, the loaded turn, release, parking and service withdrawal. As a control, moving a fixed rail 50 mm into the arc leaves both operating endpoints clear and produces about 52.04 mmÂ³ shared material at half travel. Read the actual pair and path fraction in the receipt. The example uses invented figures and simple shapes.

## Commission the project paths

1. Pin the editable `design.json` produced by the design CLI, the selected millimetre STEP and the project motion study. Use project-relative files and SHA-256 throughout. The study repeats the design digest as `layoutDesignSha256` and the exact `layoutDatum`. Give the datum a physical name and a proper row-major `robotToStepMm` transform with translations in millimetres. Express all mount points, rotation axes, starting poses, fixtures, travel and offsets in the same STEP world frame. The transform records the projectâ€™s registration. Validate it against the mounting datums on the first Fusion issue.
2. Assign every selected solid and fixture to one group. A case fixture that no group lists stops the check before any case runs, with `List each case fixture in a plan group. No group lists: ID`. Record the proposed mounting host and point for each mechanism. A mount entry may add `member` to name the one placed ID it supports, so each member of a mirrored pair cites its own point; without `member` the entry stands for the whole group. Every mechanism group still needs at least one mount; the checker does not require one per member, so register each separately mounted member yourself. When a group registers mounts for some members only, a `[mounts] note` line on stderr names the members left out: a mechanism member with no mount of its own, or the structure members without a registered joint. The note is advisory and never enters the receipt. Any group may register a mount: give a `structure` member its joint to the frame the same way, with the host under `on`. The checker compares that point with the hostâ€™s parked bounding box. Surface seating, hole alignment and strength need separate checks. Include complete stock and protection, the moving head and payload, neighboring mechanisms and a service tool wherever it occupies the path. Reserve wiring, tolerance, deflection or dressing with conservative geometry or a sourced minimum gap. List missing inputs explicitly.
3. Give each operating, park and service case its own signed start and travel. Use the existing mechanical-motion format for rotations, translations, fixtures and staged extractions. Declare all simultaneously moving groups. Use `carriedWith` for a payload that follows its carrier. Use `transportedBy` for a payload moved by contact, such as rollers or a lip, when no mechanism shares its motion. Use `freePath` for a payload that has left every mechanism. Use `supportedBy` for a payload that a registered field fixture supports or guides, such as a chute or a target. Independent moving groups retain their own motion. Tie `minGapMm` to each caseâ€™s `allowanceBasis`. Make the service case withdraw the complete group from the installed scene. A case that relies on a previous removal must name that proved extraction in the same history. [Motion and service evidence](mechanical-methods.md)
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

Add `--output receipt.json`, a path relative to the project, to save the receipt instead of printing it. The checker writes a temporary file beside the target and renames it over the target, so a reviewer or another agent reading the package finds the previous receipt or the new one, never an empty or partial file. A run that ends in an error leaves the previous receipt in place. A shell redirect such as `> receipt.json` empties the file as the run starts. `--write-view` writes the page and its scene the same way: each appears whole. On Windows a reader that opens a file during the rename itself can get a brief sharing error; it should retry. The checker waits up to ten seconds for a reader that holds a target open, then stops with an error and leaves the previous file in place. The page and scene are written only after the last check that can stop the run.

`--write-view` replaces a stale scene in the same way, so there is no need to delete it first. The checker never replaces an existing page. A project that deletes and regenerates files, or that rewrites other package files with its own scripts, opens a gap for concurrent readers. Regenerate into a new issue folder, or pause readers, when that matters.

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

The payload must be a moving `payload` group that the same stage does not list under `carriedWith`, `transportedBy` or `supportedBy`. Pin the trial that established the path. Its `freePath` record must equal the case ID, payload group and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose. A missing or unpinned trial, or a trial for another path, is listed in `missingInputs`. A free path never satisfies the loaded-operating requirement by itself: another operating case, or a carried or transported payload in the same case, must show the mechanism moving the article. The review scene names the trial in the case's evidence method and lists it under the row's `freePath`. A release may publish that trial as the `field-interaction-trial` of a mission case.

### Pin the trial behind a payload a field fixture supports

An article that rolls down a field chute or rests in a field target is supported by the field and moved by no mechanism. Register the field part as a fixture of the case, give the payload its own signed start and travel, and declare the support in the stage:

```json
"supportedBy": {
  "carried article": {
    "fixtures": ["lane"],
    "evidence": {"file": "lane-trial.json", "sha256": "..."},
    "basis": "The article rolls down the lane"
  }
}
```

The payload must be a moving `payload` group that the same stage lists under no other relation: `carriedWith`, `transportedBy` or `freePath`. Each name in `fixtures` must be a fixture the case registers. A robot member, an unknown name or a fixture of another case stops the check with `Only a field fixture registered in CASE can support a payload`. Pin the trial that established the path. Its `support` record must equal the case ID, payload group, the sorted fixture IDs and the payload members' exact `moves` and `initialPose`, with `[]` for a member that has no start pose. A missing or unpinned trial, or a trial for another path or fixture, is listed in `missingInputs`. Like a free path, a supported path never satisfies the loaded-operating requirement by itself. The review scene names the fixture and the trial in the case's evidence method and lists them under the row's `supportedBy`. A release may publish that trial as the `field-interaction-trial` of a mission case.

A plan that declares no `supportedBy` keeps its receipt and scene.

### Follow progress and stop at the first blocking case

While the check runs, it writes one line to stderr as each motion case finishes. The receipt on stdout is unchanged. Each line gives the case's position in the study, its ID and status, the failing and open pair rows, the `bounded`, `broadPhase` and `constantPoseBroadPhase` counts, and the case and total elapsed seconds. With one worker process the lines follow the study order and the displaced control is the last. Lines mark the start and finish of the budget review. When 30 seconds pass inside a case, the next pair or sample writes a `[heartbeat]` line with the pairs visited, the active pair, its subdivision depth and samples; set the interval with `--heartbeat SECONDS`. A `[motion] warning` line names a body whose rotation cannot change its swept volume, or a body listed in the motion study's optional `sweptEnvelopes` whose rotation does change it. Add `--quiet` to omit all of these lines.

```text
[motion] 2/6 park-loaded status=pass failing=0 open=0 bounded=3 broadPhase=10 constantPoseBroadPhase=14 case=0.03s total=0.07s
[heartbeat] motion 3/6 lift-loaded pairs=41/120 pair=carriage|rail depth=7 samples=93 case=30.02s total=31.40s
[motion] warning turn-loaded roller: the body is unchanged by its rotation about its own axis, so the move cannot change its swept volume and only adds refinement cost; unless another body shares the move, model it as a static envelope and remove the rotation
[budgets] done mass=pass electrical=pass 0.00s
```

The check shares the motion cases between worker processes. By default it starts one fewer than the machine's cores, and no more than the work and the free memory allow. Each worker loads the STEP file, so the check measures its own memory after loading and keeps the workers within four fifths of what is free. Set the number with `--jobs N`.

```sh
node scripts/design.mjs preliminary-check PROJECT layout.json --jobs 4
```

The receipt is the same, byte for byte, for every number of workers. A case with thousands of body pairs is divided between the workers, so one long case does not hold the others back; the slowest single pair of bodies sets the shortest possible run. Only the stderr lines differ. Cases report as they finish, in any order, and each line still gives the case's position in the study. A heartbeat line names the pair one of the case's workers is on. `--jobs 1` runs every case in order in one process. Use it to read the lines in study order, or when a worker ends for lack of memory.

To revise a layout quickly, add `--fail-fast`.

```sh
node scripts/design.mjs preliminary-check PROJECT layout.json --fail-fast
```

The run stops after the first nominal case with a status other than `pass`. That status comes from a failing or open pair, a failing or unresolved required contact, a seat, a visibility check or an incomplete extraction. The remaining cases, the displaced control, the budgets and the view are skipped. The receipt sets `"partial": true` and lists `stoppedAt`, `checkedCases` and `skippedCases`. A stopping failure gives `blocked` and reopens the case as usual. An open finding gives `provisional`, or `reopen` when a premise already reopened. A missing-input entry names the skipped work, so a partial receipt can never be `layout-checked`. `--require-checked` exits non-zero for a partial receipt. The checker evaluates skipped cases only in a full run. With several workers the run stops at the same case and writes the same receipt as with one. Workers on later cases are cancelled once an earlier case is known not to pass. Stderr may already hold the line of a later case that finished first; that case is not in the receipt.

The displaced control is expected to collide, so it never stops a run. It is the last case of the study, and it counts only when every nominal case passes. A clean `--fail-fast` run therefore checks the control and returns the same full receipt as a run without the flag. After a stop, `control.status` is `skipped` and `control.witness` is `null`. Only a full run can show that the control rejects the displaced pair. A partial run never writes a player and never credits an existing one. With `--write-view`, it reports on stderr that it did not write the view and records `view.verified: false`. Use a full run without `--fail-fast` for the issued receipt, the control and the player.

To recheck the physics of a layout whose review is already written, add `--physics-only`. It checks every case, the displaced control and the budgets and does not read or write the review page or its scene. The receipt sets `"physicsOnly": true` and is not one to publish. A project's CI [reruns each published layout](design-publication.md) this way and compares the result with the committed receipt.

Give every downstream designer the issue name, design and STEP hashes, host and mount points, motion study, status and open inputs. If one interface changes, identify its neighbors through the group roster. Recheck the affected loaded, park and withdrawal paths on the revised package, repeat the adverse control and issue the updated receipt before another designer takes the old clearance as available. The executable rechecks every commissioned case. Detailed seat geometry, loads, tolerances, retention, actuator dynamics and physical performance require their own commissioned evidence.

## Size the checks to the risk

Preliminary design is fast iteration. A revised layout should be checked and back in front of a reviewer in minutes, so decide how much checking a question deserves before running anything. A slow loop hides design problems behind queue time.

**Set a time budget first.** Aim for a whole-cycle layout check of about ten minutes and a trial campaign of about ten minutes on the machine in use. Let the budget set the case and trial counts. When a run would exceed it, cut the plan before starting. Report the budget and the actual time with the result.

**Rank the risks and test the top few.** List the premises that could change the architecture, a mechanism or an interface, each with its likelihood and its consequence. Before a trial runs, write down the decision it could change and the result that would change it. Skip a trial when no result would change the design. A question about the field or its instruments, or one the owner has already decided, becomes a bench test with pass and fail numbers.

**Check the whole cycle coarsely, then refine where the margin is thin.** Split the recorded or planned path into as few cases as follow it within a stated tolerance, starting near 40 mm. The checker sweeps each case continuously, so a coarse case still covers its whole move. Treat any pair whose clearance is smaller than the tolerance as unresolved. Rerun only the phase that holds that pair at a finer tolerance. Leave phases with ample margin coarse and record the tolerance each phase was checked at.

**Size a trial to the question.**

| Question | Smallest sound test |
| --- | --- |
| Does the nominal interaction work? | One run at the operating point, repeated at a finer timestep |
| Does the model reject a broken design? | One control with the feature removed or the input far out of range |
| Where is the edge? | Step one input outward from the operating point until the first failure on each side, then stop |
| Is the margin real under variation? | A few starts chosen to span the variation, not every recorded start at every value |
| How often does it succeed? | Only when a rate is the requirement; choose the sample size from the rate and confidence needed and stop early once the rate cannot be met |

Change one input at a time from the operating point. A full grid of every input against every start costs the product of their counts and rarely changes the decision.

**Stop when the decision is made.** A bracket is complete at its first failing value. A rate requirement is failed at the first result that puts it out of reach. Do not keep sampling a settled result to tighten an interval nobody will act on.

**Keep presentation separate from physics.** Names, colours, explanations and grouping do not change a clearance. `--write-view` checks every case before it writes the scene, so collect presentation edits and make them in one run, and use `--physics-only` while only the layout or motion is changing. A change to the release list or a status needs no check run at all.

**Share the machine.** Cap worker processes below the core count when other work is running. Commit results as each stage finishes so an interrupted campaign keeps what it found.

**Publish the increment.** An in-progress design goes to the project's site as soon as it passes its coarse check, with open risks listed. Later results revise that same release.

## Judge readiness to be marked effective

The [exit criteria](design-phase-detail.md#exit-criteria-for-an-effective-preliminary-design) say what an effective preliminary design must show. The report judges them from the files of one release's inputs:

```sh
node scripts/design.mjs effective-readiness PROJECT
```

`PROJECT` is the folder that holds `layout.json`, its saved `receipt.json`, `missions.json` and the pinned trial files. Name other files with `--plan`, `--receipt` and `--missions`, relative to that folder. When the project is the repository and the three files sit in a release folder, name it once: `effective-readiness REPOSITORY --release cad/preliminary-design/releases/layout-002`. Trial pins still resolve from the project. Add `--json` for the machine-readable report. The command writes nothing, never changes a receipt and exits 0 whatever it finds. Only an unusable project folder is an error.

```text
Effective-readiness report for synthetic-package-layout-002
Informational: marking a design effective stays a project decision in a reviewed pull request.
[not met] 1. Whole mission cycle checked for clearance, mass and voltage
            - Narrative stage endgame has no case
[met]     2. Every mission-critical interaction driven by a qualified physics trial
            · acquire: intake-trial.json
[not met] 3. Every open risk closed by a design change or carried as a bench test with numbers
            - Risk belt-slip has neither a closing design change (closedBy) nor a bench test with a measure, a pass value and a fail value
Bench tests to carry as verification items (results are not required to mark the design effective): none listed
Result: 1 of 3 criteria met.
```

Declare what the report reads:

- **Cycle map.** In `missions.json`, map each narrative stage to its checked cases: `"cycle": {"acquire": {"cases": ["acquire"]}, "retain": {"cases": ["loaded-turn"]}, ...}` for `acquire`, `retain`, `transfer`, `deliver`, `reset`, `endgame`, `park` and `service`. Each case must pass in a whole `layout-checked` receipt of this exact plan, with no missing inputs, a passing inspection weight and passing loaded-voltage cases, so commission the budgets. The `service` stage needs a case checked as `service`, `park` a case checked as `park`, and every other stage an `operating` case. When the game has no such stage, state it alone: `{"notApplicable": "reason"}`. The report shows the reason.
- **Trials.** A mission case is trial-driven when its stage pins a trial through `transportedBy`, `freePath` or `supportedBy`, when the mission case carries a `trial` pin, or when a linked field interaction's pinned trial records that case. A case that only follows its carrier is a prescribed path. Stage pins count only from a `layout-checked` receipt of this plan, and each trial record must name the mission case it ran (`case`, or the `case` inside its `transport`, `freePath` or `support` record). Each pinned trial record carries its qualification:

  ```json
  "qualification": {
    "result": "pass",
    "control": {"condition": "Roller unpowered", "rejected": true},
    "brackets": [{"input": "roller speed", "unit": "rev/s", "passing": 20, "failing": 8}],
    "timestep": {"coarseS": 0.002, "fineS": 0.001, "sameOutcome": true}
  }
  ```

  The control is an adverse or disabled condition that the trial rejects. Each bracket names an input, its unit, a value that passes and a value that fails. The timestep check repeats the trial at a finer step with the same outcome.
- **Risk register.** In `missions.json`, list every open risk under `risks`, each with an `id` and the `risk`. Give `closedBy` for a design change that closes it, or `benchTest` with a `measure`, a `pass` value, a `fail` value and optionally a `unit`. An empty list states that no risk remains. Every `presentation.uncoveredCases` ID needs an entry, and a narrative objective still marked `open` keeps the criterion unmet.

The report trusts the declarations it reads and checks that each pinned trial file has its pinned SHA-256. It does not rerun a trial. `python cad/preliminary-design/stage.py --set-status RELEASE effective --readiness PLUGIN/scripts/effective-readiness.mjs` prints the report for the release's inputs after the status change, so the pull request reviewer sees it; without `--readiness` it prints the command to run. Attach the report to the pull request that marks the release effective. Staging ignores the `cycle` and `risks` keys.

## Carry plugin updates into a season project

A season pins a plugin revision and holds copies of some plugin files. After moving the pin, re-copy what changed:

| Plugin version | Re-copy or regenerate in the season project |
| --- | --- |
| 0.103.0 | `cad/preliminary-design/stage.py` from `templates/stage-preliminary-review.py` (index rename waits for a reader). |
| 0.105.0 | `stage.py` again (a mission trial pinned through `freePath`). |
| 0.107.0, 0.108.0 | The local review page: delete `package-motion.html` and rerun the check with `--write-view` (field-fit reason; member mounts in the inspector). A stale scene is replaced without deleting it from 0.110.0. |
| 0.111.1 | The committed detailed design catalog `index.html` from `templates/detailed-design-index.html`. |
| 0.112.0 | `stage.py` again (`--readiness` prints the effective-readiness report). |
| 0.116.0 | `stage.py`, the release index page and the detailed design catalog, then follow the [migration guide](design-publication-migration.md): one workflow, no policy files, signatures or repository variables. |
| 0.114.0 | The local review scene: rerun the check with `--write-view`, which replaces the stale scene. A plan whose cases set a start pose now stores each body once, so its scene content and digest change; an issued release keeps its scene. |
| 0.117.0 | `stage.py`. The project is now the repository. A new check keeps the layout plan, its inputs and its `view` together in a release folder such as `cad/preliminary-design/releases/ID/`, names the view from the repository root, as in `cad/preliminary-design/releases/ID/package-motion.html`, and writes every pin from the repository root. `--write-view` refuses a view at the project root; an issued release whose view sits there still verifies. See [Keep the view in its release folder](#keep-the-view-in-its-release-folder). `effective-readiness` takes `--release FOLDER`. |
| 0.118.0 | Nothing to re-copy. A stage may declare `supportedBy` for a payload a registered field fixture supports. |
| 0.122.1 | The release index page `docs/preliminary-design/index.html` from `templates/preliminary-review-index.html`. The note under the header is gone: the release picker names each design status and the review page shows the rest. |
| 0.123.0 | `stage.py`, the release index page and the local review page (delete `package-motion.html` and rerun the check with `--write-view`). Staging an in-progress release again revises it in place and counts a revision; an effective release is no longer restaged. Mark in-progress releases that a later release replaced `superseded`, and add `accepted` for a superseded release that was once effective. [Revise an in-progress release in place](design-publication.md#revise-an-in-progress-release-in-place) |

An in-progress release takes the new page when it is staged again under its ID. An effective, superseded or withdrawn release never changes.

## Examine the moving blocks and budgets

### Keep the view in its release folder

The project is the repository. A release keeps its layout plan, its inputs, the review page and the scene together in one folder inside it, `cad/preliminary-design/releases/ID/` in the stock layout. The plan's `view` names the page from the repository root, in the plan's own folder, and the scene is written beside it:

```sh
node scripts/design.mjs preliminary-check REPOSITORY cad/preliminary-design/releases/layout-002/layout.json --write-view --output cad/preliminary-design/releases/layout-002/receipt.json
```

with `"view": "cad/preliminary-design/releases/layout-002/package-motion.html"` and every pin in the plan and its records written from the repository root. Save the receipt beside the page with `--output`, because the page reads `receipt.json` from its own folder. Held-receipt pins, evidence and field files then resolve from one root, and a file that a held receipt pins needs no copy into the package or `relocations` entry just to be found. Keep the held receipt passed with `--previous` in the release folder, where the [publication check](design-publication.md#which-designs-are-checked) looks for it.

Two paths are refused, each with the expected path in the message:

- A view outside the plan's folder.
- With `--write-view`, a view at the project root. This is the case when a package folder is passed as `PROJECT`. Nothing generated lands at the top of a project.

An issued release that was checked in its own folder keeps verifying: a check without `--write-view` still reads a page and scene at the project root, the publication check reruns it in its folder, and staged releases do not change. The stock `stage.py` stages both forms and tells them apart by the view path in the receipt.

To move a package that was checked in its own folder to the repository root for its next release:

1. Prefix every `file` in `layout.json` and in the records it pins (the motion study, budgets, premises, evidence and trials) with the release folder, and refresh the digests of the records that changed.
2. Set `view` to the release folder path of the page.
3. Drop any `relocations` entry and copied-in held file that existed only so a path resolved inside the package; pin the held file where it lives in the repository. The held receipt itself stays in the release folder.
4. Run the check from the repository root with `--write-view` and `--output`, then stage.

Serve the generated `package-motion.html` and its `review-scene.json.gz` over HTTP, for example with `python -m http.server` in that directory, and open the page. The page is the plugin's stock review page; it fetches and decompresses the scene, which holds every value it shows. The scene stores one tessellation per body in its placed STEP pose; each case carries only its frame placements, with the case's start pose folded into them, so the scene grows with the number of bodies and frames and not with the number of cases that pose a body differently. Opened from `file://` it cannot load the scene. Check the scene with `node PLUGIN/scripts/review-scene.mjs validate review-scene.json.gz --receipt RECEIPT.json`. Select a case, orbit and pan around its solid volumes, then play or scrub the position on path. Cylinders, spheres, swept profiles and solids with bores or cutouts can preserve the occupied space that determines fit. The viewer tessellates the placed STEP faces for display. The player uses the same starting poses and ordered rigid transformations as the interval checker, including simultaneous motion. The frames illustrate the stroke. The separate clearance receipt gives the numerical bound, obstruction or open interval. Stationary pairs are checked in each retained scene. Pairs whose relative pose stays constant, including members carried by the same motion, are cleared without an exact query when their bounding boxes are more than `minGapMm` plus 0.001 mm apart. The receipt omits these rows and counts them in the case's `counts.constantPoseBroadPhase`. An exact constant-pose result is reused across cases only when both bodies have the same source solid and initial pose, and `counts.constantPoseReused` records each reuse. A `package-motion.html` saved before version 0.100.0 is the retired player rather than the stock review page; to regenerate it, delete it and any `*.geometry.json.gz` and run `--write-view` again. A qualified intended interface must name its exact pair, stage and separately pinned evidence. The evidence record repeats the STEP digest as `stepSha256` and gives `case`, `pair` and `status: "pass"`. One file can qualify several rows: keep `stepSha256` at the top and list each `{case, pair, status}` under `interfaces`. Every row is still matched by its own case and pair, so a trial that solves the contacts of many short strokes needs one evidence file, not one per row.

List the operating and park cases in performance order in `cycle`. The checker compares each member's attained end pose with its next starting pose. Show the finite article entering, travelling with the head, leaving and resetting as appropriate for the chosen cycle. Include the drivetrain and battery as occupied groups. Service cases start from their commissioned assembled state. For a new trajectory choose a new project-relative HTML filename and generate it with `--write-view`. A saved player earns credit only if its bytes reproduce from the current issue.

Register the whole-robot mass inventory and operating requirements independently in the budget study. Record one weighed mass interval per contributor, the represented block members, and named allowances for wiring, controls and unmodeled robot hardware. Keep the payload separate to obtain the running mass range. Commission simultaneous **battery-side** current ranges per source in each operating and park stage, including a weak pack. The checker bounds bus voltage using open-circuit voltage minus the simultaneous total current times series resistance. It compares the low end against the project's operating limit and the minimum needed for the modeled duty. The designer justifies each duty minimum, current interval, source condition and omitted-stock allowance. The calculation covers nonnegative discharge on this lumped bus. Verify time-resolved inlet voltage, controller limits and attained motion when they control the decision. [Review the loaded route](whole-robot-comparison.md) and [shared electrical loads](shared-power-review.md).

The synthetic robot weighs 11 to 13.5 kg against its invented 15 kg limit. Its 11.2 to 14 kg running estimate includes the article. Simultaneous demand of 32 to 50 A leaves 10.0 to 11.264 V in the weak-pack case, above the 9.2 V required. Increase the drive upper estimate from 30 A to 80 A in the loaded turn and the low end falls to 8.5 V. That change reopens the layout decision, even with identical animation and clear paths. Detailed CAD still needs actual joints, accurate supplier articles and the applicable fabrication and readiness evidence.

## Reopen the phase that chose the premise

Use the machine-readable phase names `conceptual-design` and `preliminary-design`. Register each premise under `premises`. Its independently pinned acceptance records a named scenario, unit, source, numeric interval or categorical condition, affected groups and the phase that chose it. Pin a current observation with the same identity and unit, the current issue and geometry hashes, and the actual field containing its value in a source measurement. The scenario text is part of that identity: the observation, the upstream evidence and a held acceptance that predates `fieldInput` must repeat it exactly. To let the wording follow a revised condition, add the same short `scenarioId` to each record. When both records declare a `scenarioId`, the IDs decide and the `scenario` descriptions may differ; when either lacks one, the exact text still decides. The receipt lists `scenarioId` with the premise, the observer's wording as `observedScenario` when it differs, and both wordings of a resumed hold under `scenarioRevised`. Two different IDs keep any hold open and are named in `missingInputs`. A hold issued without a `scenarioId` keeps its exact-text rule. Unknown data or an earlier issue leaves the decision provisional. The example accepts the front approach and 2â€“3 s acquisition only for its selected cycle.

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

In a mechanical-motion case, declare `payloadCompression` for each intended contact between an analytic spherical or round-section toroidal payload and a named solid. For example, a synthetic fixture can use `{"payload":"Practice ball","contact":"Feed tread","maxDepthMm":2,"basis":"Selected radial indentation limit from the fixture load test"}` inside that array. To bind the limit to the trial that measured it, add `"evidence": {"file": "indentation-trial.json", "sha256": "...", "field": "radialIndentationMm"}`: the pinned trial record's named top-level field must be a number exactly equal to `maxDepthMm`, in one-sided millimeters, and the result row repeats the pin. To allow less than the trial measured, record that chosen value in the trial file and pin its field. A rule without `evidence` works as before. Identify whether the limit comes from a measured forceâ€“deflection curve or a preliminary design assumption. Specify a one-sided indentation in millimeters. Diametral squeeze across two surfaces is a separate measurement.

The checker takes the section radius from the registered solid and measures from its center or circular centerline to the other solid. The result records the largest observed radial intrusion and, on a pass, a conservative upper bound for the entire commissioned interval. A sampled excess fails. An interval that cannot be bounded stays open. Register other surfaces individually if they intentionally contact the piece. Preserve the unloaded display geometry, test a displaced surface beyond the allowance, and record load, friction and rebound evidence separately.
