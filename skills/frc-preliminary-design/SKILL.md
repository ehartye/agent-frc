---
name: frc-preliminary-design
description: "Preliminary design of the whole robot: block out a layout of about 30 to 80 solids, check the whole mission cycle for clearance, weight and loaded voltage, run the few physics trials that decide the architecture, and publish it as one named, versioned design with one review page. Use when asked to start, revise, check, publish or review a preliminary design, blockout or robot layout; to compare robot architectures; when the layout check fails, is slow or returns provisional; when parts float, a trial result is unclear or a published page looks wrong; to mark a design effective or hand it to detailed design; or when detailed design sends a reservation back."
---

# Preliminary design of the whole robot

Preliminary design decides the robot's architecture with a blockout: one solid per functional volume, checked through the whole mission cycle, plus the few physics trials that could change the choice. It is lightweight, fast iteration. Publish early as a draft and revise that draft in place.

The phase ends when the user marks the design **effective**. By then the whole cycle is checked, every mission-critical interaction passes a physics trial, and each open risk is closed or listed as a bench test with pass and fail numbers. Detailed design builds on that design.

Existing CAD is a premise you may revise. Judge the design by what works for the mission. Carry an earlier interface forward only when the project selects it and records why.

A design is data. You write a **design source**: solids, groups, mounts, poses and motions in one JSON file. The design library, `frc-design-kernel`, builds the solids from it and measures them. The plugin judges what the measurements mean. You write no builder program.

The figures here are guidelines: about 30 to 80 solids, clearances to about 10 mm, about a minute for a check while editing and about ten minutes for a trial campaign. Work may go past one after a check-in and an agreed, bounded budget.

## Words

| Word | Meaning |
| --- | --- |
| design | One architecture with a name and a version, such as "Tilting carriage 1.0" |
| version | `MAJOR.MINOR`. Major is the architecture; minor is its effective baseline. It names the folder under `releases/` |
| draft | One publish of an in-progress version. Drafts are counted and take no number |
| design source | `design.json`: solids, groups, fixtures, mounts, contacts, poses and motions. The library's file |
| judgement file | `judgement.json`: a stage for each motion, the cycle, the control, allowances, budgets and the `presentation` text. The plugin's file |
| generated | What the library writes from the source: the STEP and its manifest. Never edited |
| case | One checked motion of the source with its stage: operating, park or service. Evidence, listed in the check results |
| animation | One mission phase played from start to end, whatever number of cases it was checked in |
| check | The layout check, `preliminary-check` |
| receipt | The saved result of a check, `receipt.json` |
| review page | The one page that shows the design. Its animation list holds one entry per mission phase and each replay. Its check results hold every case |
| trial | A physics run that decides an interaction. The plugin reads its record |
| replay | A recorded trial, played in the review page's animation list |

## What to run for this change

| The change | Run |
| --- | --- |
| Geometry, a motion, a fixture | Regenerate the solids, then the layout check. While editing, add `--cases` for the stages the change affects |
| A tolerance or reserve, a trial, a mass or voltage budget | The layout check |
| The page, a title, a colour, a name, a version label, a status word, a document | `--view-only` when the page shows it, then the publication check. Never the layout check |
| Publishing a draft | The publication check. A draft is published on its own layout check |
| Marking a design effective | The command that marks it effective. It runs the stage gate itself: the full layout check on the committed design, once. Commit the design's inputs first |
| The physics of an effective design | Never in place. Open the next minor version as a draft |

You run every one of these with the plugin. The project runs none of them: its CI is its own files, and a push only publishes. Time guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate. When a run is heading past its guideline, stop and tell the user what is slow. Do not repeat a run whose inputs have not changed. Read the last lines each command prints: they say what ran, what did not and what a push will do. [Test by need and risk](../../docs/testing-methodology.md)

## Order of work

Follow the steps in order. Steps 3 to 7 repeat on every edit. [Every command, in order](references/commands.md)

The work has three stages, and each one settles before the next starts:

1. **Arrange and measure.** Write the design source, generate the solids and run the layout check until the whole cycle is clear.
2. **Planar trials.** Try each deciding interaction in its plane.
3. **3D confirmation** on the settled layout, for the interactions a plane cannot show.

A finding from a later stage is fixed in the design source and never in a generated file or scene. Then regenerate and rerun only what the change made stale: the check and the trials that read the changed solids. Two round trips on one interaction is a check-in.

1. **Read the strategic narrative end to end.** List each objective and fallback as represented, open or out of scope, with the reason. If no role or cycle is selected yet, use `frc-conceptual-design` first.
2. **Find or start the design.** An in-progress design already exists: revise it. Otherwise pick the architecture, give it a short name in words and start version `1.0` from the starter. A different architecture takes the next major version and its own name.
3. **Write the design source.** State the robot frame and the floor first. Draw the largest constrained items, then the rest: about 30 to 80 solids from the listed shapes, with sizes worked out from a few parameters. Place supplier and field parts from their STEP files, and list field parts and game pieces on the field as fixtures. Group the solids that move as one body. Write a purpose and a rationale for every solid in the judgement file. [Design source and judgement file](../../docs/preliminary-design.md#the-design-source-and-the-judgement-file)
4. **Write one motion for each mission phase** (acquire, retain, transfer, deliver, reset, endgame, park, service) and its stage in the judgement file, plus one displaced control. A curved move is one motion: a path, or a move through poses. Estimate mass and battery current by subsystem, with a reserve.
5. **Generate the solids and run the check.** Read the scope, attachment and budget lines and fix what they report, in the source or in the judgement file. Repeat until the receipt reads `layout-checked`.
6. **Publish the draft** and open the published page yourself. An in-progress design goes up as soon as it passes its coarse check, with its open risks listed. The site deploys when the pull request merges to the default branch.
7. **Rank the risks. Run the few trials that decide the architecture,** planar first. Give each a control, brackets and one finer-timestep repeat. Add each recorded trial to the animation list as a replay. Republish the same version. [Trials and replays](references/trials.md)
8. **Close each risk** with a design change, or list it as a bench test with pass and fail numbers. Run the readiness report until it reads 3 of 3. A trial named only on the mission case is reported as `prescribed motion with a trial attached` and does not count: name it on the case's stage or play it as a replay.
9. **Propose effective.** Write the [handoff note](references/commands.md#write-the-handoff-note), attach the readiness report and ask the user. The user decides.

When more than one architecture is plausible at step 2, block out each one coarsely against the same frame, field, mass and power figures. Pick one, say what it gives up, then name it and carry on. Check in only when the comparison does not separate them. [Whole-robot comparison](../../docs/whole-robot-comparison.md)

## Defaults: do these without being asked

These need no permission and no reminder. If you cannot do one, say so in your result.

**Layout**

1. **Nothing floats.** Every physical solid touches, or is mounted to, something that traces to the frame. A support you have not drawn yet is labelled under `attachment.unmounted` with its reason. Clear the `[attachment]` section after every check. [Nothing floats](../../docs/preliminary-design.md#nothing-floats)
2. **Field parts are fixtures.** List each field part under `fixtures` in the design source, standing on the floor. Never file one in a robot group. Fixtures take the field colour.
3. **Use the official field and game-piece models** when the project has them, and supplier CAD for purchased parts. Label any dimensioned stand-in.
4. **Colours follow the component palette.** Bumper covers show the alliance colour set in `presentation.alliance`.
5. **Leave out fasteners, bearings, shafts, lines and brackets** unless one is the risk being examined.
6. **Mass follows geometry.** After a geometry change, re-estimate every mass and current line whose solids changed.
7. **Geometry is written in the source and nowhere else.** Never edit a generated STEP, manifest or scene. Use a custom shape only when no listed shape can make the solid, and give its reason and limits. A group is one rigid body. Solid names are plain ASCII.

**One design, one page**

8. **Revise in place.** An edit to an in-progress design republishes the same version as the next draft.
9. **One review page, one animation list.** One entry per mission phase, then replays. Animations show the mission and the check results show the evidence: a segment is not an animation. When a phase is split into several cases, name it under `stages.CASE.phase`. Add no second page, tab, player or status banner. The page chip and the picker already show the status.
10. **Everything generated stays in the design's own folder.** Nothing lands at the repository root.
11. **A presentation edit uses `--view-only`.** Names, colours, explanations and grouping never need the cases rerun.

**Checks and trials**

12. **Fit the work to its guideline before starting.** Estimate from the seconds of the last run. Check the stages you changed with `--cases`, merge solids or drop trials first.
13. **Cap workers** at half the cores with `--workers` when anything else is running.
14. **Regenerate before checking.** After an edit to the design source, build the solids again and check the exit code. The check refuses solids generated from an earlier source and says so.
15. **Never idle on a background run.** Start it, then do work that does not depend on it: explanations, the risk list, the handoff note.
16. **Record each trial to its settled end.** Keep the piece's position, attitude, velocity and spin at the deciding moment.
17. **Stop when the decision is made.** A bracket ends at its first failing value. A bench-test question stays on the bench list.

**Publishing**

18. **Commit and push** after the first passing check, after each trial result and after each publish.
19. **Run the publication check before pushing.** It never runs the layout check, and the project's CI runs no design check: what you push is what is published. Read its `Advice:` lines. They list published files that no page, index or listed design leads to, such as a withdrawn viewer left in `docs/`. Delete or link each one before the push.
20. **Open the published page in a browser after each push.** Confirm the model loads, each animation plays its whole phase and the status is right. A green check alone does not show that.
21. **Keep paths short and relative.** No drive letters, no home folders.
22. **Take the obvious default** and say what you chose.

**Tools**

23. **Check with one fixed copy of the plugin:** an installed copy or a worktree of your own, never a checkout another session can move. The design library has no pinned version: its main branch is the release. `frc-setup` says what is installed and how to update it, and the receipt records the library version as information.

## Check in with the user before

- Refining a path or clearance tolerance below about 10 mm, or passing about 80 solids. Agree what detail, for which question, how much, and when it stops. Record it under `scopeGuidelines.extendedBudget`.
- Writing a second custom shape, or one longer than a few lines.
- A second round trip from a trial or a 3D result back to the layout on the same interaction.
- A squeezed soft game piece that forces a path tolerance finer than about 10 mm. A wider stated squeeze allowance and a bench test are usually better than dozens of fine segments.
- Starting a check or trial campaign that will still pass about ten minutes after you have cut it.
- Dropping the architecture for another one, or starting over (`frc-start-over`).
- Scoping a narrative objective out, or changing a premise that conceptual design chose.
- Marking a design effective, superseded or withdrawn.

Ask only when the choices lead to different designs. Keep working on everything the answer does not affect.

## When you see this, try this

| You see | Likely causes, most likely first | Try first | Check in when |
| --- | --- | --- | --- |
| A pair fails | An undeclared joint or intended contact; a path fitted too loosely to its trial; real interference | Read the overlap and where on the stroke it occurs. Bodies meant to touch: [declare the contact](../../docs/preliminary-design.md#declare-an-intended-contact) in the design source. Overlap smaller than the path tolerance: fit the path closer. Larger: move a part in the source | The phase needs a tolerance below 10 mm |
| A sliver overlap or a near-zero gap | Coincident faces; two solids that are one part | Treat it as contact. Merge the solids, draw a small split or declare the contact. Do not investigate | Never. It is not a design finding |
| A pair reads `open` | The search reached its depth limit before it could prove the pair clear | Raise `depth` on that stage by one or two. A pair is never passed as clear without the proof | It stays open at depth 12 |
| A soft piece exceeds its squeeze allowance | Path error spent against the allowance; no compression declared; a guessed allowance; real over-squeeze | [Declare the compression](../../docs/preliminary-design.md#game-piece-compression). Excess smaller than the path tolerance: list the squeeze as an interface with its allowance | The architecture depends on that squeeze |
| The check stops before any case | An error in the design source; solids generated from an earlier source; geometry written in the judgement file; a motion with no stage; a named file that does not exist | Read the message. It names the entry and says how to fix it. Fix that one thing, regenerate and rerun | The message names nothing you changed |
| The check says the design library is missing | It is not installed in this Python, or an update changed a format | Run the `frc-setup` check for `preliminary-design`. It prints the install command. The library is in its settling period: after an update, fix the design source as the message says | The same source fails after an update and the message does not say why |
| The receipt reads `provisional` | A missing purpose or rationale; an open narrative objective; a trial not named for a moved piece; no budgets | Read `missingInputs` and `decision.firstUnmet` in the receipt. Supply each one | An objective can only be closed by scoping it out |
| The receipt reads `reopen` | A premise left its accepted range | [Follow the hold](../../docs/preliminary-design-holds.md) | The premise came from conceptual design |
| The check is slow | Detailed supplier or field solids; too many solids; a full run where a partial one would do | In order: `--view-only`, `--cases`, `--physics-only`, fewer and simpler solids, then `--workers`. Read the `[time]` lines: they say what ran and what did not | It still passes its guideline |
| Parts float, or field parts read as robot | A field part listed under `solids`; a support not drawn; a solid placed by eye | Read the `[attachment]` section. Move field parts to `fixtures`. Move the solid onto its support, draw the support, add its mount, or label it under `attachment.unmounted` | Never |
| The layout is past a scope guideline | Hardware crept in | Merge solids that move together and are not the risk. Remove hardware | A removed detail is the risk being examined |
| A trial outcome is intermittent | Timestep; a start on a knife edge; contact settings; no funnel in the design | Halve the timestep once. If it still varies, run a few starts that span the variation and report the count. Look for geometry that makes the outcome insensitive before tuning inputs | A handful of runs still disagree |
| A miss cannot be explained | The recording ended early; the deciding state was not kept | Rerun three misses to rest with the end state kept. Classify each: late, bounced out, never arrived | Three misses have three causes |
| A rate is not met, or margin and outcome disagree | Operating point off-centre; variation wider than assumed; the margin is not what scores | The mission outcome decides. Step one input from the operating point and stop at the first result that settles it. State the margin cost and list it as a bench test | The best setting still misses |
| The receipt or page differs between two runs with no input change | The plugin copy or the design library moved between the runs | Compare the plugin revision and the `library` field of both receipts. Rerun both from one fixed copy | Both runs used the same revisions |
| A result did not change after an edit | The edit went into a generated file; the solids were not regenerated; the receipt was not saved | Make the edit in the design source. Regenerate, then rerun with `--output` in the design's folder. Read the `[inputs]` line: it gives the judgement file and its digest | It survives a clean regeneration |
| The published page is old, blank or differs from the local one | Not pushed or not deployed; browser cache; opened from `file://`; unchanged files republished | Confirm the commit is on the default branch and the deploy is green. Hard-reload. Serve the page over HTTP. Compare the two `receipt.json` files | The deploy is green and they still differ |
| The animation list holds many short clips of one motion | The segments of one phase share no name; an earlier copy of the review page | Name the phase of each case under `stages.CASE.phase` and rebuild with `--view-only`. For an earlier page, delete it and rebuild. [Animations and check results](../../docs/preliminary-design.md#animations-show-the-mission-the-check-list-shows-the-evidence) | Never |
| Publishing is refused | A second in-progress version of one architecture; an effective version edited; no mission case; no design name | Read the message. Revise the existing draft, or take the next version | You believe a new version is right |
| The project's CI fails | A personal path or a secret in a tracked file; a design index that disagrees with its folders; a dead link in a published page | Read the message: it names the file. Run `node scripts/ci/scan.mjs .` and `node scripts/ci/site-check.mjs docs` in the project. Fix the file. Leave the design alone | It fails twice with no change of yours |
| The publication check refuses the project | A workflow or `stage.py` left from an earlier layout; a receipt that is not of the committed files; an effective design whose physics changed; a status set by hand | Read the message. Delete the plugin file it names, rerun the layout check and publish again, take the next minor version, or mark the design effective with the command | You believe the refusal is wrong |
| The design has a `layout.json`, a `paths.json` and a builder script | It is in the earlier format | Leave an effective design as it is. For work in progress, write the design source and the judgement file by hand from the plan; nothing converts one to the other. [The earlier format](../../docs/preliminary-design.md#the-earlier-format-a-layout-plan-and-a-builder) | The design is effective and must change |
| Detailed design returns a reservation | A real part does not fit an envelope, allowance or reserve | Start the next minor version from the effective one with `--copy-inputs`, fix the layout, rerun the affected cases | The fix needs a different architecture |

## Coming, not here yet

- Trials written as data in the design source and run by the library: until then, bind each recorded trial as [Trials and replays](references/trials.md) says.
- The screen that says, from facts the library computes, whether an interaction needs a planar trial, a 3D trial or an adjustment.
- Adjustments as design data, with a coverage campaign across each assumed range.
- The auditor that reports project code which builds, measures or writes records outside the library.

## Reference

- [Commands in order, on Windows](references/commands.md)
- [Trials and replays: sizing, records, retention, what moved the piece](references/trials.md)
- [Review page: regions, scene data, replay format](references/review-layout-template.md)
- [What the review page must let a reviewer do](references/presentation.md)
- [The layout check: design source, judgement file, flags and output](../../docs/preliminary-design.md)
- [The design library: source format, shapes, motions and custom shapes](https://github.com/ehartye/frc-design-kernel/blob/main/DESIGN.md)
- [Publishing, versions and statuses](../../docs/design-publication.md)
- [Phases, statuses and the effective bar](../../docs/design-phase-detail.md)
- [Rare: held premises and moved files](../../docs/preliminary-design-holds.md)
