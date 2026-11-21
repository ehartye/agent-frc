# Run student project checks locally and in GitHub Actions

Use `frc-project-setup` to register the commands the team actually runs, and `frc-mechanical-readiness` and `frc-robot-highlights` when the team releases a public model.

## Choose the checks

Put a small, always-run smoke check and any more expensive studies in `tests/ci.json`. Each `argv` is an executable and its arguments, invoked directly from the checkout. An empty input list runs on every change. A path ending in `/` includes its descendants. Register the scripts, fixtures, common libraries, dependencies and product inputs that can change the answer. The following example assumes the project has the two named scripts.

```json
{
  "schema": "agent-frc/project-checks@1",
  "checks": [
    {"name":"Project smoke test","argv":["node","tests/smoke.mjs"],"inputs":[]},
    {"name":"Replay service duty","argv":["node","tests/service-duty.mjs"],"inputs":["controls/","sim/service/","experiments/service/","tests/service-duty.mjs","package-lock.json"]}
  ]
}
```

```sh
node PLUGIN/scripts/project-checks.mjs PROJECT changed BASE_COMMIT
node PLUGIN/scripts/project-checks.mjs PROJECT full
```

Both run the project layout check first in the default `robot-project` layout. A software-only project can use its existing layout. Use an actual ancestor of the candidate as the base. Changes to the check manifest or a workflow select all registered checks. The changed mode includes staged, unstaged and untracked non-ignored inputs in the working checkout. Full mode runs every registered command, including expensive historical replays. Install the project’s pinned runtime dependencies before either command. A private Fusion reissue remains a separate qualified-station operation.

## Start with a Java robot project

A WPILib Java project can use the general CI entry with just its Gradle wrapper, sources and configured tests. Commit the wrapper files, GradleRIO and vendor dependency versions. Select the JDK required by that project locally and set `FRC_JAVA_MAJOR` to its major version in Actions. Confirm the wrapper distribution and its checksum. Keep the ordinary Java project structure and register its Java check in `tests/ci.json`:

```json
{"schema":"agent-frc/project-checks@1","layout":"software-only","checks":[{"name":"Build and test Java","argv":["gradle-wrapper","build","--no-daemon"],"inputs":[]}]}
```

The runner selects the checked-in `gradlew` or `gradlew.bat`. Gradle's `build` runs the configured test/check tasks. Confirm that the project contains real tests and that they appear in its test report. Add independently runnable simulation regressions as separate checks with their own input paths. Both `project-checks.mjs PROJECT full` and the manual workflow run the Java build and every registered simulation check. This setup needs no Fusion installation, model policy, reviewer key or Pages settings. It builds and tests offline robot logic; Gradle dependency resolution may need a network or a populated cache.

## Set up GitHub Actions

1. Check the default branch with `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`. Set the literal push and pull-request branch filters in the entry workflow to that name.
2. Copy [the reusable project checks](../templates/project-checks.yml) to `.github/workflows/project-checks.yml`. Choose **one** entry workflow. Use [student project CI](../templates/project-ci.yml) for general projects or [robot showcase CI](../templates/robot-showcase-pages.yml) for a project releasing public CAD. Existing pipelines can call the reusable check and use the same local verification command immediately before their normal publication step.
3. Set the repository variable `AGENT_FRC_PLUGIN_SHA` to the full Git commit of the reviewed plugin containing these commands. Pin actions, builders, dependencies and the project baseline independently. Make changes to workflow files, required tests, trust configuration and publishing adapters subject to owner review.
4. Open a pull request into the default branch. It runs the changed checks once. Ordinary pushes to a feature branch do not start a second run. A default-branch push repeats the checks on the merged tree. **Run workflow** on a selected project branch executes all registered checks. A missing comparison base also selects the full suite.
5. After a successful test PR, require the emitted project check and, for sites offering CAD, **Mechanical model eligibility** in the default branch protection. Use the check names emitted by the actual job. Keep the team’s existing review and admin policies. Branch-served Pages needs the mechanical check before merge. A generated site uploads the exact checked directory only on a default-branch push after both jobs succeed. Manual full verification is safe to rerun without deploying.

## Verify the final showcase locally

Use the [local publication contract](private-model-release.md#local-release-command) on the **final** site after every copy, alias, rendered gallery and field-only rebuild. The same call works offline and as a CI step. The trusted baseline holds `.github/showcase-release.json` and a [project build adapter](../templates/prepare-showcase-release.mjs) at `scripts/prepare-showcase-release.mjs`. For a custom site adapt that file to reproduce the prior release with its original pinned builder and run the candidate’s complete presentation build. A changed field exemption requires independently regenerated bytes in a separate directory. Keep the trusted configuration, public key and approved site outside the candidate checkout.

For the showcase workflow set `FRC_APPROVED_MODEL_COMMIT`, `FRC_PAGES_LAYOUT` (`branch` or `built`), and the reviewer **public** key in `FRC_REVIEWER_PUBLIC_KEY`. Set the Pages source to the matching branch/directory or Actions configuration. Keep the previous approved version available while evaluating a replacement. An owner examining a local-only release can compare its printed complete-site digest with `local-showcase-release.mjs digest FINAL_SITE` immediately before publishing. Keep the receipt outside the served tree. A local check cannot impose a remote merge restriction when required checks are disabled.

The plugin repository runs `npm run validate` and `npm run test:portable` before building its own public guide. At the qualified desktop station, `npm test` also runs the native STEP render and full mechanical-review controls. The hosted job uses the portable profile for every default-branch pull request, merged default-branch change and manual run.
