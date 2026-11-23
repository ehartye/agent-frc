# Test by need and risk

This page says when a test or a design check runs, and why. It covers two things: the plugin's own tests, and the checks the plugin runs on a robot project's designs. Every tool, workflow and skill in this repository follows it. When one of them disagrees with this page, fix the tool.

## What the checks are for

A check exists for one of four purposes. Each purpose has its own moment. A check that runs at any other moment is waste.

| Purpose | Question it answers | When it runs | Who runs it |
|---|---|---|---|
| Feedback | Does what I just changed work? | While editing, on what changed | The designer or agent, locally |
| Stage gate | Does this meet the criteria for the next stage? | Once, when a design changes stage | CI, on the committed design |
| Regression | Did this change break something already accepted? | When a change touches what the accepted result depends on | The cheapest check that can tell |
| Publishing hygiene | Is what we publish intact and safe to show? | On every push | CI, in seconds |

The stages of a design are draft to effective, effective preliminary design to detailed design, and detailed design to build.

## Everything is in the dev phase

The plugin and the projects that use it are pre-release. The goal is iteration speed. Protect the core promises and a few whole journeys. Do not add tests for old formats, migration paths or hypothetical misuse.

## Run a check only when the change is relevant to it

A check runs when the change could break what the check protects. A change to a page, a title, a name, a status or a document never triggers a model evaluation. A change to geometry never needs the document tests.

### In a robot project

| The change touches | What runs |
|---|---|
| Geometry, a motion, a tolerance or reserve, a fixture, a trial, a mass or voltage budget | The local layout check on the phases the change affects |
| The review page, titles, colours, the view, a design name, a version label, a status word, a document | The publication checks: index, receipt, scene, animation, links |
| A draft being published | The publication checks. The layout check is not rerun |
| A design being marked effective | The full layout check and the readiness report, once, on the committed design |
| The physics of an effective design, edited in place | Refused. Open the next minor version as a draft |
| Anything, on any branch | The scan for personal paths and secrets |

A draft is work in progress. It is published on the designer's own local check and carries the in-progress label. It cannot become effective without passing the stage gate.

An effective design is frozen. Any change to its physics is a new draft, and that draft passes the stage gate before it replaces the baseline. This is how regression is prevented for designs: by the version scheme, not by rerunning the old design.

### In the plugin

| The change touches | What runs |
|---|---|
| Documents, skills, the guide | The validator, the document, skill and link tests, and the guide build |
| One script or template | The tests that cover that file |
| The layout check, attachment report, budgets, stage gate or secret scan | Their tests, including the ones that use the CAD kernel |
| The test runner, the coverage map, the package manifest | Everything |
| A release tag, or the weekly run | Everything, on the full station profile |

## What must never fail quietly

These four failures hurt. Their tests are the critical tier: they run whenever a relevant change is made, and each has a control that proves the check can fail.

| Failure | The check that owns it | A relevant change |
|---|---|---|
| The layout check passes a layout that interferes, floats or breaks a budget | The layout check's own tests, with a displaced control | The checker, the attachment report, the budget code |
| A design becomes effective, or is handed on, without meeting its criteria | The stage gate tests | The publication check, the status commands, the readiness report |
| A personal path or a secret is published | The scan tests | The scan and its ignore list |
| The published review page, picker or animations fail to load or play | The page tests in a browser | The page, the scene writer, the staging command |

Everything else is standard or low tier. `.testing/risk.yml` records the tier of each area.

## Time guidelines

| Lane | Runs | Guideline |
|---|---|---|
| Edit | The tests or cases relevant to what just changed | About 1 minute |
| Merge | The fast suite for the critical and standard tiers, or the publication checks | About 5 minutes |
| Gate | A design's full layout check and readiness report, or the plugin's full suite before a release | About 15 minutes |

These are guidelines. When a run is heading past its guideline, stop and tell the owner what is slow and why. Agree a bounded extended budget before going on. Do not wait out a long run in silence, and do not repeat a run whose inputs have not changed.

## Keep the project and the plugin loosely coupled

A robot project follows the plugin's current release. It does not name a plugin commit, and it does not carry copies of plugin behaviour that must be refreshed by hand.

- The project holds data: the plan, the solids, the trial records, the budgets, the index.
- The plugin holds behaviour: the checks, the staging commands, the page, the workflow.
- A plugin release never forces a project to rerun a check. The project meets the new behaviour at its next relevant change or its next stage gate.
- There is no promise to keep old formats working. When a format changes, the check says what to change in the project, in one message.

## Rules for adding a test or a check

- Name the failure it catches and who is hurt. If you cannot, do not add it.
- One owner per invariant. Search for an existing test of the same behaviour and extend it.
- Prove it can fail. Keep a control that the check rejects.
- Test behaviour at a seam: a command, an input, a written file. Do not assert on a mock alone or against the value just computed.
- Do not prove an unchanged result again. A local result is not repeated in CI, except at a stage gate.
- Do not digest, pin or byte-compare inputs to decide whether to run. The version control system already knows what changed.
- Keep tests independent of the checkout: no fixed ports, no fixed temporary paths, no absolute paths.
- Say which lane a new test belongs to. A slow test of a low-tier area belongs in the weekly or release run.
- While editing, run only what is relevant. Run the merge lane before merging. Run everything only at a release, on the weekly run or when asked.
