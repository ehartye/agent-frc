# Preliminary design commands, in order

Run every command from the repository root. `PLUGIN` stands for the installed plugin's folder and `1.0` for the design's version. The examples use invented names.

`PLUGIN` must not change during a run. Point it at an installed copy of the plugin, or at a worktree of your own. A shared checkout that another session updates mid-run spoils the result. Record the revision with each result. The project holds no plugin file: every plugin command here is one you run, from the project root.

The commands that build and measure need the design library, `frc-design-kernel`, in the geometry Python environment. Check it with `node PLUGIN/scripts/check-environment.mjs --task preliminary-design --python PYTHON`. The report names the installed version and commit, or the command that installs it. [Environment check](../../../docs/setup-health.md#check-the-design-library)

## Contents

- [Start a design](#start-a-design)
- [Write the inputs](#write-the-inputs)
- [Generate the solids](#generate-the-solids)
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
python PLUGIN/examples/design-source/create.py . --project-review --release 1.0 --design-name "Tilting carriage"
```

Run the starter once per project, with the geometry Python environment. It writes the published index page, the fonts and the project's own CI, and an invented example design under `cad/preliminary-design/releases/1.0/`. It then generates the example's solids, checks it and stages it. Replace the example's design source, judgement file and records with the project's own.

For a project with `iterations/active.json`, work in its active design root. [Design iterations](../../../docs/design-iterations.md)

## Write the inputs

A design's folder, `cad/preliminary-design/releases/1.0/`, holds everything the check reads. You write these files as data. No program builds them.

| File | Holds | Read by |
| --- | --- | --- |
| `design.json` | The design source: parameters, solids, groups, fixtures, mounts, contacts, poses and motions | The design library |
| `judgement.json` | The judgement file: a stage for each motion, the cycle, the displaced control, attachment labels, premises, the narrative list and `presentation` text | The plugin |
| `budgets.json`, `limits.json` | Mass and current estimates by subsystem, and what they are compared with | The plugin |
| `missions.json` | Mission cases, the cycle map and the risk list | The plugin |
| `narrative.md` | The strategic narrative the design answers | The plugin |
| `generated/` | `design.step`, `fixtures.step` and `manifest.json`, written by the library. Never edited | Both |

Keep the split: geometry and motion go in the design source, and every reason, allowance and label goes in the judgement file. The check refuses a judgement file that carries groups, mounts, poses or motions. [What goes where](../../../docs/preliminary-design.md#the-design-source-and-the-judgement-file)

Name every file by its path from the repository root, as `{"file": "..."}`, and type no hash. The check reads each file and records its digest in the receipt.

## Generate the solids

```sh
python -m frc_design_kernel validate cad/preliminary-design/releases/1.0/design.json
python -m frc_design_kernel build cad/preliminary-design/releases/1.0/design.json --out cad/preliminary-design/releases/1.0/generated
```

`validate` checks the source without building it and names the entry that is wrong. `build` writes the STEP files and the manifest. Run `build` again after every edit to the design source: the layout check stops when the manifest is of an earlier source. Commit the generated folder with the source.

## Run the check

```sh
node PLUGIN/scripts/design.mjs preliminary-check . cad/preliminary-design/releases/1.0/judgement.json --write-view --output cad/preliminary-design/releases/1.0/receipt.json
```

| While you are | Add | Effect |
| --- | --- | --- |
| Changing one or two motions | `--cases A,B` | Measures only those stages. The receipt is partial |
| Changing geometry or motion only | `--physics-only` | Checks every case and the budgets. Writes no review page |
| Changing names, colours, explanations or grouping | `--view-only` in place of `--write-view` | Rebuilds the review page from the saved receipt in seconds. Measures no case again |
| Sharing the machine | `--workers N` | Sets the worker count. Use half the cores |
| Publishing | `--write-view --output ...` | The full check. Only this receipt can be published |

Read these lines on stderr:

- `[inputs]` comes first: the judgement file and its digest.
- `[scope]` gives the solid count and the finest path tolerance beside the guidelines.
- `[motion]` gives each case's status, how many pairs were measured and the closest pair.
- `[control]` says whether the displaced control was rejected, as it must be.
- `[attachment]` lists each robot solid with no path to the frame and each field fixture off the floor. Clear every row: move the solid onto its support, draw the support, add its mount in the design source, or label it under `attachment.unmounted` in the judgement file with its reason. [Nothing floats](../../../docs/preliminary-design.md#nothing-floats)
- `[budgets]` gives mass and voltage.
- `[result]` gives the status and the first unmet requirement.
- `[time]` says what ran, what did not run and how long it took against the guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate.

The receipt's `status` is `layout-checked`, `provisional`, `blocked` or `reopen`. `missingInputs` and `decision.firstUnmet` say why. Its `library` field records the design library's version and commit, as information. [Flags and output in full](../../../docs/preliminary-design.md#run-the-check)

## Look at it locally

```sh
python PLUGIN/scripts/serve_preliminary_review.py
```

Open `http://127.0.0.1:8000/`. The page cannot load its scene from `file://`. For a review on the local network, add `--bind LAN_ADDRESS --port 8000`.

## Publish a draft

```sh
python PLUGIN/scripts/stage_preliminary_review.py 1.0 --design-name "Tilting carriage"
node PLUGIN/scripts/design-publication.mjs check .
```

`--design-name` is given once, the first time a major number is published. Publishing needs a `layout-checked` receipt of a full check and at least one mission case in `missions.json`. A mission case names a passing operating case and a narrative objective the judgement file marks `represented`.

Commit, push the branch and open a pull request. The push runs the project's own CI: the path and secret scan and the site check. No design check runs there; the layout check and the publication check you just ran are the checks of a draft. The site deploys from the default branch, so the draft is published when the pull request merges. Then open the published URL, `/<repository>/preliminary-design/` on the project's Pages site, and play each motion.

After any later edit, regenerate the solids when the design source changed, rerun the check in the same folder and run the staging command for `1.0` again. That publishes the next draft of the same version. [Versions, drafts and statuses](../../../docs/design-publication.md#name-and-number-a-design)

## Add trials and replays

The plugin reads trial records. Trials written as data and run by the design library are coming; until then a project keeps the records of the trials it has run. For each trial that decides an interaction:

1. Name the trial file on the stage in the judgement file under `transportedBy`, `freePath` or `supportedBy`, whichever moved the piece.
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
| Design | Name, version, the design source, the generated STEP and how its solids are named |
| Frame and datums | Origin, forward direction, floor height; each pivot axis, travel and mounting face, with coordinates |
| Envelopes | Frame perimeter, bumpers, parked height, greatest reach |
| Interfaces and allowances | Each fit tighter than about 10 mm, each intended contact or squeeze with its allowance, each connection still carrying an unmounted-allowance label |
| Operating point and windows | The setpoints the trials passed at, with the passing and failing value on each side |
| Motion cases | The cycle, the displaced control and the path tolerance each case was checked at |
| Budgets | Mass by subsystem and the reserve; loaded voltage by duty and the margin |
| Open risks and bench tests | Each risk, closed by a named design change or listed with its measure, pass value and fail value. A bench test may carry an optional `tag` in `missions.json`: `before-build` when it must pass before the build, `on-robot` when it is run on the finished robot |
| Trials and replays | Which interactions were tried on blockout geometry and must be repeated on real parts |
| First work items | A short list for detailed design, riskiest first |

Take each figure from the design source, the judgement file, the receipt, `missions.json` or a trial record, and name the file. Do not retype a number that a file already holds without saying which file.

## Mark the design effective

```sh
python PLUGIN/scripts/stage_preliminary_review.py --set-status 1.0 effective
```

Do this only after the user agrees, and after the design's inputs are committed. The command runs the stage gate itself: the full layout check on the committed design, once. It prints the time against the 15-minute guideline and the readiness report, writes `gate.json` beside the published design and sets the status only when the gate passes. Then run the publication check and open the pull request with the status change and the gate record. An effective design does not change. Only its view can be republished, with `python PLUGIN/scripts/stage_preliminary_review.py --refresh-view 1.0` after a `--view-only` rebuild. [The stage gate](../../../docs/design-publication.md#the-stage-gate)

## Start the next version

```sh
python PLUGIN/scripts/stage_preliminary_review.py --copy-inputs 1.0 1.1
```

| Situation | What to do |
| --- | --- |
| An edit, fix or refinement of an in-progress design | Publish the same version again. It becomes the next draft |
| A change to an effective design, including a reservation that detailed design returned | The next minor version, such as `1.1` |
| A different architecture, or a start-over | The next major version, such as `2.0`, with its own name |

## Windows and CI

- The commands run unchanged in PowerShell and in Git Bash. Use forward slashes in every path you write into a file.
- Keep committed paths short. A deep folder plus a long file name passes the Windows path length and fails a clone.
- Write no drive letter or home folder into a script, a design file or a record.
- The project's CI runs on Linux and runs only the project's own scan and site check. Run `node PLUGIN/scripts/design-publication.mjs check .` before every push.
- A project may depend on the design library. Whether its own CI regenerates the solids is the project's choice; the reference CI does not.
- After a plugin update, the check keeps a review page that already exists. Delete `package-motion.html` in the design's folder and run the check with `--view-only` to take the new stock page.
- Write browser-check captures to a scratch folder outside the checkout.
