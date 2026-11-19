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

Run `node <plugin>/scripts/project-layout.mjs init <project>` to create the folders in an existing Git checkout. Store new artifacts only where they are used. Keep required build-system roots in place. Use `project-layout.json` with a `toolchainFiles` array for additional exact tool paths. Copy the portable checker into the project or invoke a pinned plugin in CI. Run `project-layout.mjs check <project>` on each change.

During adoption, move independent studies into their own directories. Move a historically interdependent campaign together when its receipts and loaders rely on relative paths. Keep its original runnable entry point and distinguish frozen inputs from current authoring files. Re-run a representative historical replay and test discovery from the new layout. Link the current Fusion design, strategic narrative, trials and showcase from the project README. Follow the [CAD and supplier handoff](../frc-mechanism-cad/SKILL.md) and [README still and highlights workflow](../frc-robot-highlights/SKILL.md).

Use the [component palette](../../docs/cad-color-convention.md) during CAD setup. A new project inherits the plugin defaults. Keep project-specific role colors in version control at `cad/component-palette.json`. Reference that single mapping from native models and student-facing views.


## Version the workflow outputs

Keep each completed analysis, strategic narrative, constraint register, design review and verification report in the project checkout, beside its subject. A private wiki can carry team history and research. Students should be able to read the deliverables from a clean checkout. Link the project workflow from the README and showcase.

Initialization creates `docs/workflow.md`. Its table uses the columns **Agent FRC skill**, **Project output** and **Supporting evidence**. Use the invoked skill name, relative Markdown links to committed outputs, and relevant evidence or an em dash. Existing kickoff and design documents stay in their canonical directories. The layout check verifies index references when the index exists. For the standard showcase, add the pinned [workflow link configuration](../../docs/showcase-evidence.md).

For a publicly downloadable whole robot, bind the student archive to its own reopened component, feature and joint evidence. [Verify the public Fusion handoff](../../docs/public-fusion-handoff.md).
