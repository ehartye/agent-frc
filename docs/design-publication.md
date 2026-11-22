# Check published designs

One command checks everything a project publishes about its designs. The project's CI runs it on every push to every branch. A design is published, withdrawn or marked effective by one reviewed pull request that this check passes.

```sh
node PLUGIN/scripts/design-publication.mjs check PROJECT
```

## What the check verifies

| Guarantee | How |
| --- | --- |
| The layout obeys the checked physics | The plugin's layout check is rerun from the committed inputs. It must end `layout-checked`: every clearance case, the inspection mass and every loaded-voltage case pass, and the displaced control is rejected. |
| The committed receipt is that check's result | The rerun's input digests and every verdict equal the committed receipt. |
| The review shows the checked numbers | The cases, results, displaced control, objectives, mass and duties in the review scene equal the receipt. |
| The design plays a mission task | The record names a mission case: a passing operating case in the checked cycle, for a narrative objective the receipt marks `represented`. A field-interaction trial must be one the receipt names. |
| A detailed design builds on an accepted layout | An in-progress detailed design names a preliminary release that is `effective`, its receipt is on the STEP its record names as the Fusion export, and it covers that release's motion cases, cycle and displaced control. |
| One status per design, one primary view | Each index holds `in-progress`, `effective`, `superseded` or `withdrawn` for each design, at most one `effective`, and the primary view computed from the statuses. |

The rerun compares digests and verdicts. It does not compare measured values digit for digit, because a CAD kernel on another operating system can round them differently.

The check reads data. It does not inspect page markup, compare a page with the stock page or require any wording. A project may change its copy of the review page.

## Which designs are checked

A design that is `in-progress` or `effective` is checked and rerun, whatever else its record or the index says about it. A `superseded` or `withdrawn` design is history: it is not rerun. A withdrawn design may drop its files; Git keeps them.

The check reads these folders. Pass the option to use another.

| Option | Default | Holds |
| --- | --- | --- |
| `--site` | `docs` | The published site |
| `--preliminary` | `preliminary-design` | `releases.json` and `releases/ID/` inside the site |
| `--detailed` | `detailed-design` | `designs.json` and `designs/ID/` inside the site |
| `--inputs` | `cad/preliminary-design/releases` | `ID/layout.json` and every file it pins, for each preliminary release |
| `--detailed-inputs` | `cad/detailed-design/designs` | The same, for each detailed design |

A record can name its own inputs with `"check": {"project": "cad/robot", "plan": "layout.json"}`, both relative to the repository. `project` is the folder the layout check ran in and `plan` is the layout inside it.

A preliminary release must have its inputs committed. Without them the check fails, because nothing can be rerun. A detailed design whose Fusion export is not committed passes with a warning that says the layout check was not rerun.

If the receipt was checked against a held receipt with `--previous`, commit that held receipt inside the same inputs folder. The rerun finds it by digest.

## Effective designs

A design becomes effective when a reviewed pull request changes its status in the index. The check prints the evidence for the reviewer, in the log and in the run summary, and does not judge it.

- **Preliminary.** The [effective-readiness report](preliminary-design.md#judge-readiness-to-be-marked-effective) for the release's inputs.
- **Detailed.** The result of the [mechanical-readiness review](mechanical-readiness.md), committed beside the design as `designs/ID/readiness.json`. It must be a review of the STEP the design record names. Its build readiness, showcase eligibility and findings that do not pass are printed. A review that does not report `pass` adds a warning.

## Keep the rerun fast

Some layouts take half an hour to check. The workflow keeps that off most runs.

- **Cache.** A rerun that passed is stored under one digest of every file in the design's inputs folder and the plugin version. Change any input and the design is rerun. Pass the folder with `--cache`; the workflow restores it, and saves it even when another step fails. A cached result is still compared with the committed receipt.
- **Changed designs only.** With `--base COMMIT`, a design with no cached result is rerun only when its inputs, published folder or index changed since that commit. The workflow passes the point where a feature branch left the default branch. A change to a workflow file reruns every design without a cached result, because a pin may have moved. On the default branch the workflow passes no base, so a rerun that failed there is repeated until it passes.
- **Budget.** `--budget-minutes` stops one rerun that runs too long, 45 minutes by default. The rerun stops at the first clearance case that does not pass.
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
- **deploy** publishes the site from the default branch after both pass.

The check reads the branch as pushed, not its merge with the default branch. Rebase before merging; the default branch is checked again after the merge and before the site deploys.
