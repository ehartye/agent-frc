---
name: frc-preliminary-design
description: "Preliminary design of the whole robot: block out a layout of about 30 to 80 solids, check the whole mission cycle for clearance, weight and loaded voltage, run the few physics trials that decide the architecture, and publish it as one named, versioned design with one review page. Use when asked to start, revise, check, publish or review a preliminary design, blockout or robot layout; to compare robot architectures; when the layout check fails, is slow or returns provisional; when parts float, a trial result is unclear or a published page looks wrong; to mark a design effective or hand it to detailed design; or when detailed design sends a reservation back."
---

# Preliminary design of the whole robot

Preliminary design decides the robot's architecture with a blockout: one solid per functional volume, checked through the whole mission cycle, plus the few physics trials that could change the choice. It is lightweight, fast iteration. Publish early as a draft and revise that draft in place.

The phase ends when the user marks the design **effective**. By then the whole cycle is checked, every mission-critical interaction passes a physics trial, and each open risk is closed or listed as a bench test with pass and fail numbers. Detailed design builds on that design.

Existing CAD is a premise you may revise. Judge the design by what works for the mission. Carry an earlier interface forward only when the project selects it and records why.

The figures here are guidelines: about 30 to 80 solids, clearances to about 10 mm, about ten minutes for a whole-cycle check and for a trial campaign. Work may go past one after a check-in and an agreed, bounded budget.

## Words

| Word | Meaning |
| --- | --- |
| design | One architecture with a name and a version, such as "Tilting carriage 1.0" |
| version | `MAJOR.MINOR`. Major is the architecture; minor is its effective baseline. It names the folder under `releases/` |
| draft | One publish of an in-progress version. Drafts are counted and take no number |
| layout | The blockout geometry: the STEP and its named solids |
| plan | `layout.json`: groups, mounts, cases, budgets and the `presentation` text |
| case | One checked motion: operating, park or service |
| check | The layout check, `preliminary-check` |
| receipt | The saved result of a check, `receipt.json` |
| review page | The one page that shows the design. Its motion list holds every case and replay |
| trial | A physics run that decides an interaction. The project owns the runner; the plugin reads the record |
| replay | A recorded trial, played in the review page's motion list |

## Order of work

Follow the steps in order. Steps 3 to 7 repeat on every edit. [Every command, in order](references/commands.md)

1. **Read the strategic narrative end to end.** List each objective and fallback as represented, open or out of scope, with the reason. If no role or cycle is selected yet, use `frc-conceptual-design` first.
2. **Find or start the design.** An in-progress design already exists: revise it. Otherwise pick the architecture, give it a short name in words and start version `1.0` from the starter. A different architecture takes the next major version and its own name.
3. **Block out the layout.** Set the robot frame, floor and datums first. Place the largest constrained items, then the rest: about 30 to 80 solids. Add the field parts and game pieces the mission touches. Write a purpose and a rationale for every solid.
4. **Write one coarse case for each mission phase** (acquire, retain, transfer, deliver, reset, endgame, park, service), starting near a 40 mm path tolerance, plus one displaced control. Estimate mass and battery current by subsystem, with a reserve.
5. **Run the check.** Read the scope, attachment and budget lines and fix what they report. Repeat until the receipt reads `layout-checked`.
6. **Publish the draft** and open the published page yourself. An in-progress design goes up as soon as it passes its coarse check, with its open risks listed. The site deploys when the pull request merges to the default branch.
7. **Rank the risks. Run the few trials that decide the architecture.** Give each a control, brackets and one finer-timestep repeat. Add each recorded trial to the motion list as a replay. Republish the same version. [Trials and replays](references/trials.md)
8. **Close each risk** with a design change, or list it as a bench test with pass and fail numbers. Run the readiness report until it reads 3 of 3.
9. **Propose effective.** Write the [handoff note](references/commands.md#write-the-handoff-note), attach the readiness report and ask the user. The user decides.

When more than one architecture is plausible at step 2, block out each one coarsely against the same frame, field, mass and power figures. Pick one, say what it gives up, then name it and carry on. Check in only when the comparison does not separate them. [Whole-robot comparison](../../docs/whole-robot-comparison.md)

## Defaults: do these without being asked

These need no permission and no reminder. If you cannot do one, say so in your result.

**Layout**

1. **Nothing floats.** Every physical solid touches, or is mounted to, something that traces to the frame. A support you have not drawn yet is labelled under `attachment.unmounted` with its reason. Clear the `[attachment]` section after every check. [Nothing floats](../../docs/preliminary-design.md#nothing-floats)
2. **Field parts are fixtures.** Register each field part as a fixture of the cases that use it, standing on the floor. Never file one in a robot group. Fixtures take the field colour.
3. **Use the official field and game-piece models** when the project has them, and supplier CAD for purchased parts. Label any dimensioned stand-in.
4. **Colours follow the component palette.** Bumper covers show the alliance colour set in `presentation.alliance`.
5. **Leave out fasteners, bearings, shafts, lines and brackets** unless one is the risk being examined.
6. **Mass follows geometry.** After a geometry change, re-estimate every mass and current line whose solids changed.

**One design, one page**

7. **Revise in place.** An edit to an in-progress design republishes the same version as the next draft.
8. **One review page, one motion list.** Checked cases first, then replays. Add no second page, tab, player or status banner. The page chip and the picker already show the status.
9. **Everything generated stays in the design's own folder.** Nothing lands at the repository root.
10. **A presentation edit uses `--view-only`.** Names, colours, explanations and grouping never need the cases rerun.

**Checks and trials**

11. **Fit the plan to ten minutes before starting.** Estimate from the per-case seconds of the last run. Cut cases, coarsen tolerances or drop trials first.
12. **Cap workers** at half the cores with `--jobs` when anything else is running. Cap your own trial scripts the same way.
13. **Check the exit code** of every builder and script before using its output. A failed builder leaves old files behind.
14. **Never idle on a background run.** Start it, then do work that does not depend on it: explanations, the risk list, the handoff note.
15. **Record each trial to its settled end.** Keep the piece's position, attitude, velocity and spin at the deciding moment.
16. **Stop when the decision is made.** A bracket ends at its first failing value. A bench-test question stays on the bench list.

**Publishing**

17. **Commit and push** after the first passing check, after each trial result and after each publish.
18. **Run the publication check locally before pushing.** CI runs on another operating system.
19. **Open the published page in a browser after each push.** Confirm the model loads, each motion plays and the status is right. A green check alone does not show that.
20. **Keep paths short and relative.** No drive letters, no home folders.
21. **Take the obvious default** and say what you chose.

**Tools**

22. **Build and check with one fixed plugin revision:** the one the project's workflow names. Use an installed copy or a worktree of your own at that commit, never a checkout another session can move. Record the revision with the result.

## Check in with the user before

- Refining a path or clearance tolerance below about 10 mm, or passing about 80 solids. Agree what detail, for which question, how much, and when it stops. Record it under `scopeGuidelines.extendedBudget`.
- Starting a check or trial campaign that will still pass about ten minutes after you have cut it.
- Dropping the architecture for another one, or starting over (`frc-start-over`).
- Scoping a narrative objective out, or changing a premise that conceptual design chose.
- Marking a design effective, superseded or withdrawn.

Ask only when the choices lead to different designs. Keep working on everything the answer does not affect.

## When you see this, try this

| You see | Likely causes, most likely first | Try first | Check in when |
| --- | --- | --- | --- |
| A pair fails after a coarse run | Path approximation; an undeclared joint or intended contact; real interference | Read the overlap and where on the path it occurs. Bodies meant to touch: [declare the interface](../../docs/preliminary-design.md#declare-an-intended-contact). Overlap smaller than the path tolerance: rerun that phase alone at half the tolerance. Larger, or growing as you refine: move a part | The phase needs a tolerance below 10 mm |
| A sliver overlap, a near-zero gap, or a line overlapping its own end | Coincident faces; two solids that are one part | Treat it as contact. Merge the solids or declare the interface. Do not investigate | Never. It is not a design finding |
| A soft piece exceeds its squeeze allowance | Path error spent against the allowance; no compression declared; a guessed allowance; real over-squeeze | [Declare the compression](../../docs/preliminary-design.md#game-piece-compression). Excess smaller than the path tolerance: list the squeeze as an interface with its allowance | The architecture depends on that squeeze |
| The check stops before any case | A fixture no group lists; a named file that does not exist; a typed `sha256` that is stale; a view outside the design's folder | Read the message. It names the file or ID. Fix that one thing and rerun | The message names nothing you changed |
| The receipt reads `provisional` | A missing purpose or rationale; an open narrative objective; a trial not named for a moved piece; no budgets | Read `missingInputs` and `decision.firstUnmet` in the receipt. Supply each one | An objective can only be closed by scoping it out |
| The receipt reads `reopen` | A premise left its accepted range | [Follow the hold](../../docs/preliminary-design-holds.md) | The premise came from conceptual design |
| The check is slow | Too many cases; tolerance finer than needed; too many solids; a full run where a partial one would do | In order: `--view-only`, `--fail-fast`, `--physics-only`, coarser tolerance where margin is ample, fewer solids, then `--jobs` | It still passes ten minutes |
| Parts float, or field parts read as robot | A field part filed in a robot group; a support not drawn; a solid placed by eye | Read the `[attachment]` section. Refile field parts as fixtures. Move the solid onto its support, add the support, or label it under `attachment.unmounted` | Never |
| The layout is past a scope guideline | Hardware crept in | Merge solids that move together and are not the risk. Remove hardware | A removed detail is the risk being examined |
| A trial outcome is intermittent | Timestep; a start on a knife edge; contact settings; no funnel in the design | Halve the timestep once. If it still varies, run a few starts that span the variation and report the count. Look for geometry that makes the outcome insensitive before tuning inputs | A handful of runs still disagree |
| A miss cannot be explained | The recording ended early; the deciding state was not kept | Rerun three misses to rest with the end state kept. Classify each: late, bounced out, never arrived | Three misses have three causes |
| A rate is not met, or margin and outcome disagree | Operating point off-centre; variation wider than assumed; the margin is not what scores | The mission outcome decides. Step one input from the operating point and stop at the first result that settles it. State the margin cost and list it as a bench test | The best setting still misses |
| The receipt or page differs between two runs with no input change | The plugin revision moved under the run; a builder that is not repeatable | Compare the plugin revision of both runs. Rerun from a fixed copy at the revision the workflow names | Both runs used the same revision |
| A result did not change after an edit | The builder failed and left old files; the check ran on stale inputs | Check the builder's exit code. Rebuild, then rerun with `--output` in the design's folder | It survives a clean rebuild |
| The published page is old, blank or differs from the local one | Not pushed or not deployed; browser cache; opened from `file://`; unchanged files republished | Confirm the commit is on the default branch and the deploy is green. Hard-reload. Serve the page over HTTP. Compare the two `receipt.json` files | The deploy is green and they still differ |
| Publishing is refused | A second in-progress version of one architecture; an effective version edited; no mission case; no design name | Read the message. Revise the existing draft, or take the next version | You believe a new version is right |
| CI fails and the local check passes | A path that differs by case or length; a moved plugin pin; a path or secret scan hit | Run the same command locally. Fix the path or pin. Leave the design alone | It fails twice in CI only |
| Detailed design returns a reservation | A real part does not fit an envelope, allowance or reserve | Start the next minor version from the effective one with `--copy-inputs`, fix the layout, rerun the affected cases | The fix needs a different architecture |

## Reference

- [Commands in order, on Windows and in CI](references/commands.md)
- [Trials and replays: sizing, records, retention, what moved the piece](references/trials.md)
- [Review page: regions, scene data, replay format](references/review-layout-template.md)
- [What the review page must let a reviewer do](references/presentation.md)
- [The layout check: plan, cases, flags and output](../../docs/preliminary-design.md)
- [Publishing, versions and statuses](../../docs/design-publication.md)
- [Phases, statuses and the effective bar](../../docs/design-phase-detail.md)
- [Rare: held premises and moved files](../../docs/preliminary-design-holds.md)
