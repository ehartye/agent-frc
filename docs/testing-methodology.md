# Test by need and risk

This page says when a test or a design check runs, and why. It covers two things: the plugin's own tests, and the checks the plugin runs on a robot project's designs. Every tool, workflow and skill in this repository follows it. When one of them disagrees with this page, fix the tool.

## What the checks are for

A check exists for one of four purposes. Each purpose has its own moment. A check that runs at any other moment is waste.

| Purpose | Question it answers | When it runs | Who runs it |
|---|---|---|---|
| Feedback | Does what I just changed work? | While editing, on what changed | The designer or agent, locally |
| Stage gate | Does this meet the criteria for the next stage? | Once, when a design changes stage | The agent, with the plugin, on the committed design |
| Regression | Did this change break something already accepted? | When a change touches what the accepted result depends on | The cheapest check that can tell |
| Publishing hygiene | Is what we publish intact and safe to show? | Before every push, and on every push | The agent before pushing; the project's own CI on the push, in seconds |

The stages of a design are draft to effective, effective preliminary design to detailed design, and detailed design to build.

## Everything is in the dev phase

The plugin and the projects that use it are pre-release. The goal is iteration speed. Protect the core promises and a few whole journeys. Do not add tests for old formats, migration paths or hypothetical misuse.

## Run a check only when the change is relevant to it

A check runs when the change could break what the check protects. A change to a page, a title, a name, a status or a document never triggers a model evaluation. A change to geometry never needs the document tests.

### In a robot project

| The change touches | What runs | Who runs it |
|---|---|---|
| Geometry, a motion, a tolerance or reserve, a fixture, a mass or voltage budget | The layout check with `--carry`: only the pairs of solids the change affects are measured | The agent |
| A trial, an assumed input or its range, an approach range or an adjustment | That trial's campaign, run by the library | The agent, with the library |
| A mechanical adjustment, or a solid it moves | The adjustment-extremes measurement: the layout at both ends of each mechanical adjustment | The agent, with the library |
| The review page, titles, colours, the view, a design name, a version label, a status word, a document | The publication check: index, receipt, scene, animation | The agent, before pushing |
| A draft being published | The layout check with `--carry` on what changed, then the publication check | The agent, before pushing |
| A design being marked effective | The stage gate: the full layout check and the readiness report, on the committed design | The agent, once, when the design is marked effective |
| The physics of an effective design, edited in place | Refused by the publication check. Open the next minor version as a draft | The agent, before pushing |
| Anything pushed, on any branch | The scan for personal paths and secrets, the site check and, on the default branch, publishing | The project's own CI |

A push only publishes. The project's CI runs no design check, no trial and no plugin: it scans, checks that the published site is whole and deploys it.

A draft is work in progress. It is published on the designer's own layout check of what changed, which carries everything the change did not touch from the draft's last receipt, and it carries the in-progress label. It cannot become effective without passing the stage gate, which the command that marks it effective runs. The gate never takes a saved receipt for its result, and it refuses a design whose inputs are not committed.

An effective design is frozen. Any change to its physics is a new draft, and that draft passes the stage gate before it replaces the baseline. This is how regression is prevented for designs: by the version scheme, not by rerunning the old design.

#### Rerun only the pairs that changed

A case reruns only the pairs of solids whose solids, placements, motion or rules changed. Attachment and mass at a pose carry when nothing at that pose moved. The displaced control is always measured. The decision uses figures the build already produces, such as each solid's volume, bounds and placement, and costs seconds. It never reads file bytes, names, notes, status words or version numbers, so a rename or an edited note measures nothing. The stage gate always runs everything.

#### Check only the releases a change touches

The publication check validates only what the change touches. A release is touched when a file in its own published or input folder changes. A change to its index entry, such as marking it superseded, does not touch it. An effective release that a change leaves alone stands on its published files, as its inputs already do. No reader for an earlier format is added.

### In the plugin

| The change touches | What runs |
|---|---|
| Documents, skills, the guide | The validator, the document, skill and link tests, and the guide build |
| One script or template | The tests that cover that file |
| The layout check, attachment report, budgets, stage gate or secret scan | Their tests, including the ones that use the CAD kernel and the design library |
| The test runner, the coverage map, the package manifest | Everything |
| A merged change on the default branch | The full portable suite, in the hosted run |
| A release tag, or when the owner asks | Everything, on the full station profile |

## Judge a physics trial

A trial qualifies an interaction when its record meets the interaction's bar. The readiness report accepts:

- `passed`;
- `covered by adjustment`, with each mechanical adjustment it names measured at both ends;
- a success rate that meets its requirement, for a chaotic interaction;
- a planar pass whose margin is inside the engines' agreement, only with a passing 3D confirmation.

### A chaotic interaction is judged by its success rate

An interaction whose outcome depends on small differences at the start, such as several pieces, a heap or repeated shots, runs N varied start patterns and meets its bar when at least k of the N succeed.

- Derive the requirement from the mission, such as at most one failure in two matches, and record it with its basis.
- Fix k and N before running, from the requirement at a stated confidence. As a guideline, choose them so that passing shows the requirement at 90% confidence, by the one-sided Wilson lower bound. For reference, a requirement of 0.95 needs 32 of 32, or 65 of 66; 20 of 20 shows only 0.924.
- Draw the start patterns from the interaction's approach range and each assumed input's range, with a recorded seed, so the campaign can be repeated. State the sampling: uniform over the ranges, or the range corners.
- Coverage of an assumed range compares rates, not single outcomes.
- The rate must agree at half the step. An outcome that flips only at half the step is "not converged", never a rate.
- The campaign prints its cost before it runs. Before the first rate campaign, time one trial and check N against the campaign's time guideline. If it does not fit, check in with the owner.

### A planar pass near its limit is confirmed in 3D

The library records, per measure, how closely the planar and 3D engines agree on its calibration set: the largest relative difference between them over the calibration cases that exercise that measure. A planar pass whose margin to its pass limit is smaller than that agreement needs a 3D confirmation run, even when the screen says planar is enough. A comfortable pass needs none.

## What must never fail quietly

These four failures hurt. Their tests are the critical tier: they run whenever a relevant change is made, and each has a control that proves the check can fail.

Floating parts fail the layout check. A solid not connected to the base, other than a declared unmounted or suspended allowance, makes the layout not layout-checked. The stage gate requires readiness. Marking a design effective is refused unless the readiness report meets every criterion on the committed design.

| Failure | The check that owns it | A relevant change |
|---|---|---|
| The layout check passes a layout that interferes, floats or breaks a budget | The layout check's own tests, with a displaced control and a floating control | The checker, the attachment report, the budget code |
| A design becomes effective, or is handed on, without meeting every readiness criterion | The stage gate tests, with a control that meets all but one | The publication check, the status commands, the readiness report |
| A personal path or a secret is published | The scan tests | The scan and its ignore list |
| The published review page, picker or animations fail to load or play | The page tests in a browser | The page, the scene writer, the staging command |

Everything else is standard or low tier. `.testing/risk.yml` records the tier of each area.

## Time guidelines

| Lane or run | What it covers | Guideline | In the plugin |
|---|---|---|---|
| Edit | The tests or cases relevant to what just changed | About 1 minute | `npm run validate` and `npm run test:changed` |
| Merge | The fast suite for the critical and standard tiers, or the publication checks | About 5 minutes | `npm run test:portable`; a pull request runs the changed selection in CI |
| Gate | A design's full layout check and readiness report, or the plugin's full suite before a release | About 15 minutes | `npm test` at the qualified station |
| Planar trial campaign | One trial's campaign in the planar engine | About 10 minutes | — |
| 3D trial campaign | One trial's campaign in the 3D engine | About 30 minutes, a bounded extended budget; past about 40, stop and check in | — |

A change that reaches the mechanical-review controls takes about 82 seconds in the edit lane. That is over the guideline and accepted for now; run one class with `npm test -- mechanical-readiness --name CLASS` while editing. [Every command and how the selection works](project-ci.md#how-the-plugin-repository-tests-itself).

These are guidelines. When a run is heading past its guideline, stop and tell the owner what is slow and why. Agree a bounded extended budget before going on. Do not wait out a long run in silence, and do not repeat a run whose inputs have not changed.

## The plugin is a tool of the coding agent, not a dependency of the project

The coding agent has the plugin installed and runs its commands. A robot project does not. If the plugin changed, broke or disappeared, nothing in a project would change or stop working.

- The project holds data and published output: the design source, the judgement file, the generated solids, the trial records, the budgets, the index, the page.
- The project holds its own CI: a workflow and two small checks, written from the references in [`templates/project-ci/`](../templates/project-ci/ci.yml) and then owned by the project. They check out only the project and run only the project's files.
- Project code never runs plugin code. A project file names no plugin repository, commit, path or variable. It carries no copy of a plugin command and no wrapper around one. A schema ID inside a record, such as `"agent-frc/NAME@1"`, labels the record's format and is the one place the name appears.
- The agent runs the plugin's commands on the project: the layout check, the staging commands, the stage gate, the publication check, and an [audit of the project for use of the plugin](project-ci.md#audit-the-project-for-use-of-the-plugin) that gives advice and blocks nothing.
- A plugin release never forces a project to rerun a check. The project meets the new behaviour the next time the agent works on it.
- There is no promise to keep old formats working. When a format changes, the agent's command says what to change in the project, in one message.

The [sample project](../examples/sample-project/ABOUT.md) shows the whole of it: an invented project whose CI is those reference files, with nothing of the plugin in it.

Building solids and measuring them belong to a separate library, `frc-design-kernel`, that a project and the plugin may both import. A project writes a design source as data; the library builds and measures it; the plugin judges the result. The library builds and measures and never says pass or fail. It has no pinned version: its main branch is the release, the plugin's own CI installs it from there, and a receipt records its version as information only. A project may depend on the library; whether its CI regenerates a design is the project's choice, and the reference CI does not. Physics trials are data in the design source: the library runs them, planar or in 3D, and the plugin judges their records.

## Rules for adding a test or a check

- Name the failure it catches and who is hurt. If you cannot, do not add it.
- One owner per invariant. Search for an existing test of the same behaviour and extend it.
- Prove it can fail. Keep a control that the check rejects.
- Test behaviour at a seam: a command, an input, a written file. Do not assert on a mock alone or against the value just computed.
- Do not prove an unchanged result again. A local result is not repeated in CI, except at a stage gate.
- Decide whether to rerun from what each check actually uses, at the smallest unit of work; never from file bytes, labels, names, notes, status words or version numbers. The decision costs seconds and uses figures the build already produces, with no separate comparison pass. For a design, the unit is a pair of solids: [rerun only the pairs that changed](#rerun-only-the-pairs-that-changed).
- Keep tests independent of the checkout: no fixed ports, no fixed temporary paths, no absolute paths.
- Say which lane a new test belongs to, in the file's leading comment: `/** @lane merge */`, or `# @lane merge` in Python. Add `@subject PATH` there for each file the test exercises only through a subprocess. The tier of the subject decides the lane: a test of a critical area is `merge` even when it needs the CAD kernel, and a CAD kernel or browser test of a standard or low area is `scheduled`. A slow test of a low-tier area belongs in the release run.
- While editing, run only what is relevant. Run the merge lane before merging. Run everything only before a release tag or when asked. The hosted run on the default branch executes the full portable suite after every merge.
