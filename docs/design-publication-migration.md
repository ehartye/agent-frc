# Move a project to its own CI and the one publication check

This guide moves a project from any earlier layout to the current one. The current layout has three parts:

- The project runs [CI that belongs to it](project-ci.md): a path and secret scan, a site check and publishing. It runs no design check.
- The coding agent runs the [publication check](design-publication.md) before a push, and the stage gate when a design is marked effective.
- [Project code never runs plugin code](testing-methodology.md#the-plugin-is-a-tool-of-the-coding-agent-not-a-dependency-of-the-project). No project file names, pins, checks out, copies or calls the plugin.

Do the move in one pull request per project, in this order. Finish any release or withdrawal that is half way through an old process inside this pull request, with the current commands.

1. [Commit the design inputs](#commit-the-design-inputs).
2. [Take the plugin out of the project](#take-the-plugin-out-of-a-project).
3. [Tidy the two indexes](#tidy-the-two-indexes).
4. [Compare the live site with the folder](#compare-the-live-site-with-the-folder), when the way the site is published changes.
5. [Write the project's CI and run the checks](#write-the-projects-ci-and-run-the-checks).
6. [Delete the old gate files](#delete-the-old-gate-files).
7. [Change the repository settings](#change-the-repository-settings). The owner does this.
8. [Check the result](#check-the-result).

After the move, each of these is one reviewed pull request with no admin merge, no approval advance and no repository variable edit: publish a preliminary design, [withdraw a design](#withdraw-a-design-in-one-pull-request), show an in-progress detailed design, mark a detailed design effective.

## Commit the design inputs

The stage gate reruns the layout check on the committed design when a design is marked effective, so every file the layout check reads must be in the repository. The repository holds everything the design needs. Make the repository private if the season's work is private.

For each preliminary release that is `in-progress` or `effective`, commit its inputs at `cad/preliminary-design/releases/ID/`:

- `layout.json` and every file it names: the STEP, the motion study, the budgets and limits, any fixture STEP and each trial file a stage or field interaction names.
- The held receipt, when the release was checked with `--previous`.
- `missions.json`, the review page and `receipt.json`. The starter's `.gitignore` keeps the input-side `review-scene.json.gz` out of the repository; the published copy is the committed one.

For each detailed design that is `in-progress`, commit the same files at `cad/detailed-design/designs/ID/`, with the STEP exported from the registered Fusion design. Commit the Fusion archive, authority register and lineage too.

Then:

- Delete any custody file, withheld-file list or recorded hash that stands in for a file kept elsewhere. Commit the file.
- Stop ignoring the folder that holds the canonical Fusion archives. Use Git LFS for a file over the host's size limit, and set `lfs: true` on the checkout step of the project's workflow.
- Write paths relative to the repository in every builder and receipt. Run the [path and secret scan](project-ci.md#the-path-and-secret-scan) before the first push, because a machine path or credential is public as soon as its branch is pushed.
- Leave out third-party material whose licence forbids redistribution, and link to its publisher.

A superseded or withdrawn release needs no inputs. It is not rerun.

If a release's inputs sit in another folder, or its plan has another name, add `"check": {"project": "FOLDER", "plan": "FILE.json"}` to its `release.json` or `design.json`, relative to the repository. `project` is the folder the layout check ran in.

## Take the plugin out of a project

Until this step is done, the publication check fails with one message that names the files it found.

1. Run the [audit](project-ci.md#audit-the-project-for-use-of-the-plugin). It lists every project file that runs or imports plugin code, in any folder, with the line and the form of each use.

   ```sh
   node PLUGIN/scripts/project-ci-audit.mjs .
   ```

2. Before deleting a workflow, search for code that reads it. A project builder may read a plugin pin, a version or a job name out of the workflow file. It fails, or records nothing, once the file is gone.

   ```sh
   git grep -n -E "github/workflows|_REF|_SHA" -- "*.py" "*.mjs" "*.js" "*.sh" "*.ps1"
   ```

   Remove each such read. A builder records what it built from the project's own files.
3. Delete every workflow that names the plugin: a design publication workflow, a branch scan or project checks workflow that checks the plugin out, a reusable `project-checks.yml`, a showcase or review Pages workflow, and any step that checks out an approved commit or a builder or verifier pin.
4. Delete the project's copies of plugin commands. The agent runs each from the plugin, from the project root.

   | Delete from the project | The agent runs |
   | --- | --- |
   | `cad/preliminary-design/stage.py` | `python PLUGIN/scripts/stage_preliminary_review.py` |
   | `cad/preliminary-design/serve.py` | `python PLUGIN/scripts/serve_preliminary_review.py` |
   | `cad/preliminary-design/pages-workflow.yml` | Nothing. The project's workflow is `.github/workflows/ci.yml` |
   | `scripts/prepare-showcase-release.mjs` | Nothing. The site is the committed `docs/` folder |

5. Clear each remaining file the audit lists. Replace the use with the project's own code, or delete the file. A design builder that still imports the plugin's measuring modules stays until the shared `frc-design-kernel` library replaces them: declare it in `.project-ci-audit.json` with that reason, and the audit lists it on every run.
6. Run `node PLUGIN/scripts/project-layout.mjs agents .` to refresh the Design checks block in the project's `AGENTS.md`. It replaces a block between the earlier marker lines, which named the plugin, with one that does not.

The review page, the release index page and the design catalog under `docs/` are the project's own files. Copy a newer `templates/preliminary-review-index.html` or `templates/detailed-design-index.html` over them only when the project wants the change. Nothing compares them with the stock pages.

No design is restaged and no receipt changes. A design that is already effective needs no `gate.json`. The next design to be marked effective gets one from the command that marks it.

## Tidy the two indexes

Open `docs/preliminary-design/releases.json` and `docs/detailed-design/designs.json`.

- Delete `effectiveHistory` and `legacy` from `releases.json`. Git history records every status a release has held.
- Give every listed design a status under `designStatus`. A design the site no longer shows is `superseded` when a later design replaced it and `withdrawn` otherwise.
- Mark each in-progress release that a later release replaced `superseded`, so the picker lists one entry per design. For a superseded release that was once effective, add the date it was accepted under `accepted`, as in `"accepted": {"layout-001": "DATE"}`, so it stays listed. From here on, [revise an in-progress release in place](design-publication.md#revise-an-in-progress-release-in-place) and do not take a new ID for an edit. New releases take a [version as their ID](design-publication.md#name-and-number-a-design); an existing ID keeps working, and can be [renamed to a version](#rename-a-release-to-a-version).
- Give every withdrawn design a reason under `reason`. Add `lastCommit` when the commit that last held its files is known.
- Delete each on-site archive of a withdrawn design, such as `docs/detailed-design/archive/`, and any archived copy of an earlier README kept only to satisfy a pin. Git keeps those files. Remove links to them.
- Delete each published folder of a withdrawn design.
- Run `node PLUGIN/scripts/detailed-design-release.mjs refresh .` to recompute `current` and `beside`.

Existing release and design records keep working. The check ignores the digests, labels and `status` field that the earlier staging wrote. Stage a release again only to change its files.

An effective detailed design needs its mechanical-readiness review result at `docs/detailed-design/designs/ID/readiness.json`. A design that was made effective by a signed packet has none yet: run the review, save its output and run `detailed-design-release.mjs effective` in this pull request, or list the design as `in-progress` until the review passes.

## Compare the live site with the folder

Do this when the site moves from a build step to publishing the committed `docs/` folder. A folder is published whole. A file that the old build left out is published as soon as the folder is, and a page that the old build generated is gone unless it is in the folder.

1. List what is live. Download the artifact of the last Pages deployment and list it.

   ```sh
   gh run list --workflow NAME --branch main --status success --limit 1
   gh run download RUN_ID --name github-pages --dir ../live-site
   tar -tf ../live-site/artifact.tar | sed "s|^[.]/||" | grep -v "/$" | sort > ../live-files.txt
   ```

2. List the folder and compare.

   ```sh
   git ls-files docs | sed "s|^docs/||" | sort > ../folder-files.txt
   comm -13 ../live-files.txt ../folder-files.txt
   comm -23 ../live-files.txt ../folder-files.txt
   ```

   The first `comm` prints what is in the folder and not live: files that would be published for the first time. The second prints what is live and not in the folder: files that would disappear.
3. Decide every line of the first list. Delete a withdrawn viewer, an old model or a draft that was never published from the folder. Git keeps it.
4. For every line of the second list that should stay, take the file from the live site. Extract it from `artifact.tar` into `docs/` and commit it. Do not rebuild a frozen generated page: a rebuild is not the page that was reviewed, and one adopter's rebuild wrote the build machine's paths into it.
5. Run the scan on the result, then the publication check. Its [advice](design-publication.md#published-files-that-nothing-links-to) lists what the folder still holds that nothing links to.

## Write the project's CI and run the checks

1. [Write the project's CI](project-ci.md#write-the-projects-ci) from `templates/project-ci/`: `ci.yml`, `scan.mjs` and `site-check.mjs`. Keep one workflow that deploys Pages.
2. Turn each project test that ran through `tests/ci.json` into a step of that workflow that runs the project's own command. Nothing in the project's CI reads that file.
3. Commit the workflow and lint it before the first push, as [Write the project's CI](project-ci.md#write-the-projects-ci) describes.
4. Run the audit and the publication check.

   ```sh
   node PLUGIN/scripts/project-ci-audit.mjs .
   node PLUGIN/scripts/design-publication.mjs check .
   ```

The publication check reads the records, scenes and indexes in seconds and runs no layout check. Fix every error before deleting anything in the next step. A receipt that is not of the committed files is named: run the layout check on the committed inputs, stage the release again and review the difference.

## Delete the old gate files

| Delete | It was |
| --- | --- |
| `.github/showcase-release.json` | The release register with `approvedSiteSha256` |
| The station configuration, such as `.github/showcase-station.json`, and any `station.json` | The trusted station config and its pinned hash |
| The source and staged policy files that `sourcePolicy` and `stagePolicy` named | `modelFiles`, `publicRoots`, `preliminaryReleases`, `preliminaryInputs`, `detailedDesigns`, `withdrawn`, `catalogSha256`, `catalogFiles`, `presentations`, `preliminaryReadmeArchive`, `preliminaryReadmeLink`, `secondaryLink`, `mutableFieldPages`, `mutableFieldData` |
| The signed packets that `sourcePacket` and `stagePacket` named | Signatures over the delivered files |
| The reviewer public key file, if committed | The signature verification key |
| `scripts/prepare-showcase-release.mjs` | The build adapter for the approved site |
| A served-file inventory, such as `served-docs.json` | The whole-site freeze |
| A project content guard that holds a binary hash allowlist | Replaced by the project's `scripts/ci/scan.mjs` |
| A project script that only checks a README still, link line or page against a pinned hash | A page pin. `cad-readmes.py` without options [checks the still by its block, image and caption](cad-color-convention.md#keep-the-readme-still-current) |
| A project script that only keeps the `sha256` values of a layout plan and its records in step | Typed hashes. A plan [names its files by path](preliminary-design.md#name-files-by-path) |
| `.gitattributes` rules that exist only to keep pinned pages, stills and archives byte-exact | Support for the pins |
| A one-time exception coded into a project gate script | Already used |

Search the project for what is left:

```sh
git grep -n -E "approvedCommit|approvedSiteSha256|FRC_APPROVED_MODEL_COMMIT|FRC_ACTIVE_MODEL_SELECTION|FRC_REVIEWER_PUBLIC_KEY|signedPacket|staged-model-policy|public-model-policy|local-showcase-release|public-model-release|preliminary-release\.mjs|check-index|effectiveHistory|catalogSha256|readmeSha256"
```

Each match is a file to delete, a test step to remove from the project's workflow or a sentence to rewrite in the project's own instructions.

In a showcase or highlights manifest that set `mechanicalReadiness` to `{"signedPacket": …}`, set it to `{"reviewResult": "docs/detailed-design/designs/ID/readiness.json"}`.

## Change the repository settings

The repository owner does this step. The agent lists what to change and does not change repository settings itself.

Delete these repository variables after the pull request merges and the default-branch run is green. A variable that stays does not affect the new workflow, but it documents a process that no longer exists.

| Variable | It was |
| --- | --- |
| `FRC_APPROVED_MODEL_COMMIT` | The approved-commit baseline |
| `FRC_MODEL_VERIFIER_COMMIT` | A second plugin pin for the verifier |
| `AGENT_FRC_PLUGIN_SHA`, `AGENT_FRC_REF` | A plugin pin |
| `DESIGN_CHECK_RUNNER`, `DESIGN_CHECK_JOBS` | The runner and job count of the design check that CI used to run |
| `FRC_ACTIVE_MODEL_SELECTION`, `FRC_REQUIRE_ACTIVE_MODEL_SELECTION` | The active model selection |
| `FRC_REVIEWER_PUBLIC_KEY` | The signature verification key |
| `FRC_PAGES_LAYOUT` | The branch or built switch |
| `FRC_MODEL_PROJECT`, `FRC_MODEL_REVIEW_PUBLIC_KEY`, `FRC_VERIFIED_FIELD_ROOT`, `MECHANICAL_REVIEW_PLUGIN_SHA` | Builder and verifier settings |

```sh
gh variable list
gh variable delete NAME
```

In the branch protection of the default branch, remove every check an old workflow emitted, such as **Mechanical model eligibility**, **Design publication** and **Paths and secrets**. Require **Scan and site check**, the job of the project's own workflow. A required check that no workflow emits blocks every merge, so change the required checks in the same sitting as the merge.

The reviewer's private signing key is no longer used. Remove it from the workstation that held it.

The native station key is no longer used either. The mechanical-readiness review reads no key, signature or environment variable, and accepts each native observation as recorded. Remove the station key from the workstation that held it, and unset `FRC_NATIVE_WITNESS_PUBLIC_KEY`, `FRC_OPERATING_REQUIREMENTS` and `FRC_OPERATING_PROFILE` wherever a script or shell profile sets them. A `.native-signature.json` file beside an older native observation can stay or go. Nothing reads it.

## Check the result

- The pull request shows the project's own check, **Scan and site check**, green, with no admin merge.
- The audit's last line reports no file that runs or imports plugin code, or only the exceptions the project declared.
- `gh variable list` shows none of the variables above.
- The default-branch run after the merge scans, checks the site and deploys it. It runs no design check.
- The site opens the same primary view as before, each withdrawn design shows its reason, and no link points at a deleted archive.
- The list of live files equals the list of files in the folder.

## Rename a release to a version

A release published before 0.127.0 has an ID such as `layout-004`. It keeps working, and nothing forces a rename. To give it a [version](design-publication.md#name-and-number-a-design), publish the same design under the new ID and then remove the old one. The rename is clean: no redirect is left, and a link to `?release=layout-004` reports an unknown release afterwards.

Choose the version first. The design the project has accepted is `1.0`. A design that was never accepted is also `1.0`, still a draft. Earlier releases that were drafts of the same design take no number: remove them too, or leave them `superseded`.

Do the rename in one pull request.

1. **Rebuild the inputs in the new folder.**

   ```sh
   python PLUGIN/scripts/stage_preliminary_review.py --copy-inputs layout-004 1.0
   ```

   The command copies `cad/preliminary-design/releases/layout-004/` to `cad/preliminary-design/releases/1.0/`. The plan's `view` and every pin written from the repository root name the old folder, so it writes each of those pins with the new path and the digest of the copied file. It first verifies each pin against the old folder and refuses a stale one. The STEP keeps its bytes: its digest is what shows the design did not change. A held receipt keeps its bytes too. The page, scene and receipt are not copied, because they carry the old paths.
2. **Check.** Run the layout check on the new folder, so the page, scene and receipt are written with the new paths. Do not edit a receipt by hand.

   ```sh
   node PLUGIN/scripts/design.mjs preliminary-check . cad/preliminary-design/releases/1.0/layout.json --write-view --require-checked --output cad/preliminary-design/releases/1.0/receipt.json
   ```

3. **Stage under the new ID** and name the architecture.

   ```sh
   python PLUGIN/scripts/stage_preliminary_review.py 1.0 --design-name "Tilting carriage"
   ```

4. **Carry the status.** When the old release is effective, mark the new one effective. The old one becomes superseded in the same edit.

   ```sh
   python PLUGIN/scripts/stage_preliminary_review.py --set-status 1.0 effective
   ```

5. **Remove the old ID.**

   ```sh
   python PLUGIN/scripts/stage_preliminary_review.py --remove layout-004 --replaced-by 1.0
   ```

   The command deletes `docs/preliminary-design/releases/layout-004/` and `cad/preliminary-design/releases/layout-004/` and takes the ID out of every field of the index. For a release that is or was effective it requires `--replaced-by`, and it refuses unless that release is effective and its receipt names the same STEP digest. The new release then keeps the earlier accepted date. An in-progress release, or a superseded one that was never accepted, needs no `--replaced-by`.

6. **Update what named the old ID.** Stage an in-progress detailed design again with `--preliminary 1.0`; the command names each one. Change links, the README still caption and any project test that names the old folder.
7. Run `node PLUGIN/scripts/design-publication.mjs check .`, commit and open the pull request. The check matches a renamed effective release to the earlier ID by its [physics](design-publication.md#a-change-to-an-effective-design).

A changed design is not a rename. If the STEP differs, the old release stays in the index as superseded and the new design takes the next version.

## Rename a detailed design to a version

A detailed design published before 0.131.0 has an ID such as `detail-003`. It keeps working, and nothing forces a rename. To give it a [name and version](design-publication.md#name-and-number-a-detailed-design), publish the same design under the new ID and then remove the old one. No redirect is left: a link to `designs/detail-003/` no longer opens afterwards.

Choose the version first. The detailed design the project has accepted is `MAJOR.0`, where the major number is that of the preliminary design it is built on. One that was never accepted is also `MAJOR.0`, still a draft.

Do the rename in one pull request.

1. **Copy the inputs to the new folder.** The command verifies each pin that names the old folder and writes it for the new path. The STEP keeps its bytes.

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs copy-inputs . --from detail-003 --to 1.0
   ```

2. **Check.** Run the layout check in the new folder, so the page, scene and receipt are written with the new paths.

   ```sh
   node PLUGIN/scripts/design.mjs preliminary-check . cad/detailed-design/designs/1.0/layout.json --write-view --require-checked --output cad/detailed-design/designs/1.0/receipt.json
   ```

3. **Stage under the new ID.** The name comes from the preliminary release index. Add `--design-name "NAME"` when that index has none for the major number.

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs stage . --design 1.0 --inputs cad/detailed-design/designs/1.0 --preliminary 1.0 --authority cad/fusion-authority.json --lineage cad/lineage.json
   ```

4. **Carry the status.** When the old design is effective, mark the new one effective with the same review result. The old one becomes superseded in the same edit.

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs effective . --design 1.0 --readiness cad/detailed-design/readiness-result.json
   ```

5. **Remove the old ID.** For a design that is or was effective the command requires `--replaced-by`, and refuses unless that design is effective and its record names the same STEP digest.

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs remove . --design detail-003 --replaced-by 1.0
   ```

6. Change links, the README still caption and any project test that names the old folder. Run `node PLUGIN/scripts/design-publication.mjs check .`, commit and open the pull request.

A changed design is not a rename. If the STEP differs, the old design stays in the index as superseded and the new design takes the next version.

## Move to one viewer

From 0.132.0 a detailed design has [one viewer](design-publication.md#one-viewer-for-one-design), its design review page. The plugin no longer builds a separate orbit view, publishes an animated model beside it or embeds a model in the results page. Pages a project already published keep loading: they are static files in the project's site.

| The project has | What happens now | What to do |
| --- | --- | --- |
| `docs/robot/cad/index.html` from `cad-readmes.py --update` | The page stays and still opens. `--update` no longer rebuilds it. While it exists and no design review is published, the README still keeps linking to it. | Delete it and `assembly.stl.gz` once a design review is published, then run `--update`. |
| `cad-readmes.py --verify-export` or `--template` in CI | Accepted and ignored, with a note. | Remove the option. |
| A `cad` entry in the highlights manifest | The page shows the still and links the design review. It writes no `cad-…/` viewer folder; an earlier one stays until deleted. `receipt` is read only to find `assembly.png` beside it. | Optionally set `cad.still` and `cad.review`. Delete old `cad-…/` folders from the site. |
| `cad.playableGlb` or `inventory` in the highlights manifest | Ignored, with a note. | Remove the entry. |
| `mechanical_readiness.py … --deliver FILE` | Accepted and ignored, with a note. The `distribution` field of the study is no longer read. | Remove the option and the field. |
| `npm run viewer:controls` or `check-showcase-inventory.py` | Removed. | Remove the step. |
| `FRC_VERIFIED_FIELD_ROOT` | No longer read. A results page with images or films builds from the project alone. | Delete the variable. |

## Drop typed hashes, rights terms and outside custody on the detailed path

From 0.133.0 the detailed-design tools read files by path, as the preliminary check has since 0.128.0. Nothing has to change in a project: a typed `sha256` is still verified wherever one is written. To stop maintaining them, delete the `sha256` keys.

| Where | Before | Now |
| --- | --- | --- |
| Mechanical-readiness study and the records it names | `{"file", "sha256"}` on every reference | `{"file"}`. The review records the digests it read in its result |
| Motion study run by `mechanical_motion.py` on its own | Typed hashes required | Path only; an interface qualification record needs no `stepSha256` |
| Article roster in the commissioning plan | The printed SHA-256 typed beside the file | Path only. The result records `rosterSha256` |
| `checked_placement(app, archive, sha256, …)` and a fit record | The accepted archive digest typed twice | Pass `None`. The receipt records `acceptedSha256` |
| `cad/public-handoff.json` | Digests of the archive and the reopen receipt | Paths. The reopen receipt's own digest must equal the archive's |
| Highlights manifest sources, `stylesheet`, `fieldLab` | `sha256` on each | Path only |
| Restart plan evidence rows | `sha256` on each | Path only |
| Study `articles[].rights`, `rightsBasis` | Required for every part | Not read. Manufacturer, part number, source and revision stay required |
| Scope review `criteriaSha256` | Required | Compared when present |
| Study `distribution` and its `approvedBy` | Required for `--deliver` | Not read |
| Archive store of `design_iteration.py` | A folder outside the project, `--vault` required | `iterations/archive/` inside the project, committed. `--vault` optional |
| `native_handoff.py check PROJECT MANIFEST SHA256` | A digest sent through a separate channel | The digest argument is optional. Commit the inventory |

Move the files of an outside archive store into `iterations/archive/` and commit them. Delete any note that tells a teammate to fetch an archive from somewhere other than the repository.

## Withdraw a design in one pull request

1. Branch from the default branch.
2. Run the command with the reason.

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design detail-001 --reason "The lift changed to a two-stage carriage."
   python PLUGIN/scripts/stage_preliminary_review.py --set-status 2.0 withdrawn --reason "The carrier moved to the other side."
   ```

   For a model that was published before the design index existed, name its published files. The command removes them and lists the design:

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design draft-001 --reason "Rough draft published before the design-status process." --files docs/models/robot.glb,docs/media/robot-still.png
   ```

3. Update the entry page, the README and its still, and the model selector for the new primary view: the effective design, else the newest in-progress one, else a line that says no detailed design is published with a link to the current preliminary design.
4. Run `node PLUGIN/scripts/design-publication.mjs check .`, commit and open the pull request.

The index keeps the status, the reason and the last commit that changed the published files. The files leave the site and stay in Git. The pull request needs no declaration, no approval advance and no archive. A project whose build script emits the withdrawn model must stop emitting it in the same pull request.

## Move a design checked in its own folder to the repository root

Before plugin 0.117.0 a design's folder was itself the project the check ran in. Such a design keeps verifying: a check without `--write-view` still reads a page and scene at that project root, the publication check reruns it in its folder, and published versions do not change. The plugin's staging command publishes both forms and tells them apart by the view path in the receipt.

To check its next version from the repository root:

1. Prefix every `file` in `layout.json` and in the records it names (the motion study, budgets, premises, evidence and trials) with the design's folder. Delete the typed `sha256` keys while you are there, or refresh the ones you keep.
2. Set `view` to the page's path in the design's folder.
3. Drop any `relocations` entry and copied-in held file that existed only so a path resolved inside the folder. Name the held file where it lives in the repository. The held receipt itself stays in the design's folder.
4. Run the check from the repository root with `--write-view` and `--output`, then publish.

## What changed in which release

| Release | Change |
| --- | --- |
| 0.116.0 | One publication check replaced the release register, policy files, signed packets and approval variables. |
| 0.117.0 | A design is checked from the repository root. |
| 0.127.0, 0.131.0 | A design takes a version as its ID. |
| 0.132.0 | One viewer for one design. |
| 0.133.0 | The detailed-design tools read files by path. |
| 0.142.0 | The plugin left project CI. A project owns its workflow and two checks, and holds no copy of a plugin command. |
| 0.143.0 | The audit reads every folder and finds code that runs or imports plugin code. The publication check lists published files that nothing links to. |
| 0.144.0 | The layout check reads a design source and a judgement file and measures with the design library. Staging publishes the design source as `design.json` in place of `motion.json`, and the release record names `judgement.json` as the file the stage gate checks. Designs in the earlier format are staged and gated as before. |

These plugin files and options are gone. Nothing in a project should name them.

| Removed | In its place |
| --- | --- |
| `scripts/public-model-release.mjs` (`select`, `issue`, `verify`, `verify-pair`, `audit`, `audit-staged`, `check-selection`) | `design-publication.mjs check` |
| `scripts/local-showcase-release.mjs` (`check`, `digest`) | `design-publication.mjs check` |
| `scripts/preliminary-release.mjs` (`verify`, `verify-catalog`, `compare-template`) | `design-publication.mjs check` |
| `stage.py --check-index`, `--verifier` | `design-publication.mjs check` |
| `detailed-design-release.mjs` options `--policy`, `--packet` and a site folder as the first argument | The project folder as the first argument; `effective --readiness`, `withdraw --reason` |
| `templates/robot-showcase-pages.yml`, `templates/preliminary-review-pages.yml`, `templates/prepare-showcase-release.mjs` | The project's own workflow, written from `templates/project-ci/ci.yml` |
| `{"signedPacket": …}` under `mechanicalReadiness` in a showcase or highlights manifest | `{"reviewResult": "PATH"}`, the committed review result, or the study path as before |
| `templates/design-publication.yml` and the plugin workflow it called | `templates/project-ci/ci.yml`, which the project owns. The stage gate runs in the command that marks a design effective. |
| `templates/branch-scan.yml` | The scan step of `ci.yml`, running the project's `scripts/ci/scan.mjs` |
| `templates/project-checks.yml`, `templates/project-ci.yml` | Steps in the project's own workflow |
| `templates/stage-preliminary-review.py`, `templates/serve-preliminary-review.py` | `scripts/stage_preliminary_review.py` and `scripts/serve_preliminary_review.py`, run by the agent from the plugin |
| `design-publication.mjs check --skip-rerun`, `--rerun`, `--cache`, `--budget-minutes`, `--jobs` | Nothing: the check never runs the layout check |
| `stage.py --readiness` | Nothing: the gate prints the report |

The station functions lost their key argument. The agent calls them this way:

| Call | Now |
| --- | --- |
| `export_current(app, project, new_issue, key)` | `export_current(app, project, new_issue)` |
| `measure_pose(app, project, lineage, output, key, station_folder, ...)` | `measure_pose(app, project, lineage, output, station_folder, ...)` |
| `fusion_retry_station.retry(..., pairs, key, station_folder)` | `fusion_retry_station.retry(..., pairs, station_folder)` |
| `fusion_body_materials.capture(..., output, key)`, `fusion_joint_authority.capture(..., output, station_key)` | The same call without the last argument |
| `fusion_link_calibration.capture(..., request, output, station_key)` | The same call without the last argument |

A loaded-transfer study names its observed-execution inventory as a project file in `executionInventory`. `FRC_TRANSFER_EXECUTIONS` still works for a study without that field.
