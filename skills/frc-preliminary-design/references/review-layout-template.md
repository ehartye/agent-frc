# Stock preliminary design review

Every season starts its preliminary design review from the same page. The plugin ships one stock review page, [`templates/preliminary-review/review.html`](../../../templates/preliminary-review/review.html), and one standardized data input, the review scene described by [`templates/preliminary-review/scene.schema.json`](../../../templates/preliminary-review/scene.schema.json) (`agent-frc/preliminary-review-scene@1`). The page reads only the scene. Seasons supply data, not markup: the checker builds the scene from the layout plan, its own results, the STEP, the motion study, the budgets and the `presentation` fields described below. Start from the stock review page; keep its regions and controls unless your project has a reason to differ. That keeps reviews consistent across seasons. Your copy of the page is yours: the [publication check](../../../docs/design-publication.md) compares the scene with the receipt, never the page's markup or script, and your project's pull request review covers any change you make to it. The stock page ships a Content-Security-Policy suited to what it loads (its scene, receipt and release index, the bundled fonts and same-origin field players); keep it, or tighten it, if you change the page.

The scene accepts only the fields the schema defines. Validate a scene, and compare it with its receipt, with `node PLUGIN/scripts/review-scene.mjs validate review-scene.json.gz --receipt receipt.json`. Errors make the scene unusable. Warnings name the project-authored fields the page will show as "Not supplied in this review", plus findings the page keeps visible, such as a missing required role, an overweight estimate or a low-voltage duty.

## Start a project-owned review

Copy the starter into the **owning season repository** under `cad/preliminary-design/`, or under the active numbered iteration's design root. A teammate with a fresh checkout should be able to open the review, spin the robot and trace a budget figure back to its source. From the season repository root, run the installed plugin's [synthetic generator](../../../examples/preliminary-design/create.py) once with its geometry Python environment, supplying its actual path in place of `PLUGIN`. Use a new release ID for each reviewed revision. The example uses invented dimensions, limits and duties; replace them with the selected project's assumptions.

```sh
python PLUGIN/examples/preliminary-design/create.py . --project-review --release layout-001
python cad/preliminary-design/serve.py
```

Open `http://127.0.0.1:8000/`. For a LAN review pass `--bind LAN_ADDRESS --port 8000` using the host's LAN address. Stop the server with Ctrl+C. The launcher serves only the project-owned static site; the published site runs entirely in the browser.

```text
cad/preliminary-design/
  serve.py, stage.py             project-owned launcher and release packager
  .gitignore                     keeps the input-side compressed scene out of version control
  releases/layout-001/
    design.json, layout.json     issue, mounting datums, groups, member IDs and presentation fields
    package.step, paths.json     editable package inputs and checked motions
    package-limits.json          inspection, running and electrical requirements
    budgets.json, narrative.md   source estimates, duty cases and accepted objectives
    receipt.json                 checker decision, parked-assembly result and scene digests
    missions.json                mission-task cases this release plays
    package-motion.html          the review page: the stock page until the project changes it
    review-scene.json.gz         the scene the page reads (ignored; see below)
    release-lane-trial.json      example pinned evidence for a field interaction
    release-lane-run.json        example recorded run, synthetic
    release-lane-replay.json     example replay set that plays the run in the motion list
    field/release-lane.html      synthetic, self-contained season field player
.github/workflows/
  design-publication.yml         scans each pushed branch, reruns the layout check, deploys from the default branch
docs/preliminary-design/
  index.html, releases.json      stable viewer, ordered release index, current release and design statuses
  fonts/                         bundled theme fonts, fonts.css and their OFL licenses
  releases/layout-001/
    index.html                   the review page as staged
    review-scene.json.gz         the only committed copy of this revision's scene
    motion.json, receipt.json    checked paths and exact review evidence
    release.json                 phase, where the check inputs are, mission cases and field players
    field/release-lane.html      the release's self-contained field player
    budgets.json, limits.json    this revision's resource accounts
  releases/layout-002/           next reviewed revision, same structure
```

The page fetches `review-scene.json.gz` beside it, decompresses it with `DecompressionStream` and hashes the content. It uses `crypto.subtle` where the browser allows it and a bundled SHA-256 otherwise, so a plain-http LAN review verifies the same way as `localhost` or HTTPS. It then loads `receipt.json` and shows the receipt's decision only when that receipt pins this exact scene content and issue. Otherwise it shows the findings recorded when the scene was built and says so. Over plain HTTP the page marks verified results as a consistency check only: they show that the page, scene and receipt agree, not that they arrived unaltered. In the receipt, `view.sha256` is the stock page the checker shipped, `view.scene.sha256` covers the compressed scene as the checker left it, and `view.scene.contentSha256` and `view.scene.bytes` cover the decompressed scene. The checker credits a view when the page exists and the scene decompresses to the expected content. It does not compare the page with the stock page. Serve the review over HTTP; a page opened from `file://` explains that it cannot load the scene.

The season repository is the project the check runs in. Each release folder holds its layout plan, inputs, page and scene together, and every pin and the plan's `view` are written from the repository root, as in `cad/preliminary-design/releases/layout-001/package-motion.html`. `--write-view` refuses a view at the project root. [Keep the view in its release folder](../../../docs/preliminary-design.md#keep-the-view-in-its-release-folder)

The starter's `.gitignore` leaves the input-side scene uncommitted, so the published release holds the only committed copy. With `--write-view` the checker writes a missing page or scene and replaces a stale or unreadable scene whole, so a reader finds the previous scene or the new one. It never overwrites an existing page, which a project may have changed; delete a stale page before `--write-view`. Each written file appears whole through a temporary file and a rename; save the receipt the same way with `--output receipt.json`. A different Python or zlib build can compress the same content to different bytes. That does not matter to publishing: the publication check compares the scene's content with the receipt, not its compressed bytes.

An active iteration can keep its editable inputs under its own design root. Keep its site and launch command reachable from the season root. Commit the inputs the layout check reads, so the project's CI can rerun it. Leave out third-party material whose licence forbids redistribution. The starter bundles only its synthetic page, scene, reviewed motion, receipt and budget files.

### Multiple releases and Pages

Issue another synthetic example with `--release layout-002`. For a project-authored release, keep the commissioned layout, its checked page and scene, `receipt.json` and `missions.json` in its input directory, then run `python cad/preliminary-design/stage.py RELEASE_ID`. A preliminary design release need not be ready for detailed design, but it must obey the checked physics and show a meaningful mission task. Staging enters it as `in-progress` in `releases.json`; when the project accepts it as its preliminary design, mark it `effective` with `python cad/preliminary-design/stage.py --set-status RELEASE effective` in a reviewed pull request. The previous effective release becomes `superseded`. Withdraw a release with `--set-status RELEASE withdrawn --reason "…"`: the index keeps the reason and the last commit that held its published files, and the files leave the site. Statuses live in the index; the stable URL opens the effective release, or the newest in-progress one when none is effective. [Design status](../../../docs/design-phase-detail.md#design-status) Staging requires a `layout-checked` receipt of a full check and at least one mission case. Each case names a passing operating case, its accomplishment (`acquired`, `delivered`, `scored` or `climb-held`) and a `represented` narrative objective. Staging copies the page, scene and evidence, writes `release.json` with the location of the committed inputs, lists the release and sets the current pointer. Staging the same ID again replaces its published files; Git keeps the earlier ones and the pull request shows the difference. Check the result with `node PLUGIN/scripts/design-publication.mjs check . --skip-rerun`: the scene must repeat the receipt's issue, STEP and motion pins, case results, displaced control, narrative objectives, parked-assembly result, each duty's status and figures, and the inspection, remaining and running mass, and its own decision may never claim a checked result. The project's CI runs the same check on every push and also reruns the layout check from the committed inputs. [Publish and check designs](../../../docs/design-publication.md) Pull before staging from a second workstation, and resolve a conflict in `releases.json` by keeping every release ID and running `--set-status` again for the current one. Local staging locks the index and releases the lock on process exit. The stable viewer links the season's detailed design (`../`) only when an HTML page other than a directory listing exists there, so a local `serve.py` run, where the review is the site root, shows no dead link. Open the stable review for the latest release; use `?release=layout-001` to share an earlier one, and `?case=CASE_ID` on a release page to open a named case. An unknown release must identify the requested ID and offer the selector.

The starter copies the plugin's design publication workflow to `.github/workflows/design-publication.yml`. Set its plugin pin and kernel versions, enable GitHub Actions as the Pages source and require its two checks on the default branch. [Set up the workflow](../../../docs/design-publication.md#set-up-the-workflow) The workflow deploys the complete `docs/` tree from the default branch after the checks pass. The stable review URL is `/<repository>/preliminary-design/`; sibling season pages remain accessible. For an existing season showcase, keep the tree under `preliminary-design/` in the same site and link it from the season index as a secondary preliminary design page. Keep one deployment workflow for the combined site. The latest detailed design stays the primary view, README still and model selector. For existing direct publishing from `main /docs`, check in the subdirectory and reuse that publishing source. Use relative URLs for assets, release links and evidence. Exercise latest, a prior `?release=`, an unknown ID, and a direct release URL under a repository subpath. [Checked view generation](../../../docs/preliminary-design.md#work-a-synthetic-package)

## Page order

The stock page has these regions, top to bottom. Each value comes from the scene.

| Region | What the page shows | Review action |
| --- | --- | --- |
| 1. Header and title | The navy header bar with any season links, which open in the top window. The page has no link back to the release index: the stable index's release picker moves between releases, and links that leave the review open at the top or, for the receipt and field players, in a new tab, so nothing loads a page inside the index's frame. A title block: the project, release ID and "Preliminary design" above the release title (`presentation.title`, else the issue), and a chip combining the design status from the release index with the receipt decision, such as "In progress · layout-checked". The first unmet requirement appears beside the chip only when there is one. A collapsed **Review basis** holds the selected architecture, datum, units, strategic narrative revision, current decision and first unmet requirement, so the page opens onto the model. | Read the chip and any unmet requirement; open the review basis and the narrative objectives. |
| 2. Viewer row | **Viewer column**, in this order: (a) top bar with the pane title "Assembly layout", then view toggles and view buttons only: **Labels** (with callout paging when the callouts span pages), **Floor**, an optional data-driven cutaway toggle, **Fit robot**, **Fit field interaction** and **Expand**; (b) the canvas; (c) the control hint line; (d) the **playback row, directly below the canvas**: one motion selector that lists the checked cases and then any trial replays, **Play**, speed (1×, ¼×, 4×, 10×), the slider and its percent or seconds readout; (e) the live readout for the selected entry (its per-frame measure or result, the current event with numbered jump buttons when a replay records events, and its basis), with the reason whenever **Fit field interaction** is off; (f) the category legend. **Inspector column**, docked to the right: the component inspector (its heading, hint and search until a part is selected; then the part with Focus part, Show assembly and Locate in ledger), then the selection budget with Whole robot, Category, Subsystem and Custom subsystem groupings, the electrical duty and the allocation detail. | Orbit through 360° and underneath, pan, zoom, fit the robot or the field interaction, expand to full screen, pick a surface, search by name or ID, focus a part and show the assembly, locate a part in the ledgers, toggle labels and page the callouts, play and scrub each case and replay at any speed, and jump to a replay's events. |
| 3. Resource figures | Inspection weight against its limit, the loaded-bus minimum against its requirement, and battery-side demand against the pack budget at that floor, each linking to its ledger. | Choose a duty; the figures follow it. |
| 4. Weight budget and power by load | The inspection allocation ruler and table with its total, and the running configuration with itemized running additions. Battery-current bars by circuit group, each with its envelope, sag contribution and consuming parts. | Select a row, bar or member to locate the parts in the model. |
| 5. Required components | The strategic narrative review, then each required role with Present or Missing and the absent IDs, and a warning line that keeps overweight, low-voltage and missing-role findings visible beside the review focus. | Confirm every commissioned role is represented. |
| 6. Clearance evidence and component inventory | Closed-mesh and parked-assembly counts; the evidence set (current motion or parked assembly), an outcome filter, selectable findings and the witness. The inventory lists every placed body and field fixture with category, subsystem, material and volume. | Select a finding to mark the pair and jump to its witness frame; select an inventory row to inspect it. |
| 7. Motion evidence and decision | Each path with its starting pose, participating groups, environment, metric and units, limiting pair and time, clearance allowance, evidence method and result, including the playable displaced control and inhibited, adverse and uncovered cases. The pinned receipt link, what returns the layout to preliminary or conceptual design, and linked season field players. | Play a path, jump to its limiting pose, inspect both bodies, open the receipt and each field player. |
| 8. Model basis and limits | The project's notes. | Read the modelling limits before relying on a result. |

On a wide screen the viewer column and the inspector column sit side by side in one row: the viewer on the left as the largest pane, the inspector on the right in a `clamp(240px, 20vw, 330px)` column, top-aligned. They stack, inspector below the viewer, only when the page is 60rem (960 px at the default text size) wide or narrower. The resource figures start below that row. At phone width nothing scrolls sideways; the motion-evidence table scrolls within its own box.

The page uses the Agent FRC navy-and-gold engineering theme: navy `#102746` header and viewer, royal `#184e98` accents, gold `#f4c44d` rules and selection, paper `#f3f6fb` and ink `#132b48`. Headings use Barlow Condensed, body text Source Sans 3, and figures and ledgers use tabular numerals. The starter copies Latin subsets of both fonts and their SIL Open Font License files into `docs/preliminary-design/fonts/`, so the review renders correctly offline. Keep the license files with the fonts; without that directory the page falls back to system fonts. Body colours come from the resolved [component palette](../../../docs/cad-color-convention.md), so the model, legend, inspector swatch and inventory agree.

## Scene data and who supplies it

The schema marks each field `plugin` (derived), `project` (authored under `presentation` in `layout.json`) or `optional`. A missing project field renders as "Not supplied in this review" in its panel and validates with a warning; an optional feature hides cleanly when absent.

| Scene field | Supplier | Source |
| --- | --- | --- |
| `issue`, `datum`, `units`, `sources`, `decision`, `palette`, `meshes`, `cases` (bodies, frames, status, results, allowance), `parked`, `mass` (limit, inspection, running, lines), `power`, `narrativeReview`, `motionEvidence`, `returnCriteria` | plugin | The plan, the checker's results (the parked-assembly result is in the receipt as `parked`), the STEP tessellation, the motion study and the budgets. |
| `bodies[ID]` category, role, colour, motion group, volume, closure, fixture flag, mass exclusion | plugin | Plan groups, fixtures, the palette and the STEP. |
| `bodies[ID]` name, subsystem, material, volume type, purpose, rationale | project | `presentation.components[ID]` with `name`, `category`, `subsystem`, `material`, `volumeType` (`material`, `envelope` or `gauge`), `purpose`, `rationale`. |
| `bodies[ID].support` | project | `presentation.loadPaths[ID]`: the support and load path into the frame. |
| `bodies[ID].mounts` | project | Plan `mounts` entries whose `member` is this ID: the host, the registered point and its basis. The inspector lists them first under Support and load path. A mount without `member` stands for its whole group and is not attributed to one part. |
| `required` | project | `presentation.required`: `{ROLE: [IDs]}`. Absent IDs show as Missing. |
| `power[].lines[].members` | project | `presentation.loadMembers`: `{SOURCE: [IDs]}`. An unassigned source says so. |
| `mass.runningAdditions`, `mass.runningBasis` | project | `presentation.runningAdditions`: `[{name, kg: [low, high], members}]`, and `presentation.runningBasis`. |
| `title`, `context`, `architecture`, `focus`, `notes` | project | `presentation.title` (the release title shown as the heading), `presentation.context` (the project name above it), `presentation.architecture`, `presentation.focus` (what to look at first) and `presentation.notes` (model basis and limits). |
| `cases[].kind` and uncovered rows | project | `presentation.caseKinds` (`nominal`, `inhibited` or `adverse`; the displaced control is added automatically) and `presentation.uncoveredCases` (`[{id, condition, reason}]`). Unrepresented narrative objectives are added automatically. |
| `openingCase` | optional | `presentation.openingCase`; otherwise the first case in the cycle. |
| `cases[].time`, `measure`, `positions` | optional | `presentation.caseTimelines[CASE_ID]` with one entry per frame: seconds, live-readout text and robot field position in millimetres. Without them the readout shows the percent of path and the case result. |
| `cutaway` | optional | `presentation.cutaway`: `{label, hides: [fixture IDs], outline: [[x, y, z], ...]}`, for example a target aperture. |
| `links` | optional | `presentation.links`: `[{label, href}]` header links to season pages, relative or `https:`. |
| `fieldInteractions` | optional | `presentation.fieldInteractions`; see below. |
| `replays` | optional | `presentation.replays`: pinned replay sets as `[{file, sha256}]`; see [Play a recorded trial in the motion list](#play-a-recorded-trial-in-the-motion-list). |

The limiting pair on each path comes from pairs that include a moving body: a failure or open interval first, then the smallest gap or interval lower bound. An interval bound has no single limiting pose, so **Jump to limiting pose** needs a witness time. The receipt's `decision` records the final `status` and `firstUnmet` requirement: clearance findings first, then weight, voltage, the displaced control, held reopen decisions and missing inputs. The conceptual-design return criteria list each accepted conceptual premise from the receipt.

Keep field-interaction and physics players project-owned. Each one is first-class preliminary evidence for its mission task. Put it in the release inputs at `field/NAME.html` beside the review page, link it with `{title, href: "field/NAME.html", objective, evidence: {file, sha256}, embed}` and pin its trial. Staging publishes the page and its trial in the release and lists them under `fieldPlayers` in `release.json`. Keep the page self-contained so it plays from the published folder and from a local copy. The starter makes the policy `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'">` the first element in `<head>`; keep it unless the page needs more. Inline everything the playback needs, including its trace, and name the preliminary design release the page belongs to. The publication check does not inspect the page: your project's pull request review does. Correct a player by staging its release again. The review re-checks each link and sandboxes an embedded player from another origin.

## Play a recorded trial in the motion list

A replay plays a recorded physics trial in the review's own viewer. It is one more entry in the motion selector, after the checked cases, with the same Play, speed, slider and readout. `?case=ID` opens it, so replay and case IDs share one namespace. A replay is evidence playback and not a clearance case: the layout check neither runs nor credits it, the receipt's case set leaves it out, and the motion-evidence table lists only checked cases.

Generate a replay set from the trial in the owning project, write it beside `layout.json`, as JSON or gzipped JSON, and pin it under `presentation.replays` as `{file, sha256}`. A set has the schema `agent-frc/review-replays@1`, a `replays` list and optional `fieldBodies`. This example is abbreviated:

```json
{
  "schema": "agent-frc/review-replays@1",
  "fieldBodies": {"lane": {"name": "Release lane", "mesh": {"v": [[0, 0, 0]], "f": [[0, 1, 2]]}, "purpose": "...", "rationale": "..."}},
  "replays": [{
    "id": "lane-run", "label": "Lane run (recorded)", "basis": "What was recorded and under which model",
    "objective": "The narrative objective it plays",
    "evidence": [{"file": "lane-run.json", "sha256": "...", "role": "recorded run"}],
    "recorded": ["Robot position"], "display": ["Hose shape"],
    "time": [0, 0.05, 0.1], "measure": ["...", "...", "..."], "events": [{"frame": 2, "label": "At the lane"}],
    "follow": "robot",
    "bodies": {"frame": "robot", "arm": "arm", "lane": null},
    "groups": {"robot": [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]], "arm": [null]},
    "tubes": [{"name": "Hose", "radiusMm": 8, "color": "#c9a227", "points": [[[0, 0, 0], [100, 0, 0]]]},
              {"name": "Banner", "body": "banner", "points": [[[0, 0, 0], [100, 0, 0]]]}]
  }]
}
```

- `time` holds the seconds of each frame from the run, never decreasing. Its length is the frame count. `measure` is the optional readout per frame, and `events` names moments by frame, in order.
- `bodies` maps each shown ID, a placed member or a field body, to the rigid group it moves with. `null` keeps the body where its mesh was drawn. `groups` gives each group one row-major 3×4 transform per frame, in the field frame and in millimetres, applied to the mesh as drawn. A `null` frame hides the group. `follow` names the group the robot view tracks; it needs a transform in every frame.
- `fieldBodies` adds field parts and loose pieces that only replays show. Each needs a `name` and a closed triangle `mesh`, and may give `category`, `color`, `subsystem`, `material`, `purpose` and `rationale`. A field body counts as a fixture and never as robot mass.
- `tubes` draws flexible parts along a centerline. `points` holds one centerline for a fixed part or one per frame for a moving one, each with the same number of points. Give `radiusMm` and `color` to draw a round tube. Give `body` instead, naming a field body the replay does not otherwise place, and that body's mesh follows the centerline: each vertex moves with the nearest point on it, measured from the first centerline.
- `evidence` pins every trial file the replay plays back. List what came from the trial under `recorded` and what was prescribed or interpolated under `display`; display motions carry no contact or load claim.

In the scene, each replay appears under `replays[]` with the same fields, except that the plugin resolves each body to `{mesh, group}` and adds `mesh` to a tube that names a `body`. `review-scene.mjs validate` checks the frame counts, groups, event order and tube bodies. A scene without replays is unchanged.

## Shape the assembly reviewers will inspect

Start from mission heights, reach, rates, legal footprint and service space. Establish floor Z, forward direction, stationary frame, mounting faces, pivot axes and travel limits. Place the largest constrained items first. Run a physical game piece from approach through release and reset before filling the remaining space. Include the support and drive path to each moving member: frame, bracket, bearings, shaft, transmission, actuator and its stator attachment, and record it in `presentation.loadPaths`. Commission wheel, motor, controller, distribution, supply, communications and loom IDs for the chosen architecture in `presentation.required`. Show absent roles and floating loads as open issues.

Select primitives by mating and clearance geometry. Use cylinders for wheels, shafts and motors, a swept tube for cable routes, and a hollow, relieved or compound solid when a cavity admits a neighboring article. Record outside dimensions, orientation, moving membership, material and mass source for each placed ID. Give paired supports one family name plus handedness. Use scale and source dimensions for interacting fixtures and all finite game pieces. Keep floor, fixtures, carried pieces and tool/withdrawal gauges identifiable and separately accounted. Register each field part as a fixture of the cases that use it (`fixtures` in the motion study) and not as an ordinary package member: a member counts as robot in the opening fit and the robot bounds, and **Fit field interaction** stays off for a case without a fixture. The page states that reason beside the readout. When a review links field interactions but no case registers a fixture, a full check writes a `[view] warning` line to stderr unless `--quiet` is set, and `review-scene.mjs validate` lists a warning. Both are advisory.

Animate operating, simultaneous loaded, returning, disabled and service paths. Label command playback, free-body physics and measured behavior with their respective evidence. Inspect parked stock, swept travel and the full removable envelope. A sampled gap carries its sampling scope. A continuous-clearance claim needs interval coverage, tolerances and every participating neighbor. Distinguish intentional contact, verified clearance and unresolved contact. The [presentation reference](presentation.md) covers pressure, gravity retention, surface picking and field-event evidence in more detail.

## Copyable review rows

These synthetic entries illustrate the accounting convention. Replace numbers, components and limits with the project's sourced values. Give each mass or load line one identity even when several parts share it.

| Mass line | Placed IDs | Qty | Preliminary material and allocation basis | Inspection kg | Running addition kg |
| --- | --- | ---: | --- | ---: | ---: |
| Carrier assembly | carrier, pivot, shaft | 1 set | Aluminum carrier and steel shaft, weighed together | 1.8–2.1 | 0 |
| Remaining robot | Other hardware plus wiring allowance | 1 set | Itemized project estimate | 10.1–10.8 | 0 |
| Test article | sample | 1 | Separate carried payload | Excluded | 0.2–0.4 |

For a synthetic 14.0 kg inspection limit, 11.9–12.9 kg inspection weight leaves **+1.1 kg** against the high estimate. Running weight is 12.1–13.3 kg. If a selection contains only the shaft, keep the shared carrier line unallocated until a split is justified. Gauge space and envelope volume contribute zero material mass unless an actual article is separately estimated.

| Weak pack, loaded traverse | Battery A at this instant | Sag contribution at 0.030 Ω | Input power at the common 10.0 V bus |
| --- | ---: | ---: | ---: |
| Propulsion | 32 | 0.96 V | 320 W |
| Carrier actuator | 14 | 0.42 V | 140 W |
| Controls | 4 | 0.12 V | 40 W |
| Whole robot | 50 | 1.50 V | 500 W |

With 11.5 V open circuit, the modeled bus is **10.0 V**, or **+0.8 V** above a 9.2 V floor. This pack model permits 76.7 A and about 705 W at that floor; compare breaker, wire, branch and thermal limits separately. Calculate power at one coincident voltage/current point. If only ranges are available, label the result a bound and preserve shared or unknown loads. Aggregate current and power by unique load ID. Voltage is common to parallel consumers. [Shared electrical accounting](../../../docs/shared-power-review.md)

## Migrate an existing release

A release built before the stock review page and its scene has no scene to compare with its receipt. Regenerate it: copy the plugin's `templates/stage-preliminary-review.py` over `cad/preliminary-design/stage.py`, copy `templates/preliminary-review-fonts/` to `docs/preliminary-design/fonts/` and `templates/preliminary-review-gitignore` to `cad/preliminary-design/.gitignore`. Move any season-specific review content into the `presentation` fields above, delete the input-side page and any old `*.geometry.json.gz`, then run the check with `--write-view`. Validate the scene and stage the release again under the same ID, or under a new ID when the earlier one should stay published as history. Mark a release the project no longer shows `superseded` or `withdrawn` in the index; the publication check leaves those alone. A project that published through the earlier gates follows the [migration guide](../../../docs/design-publication-migration.md).

## Handoff check

Open the project-owned URL from a clean checkout. Keep browser-check captures outside the checkout and remove any scratch folder the browser tool leaves, such as `.playwright-mcp/`, before finishing. At a desktop width (1280 px or wider), confirm the inspector column is visible beside the viewer in the same row, and that it stacks below the viewer only when the page is 960 px or narrower. Confirm the playback row (case, Play, speed, slider, readout) sits directly below the canvas and the view controls sit above it. Confirm the header shows the architecture, issue, datum, units, narrative revision, receipt decision and first unmet requirement, and that `review-scene.mjs validate` lists no unexpected warnings. Pick a surface and find a part by name; confirm the inspector shows its identity, category, subsystem, motion group, material, volume, mass basis, support path, explanations, load lines and moving cases. Focus it, show the assembly, locate it in the ledgers and select a ledger row. Confirm the opening view fits the robot on the floor and **Fit field interaction** frames the fixtures. Play the displaced control, jump to its limiting pose and inspect both bodies. Open the pinned receipt and each linked field player. Orbit underneath, pan, toggle labels and page the callouts, and scrub a loaded case at both speeds. Reconcile a custom subsystem against whole-robot mass and battery-side current. Prove that an incomplete roster, an overweight or low-voltage case, and an intentionally obstructed path stay visible. Project-specific field physics and qualification require their own evidence in a season field player.
