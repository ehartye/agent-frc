# The stock review page

Every season starts its review page from the same stock page. The plugin ships one page, [`templates/preliminary-review/review.html`](../../../templates/preliminary-review/review.html), and one data input, the review scene described by [`templates/preliminary-review/scene.schema.json`](../../../templates/preliminary-review/scene.schema.json) (`agent-frc/preliminary-review-scene@1`). The page reads only the scene.

Projects supply data, not markup. The check builds the scene from the judgement file, its own results, the generated solids, the motions of the design source, the budgets and the `presentation` fields described below.

Start from the stock page and keep its regions and controls unless the project has a reason to differ. Your copy of the page is yours: the [publication check](../../../docs/design-publication.md) compares the scene with the receipt, never the page's markup or script, and the project's pull request shows any change you make to it.

## Contents

- [Start a project-owned review](#start-a-project-owned-review)
- [Versions, drafts and the published site](#versions-drafts-and-the-published-site)
- [Page order](#page-order)
- [Scene data and who supplies it](#scene-data-and-who-supplies-it)
- [Play a recorded trial in the animation list](#play-a-recorded-trial-in-the-animation-list)
- [Shape the layout reviewers will inspect](#shape-the-layout-reviewers-will-inspect)
- [Copyable review rows](#copyable-review-rows)
- [Handoff check](#handoff-check)
- [How the page verifies what it shows](#how-the-page-verifies-what-it-shows)

The scene accepts only the fields the schema defines. Validate a scene, and compare it with its receipt, with `node PLUGIN/scripts/review-scene.mjs validate review-scene.json.gz --receipt receipt.json`. Errors make the scene unusable. Warnings name the project-authored fields the page will show as "Not supplied in this review", plus findings the page keeps visible, such as a missing required role, an overweight estimate or a low-voltage duty.

## Start a project-owned review

Run the starter once in the **owning season repository**. It writes the project files under `cad/preliminary-design/`, or under the active numbered iteration's design root. A teammate with a fresh checkout should be able to open the review page, spin the robot and trace a budget figure back to its source.

From the repository root, run the installed plugin's [synthetic generator](../../../examples/design-source/create.py) with its geometry Python environment, supplying its actual path in place of `PLUGIN`. The value of `--release` is the design's version, `MAJOR.MINOR`, and `--design-name` names its architecture once. [Name and number a design](../../../docs/design-publication.md#name-and-number-a-design)

The example uses invented dimensions and duties. Replace them with the project's own.

```sh
python PLUGIN/examples/design-source/create.py . --project-review --release 1.0 --design-name "Turning carrier"
python PLUGIN/scripts/serve_preliminary_review.py
```

Open `http://127.0.0.1:8000/`. For a LAN review pass `--bind LAN_ADDRESS --port 8000` using the host's LAN address. Stop the server with Ctrl+C. The launcher serves only the project-owned static site; the published site runs entirely in the browser.

```text
cad/preliminary-design/
  .gitignore                     keeps the input-side compressed scene out of version control
  releases/1.0/
    design.json                  the design source: solids, groups, mounts, poses and motions
    judgement.json               the judgement file: stages, cycle, control and the presentation fields
    generated/                   the solids and manifest the design library wrote from the source
    limits.json                  inspection, running and electrical requirements
    budgets.json, narrative.md   source estimates, duty cases and accepted objectives
    role-cycle.json and others   the example's premise records: an accepted range and the current estimate
    receipt.json                 checker decision, parked-assembly result and scene digests
    missions.json                mission cases this design plays
    package-motion.html          the review page: the stock page until the project changes it
    review-scene.json.gz         the scene the page reads (ignored; see below)
.github/workflows/
  ci.yml                         the project's own CI: scan, site check, publish from the default branch
docs/preliminary-design/
  index.html, releases.json      stable viewer, ordered index of versions, current version and design statuses
  fonts/                         bundled theme fonts, fonts.css and their OFL licenses
  releases/1.0/
    index.html                   the review page as published
    review-scene.json.gz         the only committed copy of this version's scene
    design.json, receipt.json    the design source and the check's result
    release.json                 phase, where the check inputs are and the mission cases
    budgets.json, limits.json    this version's resource accounts
  releases/1.1/                  work toward the next baseline of the same architecture; same structure
  releases/2.0/                  a different architecture, with its own name; same structure
```

Serve the review page over HTTP. A page opened from `file://` explains that it cannot load the scene. [How the page verifies what it shows](#how-the-page-verifies-what-it-shows)

The repository is the project the check runs in. Each design's folder holds its design source, judgement file, generated solids, page and scene together, and the judgement file's `view` and every file reference are written from the repository root, by path and [without a typed hash](../../../docs/preliminary-design.md#name-files-by-path), as in `cad/preliminary-design/releases/1.0/package-motion.html`. `--write-view` refuses a view at the project root. [Keep the view in its release folder](../../../docs/preliminary-design.md#keep-the-view-in-its-release-folder)

The starter's `.gitignore` leaves the input-side scene uncommitted, so the published folder under `docs/` holds the only committed copy.

With `--write-view` the check writes a missing page or scene and replaces a stale or unreadable scene whole. It never overwrites an existing page, which a project may have changed. After a plugin update, delete the page and rebuild it with `--view-only` to take the new stock page.

A different Python or zlib build can compress the same content to different bytes. That does not matter to publishing: the publication check compares the scene's content with the receipt, not its compressed bytes.

An active iteration can keep its editable inputs under its own design root. Keep its site and launch command reachable from the repository root. Commit the inputs the check reads: the stage gate runs on the committed design. Leave out third-party material whose licence forbids redistribution.

## Versions, drafts and the published site

One design has one version folder and one review page. Publish it with the plugin's staging command, from the project root:

```sh
python PLUGIN/scripts/stage_preliminary_review.py 1.0 --design-name "Turning carrier"
node PLUGIN/scripts/design-publication.mjs check .
```

**What publishing needs.** A `layout-checked` receipt of a full check and at least one mission case in `missions.json`. Each mission case names a passing operating case, its accomplishment (`acquired`, `delivered`, `scored` or `climb-held`) and a `represented` narrative objective. The design need not be ready for detailed design.

**What publishing does.** It copies the page, scene and evidence to `docs/preliminary-design/releases/VERSION/`, writes `release.json` with the location of the committed inputs, lists the version as `in-progress` in `releases.json` and sets the current pointer.

**Revise in place.** Publishing the same version again replaces the published files and counts a draft, shown as "NAME 1.1 · draft 3 · in progress". An edit to the same design never takes a new number. Git keeps each draft's files and the pull request shows the difference. [Revise an in-progress release in place](../../../docs/design-publication.md#revise-an-in-progress-release-in-place)

| Situation | Version |
| --- | --- |
| An edit to an in-progress design | The same version, as its next draft |
| The design that follows an effective one | The next minor version |
| A different architecture or concept | The next major version, with its own name |

**Statuses.** When the user accepts the design, mark it `effective` with `python PLUGIN/scripts/stage_preliminary_review.py --set-status VERSION effective` in a reviewed pull request. The previous effective design becomes `superseded`. Withdraw one with `--set-status VERSION withdrawn --reason "…"`: the index keeps the reason and the last commit that held its files, and the files leave the site. [Design status](../../../docs/design-phase-detail.md#design-status)

**What a visitor sees.** The stable URL opens the effective design, or the newest in-progress one when none is effective. The stable viewer shows only the version picker above the review page, and the picker names each design's status. Share another version with `?release=1.0`, and a named case with `?case=CASE_ID`. An unknown version names the requested ID and offers the picker.

**The publication check.** The scene must repeat the receipt's STEP digest, case results, displaced control, narrative objectives, parked-assembly result, each duty's figures and the mass figures. Its decision may never claim a checked result the receipt does not hold. Run it before every push. The layout check runs again once, at the stage gate, when the design is marked effective. [Publish and check designs](../../../docs/design-publication.md)

**A second workstation.** Pull before publishing. Resolve a conflict in `releases.json` by keeping every version and running `--set-status` again for the current one. Local publishing locks the index and releases the lock on process exit.

### The workflow and Pages

The starter writes the project's own CI from the plugin's references: `.github/workflows/ci.yml` and the two checks under `scripts/ci/`. They name no plugin. Enable GitHub Actions as the Pages source and require the **Scan and site check** job on the default branch. [Write the project's CI](../../../docs/project-ci.md#write-the-projects-ci)

The workflow deploys the complete `docs/` tree from the default branch after the checks pass. The stable URL is `/<repository>/preliminary-design/`.

For a project that also has a detailed design showcase, keep this tree under `preliminary-design/` in the same site and link it from the season index as a secondary page. Keep one deployment workflow for the combined site. The latest detailed design stays the primary view, README still and model selector.

Use relative URLs for assets, links between versions and evidence. After the first deploy, open the stable URL, another `?release=`, an unknown ID and a direct version URL under the repository subpath.

## Page order

The stock page has these regions, top to bottom. Each value comes from the scene.

| Region | What the page shows | Review action |
| --- | --- | --- |
| 1. Header and title | The navy header bar with any season links, which open in the top window. The page has no link back to the index: the stable index's version picker moves between versions, and links that leave the review open at the top or, for the receipt, in a new tab, so nothing loads a page inside the index's frame. A title block: the project, the design name and version from the index and "Preliminary design" above the title (`presentation.title`, else the judgement file's `issue` name), and a chip combining the draft number and design status from the index with the receipt decision, such as "Draft 3 · in progress · layout-checked" or "Effective · layout-checked". The first unmet requirement appears beside the chip only when there is one. A collapsed **Review basis** holds the selected architecture, datum, units, strategic narrative revision, current decision and first unmet requirement, so the page opens onto the model. | Read the chip and any unmet requirement; open the review basis and the narrative objectives. |
| 2. Viewer row | **Viewer column**, in this order: (a) top bar with the pane title "Assembly layout", then view toggles and view buttons only: **Labels** (with callout paging when the callouts span pages), **Floor**, an optional data-driven cutaway toggle, **Fit robot**, **Fit field interaction** and **Expand**; (b) the canvas; (c) the control hint line; (d) the **playback row, directly below the canvas**: one animation list that holds one entry per mission phase, then the other checked motions, the displaced control and any trial replays, **Play**, speed (1×, ¼×, 4×, 10×), the slider and its percent or seconds readout; (e) the live readout for the selected entry (its per-frame measure or result, the current event with numbered jump buttons when a replay records events, and its basis), with the reason whenever **Fit field interaction** is off; (f) the category legend. **Inspector column**, docked to the right: the component inspector (its heading, hint and search until a part is selected; then the part with Focus part, Show assembly and Locate in ledger), then the selection budget with Whole robot, Category, Subsystem and Custom subsystem groupings, the electrical duty and the allocation detail. | Orbit through 360° and underneath, pan, zoom, fit the robot or the field interaction, expand to full screen, pick a surface, search by name or ID, focus a part and show the assembly, locate a part in the ledgers, toggle labels and page the callouts, play and scrub each animation and replay at any speed, and jump to a replay's events. |
| 3. Resource figures | Inspection weight against its limit, the loaded-bus minimum against its requirement, and battery-side demand against the pack budget at that floor, each linking to its ledger. | Choose a duty; the figures follow it. |
| 4. Weight budget and power by load | The inspection allocation ruler and table with its total, and the running configuration with itemized running additions. Battery-current bars by circuit group, each with its envelope, sag contribution and consuming parts. | Select a row, bar or member to locate the parts in the model. |
| 5. Required components | The strategic narrative review, then each required role with Present or Missing and the absent IDs, and a warning line that keeps overweight, low-voltage and missing-role findings visible beside the review focus. | Confirm every commissioned role is represented. |
| 6. Clearance evidence and component inventory | Closed-mesh and parked-assembly counts; the evidence set (current motion or parked assembly), an outcome filter, selectable findings and the witness. The inventory lists every placed body and field fixture with category, subsystem, material and volume. | Select a finding to mark the pair and jump to its witness frame; select an inventory row to inspect it. |
| 7. Check results and decision | One row per mission phase: the cases checked, their results, the tightest clearance, the clearance allowance and the path tolerance used. A phase opens to its cases, each with its starting pose, participating groups, environment, metric and units, limiting pair and time, clearance allowance, evidence method and result. A phase with a failing or open case opens at once, those cases first. A last group holds the displaced control and the uncovered conditions, and replays follow. The receipt link and what returns the layout to preliminary or conceptual design. | Play a phase, open its cases, jump from the tightest or a failing case to its pose in the phase's animation, inspect both bodies and open the receipt. |
| 8. Model basis and limits | The project's notes. | Read the modelling limits before relying on a result. |

On a wide screen the viewer column and the inspector column sit side by side in one row: the viewer on the left as the largest pane, the inspector on the right in a `clamp(240px, 20vw, 330px)` column, top-aligned. They stack, inspector below the viewer, only when the page is 60rem (960 px at the default text size) wide or narrower. The resource figures start below that row. At phone width nothing scrolls sideways; the motion-evidence table scrolls within its own box.

The page uses the Agent FRC navy-and-gold engineering theme: navy `#102746` header and viewer, royal `#184e98` accents, gold `#f4c44d` rules and selection, paper `#f3f6fb` and ink `#132b48`. Headings use Barlow Condensed, body text Source Sans 3, and figures and ledgers use tabular numerals. The starter copies Latin subsets of both fonts and their SIL Open Font License files into `docs/preliminary-design/fonts/`, so the review renders correctly offline. Keep the license files with the fonts; without that directory the page falls back to system fonts. Body colours come from the resolved [component palette](../../../docs/cad-color-convention.md), so the model, legend, inspector swatch and inventory agree.

## Scene data and who supplies it

The schema marks each field `plugin` (derived), `project` (authored under `presentation` in the judgement file) or `optional`. A missing project field renders as "Not supplied in this review" in its panel and validates with a warning; an optional feature hides cleanly when absent.

| Scene field | Supplier | Source |
| --- | --- | --- |
| `issue`, `datum`, `units`, `sources`, `decision`, `palette`, `meshes`, `cases` (bodies, frames, status, results, allowance), `parked`, `mass` (limit, inspection, running, lines), `power`, `narrativeReview`, `motionEvidence`, `returnCriteria` | plugin | The judgement file, the checker's results (the parked-assembly result is in the receipt as `parked`), the tessellation of the generated solids, the motions of the design source and the budgets. |
| `bodies[ID]` category, role, colour, motion group, volume, closure, fixture flag, mass exclusion | plugin | The groups and fixtures of the design source, the palette and the generated solids. |
| `bodies[ID]` name, subsystem, material, volume type, purpose, rationale | project | `presentation.components[ID]` with `name`, `category`, `subsystem`, `material`, `volumeType` (`material`, `envelope` or `gauge`), `purpose`, `rationale`. |
| `bodies[ID].support` | project | `presentation.loadPaths[ID]`: the support and load path into the frame. |
| `bodies[ID].mounts` | project | The `mounts` entries of the design source whose `member` is this ID: the host, the registered point and its basis. The inspector lists them first under Support and load path. A mount without `member` stands for its whole group and is not attributed to one part. |
| `required` | project | `presentation.required`: `{ROLE: [IDs]}`. Absent IDs show as Missing. |
| `power[].lines[].members` | project | `presentation.loadMembers`: `{SOURCE: [IDs]}`. An unassigned source says so. |
| `mass.runningAdditions`, `mass.runningBasis` | project | `presentation.runningAdditions`: `[{name, kg: [low, high], members}]`, and `presentation.runningBasis`. |
| `title`, `context`, `architecture`, `focus`, `notes` | project | `presentation.title` (the title shown as the heading), `presentation.context` (the project name above it), `presentation.architecture`, `presentation.focus` (what to look at first) and `presentation.notes` (model basis and limits). |
| `cases[].kind` and uncovered rows | project | `presentation.caseKinds` (`nominal`, `inhibited` or `adverse`; the displaced control is added automatically) and `presentation.uncoveredCases` (`[{id, condition, reason}]`). Unrepresented narrative objectives are added automatically. |
| `animations` | plugin | One entry per mission phase with `id`, `title`, `mission` and the `cases` it plays in order. A stage names its phase under `stages.CASE.phase`; without one the phase is the case ID less a trailing segment number. [Animations and check results](../../../docs/preliminary-design.md#animations-show-the-mission-the-check-list-shows-the-evidence) |
| `animations[].title`, `mission` | optional | `presentation.phases[PHASE]` with `title` and `headline`. By default a phase is a mission animation when it holds an operating case of the cycle. |
| `openingCase` | optional | `presentation.openingCase`; otherwise the first case in the cycle. |
| `cases[].time`, `measure`, `positions` | optional | `presentation.caseTimelines[CASE_ID]` with one entry per frame: seconds, live-readout text and robot field position in millimetres. Without them the readout shows the percent of path and the case result. |
| `cutaway` | optional | `presentation.cutaway`: `{label, hides: [fixture IDs], outline: [[x, y, z], ...]}`, for example a target aperture. |
| `links` | optional | `presentation.links`: `[{label, href}]` header links to season pages, relative or `https:`. |
| `replays` | plugin | One per trial in the library's trial record; see [Play a recorded trial in the animation list](#play-a-recorded-trial-in-the-animation-list). |

The limiting pair on each path comes from pairs that include a moving body: a failure or open interval first, then the smallest gap or interval lower bound. An interval bound has no single limiting pose, so **Jump to limiting pose** needs a witness time. The receipt's `decision` records the final `status` and `firstUnmet` requirement: clearance findings first, then weight, voltage, the displaced control, premises outside their accepted range and missing inputs. The conceptual-design return criteria list each accepted conceptual premise from the receipt.

## Play a recorded trial in the animation list

A replay plays a recorded physics trial in the review's own viewer. It is one more entry in the animation list, after the mission animations and the other checked motions, with the same Play, speed, slider and readout. `?case=ID` opens it, so replay, animation and case IDs share one namespace. A replay is evidence playback and not a clearance case: the layout check neither runs nor credits it, the receipt's case set leaves it out, and the check results count only checked cases.

The layout check builds one replay for each trial in the library's record that the judgement file names as `trials`, from the record's nominal run:

- `id` is `trial-` and the trial's name in lower case with hyphens, and `label` the name with "(trial replay)". `evidence` pins the record.
- `time` is the run's own trace times, every row, or every n-th row and the last for a trace of more than 240 rows. `events` are the moments the run recorded, at the first frame at or after each.
- The piece is drawn from the shape the record gives it, about its centre. Its group, `piece`, which the view follows, places it at each traced centre on the trial's plane, off the plane by `offPlaneMm` where the 3D engine traced that, and turns it by the spin summed over the trace about the plane's normal, signed the way both engines count spin, as the fit turns it. Other free pieces of a 3D trial follow their own traced centres.
- The design's solids stand still where the trial's pose puts them: a solid the pose does not move keeps its drawn place (`null`), and the source's own payload solids are left out so the piece is not drawn twice. A surface a mover slides is drawn where it starts; the record traces the piece, not the surface.

In the scene, `bodies` maps each shown ID to `{mesh, group}` and `groups` gives each group one row-major 3×4 transform per frame, in the field frame and in millimetres, applied to the mesh as drawn. A `null` frame hides the group. The page also reads `measure`, a readout per frame, and `tubes`, flexible parts drawn along a centerline, which a replay of a trial record does not use. `review-scene.mjs validate` checks the frame counts, groups, event order and tube bodies. A scene without replays is unchanged.

## Shape the layout reviewers will inspect

Start from mission heights, reach, rates, legal footprint and service space. Establish floor Z, forward direction, stationary frame, mounting faces, pivot axes and travel ranges. Place the largest constrained items first. Run a physical game piece from approach through release and reset before filling the remaining space.

Use one solid per functional volume, about 30 to 80 for a whole robot. Leave out fasteners, bearings, shafts, lines and brackets unless one is the risk being examined. [Keep the layout a blockout](../../../docs/preliminary-design.md#keep-the-layout-a-blockout)

Nothing floats. Each moving member touches, or is mounted to, something that traces to the frame, and `presentation.loadPaths` says in a sentence how its load reaches the frame and what drives it. A support that is not drawn yet is labelled under `attachment.unmounted` with its reason. [Nothing floats](../../../docs/preliminary-design.md#nothing-floats)

Under `presentation.required`, list the few roles this architecture cannot work without, such as its drive modules, battery and each mechanism's actuator. The page shows an absent role as Missing.

Select primitives by mating and clearance geometry: a cylinder for a wheel or a motor, a hollow, relieved or compound solid when a cavity admits a neighboring article. Reserve a wiring route with one conservative solid or a stated gap. Record outside dimensions, orientation, moving membership, material and mass source for each placed ID. Give paired supports one family name plus handedness.

Use the project's official field and game-piece models at scale, or source dimensions when it has none. Keep floor, fixtures, carried pieces and service gauges identifiable and separately accounted.

List each field part under `fixtures` in the design source and not as a solid of a robot group. A robot solid counts as robot in the opening fit and the robot bounds, and **Fit field interaction** stays off for a case without a fixture. The page states that reason beside the readout.

Animate operating, simultaneous loaded, returning, disabled and service paths. Label command playback, free-body physics and measured behavior each as what it is. A sampled gap carries its sampling scope. Distinguish intentional contact, verified clearance and unresolved contact. [Trials and replays](trials.md) covers retention and recorded physics.

## Copyable review rows

These synthetic entries illustrate the accounting convention. Replace numbers, components and limits with the project's sourced values. Give each mass or load line one identity even when several parts share it.

| Mass line | Placed IDs | Qty | Preliminary material and allocation basis | Inspection kg | Running addition kg |
| --- | --- | ---: | --- | ---: | ---: |
| Carrier assembly | carrier, pivot | 1 set | Aluminum carrier and steel pivot, estimated together | 1.8–2.1 | 0 |
| Remaining robot | Other hardware plus wiring allowance | 1 set | Itemized project estimate | 10.1–10.8 | 0 |
| Test article | sample | 1 | Separate carried payload | Excluded | 0.2–0.4 |

For a synthetic 14.0 kg inspection limit, 11.9–12.9 kg inspection weight leaves **+1.1 kg** against the high estimate. Running weight is 12.1–13.3 kg. If a selection contains only the pivot, keep the shared carrier line unallocated until a split is justified. Gauge space and envelope volume contribute zero material mass unless an actual article is separately estimated.

| Weak pack, loaded traverse | Battery A at this instant | Sag contribution at 0.030 Ω | Input power at the common 10.0 V bus |
| --- | ---: | ---: | ---: |
| Propulsion | 32 | 0.96 V | 320 W |
| Carrier actuator | 14 | 0.42 V | 140 W |
| Controls | 4 | 0.12 V | 40 W |
| Whole robot | 50 | 1.50 V | 500 W |

With 11.5 V open circuit, the modeled bus is **10.0 V**, or **+0.8 V** above a 9.2 V floor. This pack model permits 76.7 A and about 705 W at that floor; compare breaker, wire, branch and thermal limits separately. Calculate power at one coincident voltage/current point. If only ranges are available, label the result a bound and preserve shared or unknown loads. Aggregate current and power by unique load ID. Voltage is common to parallel consumers. [Shared electrical accounting](../../../docs/shared-power-review.md)

## Handoff check

After each publish, use the [short form](presentation.md#look-before-you-share). Run this full check once, before proposing the design as effective. Open the project-owned URL from a clean checkout. Keep browser-check captures outside the checkout and remove any scratch folder the browser tool leaves, such as `.playwright-mcp/`.

**Layout of the page**

- At a desktop width (1280 px or wider) the inspector column sits beside the viewer in the same row. It stacks below the viewer only at 960 px or narrower.
- The playback row (animation, Play, speed, slider, readout) sits directly below the canvas and the view controls sit above it.
- The header shows the architecture, design name and version, datum, units, narrative revision, receipt decision and first unmet requirement.
- `review-scene.mjs validate` lists no unexpected warnings.

**The model**

- The opening view fits the robot on the floor. Nothing floats. **Fit field interaction** frames the fixtures.
- Pick a surface and find a part by name. The inspector shows its identity, category, subsystem, motion group, material, volume, mass basis, support path, explanations, load lines and the phases it moves in.
- Focus it, show the assembly, locate it in the ledgers and select a ledger row.
- Orbit underneath, pan, toggle labels and page the callouts.

**Motion and evidence**

- Play every entry in the animation list. Each plays its whole phase in one clip. Scrub a loaded phase at two speeds.
- Open a phase in the check results. Jump from its tightest case to that pose.
- Play the displaced control, jump to its limiting pose and inspect both bodies.
- Open the receipt link.

**Budgets**

- Reconcile a custom subsystem against whole-robot mass and battery-side current.
- An incomplete roster, an overweight or low-voltage case and an obstructed path each stay visible when present.

## How the page verifies what it shows

This is how the stock page behaves. It needs no action from the author.

- The page fetches `review-scene.json.gz` beside it, decompresses it and hashes the content. It then loads `receipt.json` and shows the receipt's decision only when that receipt records this exact scene content and `issue` name. Otherwise it shows the findings recorded when the scene was built and says so.
- In the receipt, `view.sha256` is the stock page the check shipped, `view.scene.sha256` covers the compressed scene, and `view.scene.contentSha256` and `view.scene.bytes` cover the decompressed scene.
- The check credits a view when the page exists and the scene decompresses to the expected content. It does not compare the page with the stock page.
- The stock page ships a Content-Security-Policy suited to what it loads. Keep it, or tighten it, if you change the page.
