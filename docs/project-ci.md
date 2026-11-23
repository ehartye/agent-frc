# A project's own CI, and the checks the agent runs

A robot project runs CI that belongs to it. The coding agent writes that CI from the plugin's reference files, and the project owns it from then on. [The plugin is a tool of the coding agent, not a dependency of the project](testing-methodology.md#the-plugin-is-a-tool-of-the-coding-agent-not-a-dependency-of-the-project): project code never runs plugin code.

| Runs | Where | What |
| --- | --- | --- |
| The project's CI | GitHub Actions, on every push | The path and secret scan, the site check and, on the default branch, publishing `docs/` |
| The agent, with the plugin | The agent's computer, before a push | The layout check, staging, the stage gate, the publication check, the audit below |

## Write the project's CI

Copy three files from [`templates/project-ci/`](../templates/project-ci/ci.yml) into the project, then treat them as the project's own.

| Reference | In the project | Does |
| --- | --- | --- |
| `ci.yml` | `.github/workflows/ci.yml` | On every push: scan, then site check. On the default branch: publish `docs/` to Pages. Checks out the project and nothing else. |
| `scan.mjs` | `scripts/ci/scan.mjs` | Fails on a personal machine path or a credential in a tracked file. Needs Node and Git. |
| `site-check.mjs` | `scripts/ci/site-check.mjs` | Fails when a design index and its folders disagree, a file an index or record names is missing, or a relative link in a published page leads nowhere. Needs Node. |

1. Check the default branch with `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
2. For a site served from the `docs` folder of the default branch, delete the upload step and the `deploy` job. Otherwise enable GitHub Actions as the Pages source.
3. Add the project's own tests as steps that run the project's own commands, such as `./gradlew build` or `node tests/smoke.mjs`.
4. Require the **Scan and site check** job on the default branch.
5. Keep `on: push`. A `pull_request` trigger runs a stranger's code, which matters most on a self-hosted runner.

The [sample project](../examples/sample-project/README.md) is a complete invented project that uses these three files unchanged. The plugin's tests copy it to a folder that holds no plugin and run its checks there.

The default project CI is publish, scan and site integrity. It runs no layout check and no physics: a design is checked by the agent before it is pushed, and its [stage gate](design-publication.md#the-stage-gate) runs when it is marked effective.

## Audit the project's CI

```sh
node PLUGIN/scripts/project-ci-audit.mjs .
```

The audit is advice for the agent. It always exits 0 and blocks nothing. It reports:

- a workflow or script in the project that names the plugin: its repository, a pin of it or a path into it;
- a missing scan or site check, or one that no workflow runs;
- a workflow that publishes with no site check before it, or that runs pull requests on a self-hosted runner;
- how the project's copies differ from the reference files, as a count of lines. A difference is information: the project may change its own files.

## The path and secret scan

A personal machine path or a credential is public as soon as its branch is pushed, with or without a pull request. The project's workflow runs the scan on every push to every branch, and the agent's publication check runs the same scan before the push.

```sh
node scripts/ci/scan.mjs .
```

The scan reads every tracked text file as it stands at the checked-out commit; it does not read earlier commits. It reports a home directory that names its owner, in Windows, macOS, Linux and shell spellings, and it reports private keys, common service tokens and a quoted password, secret, key or token assignment. It names the file, line and kind. It prints a machine path so the builder that wrote it can be found, and it never prints a credential. Placeholders such as `C:/Users/name/`, the robot controller's service account and hosted-runner homes pass. Write paths relative to the repository so a clone on another machine reproduces them. Rotate a reported credential; removing it from the branch does not remove it from history.

A fixture that shows a path or key on purpose can be listed in `.branch-scan.json` at the project root, as `{"ignore": ["tests/fixtures/paths/", "docs/example.log"]}`. A folder entry ends in `/`. The list is reviewed in the pull request like any other file.

## Checks the agent runs before a push

```sh
node PLUGIN/scripts/design-publication.mjs check .
```

The [publication check](design-publication.md) verifies what the project publishes about its designs, holds an effective design to its physics, requires the record of the stage gate for a design that became effective, and runs the scan. It never runs the layout check. It ends by saying what a push will do.

## Project tests

A test that is native to the project is a step in the project's own workflow. It runs the project's own command and needs nothing else.

```yaml
      - name: Build and test the robot code
        run: ./gradlew build --no-daemon
```

A WPILib Java project commits the Gradle wrapper, GradleRIO and vendor dependency versions, and selects its JDK with `actions/setup-java`. Confirm that the project contains real tests and that they appear in its test report.

The plugin keeps one local convenience for the agent: a project may list its test commands in `tests/ci.json`, and `project-checks.mjs` runs the ones a change touches. Nothing in the project's CI reads that file.

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

Each `argv` is an executable and its arguments, invoked from the checkout. An empty input list runs on every change. A path ending in `/` includes its descendants. Both modes run the project layout check first in the default `robot-project` layout.

## Check the workflows before pushing

After committing a workflow change, check the exact commit you intend to push. Use an approved local [actionlint release](https://github.com/rhysd/actionlint/releases) and verify its published checksum. The plugin CI exercises v1.7.12.

```sh
node PLUGIN/scripts/project-checks.mjs PROJECT workflows FULL_COMMIT ABSOLUTE_PATH_TO_ACTIONLINT
```

The command reads the committed workflow YAML and local action metadata directly from Git. It checks every committed entry workflow and its local reusable calls in an isolated directory. Syntax errors and incompatible local call inputs produce a nonzero exit and a file/line diagnosis. Correct the reported file, commit it and check the new commit. A malformed workflow can prevent GitHub from creating even its first job.

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

The selection reads two things. [`test/test-map.json`](../test/test-map.json) places every test file in one lane (`logic`, `docs`, `browser` or `kernel`) and lists by hand the files a test covers that its code does not name. The runner adds every file a test reaches through its imports and through the file names and paths in its code, followed through the scripts it runs. A document, a page or a style sheet never starts a `kernel` test and never runs everything. A changed file that no test reaches runs every test. So does a change to the runner, the map or `package.json`, except a change to the version number alone. Add a new test file to one lane and give it a leading `@lane` comment, with `@subject PATH` for each file it runs only through a subprocess; `test/test-map.test.mjs` fails until you do. The lanes in the map say what a test needs. The `@lane` tag says when it runs, in the words of the [risk map](../.testing/risk.yml).

The hosted job runs `npm run validate` on every pull request, then the changed-files selection under the portable profile. A merged default-branch change and a manual run execute the full portable suite before the public guide is built. The layout check rerun installs the CAD kernel only when a pull request reaches the test it runs. Each run writes its total time and slowest files to the job summary.
