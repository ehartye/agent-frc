# Move a season project to the single publication workflow

This guide moves a project that publishes designs through the earlier gates to the [one publication check](design-publication.md). After the move, each of these is one reviewed pull request with no admin merge, no approval advance and no repository variable edit:

| Path | Before | After |
| --- | --- | --- |
| Publish a preliminary design release | A policy change, an approval advance, then the content | One pull request |
| Withdraw a design | A declaration, an approval advance, then the withdrawal with an on-site archive | One pull request |
| Show an in-progress detailed design | A policy change, an approval advance, then the content | One pull request |
| Mark a detailed design effective | Signed source and staged packets, a variable edit and the content | One pull request that carries the passing review result |

Do the move in one pull request per project. Steps 1 to 4 make the new check pass. Steps 5 to 7 delete the old gates. Finish any release or withdrawal that is half way through the old process inside this pull request, by the new commands, not before it.

## What was removed from the plugin

| Removed | Use instead |
| --- | --- |
| `scripts/public-model-release.mjs` (`select`, `issue`, `verify`, `verify-pair`, `audit`, `audit-staged`, `check-selection`) | `design-publication.mjs check` |
| `scripts/local-showcase-release.mjs` (`check`, `digest`) | `design-publication.mjs check` |
| `scripts/preliminary-release.mjs` (`verify`, `verify-catalog`, `compare-template`) | `design-publication.mjs check` |
| `stage.py --check-index`, `--verifier` | `design-publication.mjs check` |
| `detailed-design-release.mjs` options `--policy`, `--packet` and a site folder as the first argument | The project folder as the first argument; `effective --readiness`, `withdraw --reason` |
| `templates/robot-showcase-pages.yml`, `templates/preliminary-review-pages.yml`, `templates/prepare-showcase-release.mjs` | `templates/design-publication.yml` |
| `{"signedPacket": …}` under `mechanicalReadiness` in a showcase or highlights manifest | `{"reviewResult": "PATH"}`, the committed review result, or the study path as before |

## 1. Commit the design inputs

The check reruns the layout check in CI, so every file the layout check reads must be in the repository. The repository holds everything the design needs. Make the repository private if the season's work is private.

For each preliminary release that is `in-progress` or `effective`, commit its inputs at `cad/preliminary-design/releases/ID/`:

- `layout.json` and every file it pins: the STEP, the motion study, the budgets and limits, any fixture STEP and each trial file a stage or field interaction names.
- The held receipt, when the release was checked with `--previous`.
- `missions.json`, the review page and `receipt.json`. The starter's `.gitignore` keeps the input-side `review-scene.json.gz` out of the repository; the published copy is the committed one.

For each detailed design that is `in-progress`, commit the same files at `cad/detailed-design/designs/ID/`, with the STEP exported from the registered Fusion design. Commit the Fusion archive, authority register and lineage too.

Then:

- Delete any custody file, withheld-file list or recorded hash that stands in for a file kept elsewhere. Commit the file.
- Stop ignoring the folder that holds the canonical Fusion archives. Use Git LFS for a file over the host's size limit, and set `lfs: true` on the project checkout in the workflow.
- Write paths relative to the repository in every builder and receipt. Run the [branch scan](project-ci.md#scan-every-pushed-branch) before the first push, because a machine path or credential is public as soon as its branch is pushed.
- Leave out third-party material whose licence forbids redistribution, and link to its publisher.

A superseded or withdrawn release needs no inputs. It is not rerun.

If a release's inputs sit in another folder, or its plan has another name, add `"check": {"project": "FOLDER", "plan": "FILE.json"}` to its `release.json` or `design.json`, relative to the repository. `project` is the folder the layout check ran in.

## 2. Replace the project's copies of plugin files

| Project file | Copy from the plugin |
| --- | --- |
| `cad/preliminary-design/stage.py` | `templates/stage-preliminary-review.py` |
| `docs/preliminary-design/index.html` | `templates/preliminary-review-index.html`, unless the project changed its copy |
| `docs/detailed-design/index.html` | `templates/detailed-design-index.html`, unless the project changed its copy |

Delete `cad/preliminary-design/pages-workflow.yml`. The project's review page, its release index page and its catalog page are the project's own from here on. Nothing compares them with the stock pages.

## 3. Tidy the two indexes

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

## 4. Add the one workflow and run the check

Copy `templates/design-publication.yml` to `.github/workflows/design-publication.yml` and follow [Set up the workflow](design-publication.md#set-up-the-workflow). The plugin pin is the `AGENT_FRC_REF` line in that file.

```sh
node PLUGIN/scripts/design-publication.mjs check . --skip-rerun
node PLUGIN/scripts/design-publication.mjs check .
```

The first command checks the records, scenes and indexes in seconds. The second also reruns each layout check. Fix every error before deleting anything in the next steps. If a rerun differs from the committed receipt, the committed inputs are not the ones the receipt was made from: run the layout check on the committed inputs, stage the release again and review the difference.

## 5. Delete the old workflow files

Delete these from `.github/workflows/`, under whatever names the project gave them:

- The robot showcase workflow that ran the **Mechanical model eligibility** job.
- The preliminary design review Pages workflow that ran `stage.py --check-index`.
- A separate branch scan workflow. The new workflow has the **Paths and secrets** job.
- A separate project checks entry workflow and its reusable `project-checks.yml`, when the project publishes designs. The new workflow runs the registered checks from `tests/ci.json`.
- Any workflow step that checks out an approved commit, an old builder pin or a second verifier pin.

Keep one workflow that deploys Pages. If another workflow still deploys the site, remove its deploy job.

## 6. Delete the old gate files

| Delete | It was |
| --- | --- |
| `.github/showcase-release.json` | The release register with `approvedSiteSha256` |
| The station configuration, such as `.github/showcase-station.json`, and any `station.json` | The trusted station config and its pinned hash |
| The source and staged policy files that `sourcePolicy` and `stagePolicy` named | `modelFiles`, `publicRoots`, `preliminaryReleases`, `preliminaryInputs`, `detailedDesigns`, `withdrawn`, `catalogSha256`, `catalogFiles`, `presentations`, `preliminaryReadmeArchive`, `preliminaryReadmeLink`, `secondaryLink`, `mutableFieldPages`, `mutableFieldData` |
| The signed packets that `sourcePacket` and `stagePacket` named | Signatures over the delivered files |
| The reviewer public key file, if committed | The signature verification key |
| `scripts/prepare-showcase-release.mjs` | The build adapter for the approved site |
| A served-file inventory, such as `served-docs.json` | The whole-site freeze |
| A project content guard that holds a binary hash allowlist | Replaced by the branch scan |
| A project script that only checks a README still, link line or page against a pinned hash | A page pin |
| `.gitattributes` rules that exist only to keep pinned pages, stills and archives byte-exact | Support for the pins |
| A one-time exception coded into a project gate script | Already used |

Search the project for what is left:

```sh
git grep -n -E "approvedCommit|approvedSiteSha256|FRC_APPROVED_MODEL_COMMIT|FRC_ACTIVE_MODEL_SELECTION|FRC_REVIEWER_PUBLIC_KEY|signedPacket|staged-model-policy|public-model-policy|local-showcase-release|public-model-release|preliminary-release\.mjs|check-index|effectiveHistory|catalogSha256|readmeSha256"
```

Each match is a file to delete, a registered check to remove from `tests/ci.json` or a sentence to rewrite in the project's own instructions.

In a showcase or highlights manifest that set `mechanicalReadiness` to `{"signedPacket": …}`, set it to `{"reviewResult": "docs/detailed-design/designs/ID/readiness.json"}`.

## 7. Delete the repository settings

Delete these repository variables after the pull request merges and the default-branch run is green:

| Variable | It was |
| --- | --- |
| `FRC_APPROVED_MODEL_COMMIT` | The approved-commit baseline |
| `FRC_MODEL_VERIFIER_COMMIT` | A second plugin pin for the verifier |
| `AGENT_FRC_PLUGIN_SHA` | The plugin pin, now `AGENT_FRC_REF` in the workflow file. Keep it only while a remaining workflow still calls the reusable project checks. |
| `FRC_ACTIVE_MODEL_SELECTION`, `FRC_REQUIRE_ACTIVE_MODEL_SELECTION` | The active model selection |
| `FRC_REVIEWER_PUBLIC_KEY` | The signature verification key |
| `FRC_PAGES_LAYOUT` | The branch or built switch |
| `FRC_MODEL_PROJECT`, `FRC_MODEL_REVIEW_PUBLIC_KEY`, `FRC_VERIFIED_FIELD_ROOT`, `MECHANICAL_REVIEW_PLUGIN_SHA` | Builder and verifier settings |

```sh
gh variable list
gh variable delete FRC_APPROVED_MODEL_COMMIT
```

In the branch protection of the default branch, remove **Mechanical model eligibility** and any other check an old workflow emitted. Require **Design publication** and **Paths and secrets**. A required check that no workflow emits blocks every merge, so change the required checks in the same sitting as the merge.

The reviewer's private signing key is no longer used. Remove it from the workstation that held it.

## Rename a release to a version

A release published before 0.127.0 has an ID such as `layout-004`. It keeps working, and nothing forces a rename. To give it a [version](design-publication.md#name-and-number-a-design), publish the same design under the new ID and then remove the old one. The rename is clean: no redirect is left, and a link to `?release=layout-004` reports an unknown release afterwards.

Choose the version first. The design the project has accepted is `1.0`. A design that was never accepted is also `1.0`, still a draft. Earlier releases that were drafts of the same design take no number: remove them too, or leave them `superseded`.

Do the rename in one pull request.

1. **Rebuild the inputs in the new folder.**

   ```sh
   python cad/preliminary-design/stage.py --copy-inputs layout-004 1.0
   ```

   The command copies `cad/preliminary-design/releases/layout-004/` to `cad/preliminary-design/releases/1.0/`. The plan's `view` and every pin written from the repository root name the old folder, so it writes each of those pins with the new path and the digest of the copied file. It first verifies each pin against the old folder and refuses a stale one. The STEP keeps its bytes: its digest is what shows the design did not change. A held receipt keeps its bytes too. The page, scene and receipt are not copied, because they carry the old paths.
2. **Check.** Run the layout check on the new folder, so the page, scene and receipt are written with the new paths. Do not edit a receipt by hand.

   ```sh
   node PLUGIN/scripts/design.mjs preliminary-check . cad/preliminary-design/releases/1.0/layout.json --write-view --require-checked --output cad/preliminary-design/releases/1.0/receipt.json
   ```

3. **Stage under the new ID** and name the architecture.

   ```sh
   python cad/preliminary-design/stage.py 1.0 --design-name "Tilting carriage"
   ```

4. **Carry the status.** When the old release is effective, mark the new one effective. The old one becomes superseded in the same edit.

   ```sh
   python cad/preliminary-design/stage.py --set-status 1.0 effective --readiness PLUGIN/scripts/effective-readiness.mjs
   ```

5. **Remove the old ID.**

   ```sh
   python cad/preliminary-design/stage.py --remove layout-004 --replaced-by 1.0
   ```

   The command deletes `docs/preliminary-design/releases/layout-004/` and `cad/preliminary-design/releases/layout-004/` and takes the ID out of every field of the index. For a release that is or was effective it requires `--replaced-by`, and it refuses unless that release is effective and its receipt names the same STEP digest. The new release then keeps the earlier accepted date. An in-progress release, or a superseded one that was never accepted, needs no `--replaced-by`.

6. **Update what named the old ID.** Stage an in-progress detailed design again with `--preliminary 1.0`; the command names each one. Change links, the README still caption and any registered check that names the old folder.
7. Run `node PLUGIN/scripts/design-publication.mjs check .`, commit and open the pull request.

A changed design is not a rename. If the STEP differs, the old release stays in the index as superseded and the new design takes the next version.

## Withdraw a design in one pull request

1. Branch from the default branch.
2. Run the command with the reason.

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design detail-001 --reason "The lift changed to a two-stage carriage."
   python cad/preliminary-design/stage.py --set-status 2.0 withdrawn --reason "The carrier moved to the other side."
   ```

   For a model that was published before the design index existed, name its published files. The command removes them and lists the design:

   ```sh
   node PLUGIN/scripts/detailed-design-release.mjs withdraw . --design draft-001 --reason "Rough draft published before the design-status process." --files docs/models/robot.glb,docs/media/robot-still.png
   ```

3. Update the entry page, the README and its still, and the model selector for the new primary view: the effective design, else the newest in-progress one, else a line that says no detailed design is published with a link to the current preliminary design.
4. Run `node PLUGIN/scripts/design-publication.mjs check . --skip-rerun`, commit and open the pull request.

The index keeps the status, the reason and the last commit that changed the published files. The files leave the site and stay in Git. The pull request needs no declaration, no approval advance and no archive. A project whose build script emits the withdrawn model must stop emitting it in the same pull request.

## Check the result

- The pull request shows **Design publication** and **Paths and secrets**, both green, with no admin merge.
- `gh variable list` shows none of the variables above.
- The default-branch run after the merge reruns each in-progress and effective design once and deploys the site.
- The site opens the same primary view as before, each withdrawn design shows its reason, and no link points at a deleted archive.
