# Publish and check designs

A project publishes a design, changes its status or withdraws it in one reviewed pull request. One command checks everything the project publishes about its designs, and the project's CI runs it on every push to every branch.

```sh
node PLUGIN/scripts/design-publication.mjs check PROJECT
```

A project that still runs the earlier gates moves to this workflow with the [migration guide](design-publication-migration.md).

## What the check verifies

| Guarantee | How |
| --- | --- |
| The layout obeys the checked physics | The plugin's layout check is rerun from the committed inputs. It must end `layout-checked`: every clearance case, the inspection mass and every loaded-voltage case pass, and the displaced control is rejected. |
| The committed receipt is that check's result | The rerun's input digests and every verdict equal the committed receipt. |
| The review shows the checked numbers | The cases, results, displaced control, objectives, mass and duties in the review scene equal the receipt. |
| The design plays a mission task | The record names a mission case: a passing operating case in the checked cycle, for a narrative objective the receipt marks `represented`. A field-interaction trial must be one the receipt names. |
| A detailed design builds on an accepted layout | An in-progress detailed design names a preliminary release that is `effective`, its receipt is on the STEP its record names as the Fusion export, and it covers that release's motion cases, cycle and displaced control. |
| An effective detailed design passed its review | The design carries its mechanical-readiness review result, for the STEP its record names, and the review reports `pass`. |
| One status per design, one primary view | Each index holds `in-progress`, `effective`, `superseded` or `withdrawn` for each design, at most one `effective`, and the primary view computed from the statuses. |

The rerun compares digests and verdicts. The digests are the ones the layout check read and wrote into the receipt: the plan, the STEP, the motion study, the budgets and limits, and each trial a stage names. A plan [names its files by path](preliminary-design.md#name-files-by-path) and needs no typed hash for this, and an input that changed since the committed receipt still shows as a differing digest. It does not compare measured values digit for digit, because a CAD kernel on another operating system can round them differently.

The check reads data. It does not inspect page markup, compare a page with the stock page or require any wording. A project may change its copy of the review page, the release index page and the design catalog. The pull request shows every change to them.

The check needs no approved baseline, repository variable, signing key or policy file. It reads the branch as pushed.

## Which designs are checked

A design that is `in-progress` or `effective` is checked and rerun, whatever else its record or the index says about it. A `superseded` or `withdrawn` design is history: it is not rerun. A withdrawn design drops its published files; Git keeps them.

The check reads these folders. Pass the option to use another.

| Option | Default | Holds |
| --- | --- | --- |
| `--site` | `docs` | The published site |
| `--preliminary` | `preliminary-design` | `releases.json` and `releases/ID/` inside the site. A release ID is a [version](#name-and-number-a-design), as in `releases/1.0/`. |
| `--detailed` | `detailed-design` | `designs.json` and `designs/ID/` inside the site. A design ID is a [version](#name-and-number-a-detailed-design), as in `designs/1.0/`. |
| `--inputs` | `cad/preliminary-design/releases` | `ID/layout.json` and every file it names, for each preliminary release |
| `--detailed-inputs` | `cad/detailed-design/designs` | The same, for each detailed design |

A release checked from the repository root, whose receipt names its view inside the inputs folder from there, is rerun from the repository root. The rerun cache and the changed-designs test read the inputs folder only, so keep every file the plan names inside it, or name a wider folder with `check.project`. One checked in its own folder is rerun in that folder.

A record can name its own inputs with `"check": {"project": "cad/robot", "plan": "layout.json"}`, both relative to the repository. `project` is the folder the layout check ran in and `plan` is the layout inside it. The staging commands below write this field.

A preliminary release must have its inputs committed. Without them the check fails, because nothing can be rerun. A detailed design whose Fusion export is not committed passes with a warning that says the layout check was not rerun.

If the receipt was checked against a held receipt with `--previous`, commit that held receipt inside the same inputs folder. The rerun finds it by digest.

## Design status

Each phase keeps one index: `releases.json` for preliminary design and `designs.json` for detailed design. The index holds a status for every design. [What each status means](design-phase-detail.md#design-status)

- The status lives in the index, never in a design's own record, so a status change does not rewrite published evidence.
- A status change is an index edit in a reviewed pull request. Git history records what the status was and who changed it.
- At most one design per phase is `effective`. The commands below mark the earlier one `superseded` in the same edit.
- The site opens the effective design, or the newest in-progress one when none is effective. The commands compute this, and the check fails an index that points elsewhere.

## Name and number a design

A design has a name, a version and a status, in preliminary design and in [detailed design](#name-and-number-a-detailed-design). The name says which architecture it is. The version says which accepted baseline of that architecture it is. The status says whether the project has accepted it, and stays separate from the number.

| Part | Meaning | Changes when |
| --- | --- | --- |
| Design name | The architecture, in words: a short name people can say | Never, for that architecture |
| Major | Which architecture generation the robot is on | The team starts over or selects a different architecture |
| Minor | Which effective baseline of that architecture | A revision is accepted as effective |
| Draft | Work in progress toward the next baseline | Every in-place publish; it is not part of the version |

The release ID is the version, `MAJOR.MINOR`. A design reads "Tilting carriage 1.0 · effective". Work toward the next baseline reads "Tilting carriage 1.1 · draft 3 · in progress". The folders are `cad/preliminary-design/releases/1.0/` and `docs/preliminary-design/releases/1.0/`.

**Drafts do not consume numbers. A new number is only for a new effective baseline or a new architecture.**

Three examples follow one invented design.

1. **First effective design.** The team stages `1.0` and names it "Tilting carriage". Each publish while it is in progress is a draft of 1.0: draft 1, draft 2, draft 3. The pull request that marks it effective makes it "Tilting carriage 1.0 · effective". Everything before that was "1.0 draft N".
2. **Accepted revision.** The carriage needs a longer stroke. The team stages `1.1`, which reads "Tilting carriage 1.1 · draft 1 · in progress" while 1.0 stays effective. When 1.1 is marked effective, 1.0 becomes superseded automatically.
3. **Start-over.** The team drops the carriage for an arm. The different architecture is `2.0` with its own name, and starts at "Swinging arm 2.0 · draft 1 · in progress".

```sh
python cad/preliminary-design/stage.py 1.0 --design-name "Tilting carriage"
python cad/preliminary-design/stage.py 1.0
python cad/preliminary-design/stage.py --set-status 1.0 effective --readiness PLUGIN/scripts/effective-readiness.mjs
python cad/preliminary-design/stage.py 1.1
python cad/preliminary-design/stage.py --set-status 1.1 effective --readiness PLUGIN/scripts/effective-readiness.mjs
python cad/preliminary-design/stage.py 2.0 --design-name "Swinging arm"
```

Start the next version from the inputs of the last one with `python cad/preliminary-design/stage.py --copy-inputs 1.0 1.1`. It copies the release folder, writes each pin that names the folder with the new path and digest, and leaves the page, scene and receipt for the layout check to write. Edit the design there, run the check and stage `1.1`.

Give `--design-name` the first time a major number is staged. Staging refuses a new major number without it and does not ask again. The index holds the name once for each major number, under `designs`:

```json
{
  "releases": ["1.0", "1.1"],
  "designs": {"1": {"name": "Tilting carriage"}},
  "designStatus": {"1.0": "effective", "1.1": "in-progress"},
  "accepted": {"1.0": "DATE"},
  "revision": {"1.0": {"number": 3, "date": "DATE", "commit": "COMMIT"}, "1.1": {"number": 1, "date": "DATE", "commit": "COMMIT"}},
  "current": "1.0"
}
```

`revision` holds the draft count of each release: its `number` is the "draft N" shown while the release is in progress. An effective release shows no draft number. The index page shows the date it was accepted and the commit it was staged from.

Staging guides the order of versions. It refuses only what the index cannot hold.

| Staged | Result |
| --- | --- |
| The version after effective `M.N` | `M.(N+1)` for the same architecture, or the next major number at `.0` for a different one. `--set-status ID effective` prints both. |
| A second in-progress version of one architecture | Refused. Revise the existing draft in place. |
| A version behind one already listed for its architecture | Refused. |
| A different name for a major number that has one | Refused. Correct a spelling by editing `designs` in the index, in a pull request. |
| A skipped number, or a first version that is not `.0` | Staged, with a note that names the expected version. |

The index page lists the effective design and each in-progress version first, then earlier baselines and withdrawn designs under "Earlier". Title the README still, its caption and any link to the review with the name and version, as in "Tilting carriage 1.0, preliminary design". Leave the draft number out of file names and titles, so a new draft replaces the still without a rename.

An ID issued before versions, such as `layout-002`, keeps working in staging, in-place revision, status changes and the check. It has no name and reads as its ID. [Rename a release to a version](design-publication-migration.md#rename-a-release-to-a-version)

### Name and number a detailed design

A detailed design takes the same name as the preliminary design it is built on, and its own `MAJOR.MINOR`.

| Part | Meaning for a detailed design |
| --- | --- |
| Design name | The architecture's name, the same words as its preliminary design |
| Major | The architecture. It equals the major number of the preliminary design it is built on. |
| Minor | Which detailed effective baseline of that architecture. The first effective detailed design is `1.0`; a later accepted revision is `1.1`. It counts separately from the preliminary minor. |
| Draft | Work in progress toward the next detailed baseline. Staging the same ID again counts it; it takes no number. |

The catalog reads "Tilting carriage 1.0 · effective", with "Built on preliminary design Tilting carriage 1.1" beneath it. Work toward the next baseline reads "Tilting carriage 1.1 · draft 3 · in progress". The staged review page shows the same name, draft and status. The folders are `cad/detailed-design/designs/1.0/` and `docs/detailed-design/designs/1.0/`.

```sh
node PLUGIN/scripts/detailed-design-release.mjs stage . --design 1.0 --inputs cad/detailed-design/designs/1.0 --preliminary 1.0 --authority cad/fusion-authority.json --lineage cad/lineage.json
node PLUGIN/scripts/detailed-design-release.mjs relink . --design 1.0 --preliminary 1.1
node PLUGIN/scripts/detailed-design-release.mjs effective . --design 1.0 --readiness cad/detailed-design/readiness-result.json
node PLUGIN/scripts/detailed-design-release.mjs copy-inputs . --from 1.0 --to 1.1
node PLUGIN/scripts/detailed-design-release.mjs stage . --design 1.1 --inputs cad/detailed-design/designs/1.1 --preliminary 1.1 --authority cad/fusion-authority.json --lineage cad/lineage.json
```

`stage` reads the name from the preliminary release index. Give `--design-name "NAME"` only when that index has no name for the major number, as when the preliminary release keeps an earlier ID. The detailed index holds the name once for each major number under `architectures`, because its `designs` field is the list of IDs.

| Staged | Result |
| --- | --- |
| The same in-progress ID again | The next draft, in place. Unchanged files count nothing. |
| A second in-progress version of one architecture | Refused. Revise the existing draft in place. |
| An ID that is effective, superseded or withdrawn | Refused, with the next minor version named. |
| A major number other than the preliminary design's | Refused. A different architecture is the next major number with its own name. |
| A name other than the preliminary design's, or a second name for a major number | Refused. |
| A version behind one already listed for its architecture | Refused. |
| A skipped number, or a first version that is not `.0` | Staged, with a note that names the expected version. |

An in-progress detailed design links an effective preliminary release. When the next preliminary baseline is accepted, say `1.1`, re-link the draft with `relink --preliminary 1.1`. It keeps its ID, its files and its draft count. The command refuses when the design's layout check does not cover the motion cases, cycle and displaced control of that release: rerun the check on them and stage the same ID with `--preliminary 1.1` instead. An effective detailed design is not re-linked. Work on a newer preliminary baseline is the next detailed minor version.

Marking a new minor effective supersedes the previous one in the same edit and records the date it was accepted. `supersede --design ID` marks an in-progress design the team has left as superseded and keeps its files.

A design ID issued before versions, such as `detail-003`, keeps working in every command and in the check. It has no name and reads as its ID. [Rename a detailed design to a version](design-publication-migration.md#rename-a-detailed-design-to-a-version)

## Publish a preliminary design release

Keep the release's checked inputs in the repository at `cad/preliminary-design/releases/ID/`: the layout, its STEP and motion study, the budgets and limits, the review page and scene written by `--write-view` (or rebuilt by [`--view-only`](preliminary-design.md#rebuild-the-review-without-rerunning-the-cases) after a presentation edit), the `layout-checked` `receipt.json` and a `missions.json` that names at least one mission case. The project's `cad/preliminary-design/stage.py` is its copy of the plugin's [staging script](../templates/stage-preliminary-review.py).

```sh
python cad/preliminary-design/stage.py 1.0 --design-name "Tilting carriage"
node PLUGIN/scripts/design-publication.mjs check . --skip-rerun
```

Staging copies the review page as it is, the scene, receipt, motion, budget and limit files, each field player the scene links and each trial a mission case names into `docs/preliminary-design/releases/ID/`. It writes the release record and lists the release as `in-progress`, at draft 1. The ID is the [version](#name-and-number-a-design), and the name is given once.

### Revise an in-progress release in place

One version keeps one release ID. An edit to an in-progress version is a draft of it, not a new release:

```sh
node PLUGIN/scripts/design.mjs preliminary-check . cad/preliminary-design/releases/1.1/layout.json --write-view --output cad/preliminary-design/releases/1.1/receipt.json
python cad/preliminary-design/stage.py 1.1
```

Edit the inputs in the release's own folder, rerun the check there and stage the same ID. Staging replaces the published page, scene, receipt and evidence, and counts the draft in the index: `"revision": {"1.1": {"number": 4, "date": "DATE", "commit": "COMMIT"}}`, where the commit is the one the checkout was at. The picker and the review page show it as "draft 4". The picker gains no entry, and the publication check reruns the layout check on the revised inputs. Staging unchanged files counts nothing. Push each draft to publish an in-progress design as it develops; Git keeps the earlier bytes.

| Situation | What to do |
| --- | --- |
| An edit, fix or refinement of an in-progress design | Stage the same version again. It becomes the next draft. |
| A change to an effective design | The next minor version, such as `1.1` after `1.0`. |
| A different architecture or concept | The next major version, such as `2.0`, with its own name. |

A release stops changing when it is marked `effective`, and stays unchanged as `superseded` or `withdrawn`: staging its ID is refused. When a new release replaces an in-progress one that was never accepted, mark the old one `superseded` with `python cad/preliminary-design/stage.py --set-status OLD-ID superseded`. It keeps its record in the index and opens from a link that names it, and the picker lists it no longer. The picker lists a superseded release only when the index holds the date it was accepted, under `accepted`, which `--set-status ID effective` records.

```json
{
  "schema": "agent-frc/preliminary-release@1",
  "release": "1.0",
  "issue": "synthetic-package-1.0",
  "phase": "preliminary-design",
  "check": {"project": "cad/preliminary-design/releases/1.0", "plan": "layout.json"},
  "missionCases": [
    {"case": "release", "kind": "operating-case", "accomplishes": "delivered", "objective": "Acquire, turn and release"}
  ],
  "fieldPlayers": [
    {"file": "field/release-lane.html", "trial": {"file": "release-lane-trial.json"}, "objective": "Acquire, turn and release"}
  ]
}
```

A mission case names a passing operating case, what it accomplishes (`acquired`, `delivered`, `scored` or `climb-held`) and a narrative objective the receipt marks `represented`. For a contact-transport, free-path or fixture-support trial use `"kind": "field-interaction-trial"` with `"trial": {"file": "acquire-trial.json"}`, or `"player": "field/release-lane.html"` for a trial shown by a field player. The trial must be one the receipt names for that case. The record carries no digest of its sibling files: they are committed together, and the check compares their content.

Change a status in the same way, in a pull request:

```sh
python cad/preliminary-design/stage.py --set-status 1.0 effective --readiness PLUGIN/scripts/effective-readiness.mjs
python cad/preliminary-design/stage.py --set-status 2.0 withdrawn --reason "The carrier moved to the other side."
```

`--copy-inputs FROM TO` copies a release's inputs to a new release folder with their pins written for the new paths. `--remove ID` deletes a release's two folders and its index entry, and leaves no redirect. It is the last step of [renaming a release to a version](design-publication-migration.md#rename-a-release-to-a-version). It refuses a release that is or was effective unless `--replaced-by NEW` names the effective release checked on the same STEP.

## Publish a detailed design

Export the STEP from the registered Fusion design. Run the [layout check](preliminary-design.md) on a layout that names that STEP and repeats the motion cases, cycle and displaced control of the effective preliminary release. Keep the inputs, receipt and `missions.json` in the repository at `cad/detailed-design/designs/ID/`.

```sh
node PLUGIN/scripts/detailed-design-release.mjs stage . --design 1.1 --inputs cad/detailed-design/designs/1.1 --preliminary 1.0 --authority cad/fusion-authority.json --lineage cad/lineage.json
node PLUGIN/scripts/detailed-design-release.mjs effective . --design 1.1 --readiness cad/detailed-design/readiness-result.json
node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design draft-001 --reason "Rough draft published before the design-status process."
node PLUGIN/scripts/detailed-design-release.mjs refresh .
```

The design ID is a [version, and the design takes the name of its preliminary design](#name-and-number-a-detailed-design).

| Command | What it writes |
| --- | --- |
| `stage` | `docs/detailed-design/designs/ID/` with the review files and `design.json`, listed as `in-progress` at draft 1. Staging the same in-progress ID again replaces the files and counts the next draft. It replays the Fusion authority register and lineage with `fusion_authority.py` and refuses a receipt on any other STEP. It leaves the site as it was when the publication check would fail the design. |
| `relink` | The preliminary release an in-progress design is built on, in `design.json` and the index. The design keeps its ID, files and draft count. |
| `effective` | `designs/ID/readiness.json`, a copy of the review result, the status `effective` and the date under `accepted`. The earlier effective design becomes `superseded`. A design that was never shown in progress gets its record from the review; give `--design-name` when its major number has no name yet. A review that does not report `pass` is refused. |
| `supersede` | The status `superseded` for an in-progress design that a newer one replaced before it was accepted. `--by ID` records which. |
| `copy-inputs` | `cad/detailed-design/designs/TO/`, a copy of the inputs of `FROM` with each pin that names the folder written for the new path. The page, scene and receipt are left for the layout check to write. |
| `remove` | Nothing: it deletes a design's published folder, inputs folder and index entry, and leaves no redirect. A design that is or was effective needs `--replaced-by ID`, the effective design of the same STEP. |
| `withdraw` | The status `withdrawn` with the reason. See [Withdraw a design](#withdraw-a-design). |
| `refresh` | `current` and `beside` recomputed after a hand edit, and the stock catalog page when the tree has none. |

Each command only edits files. The pull request and the check decide whether they merge.

```json
{
  "schema": "agent-frc/detailed-design-index@1",
  "preliminaryIndex": "../preliminary-design/releases.json",
  "current": "1.0",
  "beside": "1.1",
  "designs": ["draft-001", "1.0", "1.1"],
  "architectures": {"1": {"name": "Tilting carriage"}},
  "designStatus": {"draft-001": "withdrawn", "1.0": "effective", "1.1": "in-progress"},
  "reason": {"draft-001": "Rough draft published before the design-status process."},
  "lastCommit": {"draft-001": "<commit that last held its published files>"},
  "preliminary": {"1.0": "1.0", "1.1": "1.0"},
  "revision": {"1.0": {"number": 4, "date": "DATE", "commit": "COMMIT"}, "1.1": {"number": 2, "date": "DATE", "commit": "COMMIT"}},
  "accepted": {"1.0": "DATE"}
}
```

`revision` holds the draft count of each design: its `number` is the "draft N" shown while the design is in progress. `accepted` holds the date a design became effective.

`current` is the effective design, else the newest in-progress one. `beside` is the newest in-progress design while another is effective. The effective design holds the project's primary view: the entry page and the README still show it and link to its review. An in-progress design shows beside it, labelled, and takes the primary view only when no design is effective. Update the entry page and README in the pull request that changes the status.

### One viewer for one design

A detailed design has one viewer: the design review page that `stage` publishes at `docs/detailed-design/designs/ID/`. It is the review the layout check wrote for the Fusion export, with the model, the checked motion cases, the mission cases and the component inspector. The same page serves the design while it is in progress and after it is effective. Under `designs/ID/` it reads `designs.json` and titles itself "Detailed design review", with the design's name, draft, status and the preliminary design it is built on. `stage` copies the page's theme fonts to `docs/detailed-design/fonts/` when that folder is missing.

Everything else links to that page and embeds no model of its own.

| Page | What it does |
| --- | --- |
| The catalog `docs/detailed-design/index.html` | Links the review of the effective design and of each in-progress one. |
| The README still | Shows the picture and links the review. [Keep the README still current](cad-color-convention.md#keep-the-readme-still-current) |
| The results page from `robot-highlights.mjs` | Shows the still, results, build sheet and films, and links the review. |

Stage a design in progress before it becomes effective, so the effective design has its review page. `effective` still records a design that was never staged from its review result; the catalog then says that no design review is staged for it. [What was retired, and what a project that published the earlier viewers does](design-publication-migration.md#move-to-one-viewer)

When the preliminary release that an in-progress detailed design names is superseded, the design stays published and the check adds a warning. [Re-link it](#name-and-number-a-detailed-design) to the effective preliminary release with `relink`, or stage it again on that release when its motion cases changed.

## Effective designs

A design becomes effective when a reviewed pull request changes its status in the index. No signature is involved. The reviewer accepts the design by merging the pull request, and the check prints the evidence in the log and in the run summary.

- **Preliminary.** The check prints the [effective-readiness report](preliminary-design.md#judge-readiness-to-be-marked-effective) for the release's inputs, titled with the design name and version. The report is informational: the check does not fail on it.
- **Detailed.** The design carries the result of the [mechanical-readiness review](mechanical-readiness.md) as `designs/ID/readiness.json`. Save the output of `mechanical_readiness.py review` and pass it to `effective`. It must be a review of the STEP the design record names, and it must report a showcase eligibility of `pass`. A review with any other verdict fails the check, so the design stays in progress until the findings are resolved. The check prints the build readiness, the showcase eligibility and each finding that does not pass.

### A change to an effective design

An effective design was accepted with the files it had in that pull request. When a later branch edits the committed inputs or the published folder of a design that was already effective where the branch left the default branch, the check adds a warning that names the folders. The warning does not fail the check. The rerun still has to reproduce the committed receipt. Treat the warning as a prompt for the reviewer: accept the change as a revision of the effective design, or publish it as the next minor version and make that one effective.

The pull request that makes a design effective raises no warning for that design.

## Withdraw a design

Withdrawing is one pull request. Run the command with the reason, update the entry page, README and selector for the new primary view, and open the pull request.

```sh
python cad/preliminary-design/stage.py --set-status 2.0 withdrawn --reason "The carrier moved to the other side."
node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design draft-001 --reason "Rough draft published before the design-status process."
```

- The index keeps the design's ID, the status `withdrawn`, the reason under `reason` and, under `lastCommit`, the last commit that changed its published folder.
- The published folder leaves the site. Nothing is archived on the site. Read the files with `git show COMMIT:docs/detailed-design/designs/ID/design.json`, or check that commit out.
- The committed check inputs under `cad/` stay.
- The stock index and catalog pages list the design as withdrawn, with its reason and the commit.
- The check adds a warning when a withdrawn design has no reason in the index.

The check requires no declaration before a withdrawal. A model published before this workflow has no entry in `designs.json`. Give it an ID and name its published files:

```sh
node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design draft-001 --reason "Rough draft published before the design-status process." --files docs/models/robot.glb,docs/media/robot-still.png
```

The command removes those files, lists the design first in the index as `withdrawn` and records the last commit that changed them.

## Keep the rerun fast

Some layouts take half an hour to check. The workflow keeps that off most runs.

- **Cache.** A rerun that passed is stored under one digest of every file in the design's inputs folder and the plugin version. Change any input and the design is rerun. Pass the folder with `--cache`; the workflow restores it, and saves it even when another step fails. A cached result is still compared with the committed receipt.
- **Changed designs only.** With `--base COMMIT`, a design with no cached result is rerun only when its inputs, published folder or index changed since that commit. The workflow passes the point where a feature branch left the default branch. A change to a workflow file reruns every design without a cached result, because a pin may have moved. On the default branch the workflow passes no base, so a rerun that failed there is repeated until it passes.
- **Budget.** `--budget-minutes` stops one rerun that runs too long, 45 minutes by default. The rerun stops at the first clearance case that does not pass. It shares the motion cases between worker processes, one fewer than the runner's cores unless `--jobs N` sets the number.
- **Physics only.** The rerun uses `--physics-only`, which skips building the review scene. A receipt from such a run is marked and cannot be published.

A new design is rerun twice: once on its branch and once on the default branch after the merge, because GitHub does not share a branch's cache with the default branch. The site deploys after the second run. Changing the plugin pin or the kernel versions empties the cache, so every in-progress and effective design is rerun once.

Run the same command before pushing. `--skip-rerun` checks everything except the rerun when the layout check has just run locally.

## Set up the workflow

Copy [the workflow](../templates/design-publication.yml) to `.github/workflows/design-publication.yml`.

1. Set `AGENT_FRC_REF` to the plugin release the project uses. This line is the only plugin pin. Change it by pull request.
2. Set `PYTHON_VERSION`, `OCP_VERSION` and `NUMPY_VERSION` to the versions the project checks with locally.
3. For a site served from the `docs` folder of the default branch, delete the upload step and the `deploy` job.
4. Require the **Design publication** and **Paths and secrets** checks on the default branch.

The workflow runs on every push to every branch, so a pull request shows the result for its latest commit. It needs no repository variable.

- **Paths and secrets** runs the [branch scan](project-ci.md#scan-every-pushed-branch).
- **Design publication** runs this check, then the project's [registered checks](project-ci.md#choose-the-checks).
- **deploy** publishes the site from the default branch after both pass. A failed check leaves the current site online.

The check reads the branch as pushed, not its merge with the default branch. Rebase before merging; the default branch is checked again after the merge and before the site deploys.

## What the check does not do

- It does not open Fusion. `stage` replays the Fusion export lineage on the workstation that has the archive.
- It does not compare the tessellated display solids with the STEP.
- It does not verify that an animation shows what a mission case says it accomplishes. The reviewer of the pull request watches it.
- It does not judge the effective-readiness report of a preliminary release. The reviewer does.
