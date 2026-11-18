# Agent FRC

Agent FRC helps students turn a new game manual into robot design decisions. Open the [interactive workflow guide](https://ehartye.github.io/agent-frc/) to try the field lab and see which skills support each step.

1. **Model the rules.** Read the supplied manual and drawings at the project's evidence cutoff. Build a [source-linked rules register and field profile](docs/project-rules-model.md) in the team's project.
2. **Rehearse the match.** Explore the field with a robot-sized box. Compare scoring windows, supply, red and blue routes, finite footprints and time lost at choke points in the [field lab](docs/kickoff-field-lab.md).
3. **Choose a strategy.** Turn student observations into a [match narrative](docs/game-to-robot-strategy.md), an alternative, a measurable requirement and the experiment that will resolve the choice.
4. **Design and check the robot.** Hand off an [editable blockout](docs/design-artifact.md) and [subsystem interfaces](docs/subsystem-contracts.md). Explore a [swerve drivetrain](skills/frc-swerve/SKILL.md) with an [original Fusion teaching model](examples/swerve/README.md). Review [native viewer evidence](docs/native-viewer-contracts.md) and [simulation traces](docs/simulation-checks.md).
5. **Resume the investigation.** Recover the owner's decision, current candidate and most recent test with the [continuation guide](docs/strategy-first-continuation.md).

## Run from a checkout

To repeat a geometric check on a saved Fusion assembly, use the [native study replay procedure](docs/native-study-replay.md). It verifies the document and geometry before testing the chosen poses.

Use Node.js and npm. See the [local marketplace guide](docs/local-plugin.md) to stage and install this checkout. The plugin works with project files and has no required vault or robot connection.

```sh
npm test
npm run validate
npm run rules -- init ../robot-project/register.json
npm run rules -- compile ../robot-project/register.json ../robot-project/field-profile.json ../robot-project/reviewed-rules.json
npm run kickoff -- --profile ../robot-project/reviewed-rules.json --output ../robot-project/field.html
```

Fill the register and field profile from the team's sources before compiling. Open the generated HTML locally. For a quick trial, run the last command with [the invented training field](examples/kickoff/training-field.json) as the profile. Outputs use new filenames to preserve prior revisions.
