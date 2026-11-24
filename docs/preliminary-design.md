# Preliminary design: the layout and its check

This page is the reference for the layout check: what the design source and the judgement file hold, what each flag does and how to read the result. For the order of work, the defaults and what to try when something fails, start from the [preliminary design skill](../skills/frc-preliminary-design/SKILL.md). For the commands in order, see [commands](../skills/frc-preliminary-design/references/commands.md).

A preliminary design is one robot frame and one layout: fixed structure and bumpers, mounts, moving members, a finite game piece, the field parts the mission touches and the service envelope. Simple conservative solids are enough to decide an architecture. Record what each one bounds and what geometry is missing.

Three kinds of repository take part, and each has one job:

| Repository | Holds | Runs |
| --- | --- | --- |
| The robot project | Data: the design source, custom shapes, the generated solids and records, the published page, its own CI | No plugin code |
| The design library, `frc-design-kernel` | Code that builds solids from a design source and measures clearance, attachment and mass along its motions | Nothing of the plugin |
| The plugin | The coding agent's tool: which cases to check, what a result means, readiness, the review page, publishing | The library |

The library builds and measures. The plugin judges. A design's end poses alone leave the path between them untested, so every motion is checked as a case.

## Contents

- [Work an invented example](#work-an-invented-example)
- [The design source and the judgement file](#the-design-source-and-the-judgement-file)
- [Work in three stages](#work-in-three-stages)
- [What a stage and the design source must say](#what-a-stage-and-the-design-source-must-say)
- [Run the check](#run-the-check)
- [Nothing floats](#nothing-floats)
- [Keep the layout a blockout](#keep-the-layout-a-blockout)
- [Interactions, trials and adjustments](#interactions-trials-and-adjustments)
- [Size the checks to the risk](#size-the-checks-to-the-risk)
- [Judge readiness to be marked effective](#judge-readiness-to-be-marked-effective)

## Work an invented example

With the geometry Python environment selected and the design library installed, write the example into a new folder, generate its solids and check it.

```sh
python examples/design-source/create.py layout-trial
node scripts/design.mjs preliminary-check layout-trial cad/preliminary-design/releases/1.0/judgement.json --require-checked
```

`layout-trial` stands for a repository. The design sits in the folder `cad/preliminary-design/releases/1.0/` inside it, with every file named from `layout-trial`, and nothing is generated at its top level. The starter draws nothing: it writes the design source and the judgement file as data, runs the library's `build` and then the check.

The carrier rotates 90° with a finite article while a neighbouring slide travels 12 mm. A separate park motion returns the carrier and slide. The service motion withdraws the group 80 mm. Each stage reserves 1 mm between unrelated solids. The layout clears acquisition, the loaded turn, release, parking and service withdrawal.

As a control, moving a fixed rail 50 mm into the arc leaves both operating end poses clear and puts the head through the rail at half travel. Read the pair and stroke fraction in the receipt. The example uses invented figures and simple shapes.

The invented robot weighs 11 to 13.5 kg against its 15 kg limit. Its 11.2 to 14 kg running estimate includes the article. Simultaneous demand of 32 to 50 A leaves 10.0 to 11.264 V in the weak-pack case, above the 9.2 V required. Raise the drive's upper estimate from 30 A to 80 A in the loaded turn and the low end falls to 8.5 V. That change reopens the layout decision with identical geometry.

## The design source and the judgement file

A design has two inputs, kept apart on purpose.

| File | Whose | Holds |
| --- | --- | --- |
| `design.json`, the design source | The library's | Parameters, solids, groups and what carries what, fixtures, mounts, contacts, poses and motions |
| `judgement.json`, the judgement file | The plugin's | The design source's name, a stage for each motion, the cycle, the displaced control, attachment labels, the scope guidelines, budgets, premises, the narrative list and the `presentation` text |

The rule for what goes where: if the library needs it to build or place a solid, it is in the design source. Every reason, allowance, label and explanation is in the judgement file. The check refuses a judgement file that carries `groups`, `mounts`, `contacts`, `poses`, `motions`, a `datum`, a `step` or a `motion` reference, and names what to move.

### The design source

The format is the library's and is described in its [design document](https://github.com/ehartye/frc-design-kernel/blob/main/DESIGN.md). The library is in its settling period, so the format may still change; after an update, the library's message says what to fix. What the layout check asks of a source:

- **Frame.** `frame` states the origin and axes in words. The floor is at Z = 0 unless `attachment.floorZMm` says otherwise.
- **Groups.** A group is one rigid body. Its `role` is one of `structure`, `bumper`, `drive`, `battery`, `mechanism`, `payload`, `service`, `other` or `fixture`. A layout needs the first six.
- **Solids.** One per functional volume, from the listed shapes, with sizes worked out from `parameters`. A purchased or field part is placed from its STEP file with `part`. A custom shape is the exception: it needs a reason and limits, and it only makes one solid.
- **Fixtures.** Field parts and game pieces on the field go under `fixtures`, never under `solids`. Use the official models where the project has them.
- **Mounts.** Each mechanism group has at least one mount with a `note`: the note is the basis the review shows. The mount point lies inside its host's box.
- **Contacts.** Two solids that are meant to touch are a [declared contact](#declare-an-intended-contact), with a note and the motions it holds in.
- **Poses and motions.** One motion for each checked stroke, starting from a named pose. A curved move is one motion: a `path` operation, or a motion `through` poses. Each motion of the cycle starts where the one before it ended.

Generate the solids with `python -m frc_design_kernel build SOURCE --out FOLDER` and name the manifest in the judgement file under `generated`. A generated file is never edited. The check stops when the manifest is of an earlier source.

### The judgement file

```json
{
  "schema": "agent-frc/layout-judgement@1",
  "issue": "invented-design-1.0",
  "source": {"file": "cad/preliminary-design/releases/1.0/design.json"},
  "generated": {"file": "cad/preliminary-design/releases/1.0/generated/manifest.json"},
  "view": "cad/preliminary-design/releases/1.0/package-motion.html",
  "budgets": {"file": "cad/preliminary-design/releases/1.0/budgets.json"},
  "stages": {"loaded-turn": {"purpose": "operating", "phase": "deliver", "basis": "Sweep the head and sample while the gate slides",
                             "minGapMm": 1, "allowanceBasis": "1 mm packaging reserve", "pathToleranceMm": 40,
                             "carriedWith": {"carried article": "carrier"}}},
  "cycle": ["acquire", "loaded-turn", "release", "park-loaded"],
  "control": {"case": "loaded-turn", "displaced": "rail", "moving": "head", "offsetMm": [0, -50, 0], "basis": "Move the fixed rail into the arc"}
}
```

| Field | Holds |
| --- | --- |
| `stages` | One entry for each motion of the source, under the motion's name. See the table below |
| `cycle` | The operating and park stages in mission order. Service stages are left out |
| `control` | The [displaced control](#the-displaced-control): a stage, one solid that stays still in it, one that moves, an offset and the basis |
| `attachment` | `gapMm`, `floorZMm` and the labelled exceptions `unmounted` and `suspended`. [Nothing floats](#nothing-floats) |
| `scopeGuidelines` | The project's own figures for solids and path tolerance, and an agreed `extendedBudget` |
| `budgets` | The mass and current ledger, which names its limits. [Mass and voltage budgets](#mass-and-voltage-budgets) |
| `premises`, `narrativeReview`, `missingInputs` | What the layout holds from upstream, the objectives it answers and what is still missing |
| `presentation` | Everything the review page says: `components` with a purpose and rationale for each solid, titles, phases and notes |
| `interactions`, `trials`, `measurements` | What each interaction decides and its trial, and the library's records. [Interactions, trials and adjustments](#interactions-trials-and-adjustments) |

A stage holds:

| Field | Meaning |
| --- | --- |
| `purpose` | `operating`, `park` or `service` |
| `phase` | The mission phase whose animation plays this stage. [Animations](#animations-show-the-mission-the-check-list-shows-the-evidence) |
| `basis` | What the motion is, in a sentence |
| `minGapMm`, `allowanceBasis` | The allowance between unrelated solids, and why that figure |
| `pathToleranceMm` | How closely the motion follows the path it stands for. Reported against the scope guidelines |
| `absent` | Solids taken out of the scene before the motion, such as a cover removed before a part is lifted out |
| `extract` | `true` for a service withdrawal: the moved solids must end beyond the allowance of everything that stayed |
| `requiredContacts` | Pairs that must come within `maxGapMm` in a `window` of the stroke, such as a hook seating on a bar |
| `payloadCompression` | How deep a roller or guide may press into a ball or round-section game piece. [Judge a squeezed game piece](#judge-a-squeezed-game-piece) |
| `depth` | How many times the search may halve the stroke before it reports a pair as open. Default 9 |
| `carriedWith`, `transportedBy`, `freePath`, `supportedBy` | [What moved each payload](#move-a-payload-by-contact-transport), by the name of the design library trial that moved it |

`missions.json`, the mass and current ledger and its limits stay separate files beside the judgement file, because the readiness report and the review page read them on their own.

### What the check does not do

- It runs no trial. The library runs them; the check reads their record. [Interactions, trials and adjustments](#interactions-trials-and-adjustments)
- It has no early stop. It measures every case, or the ones named with `--cases`.

## Work in three stages

| Stage | What you do | It settles when |
| --- | --- | --- |
| 1. Arrange and measure | Write the design source, generate the solids, run the layout check | The receipt reads `layout-checked` |
| 2. Planar trials | Try each deciding interaction in its plane, with a control, brackets and a half-step repeat | Each trial passes, or its risk is listed as a bench test |
| 3. 3D confirmation | Try the interactions a plane cannot show, on the settled layout | The same |

A finding from stage 2 or 3 is fixed in the design source. Never edit a generated STEP, a manifest or a scene: the next generation would undo the edit and the receipt would describe solids nobody drew. After the fix, regenerate and rerun only what the change made stale: the layout check, and the trials that read the changed solids. A record says what it was made from, so an unchanged one stands. Two round trips on one interaction is a check-in with the user.

## What a stage and the design source must say

### Name files by path

Name every file by its project-relative path, as `{"file": "..."}`, and type no hash:

```json
"source": {"file": "cad/preliminary-design/releases/1.0/design.json"},
"budgets": {"file": "cad/preliminary-design/releases/1.0/budgets.json"}
```

The same form serves every reference in the judgement file and in the records it names: the budgets and their `requirements`, each premise acceptance, observation and `source`, `narrativeReview.source`, and each trial behind `transportedBy`, `freePath` or `supportedBy`. The check reads each file and records its digest in the receipt. A `sha256` typed beside a file is verified, and a stale one stops the check with `Changed evidence: FILE`.

### The displaced control

Select a matched displaced control: one solid that stays still in a stage, shifted by a measured offset against one solid that moves there. The library measures that one pair with the solid shifted, and the check requires it to be rejected. A control that passes shows that the check could not have failed, so the receipt stays `provisional`.

### Narrative list and component explanations

Before drawing solids, read the project's current strategic narrative from opening through endgame, including contingencies. In the judgement file, set `narrativeReview.source` to its project-relative file, as `{"file": "..."}`.

Under `narrativeReview.objectives`, give each objective and fallback an `objective`, a `disposition` (`represented`, `open` or `out-of-scope`) and a `basis` naming its stage, gap or explicit scope decision. The author reconciles the list with the complete narrative. The check reads the source, records its digest in the receipt and verifies the recorded coverage.

For each solid and fixture, set `presentation.components[NAME].purpose` and `.rationale`. Explain the function and the reason this architecture needs the solid. These appear in the review page's inspector. The same entry takes the optional display `name`, `category`, `subsystem` and `material`, so a rename is a presentation edit.

A missing explanation or an open narrative objective leaves the receipt `provisional`, unless another finding already blocks it.

### Move a payload by contact transport

A fixed pocket, powered rollers or a deployable lip can move the article while no mechanism moves rigidly with it. Write the interaction's trial in the design source, run it with the library, and declare the transport in the stage with the trial's name:

```json
"transportedBy": {
  "carried article": {
    "mechanisms": ["carrier"],
    "drive": {"carrier": "Roller surface held at a fixed powered speed"},
    "trial": "pickup",
    "basis": "The article rolls in on the powered carrier surface"
  }
}
```

- Each transporter must be a `mechanism` group. A transporter that does not move in the motion needs a named `drive`.
- The payload's move in the motion must be the trial's fitted path: copy `trials.NAME.fit.operation` from the library's record into the design source as the move of every solid of the payload group. The judgement file names that record as `"trials": {"file": ".../records/trials.json"}`.
- When every condition holds, an operating stage satisfies the loaded-operating requirement.

A trial not in the record, a move that is not its fitted path or an undeclared stationary drive is listed in `missingInputs`, and the stage does not count. The check binds the path to the trial; the trial's record says what it found. [Find what moved the piece](../skills/frc-preliminary-design/references/trials.md#find-what-moved-the-piece)

### One trial, several stages

One trial can run through several stages, such as a drop, a ride on a pocket and a seat. Give each stage a window of the trial: `"trial": "receive", "window": [0.42, 0.91]`. Both ends are times at which the fit kept a point, listed in the record as `fit.atS`. The stage's move is then the fitted path through the kept points inside the window: their `throughMm` and, for a fit that turns, their `turnDeg` as the fit wrote them, about the same `turnAxis`. Set the trial's `fitToleranceMm` small enough that each stage boundary is a kept point.

The library measures each traced sample against its own piece of the kept path. A fit it records as straying past its own tolerance, `maxDeviationMm` past `toleranceMm` or `maxTurnDeviationDeg` past `turnToleranceDeg`, does not stand for the trace, and no stage binds to it: run the trial with a smaller `fitToleranceMm`. A piece that only turned in place has no path to bind.

### A free payload path

A released, launched or dropped article is carried by nothing: its path comes from a trial. Declare the free path in the stage with the trial's name, and write its fitted path as the payload's move:

```json
"freePath": {"carried article": {"trial": "release", "basis": "The article leaves the carrier and flies free"}}
```

A free path never satisfies the loaded-operating requirement by itself. Another operating stage, or a carried or transported payload in the same stage, must show the mechanism moving the article. The review scene names the trial in the case's evidence method.

### A payload a field fixture supports

An article that rolls down a field chute or rests in a field target is supported by the field and moved by no mechanism. List the field part under `fixtures` in the design source and declare the support in the stage:

```json
"supportedBy": {"carried article": {"fixtures": ["lane"], "trial": "lane roll", "basis": "The article rolls down the lane"}}
```

Each name in `fixtures` must be a fixture present in the stage, and the payload's move is the trial's fitted path. Like a free path, a supported path never satisfies the loaded-operating requirement by itself.

A payload is declared once in a stage: carried, transported, on a free path or supported.

### Declare an intended contact

Unrelated solids must stay `minGapMm` apart. Two solids that are meant to touch, seat or share material fail that test until the design source says so. Decide which of these applies:

| The two solids | Do this |
| --- | --- |
| Are one physical part drawn as two, such as a line and its termination | Draw them as one solid |
| Have coincident faces by accident, leaving a sliver overlap or a near-zero gap | Pull one back by the clearance allowance |
| Meet at a designed joint or seat | Declare the contact |

Declare the contact where the design is written, with the motions it holds in:

```json
"contacts": [{"pair": ["carrier", "pivot"], "during": ["loaded-turn"], "note": "Carrier seats on the pivot"}]
```

Without `during` the contact holds in every motion. Declare only what the design intends. A declared contact removes that pair from the clearance test, so a real interference declared away is hidden.

### Judge a squeezed game piece

A roller or guide that squeezes a soft ball or a round-section ring shares volume with it by design. Declare the pair as a contact during that motion, then say in the stage how deep the squeeze may go:

```json
"payloadCompression": [{"payload": "sample", "contact": "pad", "maxDepthMm": 1, "basis": "Allowed one-sided squash of the piece"}]
```

The library measures how far the contact surface reaches inside the piece's section along the whole stroke, with a proven ceiling. The check judges it: `pass` when the deepest point stays within `maxDepthMm` and the ceiling is proven, `fail` past it, and `open` when the search reached its depth limit. A failing squeeze blocks the layout like a failing clearance case. `payload` is a solid of a payload group, `contact` is not, and `maxDepthMm` is above zero and less than the piece's section radius. The check prints one `[squeeze]` line per rule.

The allowed depth is a best guess with a basis, like every other input. Treat it as an assumption to cover with an adjustment, such as a slotted roller mount, and put the squeeze on the builder's bench-test list.

### Mass and voltage budgets

Register the whole-robot mass inventory and operating requirements in the budget ledger, apart from the geometry.

- **Mass.** Record one mass interval per contributor, the robot solids it represents, and named allowances for wiring, controls and unmodelled hardware. Fixtures are not in the ledger. Keep the payload separate to obtain the running mass range. Hold a reserve.
- **Current.** Record simultaneous **battery-side** current ranges per source in each operating and park stage, including a weak pack.

The check bounds bus voltage as open-circuit voltage minus the simultaneous total current times series resistance. It compares the low end with the project's operating threshold and the minimum needed for the modelled duty.

The designer justifies each duty minimum, current interval, source condition and omitted-stock allowance. The calculation covers nonnegative discharge on this lumped bus. [Review the loaded route](whole-robot-comparison.md) and [shared electrical loads](shared-power-review.md).

After a geometry change, re-estimate every mass and current line whose solids changed. A ledger carried forward untouched describes the previous layout.

## Run the check

```sh
python -m frc_design_kernel build cad/preliminary-design/releases/1.0/design.json --out cad/preliminary-design/releases/1.0/generated
node scripts/design.mjs preliminary-check REPOSITORY cad/preliminary-design/releases/1.0/judgement.json --write-view --output cad/preliminary-design/releases/1.0/receipt.json
```

| Flag | Effect |
| --- | --- |
| `--write-view` | Creates the review page if it is missing and writes or replaces its scene |
| `--output FILE` | Saves the receipt through a temporary file and a rename |
| `--require-checked` | Exits 1 unless the receipt reads `layout-checked` |
| `--cases A,B` | Measures only the named stages. The receipt is partial and is not one to publish |
| `--physics-only` | Checks every case, the control and the budgets and leaves the view alone. The receipt is not one to publish |
| `--view-only` | Rebuilds the page and scene from the saved receipt and measures nothing again. Refused, naming what changed, when the design source, the generated solids, a stage's measuring inputs, the groups, the mounts, the control or the budgets differ from that receipt |
| `--workers N` | Worker processes that share the cases. Default: half the cores |
| `--quiet` | Omits the progress lines |

The check prints what it ran and what it did not, and the time against the guidelines:

```text
[inputs] judgement cad/preliminary-design/releases/1.0/judgement.json sha256=...
[scope] solids=8 (guideline: up to about 80 for a whole robot) finest path tolerance=40 mm in acquire (guideline: 10 mm or coarser) figures=plugin default
[motion] loaded-turn pass: 3 of 28 pairs measured, closest head and rail at 41.2 mm
[control] rail shifted [0, -50, 0] mm in loaded-turn: rejected, as it must be
[attachment] acquire start pose, touching within 3 mm: 7 robot solids checked, 0 floating, ...
[budgets] done mass=pass electrical=pass 0.00s
[result] layout-checked
[time] layout check of 5 case(s), the displaced control, attachment and budgets and the review view in 2 s. Guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate.
```

A pair's row in the receipt is `pass` with the proven lower bound of its gap over the whole stroke, `fail` with the stroke fraction, gap and shared volume where it was found, or `open` when the search reached its depth limit before it could prove the pair clear. An open pair is never passed off as clear. The receipt's `library` field records the design library's version and commit. It is information: nothing compares it.

The receipt's status says where the layout stands:

| Status | Meaning |
| --- | --- |
| `layout-checked` | Every represented case, reserve and budget passes and the displaced control is rejected |
| `provisional` | Nothing fails, and something is missing. `missingInputs` names it. A partial layout stays useful |
| `blocked` | A nominal case violates clearance, mass or voltage |
| `reopen` | A premise is outside its accepted condition. Change the design or have the premise accepted again upstream, then run the check again |

Use `--require-checked` to exit non-zero for anything but `layout-checked`. A malformed or stale registration exits with a diagnostic. For an early concept, name what is missing under `missingInputs` and keep the provisional receipt.

Detailed seat geometry, loads, tolerances, retention, actuator dynamics and physical performance are outside this check.

### Keep the view in its release folder

The project is the repository. A design keeps its plan, its inputs, the review page and the scene together in one folder inside it, `cad/preliminary-design/releases/VERSION/` in the stock layout. The judgement file's `view` names the page from the repository root, in the judgement file's own folder, such as `"view": "cad/preliminary-design/releases/1.0/package-motion.html"`. The scene is written beside it.

Save the receipt beside the page with `--output`, because the page reads `receipt.json` from its own folder.

Two paths are refused, each with the expected path in the message:

- A view outside the judgement file's folder.
- With `--write-view`, a view at the project root. This happens when a design's folder is passed as `PROJECT`. Nothing generated lands at the top of a project.

One design has one review page. A new mission phase or a new trial is one more entry in that page's animation list, and a new case is one more row of its check results. Do not write a second page for it.

### Save the receipt while others read

Add `--output receipt.json`, a path relative to the project, to save the receipt instead of printing it. A shell redirect such as `> receipt.json` empties the file as the run starts, so use `--output`.

The check writes a temporary file beside the target and renames it over the target. A reviewer or another agent reading the folder finds the previous receipt or the new one, never an empty or partial file. A run that ends in an error leaves the previous receipt in place. `--write-view` writes the page and its scene the same way, and only after the last check that can stop the run.

On Windows a reader that opens a file during the rename itself can get a brief sharing error; it should retry. The check waits up to ten seconds for a reader that holds a target open, then stops with an error and leaves the previous file in place.

`--write-view` replaces a stale scene, so there is no need to delete it first. It never replaces an existing page. A project script that deletes and regenerates files opens a gap for concurrent readers; pause the readers when that matters.

### Check a draft by what changed

A draft is published on the check of what changed. Add `--carry`, with the saved receipt at the `--output` path (or name it with `--from-receipt FILE`):

```sh
node scripts/design.mjs preliminary-check REPOSITORY cad/preliminary-design/releases/1.0/judgement.json --write-view --carry --output cad/preliminary-design/releases/1.0/receipt.json
```

In every case only the pairs of solids whose solids, placements, motion or rules changed are measured again; the design library carries every other pair from the case's row in the earlier receipt. It decides from an identity of each solid made from figures the build already produces: its volume, centre, second moments and box, and its group's placement along the motion. A renamed design, a renamed solid, an edited note and a new library or plugin version change no identity, so they measure nothing. A changed allowance or search depth measures every pair of its case. A required contact or a squeeze is carried when its two solids and its rule are unchanged, and a withdrawal when no solid of its case changed. The attachment report carries the touching gaps and mount distances of unchanged solids. The displaced control is always measured again.

Each case row keeps what the next carry needs: `clearance` holds the library's inputs, declared contacts and its own rows, one for each entry of `pairs`. Its `checked` says what was done: `measuredSolids`, `pairsMeasured`, `pairsCarried`, `renamed`, and `measuresMeasured` and `measuresCarried` for its contacts, squeezes and withdrawal. The receipt's `carriedFrom` names the earlier receipt and totals the pairs measured and carried, and the `[carry]` line gives the totals and the time. Staging accepts the receipt. The stage gate does not: the command that marks a design effective runs the full check on the committed design and trusts nothing carried.

### Rebuild the review without rerunning the cases

`--write-view` checks every case before it writes the scene. When only the presentation changed, add `--view-only` instead:

```sh
node scripts/design.mjs preliminary-check REPOSITORY cad/preliminary-design/releases/1.0/judgement.json --view-only --output cad/preliminary-design/releases/1.0/receipt.json
```

The run reads the saved receipt, reuses its case results and its displaced control, and rebuilds the page and scene around them. It reads the receipt at the `--output` path, or `receipt.json` beside the judgement file when the receipt is printed. Name another with `--from-receipt FILE`, relative to the project. A `--physics-only` receipt serves too, so a layout can be iterated with `--physics-only` and its review written once at the end.

The case results stand only while the inputs that produced them are unchanged. The run compares the design source, the generated solids, the `issue` name, each stage's measuring inputs, the groups, the mounts, the displaced control and the weight and voltage budgets with what the receipt recorded. A change to a title, a phase name, a basis sentence or any `presentation` text is not a measuring input. When one differs, the run stops and names it:

```text
--view-only reuses the checked cases of a receipt only while their inputs are unchanged. Changed since that receipt: the stages. Run the full check with --write-view
```

Everything else is checked again as in a full run: the groups and their roles, mounts, stages, payload relations and their trial references, the cycle, premises, the narrative review, component explanations and the view itself. A reworded clearance basis, a renamed group or a new component explanation is therefore accepted, and a missing explanation still leaves the receipt provisional. For the same files the receipt and the scene are the ones a full `--write-view` check writes, so publishing and the publication check accept them unchanged.

`--view-only` is refused with `--cases` or `--physics-only`, for a partial receipt, and for a receipt whose displaced control was not rejected.

### Look at the result

Serve the generated `package-motion.html` and its `review-scene.json.gz` over HTTP and open the page. `python PLUGIN/scripts/serve_preliminary_review.py` serves the published site from the project root; `python -m http.server` in that folder also works. Opened from `file://` the page cannot load the scene.

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

A judgement file that names no phase needs no edit. The phase of a case is then its ID without a trailing segment number, so `acquire-01`, `acquire-02` and `acquire_3` are one phase, `acquire`, when they follow one another. Only a number after `-`, `_`, `.` or a space counts: `lift-l2` stays `lift-l2`. A derived phase that returns later in the cycle becomes a second animation, `acquire-run-2`. When this still leaves more than twelve animations, the check writes a `[view]` note that asks for phase names. The note is information and does not change the result.

The displaced control is listed once, under **Check control**, by its title. A replay is listed under **Trial replays**. A link to `?case=ID` opens an animation, a replay or a case; a case opens inside its animation at its own start.

The scene carries the list as `animations`: each entry holds `id`, `title`, `mission` and the `cases` it plays in order. Each check row carries the `pathToleranceMm` its stage declares. A tolerance declared or changed in the judgement file therefore changes the scene: rebuild the view, and `--view-only` is enough when the cases themselves have not changed.

## Nothing floats

Every physical robot solid in a preliminary layout is held by something. It touches another robot solid, or the design source gives it a mount, and that chain of contacts and mounts leads to the frame. A solid that hangs in space reads as a mistake to a reviewer, so fix it before sharing the review page: draw the support that carries it, or add its mount. Do not wait to be asked.

Sometimes a support is deliberately not drawn yet. Label that solid as an unmounted allowance in the judgement file and give the reason:

```json
"attachment": {
  "unmounted": {"control-panel": "Panel stand-offs are chosen with the electrical layout in detailed design"}
}
```

List field parts under `fixtures` in the design source, not in a robot group, so they are drawn as field and left out of the robot. A fixture reaches the floor, or rests on a fixture that does. Label one that really hangs, such as a chain or a hanging target:

```json
"attachment": {
  "suspended": {"hanging-target": "Hangs from the overhead truss, which this layout does not include"}
}
```

### Read the attachment section of the layout check

After the motion cases, the layout check writes an `[attachment]` section to stderr. It reads the opening case at its start pose, the pose the review opens on.

```text
[attachment] acquire start pose, touching within 3 mm: 41 robot solids checked, 2 floating, 3 held by a registered mount alone, 1 unmounted allowance, 1 field fixture off the floor
[attachment] floating: camera (sensors); nearest attached solid upright-left, 38.5 mm away
[attachment] floating: hopper-wall (hopper); nearest attached solid frame-rail-rear, 12 mm away
[attachment] held across a gap by a registered mount alone: arm, arm-roller, lift-carriage
[attachment] unmounted allowance: control-panel (electrical): Panel stand-offs are chosen with the electrical layout in detailed design
[attachment] field fixture off the floor: target-shelf, lowest point 410 mm above the floor at Z = 0 mm
[attachment] note: nothing floats. Give each floating solid a support that touches it and traces to the frame, or give it a mount; ... Until then the layout is not layout-checked.
```

Read it after every check and clear each `floating` and `off the floor` line. How it decides:

- **Touching** means the surfaces are within 3 mm. State another figure as `attachment.gapMm`. A pair the design source declares as a contact touches.
- **The frame** is the connected set of solids that holds the most members of `structure` groups.
- **A registered mount** holds the member it names to its host. A mount without a member holds the member of its group that lies nearest the mount point. A solid held only this way, with no modelled solid touching it, is listed as held by a registered mount alone. That is not a finding, but it still looks detached in the review until its bracket or shaft is drawn.
- **An unmounted allowance** is listed apart with its reason, and so is anything it carries. When a labelled solid reaches the frame after all, the line says the label can go.
- **Left out:** field fixtures, game pieces (`payload` groups), `service` groups and components whose `volumeType` is `gauge`.
- **The floor** is Z = 0 in the robot frame. State another height as `attachment.floorZMm`.

The receipt carries the same report in its `attachment` field: `floating` (each with its `group`, `nearest` attached solid and `gapMm`), `heldByMountOnly`, `unmountedAllowances`, `onUnmountedAllowance`, `fixturesOffFloor` and `suspendedFixtures`.

The stock review page lists every row under **Attachment: nothing floats**, below the required components. Choose a row to select that solid in the model. An unmounted allowance is drawn hatched and the inspector shows its reason.

A floating solid or a field fixture off the floor that no label explains fails the layout: the receipt's status is `blocked`, its first unmet requirement names each one, and the layout is not layout-checked until each is supported, mounted or labelled with its reason.

The library measures it at the start pose of the opening stage. `--quiet` omits the stderr lines.

## Keep the layout a blockout

Preliminary design is lightweight, fast iteration. These are guidelines for how much detail a preliminary layout carries. They keep the work at the level where an architecture is decided, and they tell the agent when to check in with the user before going deeper. Work may go past a guideline with an agreed, bounded budget.

- **A preliminary layout is a blockout.** Use one solid per functional volume, about 30 to 80 solids for a whole robot. Leave out fasteners, bearings, lines and brackets unless one of them is the risk being examined.
- **Answer clearance questions to about 10 mm.** A fit tighter than that becomes a listed interface, with its allowance, for detailed design.
- **Keep mass and power as estimates.** Estimate by subsystem and hold a reserve.
- **Run physics trials on the few interactions that decide the architecture.**

The 30 to 80 solids and the 10 mm figure are starting figures, not measured values. A project states its own under `scopeGuidelines` in the judgement file:

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

The check-in makes sure the work is not getting carried away. Once the budget is agreed the work continues, and the agent checks in again before going past it. Record the agreed budget in the judgement file so the next reader sees it:

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

Record the path tolerance each case was split at as `pathToleranceMm` in its entry under `stages` in the judgement file. Before the first case runs, the layout check writes one `[scope]` line to stderr with the number of placed solids and the finest declared path tolerance, each beside its guideline. Field fixtures are counted apart from the solids. A second line says so plainly when a guideline is passed, and names the agreed budget when the judgement file records one.

```text
[scope] solids=96 (guideline: up to about 80 for a whole robot) finest path tolerance=2 mm in lift-loaded (guideline: 10 mm or coarser) figures=plugin default
[scope] note: the layout has 96 solids, past the guideline of about 80 and lift-loaded is checked to a 2 mm path tolerance, finer than the guideline of 10 mm. This is information and does not change the result. Check in with the user and agree a bounded extended budget (what detail, for which question, how much time or how many cases or solids, and when it stops) before going deeper, then record it under scopeGuidelines.extendedBudget in the judgement file.
```

The receipt carries the same figures in its `scope` field: `solids`, `fieldFixtures`, the `guideline` figures and whether they came from the plugin default or the judgement file, `finestPathToleranceMm` with its case, the number of cases with no declared tolerance, the guidelines `passed`, and the agreed `extendedBudget` when one is recorded. The report is information. It never changes a status, a missing input or an exit code, and the publication check does not read it. A plan that sets none of these keys is checked as before; its receipt gains only the `scope` field. `--quiet` omits the stderr lines and keeps the field.

## Interactions, trials and adjustments

An **interaction** is a game piece meeting the robot or the field: a pickup, a hand-off, a hold, a launch. The design source declares each one with its piece, its section plane, the solids it meets and where the piece sits, and the trials and adjustments that go with it. The library computes plain facts about each interaction and runs each trial; the layout check judges what those facts mean and records it in the receipt. [The library's interactions, trials and adjustments](https://github.com/ehartye/frc-design-kernel/blob/main/DESIGN.md)

Say in the judgement file what each interaction decides and which trial answers it:

```json
"interactions": {
  "pickup": {"decides": "Whether the belt intake can replace the roller intake", "trial": "pickup", "cases": ["acquire-1"]},
  "staging": {"decides": "Nothing: the hopper floor holds the piece whatever the friction", "noTrial": "No result would change the hopper floor", "cases": []}
},
"trials": {"file": "cad/preliminary-design/releases/1.0/records/trials.json"},
"measurements": {"file": "cad/preliminary-design/releases/1.0/records/measurements.json"}
```

`decides` is the decision the trial could change. The review page and the readiness report say it beside each trial that is not run yet, so a reader sees what is open. Never run a trial whose outcome could not change a decision: give `noTrial` and the reason instead. `cases` are the stages whose motion the interaction stands behind; a mission case counts toward being effective only when an interaction that meets its bar lists it. `trials` and `measurements` name the library's records, in one folder. An interaction the judgement file does not explain is a missing input: what it decides is settled at the arrangement stage, before any trial runs.

### The screen verdict

At the arrangement stage, before a trial is written, the check reads the library's screen facts for each interaction and gives one verdict with its reasons in plain words. Each reason gives what was measured and the guideline it is held to, such as `unguided on the plus side of the plane; guideline: a guide within 15 mm, a tenth of the piece's width`:

| Verdict | When | What a trial must show |
| --- | --- | --- |
| `planar is enough` | The piece is round in the section, every meeting solid is the same across its width, and nothing leaves the plane | A planar trial: control rejected, brackets held, half step agrees |
| `needs 3D` | The answer may depend on what one section cannot show | A 3D trial (`"engine": "mujoco"`) |
| `configurable` | A simulated result is only a best guess: a deep squeeze, or a compliant or flexible surface | The best-guess case passes and a declared adjustment covers the assumed range |

The guidelines, kept in the plugin, send an interaction to `needs 3D` when:

- the piece is not round in the section;
- a meeting solid's section changes across the piece's width by more than about 5% of the piece's thickness, or 2 mm;
- a meeting solid has a face curved across the plane, such as a funnel, a dome or a cone;
- a side is unguided, or its gap is more than about a tenth of the piece's width. A ball counts only where a meeting solid ends inside its width;
- a mechanism the piece meets turns or slides out of the plane. The field moving under a driving robot does not count;
- more than one piece is involved;
- the target is off the plane;
- the stated approach angle is beyond about 10 degrees.

It goes to `configurable` when a squeeze is deeper than about a tenth of the piece's thickness or a meeting solid is compliant or flexible. These are guidelines. When the author knows better, override the verdict with the reason: `"override": {"verdict": "planar is enough", "reason": "The second ball waits behind the gate"}`. The receipt keeps the screened verdict beside the override, and the review page and the readiness report list every override.

### Trials, records and what is stale

Write each trial as data in the design source and run it with the library: `python -m frc_design_kernel try design.json --out records`. The check reads its record and says, per interaction, the trial's result word, its engine, its stated and standing assumptions, every input with its source and range, the input it leans on most, and the adjustment windows the coverage campaign found. The check asks the library's `status` whether the record is current. A stale record is marked, with what changed. A stale or failing trial never blocks the layout; the readiness report holds it against the bar.

A stage binds a payload's motion to a trial by name, so the animation is the trial's own path:

```json
"transportedBy": {"carried article": {"mechanisms": ["carrier"], "drive": {"carrier": "Belt at its set speed"}, "trial": "pickup", "basis": "The belt lifts the piece"}}
```

The payload's move in that motion must then be the trial's `fit` operation, copied into the design source as it is. A move that differs is a missing input.

### Adjustments

What the built robot can change is design data in the source: a slotted mount (`mechanical`), a preload (`spring`) or a set speed (`setpoint`). A trial names the adjustments that apply to it, and the campaign reports the settings that pass at each end of each assumed range. Measure a mechanical adjustment at both ends: `python -m frc_design_kernel measure design.json --out records --extremes --min-gap N`, with `N` the largest stage allowance. The check records each adjustment, whether its ends were measured, and every pair that comes closer than the allowance only at an end.

### Work in order, and come back up in order

1. Arrange and measure: the layout check, with each interaction declared and screened.
2. Planar trials, for the interactions that are `planar is enough` or `configurable`.
3. 3D trials on the settled layout, for `needs 3D`.

Fix a finding from a later stage in the design source or the trial data, never in a generated scene. Sort a 3D finding before changing anything: the design is wrong, a mechanism setting is wrong, or the 3D model is wrong. Then rerun only what `status` reports stale, starting from the earliest stage it touches. Two round trips between planar and 3D on one interaction is a check-in with the owner.

## Size the checks to the risk

Preliminary design is fast iteration. A revised layout should be checked and back in front of a reviewer in minutes, so decide how much checking a question deserves before running anything. A slow loop hides design problems behind queue time.

**Set a time budget first.** As a guideline, aim for a whole-cycle check of about ten minutes and a trial campaign of about ten minutes on the machine in use. Let the budget set the case and trial counts. When a run would pass it, cut the judgement file before starting. If the cut plan still passes it, check in with the user and agree a bounded budget. Report the budget and the actual time with the result.

**Check the whole cycle coarsely, then refine where the margin is thin.** Start with one case for each mission phase. When a recorded or planned path needs splitting, split it into as few cases as follow it within a stated tolerance, starting near 40 mm. The check sweeps each case continuously, so a coarse case still covers its whole move.

Treat any pair whose clearance is smaller than the tolerance as unresolved. Rerun only the phase that holds that pair at a finer tolerance. Leave phases with ample margin coarse and record the tolerance each phase was checked at as `pathToleranceMm`. Before refining below about 10 mm, [check in and agree a budget](#check-in-before-going-deeper).

**A squeezed soft piece is the usual reason to go finer, and it needs a budget like any other.** Where a soft game piece is squeezed against rollers or guides, path error is spent directly against the indentation allowance. Judge the depth with [`payloadCompression`](#judge-a-squeezed-game-piece) and list the squeeze as an interface with its allowance for detailed design. Refine that one phase below 10 mm only when the architecture depends on the squeeze, and only with an agreed budget that says how fine and for which phase. A wider stated squeeze allowance and a bench test of the squeeze are usually better than dozens of fine segments. However finely a phase is split, it stays [one animation](#animations-show-the-mission-the-check-list-shows-the-evidence): the segments are rows of the check results.

Fewer cases are not always faster. A coarse case sweeps a longer move and takes longer, so judge the judgement file by its total time.

**Read a failure before changing the design.** A failing pair after a coarse run is one of three things:

| Cause | How to tell | What to do |
| --- | --- | --- |
| Path approximation | The overlap is smaller than the path tolerance and shrinks when that phase is rerun at half the tolerance | Keep the finer tolerance for that phase |
| An undeclared joint or intended contact | The two solids are meant to touch, or are one part | [Declare the contact](#declare-an-intended-contact), or merge the solids |
| Real interference | The overlap is larger than the tolerance, or stays as the tolerance is refined | Move or reshape a part |

Find out which before moving a part. A sliver of a few cubic millimetres between coincident faces is contact, not a design finding.

**Size each trial to its question.** Rank the risks, write down the decision each trial could change, and stop when the decision is made. [Trials and replays](../skills/frc-preliminary-design/references/trials.md#size-a-trial-to-the-question)

**Keep presentation separate from physics.** Names, colours, explanations and grouping do not change a clearance. After such an edit, [rebuild the review with `--view-only`](#rebuild-the-review-without-rerunning-the-cases): it reuses the checked cases of the saved receipt and writes the scene and a new receipt in seconds. Use `--physics-only` while only the layout or motion is changing, then `--view-only` to write the review page from that receipt. A change to a status needs no check run at all.

**Share the machine.** Pass `--workers` at half the cores when other work is running. Commit results as each step finishes so an interrupted campaign keeps what it found.

**Do not wait on a run.** Start a long check or campaign in the background and work on something that does not depend on it.

**Publish the increment.** An in-progress design goes to the project's site as soon as it passes its coarse check, with open risks listed. Later results revise that same version as its next draft.

## Judge readiness to be marked effective

The [exit criteria](design-phase-detail.md#exit-criteria-for-an-effective-preliminary-design) say what an effective preliminary design must show. The report judges them from the files in one design's folder:

```sh
node scripts/design.mjs effective-readiness PROJECT
```

`PROJECT` is the folder that holds `judgement.json`, its saved `receipt.json`, `missions.json` and the trial files they name. Name other files with `--plan`, `--receipt` and `--missions`, relative to that folder. When the project is the repository and the three files sit in a release folder, name it once: `effective-readiness REPOSITORY --release cad/preliminary-design/releases/1.0`. Add `--design "NAME 1.0"` to title the report with the design name and version, as the publication check and the stage gate do. Trial paths still resolve from the project. Add `--json` for the machine-readable report. The command writes nothing, never changes a receipt and exits 0 whatever it finds. Only an unusable project folder is an error. The [stage gate](design-publication.md#the-stage-gate) runs the same report on the committed design, with the receipt it publishes, and refuses to mark the design effective unless it meets every criterion.

```text
Effective-readiness report for Turning carrier 1.0 (synthetic-package-1.0)
The stage gate marks a design effective only when every criterion is met.
[not met] 1. Whole mission cycle checked for clearance, mass and voltage
            - Narrative stage endgame has no case
[not met] 2. Every deciding interaction meets the bar its screen verdict sets, and backs every mission case
            - Interaction pickup (configurable): trial pickup is not covered: the outcome changes inside the assumed range of "materials.bumper.friction": it holds at 0.3 and changes at 0.2; no adjustment declared for this trial has a setting that passes at each end
            · pickup: configurable; trial pickup (planar): not covered; leans most on materials.bumper.friction
[not met] 3. Every open risk closed by a design change or carried as a bench test with numbers
            - Risk belt-slip has neither a closing design change (closedBy) nor a bench test with a measure, a pass value and a fail value
Bench tests to carry as verification items (results are not required to mark the design effective): none listed
Result: 1 of 3 criteria met.
```

Publishing a draft and being marked effective ask different things of the motion shown:

| To | The motion must be |
| --- | --- |
| Publish an in-progress draft | At least one mission case: a passing operating case for a represented objective. A prescribed path is enough |
| Be marked effective | Every mission case backed by an interaction that meets the bar its screen verdict sets, as listed under Interactions below |

Declare what the report reads:

- **Cycle map.** In `missions.json`, map each mission phase (the report calls it a narrative stage) to its checked cases: `"cycle": {"acquire": {"cases": ["acquire"]}, "retain": {"cases": ["loaded-turn"]}, ...}` for `acquire`, `retain`, `transfer`, `deliver`, `reset`, `endgame`, `park` and `service`. Each case must pass in a whole `layout-checked` receipt of this exact plan, with no missing inputs, a passing inspection weight and passing loaded-voltage cases, so supply the budgets.

  The `service` stage needs a case checked as `service`, `park` a case checked as `park`, and every other stage an `operating` case. When the game has no such stage, state it alone: `{"notApplicable": "reason"}`. The report shows the reason.
- **Interactions.** Criterion 2 reads the receipt's interactions. Each one that decides the design meets its bar when:

  | Its verdict | It needs |
  | --- | --- |
  | `planar is enough` | A current trial record, planar or 3D, that is `passed` or `covered by adjustment` |
  | `needs 3D` | The same, from the 3D engine (`"engine": "mujoco"`) |
  | `configurable` | The same, and the trial names at least one declared adjustment |

  A mechanical adjustment the trial names must be measured at both ends with no pair closer than the allowance there. An interaction with `noTrial` is listed with its reason and backs no mission case. Every mission case in `missions.json` must be listed under the `cases` of an interaction that meets its bar. Each line under the criterion names the interaction, its verdict, its trial, the result and the input it leans on most; an override is listed with its reason. Interactions count only from a whole `layout-checked` receipt of this plan.
- **Risk register.** In `missions.json`, list every open risk under `risks`, each with an `id` and the `risk`. Give `closedBy` for a design change that closes it, or `benchTest` with a `measure`, a `pass` value, a `fail` value and optionally a `unit` and a `tag` (`before-build` or `on-robot`). Detailed design [takes each one up as a record](design-publication.md#bench-tests-handed-over-from-preliminary-design). An empty list states that no risk remains. Every `presentation.uncoveredCases` ID needs an entry, and a narrative objective still marked `open` keeps the criterion unmet.

The report trusts the receipt it reads, and the receipt pins the trial and measurement records by digest. It does not rerun a trial. The command that marks a release effective prints the report after the stage gate. Attach the report to the pull request that marks the release effective. Staging ignores the `cycle` and `risks` keys.
