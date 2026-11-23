---
name: frc-detailed-design
description: "Use for detailed design of a robot in Fusion: start from the effective preliminary design, model real parts, joints and fasteners, keep its reserved paths, mass and voltage checked, and publish drafts until the design is effective."
---
# Detailed design in Fusion

Detailed design turns the effective preliminary design into a Fusion design a team can build. The work stays inside what preliminary design reserved, or sends the reservation back. The phase ends when a reviewed pull request marks the design `effective` on a passing mechanical-readiness review.

**Start here:** find the preliminary design that `docs/preliminary-design/releases.json` marks `effective`, and do step 1. This skill authorizes no hardware operation or deployment.

In the commands, `PLUGIN` is the [installed plugin folder](../../docs/setup-health.md#resolve-the-plugin-used-by-this-check), `REGISTER` is the project's Fusion register and `EXPORT` is the newest export folder. `ID` is the detailed design's ID, a version such as `1.0`. Run commands from the project root, in PowerShell or a POSIX shell.

A detailed design takes the name of its preliminary design and its own version, `MAJOR.MINOR`, as its ID. The major number equals the preliminary design's. The minor number counts effective detailed designs. Staging the same ID again is the next draft; drafts take no number. [Name and number a detailed design](../../docs/design-publication.md#name-and-number-a-detailed-design)

**Words.** The Fusion file is the saved Fusion design the project registers as current. The export is the STEP written from it. The blockout is the preliminary layout's solids. A reservation is a volume, path, mass or voltage figure preliminary design set aside. Reopened means read from the saved file after closing it.

## What you start with

The handoff is the effective preliminary design's folder, `cad/preliminary-design/releases/VERSION/`, with its handoff note, `HANDOFF.md`, when it has one. [The ten items it hands over](../../docs/design-phase-detail.md#what-preliminary-design-hands-to-detailed-design)

| Handed over | What you do with it |
| --- | --- |
| Blockout: the STEP that `layout.json` names | Bring it into Fusion as the reference (step 2) |
| Robot frame and datums: `layout.json` `datum` and `mounts`, and the note | Put each joint origin on its datum (step 2) |
| Envelopes in the note: frame, bumpers, parked height, reach | Draw each limit as a `Limit` body (step 2) |
| Interfaces and allowances: `mounts`, declared fits and the note | One work item each. Draw every undrawn connection |
| Motion cases, cycle and displaced control | Repeat them unchanged on every export (step 4) |
| Mass and loaded-voltage budgets: `budgets.json` and its limits file | Charge every change against the stated reserve (step 4) |
| Open risks and bench tests: `missions.json` `risks` and the note | A work-list row for each risk and a bench-test record (step 1) |
| Operating point and its passing range | Draw the stop or adjustment that holds it (step 3) |
| Trials and replays | Repeat each trial the note lists, and any whose contact surfaces change (step 5) |
| First work items in the note | The first rows of the work list (step 1) |

## What to run for this change

| The change | Run |
| --- | --- |
| Geometry, a motion, a tolerance or reserve, a fixture, a trial, a mass or voltage budget | The local layout check, on the phases the change affects |
| The page, a title, a colour, a name, a version label, a status word, a document | `--view-only` when the page shows it, then the publication check with `--skip-rerun`. Never the layout check |
| Publishing a draft | The publication check with `--skip-rerun`. A draft is published on its local check |
| Marking a design effective | Nothing more locally. CI reruns the full layout check once, on the committed design |
| The physics of an effective design | Never in place. Open the next minor version as a draft |

Time guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate. When a run is heading past its guideline, stop and tell the user what is slow. Do not repeat a run whose inputs have not changed. Read the last lines each command prints: they say what ran, what did not and what CI will do on push. [Test by need and risk](../../docs/testing-methodology.md)

## Order of work

### 1. Read the handoff and write the work list

Read that folder end to end, the handoff note first when it has one. Write `cad/detailed-design/work/ID/work-list.md` before drawing anything. Give it one row for each first work item, interface, undrawn connection, open risk and reservation.

Each row holds: the handoff's own name or number for the item; its kind (work item, interface, risk or reservation); the subsystem and part it lands on; the step below that closes it; the pass and fail numbers, copied unchanged; and the result, open or the file and line that records it.

Bench tests have their own record, `cad/detailed-design/designs/ID/bench-tests.json`. Seed it from the handoff. Give each test a tag, `before-build` or `on-robot`, an owner and a plan. Record each result with the second command. More simulation never closes a bench test. [Bench tests as records](../../docs/design-publication.md#bench-tests-handed-over-from-preliminary-design)

```sh
node PLUGIN/scripts/bench-tests.mjs seed . --design ID --preliminary VERSION
node PLUGIN/scripts/bench-tests.mjs result . --design ID --test TEST --value VALUE --note "TEXT"
```

A case or budget line the handoff already shows as failing or thin is an open risk with a row of its own. It is not a new violation.

If `iterations/active.json` or the project's Fusion register names a different architecture from the effective preliminary design, the status index decides. Do not resume the other design's Fusion file. The version carries the architecture. Check in. `frc-start-over` is the route to a new major version: it opens a design root and register for it.

### 2. Start the Fusion file from the blockout

1. Create one new Fusion design for this robot design. Work in millimetres. Put the Fusion origin on the layout datum, with the axes the handoff states.
2. Save the Fusion file beside the register and register it before the first export. The register is `cad/fusion-authority.json` under the project's design root. [Find the current Fusion design](../../docs/fusion-authority.md)
3. Insert the blockout STEP at the origin. Do not edit its solids. Measure one handoff datum point to confirm the frame.
4. Put joint axes, mount points and travel limits from the handoff in one layout sketch in the root component. Parts reference that sketch.
5. Put reserved volumes for wiring, tools, hands and service in a component named `Reservations`. Where the handoff reserves none, add the ones this design needs as you find them. Add each envelope limit the handoff gives as a number, such as a reach or a height, as a thin `Limit` body there. Keep them to the end.
6. Resolve the palette with `python PLUGIN/scripts/component_palette.py .` and colour parts by role. [CAD colour convention](../../docs/cad-color-convention.md)

Name components so the export maps back to the motion cases. The layout check knows a solid by its component's name, and every solid must be in exactly one group of the plan.

| Rule | Why |
| --- | --- |
| One body in each leaf component | Two bodies export as `NAME [index]`, and the index moves with the browser order |
| The main part that replaces a blockout solid keeps that solid's exact name | Mounts, cases and the displaced control still find it |
| Every other part is named `BLOCKOUT NAME - part`, such as `Carriage plate - left bearing block` | Your script puts it in that solid's group and gives it that solid's moves in every case |
| A part placed several times keeps one component | Each copy exports as `NAME [index]`. List them again after reordering |

Copy the preliminary design's check inputs to `cad/detailed-design/designs/ID/`. Rewrite each file reference for the new folder and point `layout.json` at the export. Keep the cases, cycle, displaced control and declared fits unchanged. The check matches exact names only, so every new solid needs its own entries. Generate them from the naming rule with a small project script kept beside the plan. Do not type them by hand.

| File | Entry for each solid |
| --- | --- |
| `layout.json` | `groups` members; `presentation.components` purpose and rationale; `mounts` where a member has its own |
| Motion study | `moves` and `initialPose` in every case that moves its group |
| `budgets.json` | `masses` members |

Export, run the layout check (step 4) and publish draft 1 (step 5) while the file still holds only the blockout. This proves the frame, the names and the publishing path. Compare the solid names in that export with the blockout's and fix any name that changed in the round trip.

### 3. Detail one subsystem at a time

Take the riskiest subsystem first. With no specified drivetrain, start with four-module swerve and use `frc-swerve` before fixing its mounts. Start a new chassis from the [frame profile](../../docs/frame-profile.md) sketch. Work through each subsystem in this order.

| Order | Do | Method |
| --- | --- | --- |
| 1. Parts list | List every part the subsystem needs: site, part, option and the job it does. A fastener names the joint it holds. | [Parts list](../../docs/article-functions.md) |
| 2. Purchased parts | Import the manufacturer's model of the exact part number and option. Check units, mounting datums and orientation. Record source, date and option in the parts register and commit the model. | [Hardware catalog](../../docs/hardware-catalog.md) |
| 3. Structure and attachment | Design each attachment before drawing holes: load, two patterns on the real faces, stock, hardware, tool side, removal order. | [Attachment design](../../docs/attachment-design.md) |
| 4. Shafts and bearings | Give each shaft two supports, an axial stop each way and a way out. | [Bearing stack](../../docs/axial-bearing-stack.md) · [Seated pilot](../../docs/seated-pilot.md) |
| 5. Fasteners | Model one real fastener for each distinct joint and pattern it. Check length, thread engagement and bottom clearance. | [Fastener stacks](../../docs/fastener-stacks.md) |
| 6. Stops, adjustments and tolerances | Draw the hard stop or adjustment for each operating point at its handoff value, with the range the trials passed. | [Operating space](../../docs/operating-space.md) |
| 7. Sensors and wiring | Mount each sensor and reserve room for wires, connectors and a hand. | [Sensor observability](../../docs/sensor-observability.md) · [Electrical review](../../docs/electrical-review.md) |
| 8. Joints | Give each moving part a Fusion joint on its datum, with limits. | [Fusion handoff checks](../../docs/native-fusion-handoff.md) |

When the real parts of a blockout solid are in place, delete that solid in the same edit that gives its name to the main part. For the mechanisms that decide the match role, use `frc-mechanism-hardening`.

### 4. Keep the reservations checked

After each subsystem, save, export and run all four checks. Fix or report every new failure before the next subsystem.

| Reservation | How it is checked |
| --- | --- |
| Paths | The layout check sweeps the export through the preliminary motion cases. |
| Volumes | The `Reservations` bodies and the remaining blockout solids are solids in the same check. A part that enters one fails its case. |
| Mass | Read mass and centre of mass from Fusion. Write each subsystem's range into `budgets.json` `masses`. The check compares the upper total with the limit. |
| Loaded voltage | After a change of motor, gearing or load, update `batterySideA` and `loadedKg` in `budgets.json` `electricalCases`. The check compares every case with its minimum voltage. |

Export from Fusion's Python environment into a new folder each time, such as `cad/detailed-design/designs/ID/export-3`. It writes `assembly.step` and `lineage.json`. Delete the previous export folder; Git keeps it. Then verify the export and run the check from a terminal:

```python
fusion_authority.export_issue(app, project_root, register_path, new_export_folder)
```

```sh
python PLUGIN/scripts/fusion_authority.py . REGISTER EXPORT/lineage.json
node PLUGIN/scripts/design.mjs preliminary-check . cad/detailed-design/designs/ID/layout.json --physics-only --fail-fast --jobs 4
node PLUGIN/scripts/design.mjs preliminary-check . cad/detailed-design/designs/ID/layout.json --write-view --output cad/detailed-design/designs/ID/receipt.json --jobs 4
```

Use the first check line while fixing and the second for the result you publish. [Mass, centre of mass and voltage](../../docs/fusion-design-checkpoints.md) · [Layout check](../../docs/preliminary-design.md)

### 5. Publish the draft as in-progress

A detailed design publishes as `in-progress` on three things: a link to the effective preliminary design, an export that passes the layout check on that design's motion cases, and a mission animation on the detailed geometry. Keep the copied `missions.json` beside the plan; it names the mission cases to play. Rerun a physics trial when detailing changes a surface that touches the game piece.

```sh
node PLUGIN/scripts/detailed-design-release.mjs stage . --design ID --inputs cad/detailed-design/designs/ID --preliminary VERSION --authority REGISTER --lineage EXPORT/lineage.json
node PLUGIN/scripts/design-publication.mjs check . --skip-rerun
```

Stage the same ID after each subsystem. Commit the Fusion file, export, check inputs and published folder together, push, and open the published page. [Publish a detailed design](../../docs/design-publication.md#publish-a-detailed-design)

### 6. Take the readiness review

When every subsystem is detailed and no blockout solid remains, run `frc-mechanical-readiness` on the reopened Fusion file. Before the review, `node PLUGIN/scripts/bench-tests.mjs check . --design ID` passes: every `before-build` test has a passing result and every `on-robot` test has an owner and a plan. Fix what the review fails, republish the draft and review again.

### 7. Mark the design effective

Check in before this step. `effective` refuses a design while a bench test is unresolved. Save the passing review result, then:

```sh
node PLUGIN/scripts/detailed-design-release.mjs effective . --design ID --readiness cad/detailed-design/readiness-result.json
node PLUGIN/scripts/design-publication.mjs check . --skip-rerun
```

Open one pull request with the status change, the review result, the entry page and the README still. Make the status change its last commit. This is the stage gate: CI reruns the layout check once on the committed inputs for each push that carries the change, and never for a draft. [When the layout check reruns](../../docs/design-publication.md#when-the-layout-check-reruns) The design is effective when it is reviewed and merged. [Effective designs](../../docs/design-publication.md#effective-designs)

## Return a reservation to preliminary design

Return it when a reserved path, volume, mass or loaded-voltage figure cannot be kept after the cheap fixes in the table below.

1. Stop work on the affected interface. Other subsystems continue.
2. Record the failing pair, case and amount, or the budget line and shortfall, in the work list.
3. Check in with the user.
4. Open the next preliminary minor version as a draft and hand the record to `frc-preliminary-design`. After effective `1.0` that is `python cad/preliminary-design/stage.py --copy-inputs 1.0 1.1`. A different architecture is the next major version and a new detailed design.
5. The detailed design stays `in-progress` and keeps its ID. When the new preliminary version is effective, copy its changed cases into the detailed plan, rerun the check and stage the same ID again with `--preliminary 1.1`. If no case changed, `node PLUGIN/scripts/detailed-design-release.mjs relink . --design ID --preliminary 1.1` re-points it.

[When to return to an earlier phase](../../docs/design-phase-detail.md#when-to-return-to-an-earlier-phase) · [Start the next version](../../docs/design-publication.md#name-and-number-a-design)

## Defaults: do these without being asked

Say in the result when one could not be done.

**Starting**
1. Build on the effective preliminary design, not on old CAD. Reuse an earlier Fusion component only when it fits the handoff datums, and name it.
2. Keep one Fusion file for each robot design. Register it the day it is created.
3. Use the handoff's robot frame and datums unchanged. A datum that has to move is a return to preliminary design.
4. Keep each blockout solid until its real parts exist. Then delete it and say so.

**Parts**
5. Nothing floats. Every real part is joined or fastened to something that traces to the frame. Clear each floating solid in the check's `[attachment]` lines, or list it with the reason. Blockout solids are exempt until replaced.
6. Nothing overlaps unless it is a declared fit. Register press fits, threads and squeezed game pieces by pair with a limit.
7. Use the manufacturer's model for a purchased part. Where none exists, use a labelled stand-in and list what it leaves open.
8. Give every moving part a joint with limits, and a hard stop or a stated reason it needs none.
9. Author shapes in Fusion. An outside tool needs a written reason and a path back into the Fusion file.
10. Colour by role from the project palette. Bumpers take the documented alliance colour. Supplier finishes stay.

**Working in Fusion**
11. Save, close and reopen before measuring anything you report.
12. Check timeline health after each batch of features. Fix a failed feature before the next edit.
13. When a script moves or inserts parts, work in a copy. Keep the last good file until the new one passes.
14. Record which features a student can edit and which came in as imported solids.

**Publishing and moving**
15. Publish a draft after each subsystem, under the same ID.
16. Commit and push the Fusion file, export and check inputs together every session. Another computer starts with `git pull`.
17. Run the publication check locally before pushing.
18. Use project-relative paths. No drive letters and no home folders.
19. Take the obvious choice and say what you chose.

## Check in with the user before

1. Returning a reservation to preliminary design.
2. Using more than half of the margin the handoff states between a mass or voltage estimate and its limit.
3. Changing the drivetrain or a purchased part family.
4. Starting a check you expect to run past the 30-minute guideline.
5. Making a third local fix to the same clash.
6. Acting when the project's Fusion register or `iterations/active.json` names a different design from the effective preliminary design.
7. Marking the design effective.

## When you see this, try this

Likely causes for each row, and eleven rarer symptoms: [special cases](references/special-cases.md#symptoms-likely-causes).

| You see | First thing to try | Check in when |
| --- | --- | --- |
| The export fails the layout check | Read the first failing pair and case. `no group lists:` names solids the plan misses; fix names first. Then check one datum point. Look at geometry last. | Both parts were in the blockout and are unchanged |
| Bolted parts fail a case only because they touch | A case with `minGapMm` above zero fails every mated pair. Set it to 0 in the detailed plan and say so in the stage's `allowanceBasis`. Keep each required running clearance as a body in `Reservations`. Overlap still fails. | A handoff clearance cannot be drawn as a body |
| A part crosses a reserved volume or path | In order: flip or rotate the part, pick its shorter or flatter option, move the fastener or connector side. Rerun. | None works, or a neighbour must move past its allowance |
| The mass reserve is used up | List the ten heaviest changes since the last budget. Check each material. Count each purchased assembly once, at supplier mass. | The upper estimate is inside the minimum reserve or over the limit |
| A check is too slow | Use `--physics-only --fail-fast` while fixing. Set `--jobs`. Coarsen the path tolerance of cases with ample margin. | A whole-cycle check will pass 30 minutes |

## Scope guidelines and rare cases

The figures for check time, clearance and fastener detail are guidelines a project may replace. Check in before going past one. [Scope guidelines](references/scope-guidelines.md) · [Special cases, one row each](references/special-cases.md)
