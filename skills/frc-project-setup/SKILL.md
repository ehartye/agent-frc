---
name: frc-project-setup
description: "Initialize, adopt and enforce the student robot project layout across kickoff, Fusion CAD, controls, simulation, experiments and published evidence."
---

# Set up a robot project

Start at the project checkout. Inventory active branches, worktrees, untracked evidence, existing entry points and inputs with pinned paths. Coordinate a cutover with active authors before moving studies.

| Folder | What students find there |
| --- | --- |
| `kickoff/` | The supplied rules register, field model, student pre-sim and strategic narrative |
| `cad/` | Current Fusion design or authorized project link, editable archives, purchased-part register and reopen receipts |
| `controls/` | Promoted control implementation, calibration definitions and coordinate conventions |
| `sim/` | Shared field and robot simulation entry points |
| `experiments/<study>/` | One design question or tightly coupled historical campaign, with its inputs, results and boundaries |
| `tests/` and `scripts/` | Regression entry points and project maintenance commands |
| `docs/` | Student-facing guidance and the robot showcase; put the published CAD view in `docs/robot/cad/` |
| `artifacts/` | Ignored local runs and restricted supplier material, with durable evidence captured before cleanup |

Run `node <plugin>/scripts/project-layout.mjs init <project>` to create the folders in an existing Git checkout. Store new artifacts only where they are used. Keep required build-system roots in place. Use `project-layout.json` with a `toolchainFiles` array for additional exact tool paths. List a top-level folder of recorded evidence that a design is checked from, such as trial inputs, traces or field models, in its `evidenceFolders` array, so the files stay at the paths their records pin. Copy the portable checker into the project or invoke a pinned plugin in CI. Run `project-layout.mjs check <project>` on each change.

During adoption, move independent studies into their own directories. Move a historically interdependent campaign together when its receipts and loaders rely on relative paths. Keep its original runnable entry point and distinguish frozen inputs from current authoring files. Re-run a representative historical replay and test discovery from the new layout. Link the current Fusion design, strategic narrative, trials and showcase from the project README. Follow the [CAD and supplier handoff](../frc-detailed-design/SKILL.md) and [README still and highlights workflow](../frc-robot-highlights/SKILL.md).

Use the [component palette](../../docs/cad-color-convention.md) during CAD setup. A new project inherits the plugin defaults. Keep project-specific role colors in version control at `cad/component-palette.json`. Reference that single mapping from native models and student-facing views.


## Write the Design checks block

`project-layout.mjs init` writes a short **Design checks** block into the project's `AGENTS.md`, between two marker lines. It tells any agent in the project what to run for which change, before a skill loads: the layout check for geometry, motion and budgets; the publication check alone for a page, a name or a status; the stage gate, run by the command that marks a design effective; no edit in place to the physics of an effective design; and the time guidelines. It is instruction only and names no plugin. Refresh it with `node <plugin>/scripts/project-layout.mjs agents <project>`: it replaces the block in place and leaves the rest of the file alone.

## Write the project's own CI

A project runs CI that belongs to it. Write it from the references in `<plugin>/templates/project-ci/`: copy `ci.yml` to `.github/workflows/ci.yml`, and `scan.mjs` and `site-check.mjs` to `scripts/ci/`. On every push it scans for personal paths and secrets and checks that the published site is whole; on the default branch it publishes `docs/`. Add the project's own tests as steps that run the project's own commands. Project code never runs plugin code: no project file may name the plugin, a path into it or a pin of it, and the project carries no copy or wrapper of a plugin command. Then run `node <plugin>/scripts/project-ci-audit.mjs <project>`. It is advice and blocks nothing: it reports a file that names the plugin, a missing scan or site check and how the project's copies differ from the references. The plugin's `examples/sample-project/` is a complete invented project to compare with. [Write the project's CI](../../docs/project-ci.md#write-the-projects-ci)

## Version the workflow outputs

Keep each completed analysis, strategic narrative, constraint register, design review and verification report in the project checkout, beside its subject. A private wiki can carry team history and research. Students should be able to read the deliverables from a clean checkout. Link the project workflow from the README and showcase.

Initialization creates `docs/workflow.md`. Its table uses the columns **Agent FRC skill**, **Project output** and **Supporting evidence**. Use the invoked skill name, relative Markdown links to committed outputs, and relevant evidence or an em dash. Existing kickoff and design documents stay in their canonical directories. The layout check verifies index references when the index exists. For the standard showcase, add the pinned [workflow link configuration](../../docs/showcase-evidence.md).

For a publicly downloadable whole robot, bind the student archive to its own reopened component, feature and joint evidence. [Verify the public Fusion handoff](../../docs/public-fusion-handoff.md).

Keep the project’s [frame and bumper outline](../../docs/frame-profile.md) with CAD settings. Fresh project setup creates the rear-chamfer convention. Preserve any explicit robot outline during adoption.

Use the [Fusion authority and revision handoff](../../docs/fusion-authority.md) to establish the one current saved native design, the STEP exported from that design and the identity of the engineering evidence. When resuming in another checkout or before replacing a published view, verify the selected register and lineage with `fusion_authority.py`. For a mechanical review, use `fusion_issue_inventory.capture` in Fusion for missing commissioned poses. [Resume a registered master](../../docs/fusion-authority.md#resume-a-registered-master)

The project's CI runs the [path and secret scan](../../docs/project-ci.md#the-path-and-secret-scan) on every pushed branch. Before pushing a workflow change, [check the committed workflow](../../docs/project-ci.md#check-the-workflows-before-pushing) with the approved actionlint executable.

Add the project’s own tests to its workflow as steps, verify the actual default branch and choose branch-served or generated Pages when the team publishes CAD. [A project's own CI](../../docs/project-ci.md)

For a project with `iterations/active.json`, follow its active design root before recovering older records. After a decision to start over, use `frc-start-over` to preserve the evidence and open a fresh numbered design. [Design iterations](../../docs/design-iterations.md)

When pausing or moving a Fusion design to another computer, commit the archive, register, lineage and STEP and let Git carry them. For extra files, record the selected native files and canonical STEP, then verify them in the receiving checkout. [Transfer an issued design](../../docs/fusion-authority.md#move-a-design-to-another-computer)
