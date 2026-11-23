---
name: frc-robot-highlights
description: "Create or refresh a student robot showcase with an explorable design review, mechanism animations, a maintained README still and source-linked design evidence."
---

# Robot showcase

The showcase lets a student explore the robot, watch its mechanisms move and follow each claim to its evidence. It ends when the hosted page, the design review and the README still all show the same design and you have opened each one.

**Start here:** find the design to show in `docs/detailed-design/designs.json`, then do the six steps in order.

## One design, one review

Each design has one explorable view: its [design review](../../docs/design-publication.md#one-viewer-for-one-design), the page the layout check writes and staging copies to `docs/detailed-design/designs/ID/`. It serves the design while it is `in-progress` and after it is `effective`. The README still links to it. The showcase page links to it and adds results, films and sources.

| Status | Where it shows |
| --- | --- |
| `effective` detailed design | Front and centre: the entry page, the README still and the selector |
| `in-progress` detailed design | Beside the effective one, labelled. It takes the front only when no design is effective |
| Preliminary design, in progress or effective | A secondary page that says it is preliminary design |
| `superseded` | Viewable as history |
| `withdrawn` | Not shown. The index keeps the reason |

Statuses, staging and withdrawal belong to [design publication](../../docs/design-publication.md). Update the entry page, README and selector in the pull request that changes a status.

## What to run for a showcase change

A showcase change is a page change. Build the page, open it and run the publication check. It never starts the layout check or a readiness review: those run when geometry, motion or a budget changes, and the stage gate runs once, in the command that marks a design effective. The page build should take about a minute; when it is heading past that, stop and tell the user what is slow. [Test by need and risk](../../docs/testing-methodology.md)

## Order of work

### 1. Choose what to show

Start with the project's existing public page, the design and its match role. Find the strongest recorded result that would help a student decide what to keep or change. Open the original run. Check the design it ran on, the clock, units, pass criterion and first failure. A tally from a development run stays beside the conditions that produced it. A different drivetrain or mechanism needs its own run.

### 2. Show the model

- Resolve the project's [component palette](../../docs/cad-color-convention.md) first. Use the same part roles in Fusion, the design review and the README still. Check the bumper cover, the moving parts next to it and supplier finishes in each.
- Caption the view with the design name, status, pose and scope. Name simplified purchased parts and unfinished subsystems. Title a subsystem-only view with the subsystem.
- Link the student Fusion file or its project location.
- Put a CAD still directly below the title of each project README, linked to the design review. In the project's `cad-showcase.json` set `source`, `title`, `scope` and the design's `status`. The update links the still to the current design's review by itself. Then run:

```sh
python PLUGIN/scripts/export-showcase-cad.py .
python PLUGIN/scripts/cad-readmes.py . --update
```

Run `cad-readmes.py .` with no option before pushing. It checks that each README shows the still below its title, that the image exists and that the caption names the current design and its status. [Keep the README still current](../../docs/cad-color-convention.md#keep-the-readme-still-current)

Before publishing a still, reopen the Fusion file, restore only the intended display state and compare the picture with a second view. Check the whole outline, the visible mechanism, the cover finish and readable markings. [Check a captured still](../../docs/cad-capture-review.md)

### 3. Show how each mechanism moves

For each mechanism central to the match role, show one whole operating cycle: for example stowed, acquiring, transferring a piece and back to stow. Name the moving part, its state and the joint angle or extension. Pick a camera angle that shows both the moving part and its fixed reference. Use a cutaway or an isolated subsystem when the frame hides the motion.

Prefer an animation the student controls: play, pause, scrub and named poses. A recorded Fusion joint drive or simulation clip with video controls also works. Give the motion source, units, joint limits, playback speed and any motion left out. Label a commanded CAD sequence as commanded. For a replay driven by recorded data, tie poses to timestamps and mark the first failure or contact. A camera orbit shows shape, not mechanism motion.

If a mechanism has no motion evidence, name the missing joint or run in the showcase and leave its animation pending.

### 4. Write the manifest

Write a project-owned manifest from the [working example](../../examples/highlights/project.json).

- Put the robot's role and design at the top. Add a `cad` object with `title`, `scope` and `shareable: true`; the page shows the still and links to the design review.
- Give each result a claim, a basis (`modeled`, `measured`, `design` or `open`), conditions, a limit and a source ID. Include the most consequential failed or untested condition.
- In the build sheet, link each subsystem configuration to its drawing, settings or bill.
- Use a separate campaign for a fixed evaluation set: criterion, required passes and full counts with failed and unresolved attempts. Keep development starts out of that count.
- For each source give a label and the design or commit it came from. Prefer a permanent public link to the exact record. For a local file, give its relative path and `shareable: true`. Check private details first.
- Put each recorded view in `media`: `asset`, `description`, `caption` and `source`, with an optional `poster`. Start paused. Explain the viewpoint and playback speed. Mark renders, slow motion and sensor events.

### 5. Build the page and check it

```sh
node PLUGIN/scripts/robot-highlights.mjs highlights.json docs/robot
```

Open the generated `index.html` on a desktop and at a narrow width. Follow every source link and play every film. Confirm a student can pause a mechanism mid-cycle, inspect an endpoint and reset the view with keyboard and pointer. Build into a fresh folder for a clean result. Link the page from the project's navigation.

### 6. Publish and verify

Keep `highlights.json` and its source files in the project repository. For a repository that already has a Pages site, build into a subfolder of that site and link it. The project publishes it with [its own CI](../../docs/project-ci.md#write-the-projects-ci); run the publication check before pushing.

After the first deployment, open the URL the deploy job reports. Check the design review, the still and film playback on the hosted page. Add the live URL to the README. On a later change, revisit every changed configuration, claim and caption and build again.

## Defaults: do these without being asked

1. Show one design review for each design. Do not add a second model viewer.
2. Label every view with the design name and its status.
3. Show a failed or untested condition beside each headline result.
4. Keep the effective design in front until another design is effective.
5. Open the hosted page yourself after every deploy.

## Check in with the user before

1. Publishing a file whose private details you have not checked.
2. Replacing the front view with a design that is not effective.
3. Withdrawing a published design.

## Special cases

| When | Do | Detail |
| --- | --- | --- |
| The project wants its own look | Set `stylesheet` in the manifest: a project-relative CSS `file` and `shareable: true`. Scope selectors to `.robot-showcase`. Use self-contained CSS. Keep controls usable on a phone and by keyboard. | [Working example](../../examples/highlights/project.json) |
| A two-colour backdrop behind the still | Add `"backdrop": {"center":"#536980","edge":"#192C44"}` to `cad-showcase.json` and regenerate the still. Part colours are unchanged. | [CAD colour convention](../../docs/cad-color-convention.md) |
| A kickoff-only analysis page, a workflow index or markers on a film clock | Use the publication checks. Keep chances and conditional point estimates apart from a target reached independently. | [Publish what students can inspect](../../docs/showcase-evidence.md) |
| A film cuts between two studies | Show the checked chapter boundary. Compare the event type, time and qualification with independent observations. For a named animation, seek the event in its own clip. | [Boundary between two studies](../../docs/showcase-evidence.md#mark-the-boundary-between-two-studies) |
| The project has a student field lab | Publish it with the `fieldLab` entry and link it from the README. Verify `field-lab.html` on the deployed site. | [Publish the field lab](../../docs/showcase-evidence.md#publish-the-actual-interactive-field-lab) |
| The whole robot is offered as a Fusion download | Reopen the downloadable file and record its own components, features and joints. | [Public Fusion handoff](../../docs/public-fusion-handoff.md) |
| An outside study found a defect in the shown design | Require a failing control and a passing result from an installed plugin check before showing the fix. | [Reproduce a defect](../../docs/mechanical-methods.md) |
| The team started over on a new architecture | The earlier design stays effective and published until the new one passes its review and its pull request merges. | [Effective designs](../../docs/design-publication.md#effective-designs) |
