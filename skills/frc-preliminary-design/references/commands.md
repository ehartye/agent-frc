# Preliminary design commands, in order

Run every command from the repository root. `PLUGIN` stands for the installed plugin's folder and `1.0` for the design's version. The examples use invented names.

`PLUGIN` must not change during a run. Point it at an installed copy, or at a worktree of your own, at the revision the project's workflow names as `AGENT_FRC_REF`. A shared checkout that another session updates mid-run spoils the result. Record the revision with each result.

## Contents

- [Start a design](#start-a-design)
- [Build the inputs](#build-the-inputs)
- [Run the check](#run-the-check)
- [Look at it locally](#look-at-it-locally)
- [Publish a draft](#publish-a-draft)
- [Add trials and replays](#add-trials-and-replays)
- [Judge readiness](#judge-readiness)
- [Write the handoff note](#write-the-handoff-note)
- [Mark the design effective](#mark-the-design-effective)
- [Start the next version](#start-the-next-version)
- [Windows and CI](#windows-and-ci)

## Start a design

```sh
python PLUGIN/examples/preliminary-design/create.py . --project-review --release 1.0 --design-name "Tilting carriage"
```

Run the starter once per project, with the plugin's geometry Python environment. It writes the project's publish script (`cad/preliminary-design/stage.py`), local server (`serve.py`), index page, fonts and CI workflow. It also writes a synthetic example design under `cad/preliminary-design/releases/1.0/`. Replace that example's inputs with the project's own.

For a project with `iterations/active.json`, work in its active design root. [Design iterations](../../../docs/design-iterations.md)

## Build the inputs

A design's folder, `cad/preliminary-design/releases/1.0/`, holds everything the check reads:

| File | Holds |
| --- | --- |
| `design.json` | The editable design, its datum and units |
| `package.step` | The layout: one named solid per functional volume, in millimetres |
| `layout.json` | The plan: groups, mounts, cases, premises, the narrative list and `presentation` text |
| `paths.json` | The motion study: each case's moves, fixtures and allowances |
| `budgets.json`, `package-limits.json` | Mass and current estimates by subsystem, and what they are compared with |
| `narrative.md` | The strategic narrative the design answers |
| `missions.json` | Mission cases, the cycle map and the risk list |

Generate these with one project builder script, not by hand. Model it on the starter: it runs the check itself and stops on a non-zero exit code. Give the builder named steps and make each one fail loudly.

Name every file by its path from the repository root, as `{"file": "..."}`, and type no hash. The check reads each file and records its digest in the receipt. A typed `sha256` is optional; when one is present and stale the check stops with `Changed evidence: FILE`, so delete it or have the builder rewrite it. [Plan and case format](../../../docs/preliminary-design.md#write-the-plan)

## Run the check

```sh
node PLUGIN/scripts/design.mjs preliminary-check . cad/preliminary-design/releases/1.0/layout.json --write-view --output cad/preliminary-design/releases/1.0/receipt.json
```

| While you are | Add | Effect |
| --- | --- | --- |
| Fixing a failing layout | `--fail-fast` | Stops at the first case that does not pass. The receipt is partial |
| Changing geometry or motion only | `--physics-only` | Checks every case and the budgets. Writes no review page |
| Changing names, colours, explanations or grouping | `--view-only` in place of `--write-view` | Rebuilds the review page from the saved receipt in seconds. Reruns no case |
| Running after a project builder | `--built-from PATH` | Warns when the plan is older than the builder's source file or folder. Repeat it for each source. Changes no result |
| Sharing the machine | `--jobs N` | Sets the worker count. Use half the cores |
| Publishing | `--write-view --output ...` | The full check. Only this receipt can be published |

Read these lines on stderr:

- `[plan]` comes first: the plan's path, when it was last written and its digest. A `[plan] warning` says the plan is older than a `--built-from` source: check the builder's exit code and rebuild before relying on the result. [Confirm the check read a fresh plan](../../../docs/preliminary-design.md#confirm-the-check-read-a-fresh-plan)
- `[scope]` gives the solid count and the finest path tolerance beside the guidelines.
- `[mounts] note` names members with no registered mount.
- `[attachment]` lists each robot solid with no path to the frame and each field fixture off the floor. Clear every row: move the solid onto its support, draw the support, register its mount, or label it under `attachment.unmounted` in the plan with its reason. [Nothing floats](../../../docs/preliminary-design.md#nothing-floats)
- `[motion]` gives each case's status and seconds as it finishes. Use those seconds to estimate the next run. `[budgets]` gives mass and voltage.

The check has no flag for one case. To refine one phase, change that case's entry and rerun with `--physics-only`. Every case runs again, so keep the case count small.

The receipt's `status` is `layout-checked`, `provisional`, `blocked` or `reopen`. `missingInputs` and `decision.firstUnmet` say why. [Flags and output in full](../../../docs/preliminary-design.md#run-the-check)

## Look at it locally

```sh
python cad/preliminary-design/serve.py
```

Open `http://127.0.0.1:8000/`. The page cannot load its scene from `file://`. For a review on the local network, add `--bind LAN_ADDRESS --port 8000`.

## Publish a draft

```sh
python cad/preliminary-design/stage.py 1.0 --design-name "Tilting carriage"
node PLUGIN/scripts/design-publication.mjs check . --skip-rerun
```

`--design-name` is given once, the first time a major number is published. Publishing needs a `layout-checked` receipt of a full check and at least one mission case in `missions.json`. A mission case names a passing operating case and a narrative objective the plan marks `represented`.

Commit, push the branch and open a pull request. CI reruns the check from the committed inputs on every pushed branch. The site deploys from the default branch, so the draft is published when the pull request merges. Then open the published URL, `/<repository>/preliminary-design/` on the project's Pages site, and play each motion.

After any later edit, rerun the check in the same folder and run `stage.py 1.0` again. That publishes the next draft of the same version. [Versions, drafts and statuses](../../../docs/design-publication.md#name-and-number-a-design)

## Add trials and replays

The plugin reads trial records. It does not run trials: the project owns its trial runner. For each trial that decides an interaction:

1. Name the trial file on the case's stage under `transportedBy`, `freePath` or `supportedBy`, whichever moved the piece.
2. Write its `qualification`: the result, a control, brackets and the timestep repeat.
3. Convert the recorded run to a replay set and name it under `presentation.replays`. Rebuild the review page with `--view-only`. If it refuses, it names the input that changed: run the full check.

[Trials and replays](trials.md)

## Judge readiness

```sh
node PLUGIN/scripts/design.mjs effective-readiness . --release cad/preliminary-design/releases/1.0 --design "Tilting carriage 1.0"
```

The report lists the three criteria as met or not met, each with the reason. It writes nothing and always exits 0. Under criterion 2 a note says how each mission case's animation relates to its trial. `prescribed motion with a trial attached` is `not met`: name the trial on the case's stage, or play it as a replay. [What it reads](../../../docs/preliminary-design.md#judge-readiness-to-be-marked-effective)

## Write the handoff note

Write `HANDOFF.md` in the design's folder before proposing effective. It tells detailed design where each item is and what to do first. Keep it to a page or two of tables.

| Section | Contents |
| --- | --- |
| Design | Name, version, the STEP file and how its solids are named |
| Frame and datums | Origin, forward direction, floor height; each pivot axis, travel and mounting face, with coordinates |
| Envelopes | Frame perimeter, bumpers, parked height, greatest reach |
| Interfaces and allowances | Each fit tighter than about 10 mm, each intended contact or squeeze with its allowance, each connection still carrying an unmounted-allowance label |
| Operating point and windows | The setpoints the trials passed at, with the passing and failing value on each side |
| Motion cases | The cycle, the displaced control and the path tolerance each case was checked at |
| Budgets | Mass by subsystem and the reserve; loaded voltage by duty and the margin |
| Open risks and bench tests | Each risk, closed by a named design change or listed with its measure, pass value and fail value. A bench test may carry an optional `tag` in `missions.json`: `before-build` when it must pass before the build, `on-robot` when it is run on the finished robot |
| Trials and replays | Which interactions were tried on blockout geometry and must be repeated on real parts |
| First work items | A short list for detailed design, riskiest first |

Take each figure from the plan, the receipt, `missions.json` or a trial record, and name the file. Do not retype a number that a file already holds without saying which file.

## Mark the design effective

```sh
python cad/preliminary-design/stage.py --set-status 1.0 effective --readiness PLUGIN/scripts/effective-readiness.mjs
```

Do this only after the user agrees. It is an index edit in a reviewed pull request, with the readiness report attached. An effective design no longer changes.

## Start the next version

```sh
python cad/preliminary-design/stage.py --copy-inputs 1.0 1.1
```

| Situation | What to do |
| --- | --- |
| An edit, fix or refinement of an in-progress design | Publish the same version again. It becomes the next draft |
| A change to an effective design, including a reservation that detailed design returned | The next minor version, such as `1.1` |
| A different architecture, or a start-over | The next major version, such as `2.0`, with its own name |

## Windows and CI

- The commands run unchanged in PowerShell and in Git Bash. Use forward slashes in every path you write into a file.
- Keep committed paths short. A deep folder plus a long file name passes the Windows path length and fails a clone.
- Write no drive letter or home folder into a script, a plan or a record.
- CI runs the same check on Linux. It compares digests and verdicts, not measured values digit for digit. Run `design-publication.mjs check . --skip-rerun` locally before every push.
- After a plugin update, the check keeps a review page that already exists. Delete `package-motion.html` in the design's folder and run the check with `--view-only` to take the new stock page.
- Write browser-check captures to a scratch folder outside the checkout.
