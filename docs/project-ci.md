# Run student project checks locally and in GitHub Actions

Use `frc-project-setup` to register the commands the team actually runs, and `frc-mechanical-readiness` and `frc-robot-highlights` when the team publishes a model.

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

## Scan every pushed branch

A personal machine path or a credential is public as soon as its branch is pushed, with or without a pull request. Copy [the branch scan workflow](../templates/branch-scan.yml) to `.github/workflows/branch-scan.yml` and set `AGENT_FRC_REF` to the plugin release the project uses. It runs on every push to every branch.

```sh
node PLUGIN/scripts/branch-scan.mjs PROJECT
```

The scan reads every tracked text file as it stands at the pushed commit; it does not read earlier commits. It reports a home directory that names its owner, in Windows, macOS, Linux and shell spellings, and it reports private keys, common service tokens and a quoted password, secret, key or token assignment. It names the file, line and kind. It prints a machine path so the builder that wrote it can be found, and it never prints a credential. Placeholders such as `C:/Users/name/`, the robot controller's service account and hosted-runner homes pass. Write paths relative to the repository so a clone on another machine reproduces them. Rotate a reported credential; removing it from the branch does not remove it from history.

A fixture that shows a path or key on purpose can be listed in `.branch-scan.json` at the project root, as `{"ignore": ["tests/fixtures/paths/", "docs/example.log"]}`. A folder entry ends in `/`. The list is reviewed in the pull request like any other file. Run the same command before the first push of a new branch.

## Check published designs in CI

A project that publishes design reviews runs one workflow, [design publication](../templates/design-publication.yml). On every push it scans the branch, reruns the layout check for each published design from its committed inputs and checks the status index. [What the check verifies and how it stays fast](design-publication.md) A project that ran the earlier showcase gates moves over with the [migration guide](design-publication-migration.md).

## Check the workflows before pushing

After committing a workflow change, check the exact commit you intend to push. Use an approved local [actionlint release](https://github.com/rhysd/actionlint/releases) and verify its published checksum. The plugin CI exercises v1.7.12.

```sh
node PLUGIN/scripts/project-checks.mjs PROJECT workflows FULL_COMMIT ABSOLUTE_PATH_TO_ACTIONLINT
```

The command reads the committed workflow YAML and local action metadata directly from Git. It checks every committed entry workflow and its local reusable calls in an isolated directory. Syntax errors and incompatible local call inputs produce a nonzero exit and a file/line diagnosis. Correct the reported file, commit it and check the new commit. A repair present only in the working directory leaves the earlier result unchanged.

The result identifies the selected commit, checked workflows and executable digest. The checker uses actionlint’s default rules without repository suppressions, shellcheck or pyflakes. A project with custom runner labels may need a separate policy review. Remote reusable workflow bodies, job execution, repository variables, permissions on the host and deployment still require separate verification. Run this command alongside the local project tests. A malformed workflow can prevent GitHub from creating even its first job.

## Start with a Java robot project

A WPILib Java project can use the general CI entry with just its Gradle wrapper, sources and configured tests. Commit the wrapper files, GradleRIO and vendor dependency versions. Select the JDK required by that project locally and set `FRC_JAVA_MAJOR` to its major version in Actions. Confirm the wrapper distribution and its checksum. Keep the ordinary Java project structure and register its Java check in `tests/ci.json`:

```json
{"schema":"agent-frc/project-checks@1","layout":"software-only","checks":[{"name":"Build and test Java","argv":["gradle-wrapper","build","--no-daemon"],"inputs":[]}]}
```

The runner selects the checked-in `gradlew` or `gradlew.bat`. Gradle's `build` runs the configured test/check tasks. Confirm that the project contains real tests and that they appear in its test report. Add independently runnable simulation regressions as separate checks with their own input paths. Both `project-checks.mjs PROJECT full` and the manual workflow run the Java build and every registered simulation check. This setup needs no Fusion installation or Pages settings. It builds and tests offline robot logic; Gradle dependency resolution may need a network or a populated cache.

## Set up GitHub Actions

1. Check the default branch with `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`. Set the literal push and pull-request branch filters in the entry workflow to that name.
2. Copy [the reusable project checks](../templates/project-checks.yml) to `.github/workflows/project-checks.yml`. Use [student project CI](../templates/project-ci.yml) as the entry workflow for a project that publishes no design. A project that publishes designs uses the [design publication workflow](../templates/design-publication.yml) alone: it runs the registered checks itself and needs neither file.
3. Set the repository variable `AGENT_FRC_PLUGIN_SHA` to the full Git commit of the reviewed plugin containing these commands. The reusable project checks read it. Pin actions and dependencies independently. Make changes to workflow files and required tests subject to owner review.
4. Open a pull request into the default branch. It runs the changed checks once. Ordinary pushes to a feature branch do not start a second run. A default-branch push repeats the checks on the merged tree. **Run workflow** on a selected project branch executes all registered checks. A missing comparison base also selects the full suite.
5. After a successful test PR, require the emitted project check in the default branch protection. Use the check names emitted by the actual job. Keep the team’s existing review and admin policies. Manual full verification is safe to rerun without deploying.

## How the plugin repository tests itself

These commands carry out [Test by need and risk](testing-methodology.md) for the plugin's own tests. While you work on the plugin, run two commands after a change:

```sh
npm run validate
npm run test:changed
```

`npm run test:changed` runs the test files that cover what you changed since the merge base with `origin/main`, uncommitted and untracked files included. Pass another base after `--`, for example `npm run test:changed -- HEAD~1`. A change to documentation, a skill or the guide runs `validate` and the documentation tests, with the guide tests when the guide's own files changed. The run prints its total time and its five slowest files.

| Run | Command | When |
| --- | --- | --- |
| Changed files | `npm run test:changed` | After each change, with `npm run validate` |
| Quick | `npm run test:quick` | A broad check in seconds: every test that needs no CAD kernel, browser or guide build |
| Named files | `npm test -- role-handoff kickoff` | One or more test files, by any part of the name |
| One Python class | `npm test -- mechanical-readiness --name FreePath` | One class of the mechanical-review controls |
| Full portable | `npm run test:portable` | Everything that runs without the CAD kernel or a renderer |
| Full station | `npm test` | Before a release tag, or when asked. It adds the native STEP render and the full mechanical-review controls at the qualified desktop station |

Add `--portable` to skip the tests that need the CAD kernel, `--lane NAME` to run one lane, `--jobs N` to change how many test files run at once (default: half the cores) and `--list` to see the selection without running it.

The selection reads two things. [`test/test-map.json`](../test/test-map.json) places every test file in one lane (`logic`, `docs`, `browser` or `kernel`) and lists by hand the files a test covers that its code does not name. The runner adds every file a test reaches through its imports and through the file names and paths in its code, followed through the scripts it runs. A changed file that no test reaches runs every test. So does a change to the runner, the map or `package.json`, except a change to the version number alone. Add a new test file to one lane; `test/test-map.test.mjs` fails until you do.

The hosted job runs `npm run validate` on every pull request, then the changed-files selection under the portable profile. A merged default-branch change and a manual run execute the full portable suite before the public guide is built. The layout check rerun installs the CAD kernel only when a pull request reaches the test it runs. Each run writes its total time and slowest files to the job summary.
