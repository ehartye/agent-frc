# Whole-robot review layout template

Use this page order for a preliminary design review. Copy the starter into the **owning season repository** under `cad/preliminary-design/`, or under the active numbered iteration's design root. Keep the files needed to launch the UI in that project. A teammate with a fresh checkout should be able to open the review, spin the robot and trace a budget figure back to its source.

## Start a project-owned review

From the season repository root, run the installed plugin's [synthetic generator](../../../examples/preliminary-design/create.py) once with its geometry Python environment. Supply its actual path in place of `PLUGIN`. Use a new release ID for each reviewed revision. The example uses invented dimensions, limits and duties. Replace these inputs with the selected project's assumptions.

```sh
python PLUGIN/examples/preliminary-design/create.py . --project-review --release layout-001
python cad/preliminary-design/serve.py
```

Open `http://127.0.0.1:8000/`. For a LAN review pass `--bind LAN_ADDRESS --port 8000` using the host's LAN address. Stop the server with Ctrl+C. The launcher serves only the project-owned static site. A fresh checkout needs Python's standard library for LAN hosting; the published site runs entirely in the browser.

```text
cad/preliminary-design/
  serve.py, stage.py             project-owned launcher and immutable release packager
  .gitignore                     keeps the input-side compressed geometry out of version control
  pages-workflow.yml             starter for the season's main-branch Pages workflow
  releases/layout-001/
    design.json, layout.json     issue, mounting datums, groups and member IDs
    package.step, paths.json     editable package inputs and checked motions
    package-limits.json          inspection, running and electrical requirements
    budgets.json, narrative.md   source estimates, duty cases and accepted objectives
    receipt.json                 checker decision with verified view and geometry digests
    missions.json                mission-task cases this release plays
    package-motion.html          checked review page: regions, data and interactions
    package-motion.geometry.json.gz compressed geometry the page fetches (ignored; see below)
    release-lane-trial.json      example pinned evidence for a field interaction
    field/release-lane.html      synthetic, self-contained season field player
docs/preliminary-design/
  index.html, releases.json      stable viewer and ordered release index
  fonts/                         bundled theme fonts, fonts.css and their OFL licenses
  releases/layout-001/
    index.html                   this revision's review page, data and interactions
    package-motion.geometry.json.gz  the only committed copy of this revision's display geometry
    motion.json, receipt.json    checked paths and exact review evidence
    release.json                 work-in-progress label, status, digests, mission cases and field players
    field/release-lane.html      the release's pinned, self-contained field player
    budgets.json, limits.json    this revision's resource accounts
  releases/layout-002/           next reviewed revision, same structure
```

The page holds the regions, ledgers and evidence rows. It fetches its display geometry from the gzip file beside it, decompresses it with `DecompressionStream` and, in a secure context such as `localhost` or HTTPS, compares it with the content digest embedded in the page. Each distinct tessellation is stored once; cases carry only their placements. In the receipt, `view.sha256` covers the page bytes, `view.geometry.sha256` covers the compressed bytes and `view.geometry.contentSha256` covers the decompressed content. The checker credits a view only when the page matches and the file decompresses to the expected content. Serve the review over HTTP; a page opened from `file://` explains that it cannot load the geometry. Staging copies the file into the release. `stage.py --check-index` and the release gate reject a release whose served geometry differs from its page or receipt.

The starter's `.gitignore` leaves the input-side geometry uncommitted, so the published release holds the only committed copy. The checker writes missing view files but never overwrites one; delete a stale view or geometry file before `--write-view`. A different Python or zlib build can compress the same content to different bytes. Before staging from another workstation, rerun the check with `--write-view` and save that run's receipt; staging refuses geometry bytes the receipt does not pin.

An active iteration can keep its editable inputs under its own design root. Keep its site and launch command reachable from the season root. Check in any custom scene, textures, fonts, styles, scripts, traces or serving config that its display reads. Deliver restricted sources under the project’s declared custody. Inspect each artifact's rights and visibility before adding it to a public site. The starter bundles only its synthetic viewer, reviewed motion, receipt and budget files.

### Multiple releases and Pages

Issue another synthetic example with `--release layout-002`. For a project-authored release, keep the commissioned layout, its checked HTML, `receipt.json` and `missions.json` in its input directory, then run `python cad/preliminary-design/stage.py RELEASE_ID`. A release is a work-in-progress preliminary design. It need not be ready for detailed design, but it must obey the checked physics and show a meaningful mission task. Staging requires a `layout-checked` receipt and at least one mission case. Each case names a passing operating case, its accomplishment (`acquired`, `delivered`, `scored` or `climb-held`) and a `represented` narrative objective. Staging verifies the view and input hashes, writes `release.json`, appends a distinct release and sets the current pointer. Check the staged directory with `node PLUGIN/scripts/preliminary-release.mjs verify docs/preliminary-design/releases/RELEASE_ID`. Issued directories are immutable. Keep all earlier entries on the same branch. Pull before issuing from a second workstation. Reconcile concurrent releases by retaining the union of immutable directories and IDs, explicitly choose the current ID, then run `python cad/preliminary-design/stage.py --check-index` on the merged tree. It compares the index with the actual release directories and checks each view digest. The project launcher needs no running authoring process. Local staging locks release on process exit. If an interruption left a complete release before the index update, rerun staging with the same ID and inputs; different bytes stop the update. Open the stable review for the latest release; use `?release=layout-001` to share an earlier one. Preserve additional query parameters for a release page with named cases. An unknown release must identify the requested ID and offer the selector.

For a new project without a Pages workflow, opt in by copying the provided `cad/preliminary-design/pages-workflow.yml` to `.github/workflows/preliminary-review.yml`, enable GitHub Actions as the Pages source and commit the static bundle on `main`. The workflow deploys the complete `docs/` tree. The stable review URL is `/<repository>/preliminary-design/`; sibling season pages remain accessible. For an existing season showcase, include that directory under `preliminary-design/` in its current Pages artifact and link it from the season index as a secondary, work-in-progress page. Keep one deployment workflow for the combined site. The latest detailed design stays the primary view, README still and model selector. Register the tree under `preliminaryReleases` in the staged policy, with the season index as its one `secondaryLink`, and the release inputs under `preliminaryInputs` in the source policy, so the [mechanical model eligibility gate](../../../docs/private-model-release.md#publish-work-in-progress-preliminary-releases) admits new releases by receipt instead of a mechanical signature. For existing direct publishing from `main /docs`, check in the subdirectory and reuse that publishing source. Use relative URLs for assets, release links and evidence. Exercise latest, a prior `?release=`, an unknown ID, and a direct release URL under a repository subpath. LAN hot reload can wrap the same static bundle. [Checked view generation](../../../docs/preliminary-design.md#work-a-synthetic-package)

## Page order

| Region | Put on the page | Review action |
| --- | --- | --- |
| 1. Review header | Selected architecture, issue, datum and units, strategic narrative revision, current decision and first unmet requirement. The stock view reads `presentation.architecture`, the datum and the narrative pin from the plan, and the decision and first unmet requirement from the receipt. | Open the objective and its nominal, adverse or fallback case. |
| 2. Model and controls | Largest pane on the page. Open on the parked whole robot in three-quarter view on the field floor with a visible scale. The default fit frames the robot and the floor; **Fit field interaction** frames the robot with its field fixtures. Provide a motion selector, play/pause, scrubber, clock and the observed outcome. Dock a component inspector beside the model on wide screens and directly below it on narrow ones; the resource figures follow the viewer row. | Orbit through 360° and underneath, pan, zoom, fit/reset, select by face or name, isolate and restore, toggle labels and follow an article through a complete cycle. Keep the camera on scrub. |
| 3. Resource figures | Immediately below the viewer and above the ledgers. Show inspection limit, low/high estimate, signed headroom and running weight. Show the selected duty, battery condition, total battery A, minimum bus V, required V and signed margin. | Choose a duty and pack condition. The figures and highlighted ledger rows follow the same selection. |
| 4. Weight ledger | Rows for physical components or individually owned shared allocations, then outstanding allowances. Include count, material, volume type and units, kg range and basis. Show excluded inspection items and running additions separately. | Drill into a category or define a subsystem by selecting placed IDs. Reconcile each subtotal to the whole robot. |
| 5. Electrical ledger | List each simultaneous load or shared load, its consuming IDs, battery-side A, pack sag contribution and input power at the reported operating point. Give pack inputs and the whole-robot voltage and power available at the required floor. Show a limiting branch or actuator-terminal drop when known. | Compare nominal and weak pack in the same duty. Select the governing load and locate the consuming articles. |
| 6. Motion evidence and decision | For each named path list starting pose, participating groups, environment, metric, units, limiting pair/time, clearance allowance, evidence method and result. Include displaced, inhibited or adverse controls and uncovered cases. Make the displaced control a playable case. Link season-owned field-interaction or physics players. | Jump to the limiting pose, inspect both bodies and open the pinned receipt. Identify what sends the layout back to preliminary or conceptual design. |

Use the blue-and-gold [field console theme](../../../templates/kickoff/index.html): navy `#142f63` masthead, blue `#194fb0` actions, paper `#f7faf8` panels, ink `#182e49` text and gold `#ffd078` selection. Use Barlow Condensed for display, Source Sans 3 for body text and tabular numerals for budgets. The starter copies Latin subsets of both fonts and their SIL Open Font License files into `docs/preliminary-design/fonts/`, so the review works offline. Keep the license files with the fonts. Without that directory, pages fall back to system fonts. Apply the resolved [component palette](../../../docs/cad-color-convention.md) consistently across the model, selection and ledgers. Keep a readable category swatch and text status in filtered views. Place optional labels in an ordered side rail with leaders approaching along a common axis. Provide keyboard controls and fit the canvas and ledger tables to smaller screens.

## Shape the assembly reviewers will inspect

Start from mission heights, reach, rates, legal footprint and service space. Establish floor Z, forward direction, stationary frame, mounting faces, pivot axes and travel limits. Place the largest constrained items first. Run a physical game piece from approach through release and reset before filling the remaining space. Include the support and drive path to each moving member: frame, bracket, bearings, shaft, transmission, actuator and its stator attachment. Commission wheel, motor, controller, distribution, supply, communications and loom IDs for the chosen architecture. Show absent roles and floating loads as open issues.

Select primitives by mating and clearance geometry. Use cylinders for wheels, shafts and motors, a swept tube for cable routes, and a hollow, relieved or compound solid when a cavity admits a neighboring article. Record outside dimensions, orientation, moving membership, material and mass source for each placed ID. Give paired supports one family name plus handedness. Use scale and source dimensions for interacting fixtures and all finite game pieces. Keep floor, fixtures, carried pieces and tool/withdrawal gauges identifiable and separately accounted.

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

### Fill the review header and motion evidence

The checker builds regions 1 and 6 from the plan and its own results. Add these optional fields under `presentation` in `layout.json`:

| Field | Shape | Shown as |
| --- | --- | --- |
| `architecture` | string | Selected architecture in the header. A missing name stays visible. |
| `caseKinds` | `{CASE_ID: KIND}` with `nominal`, `inhibited` or `adverse` | Kind of each commissioned path. Unlisted cases are nominal. The displaced control is added automatically. |
| `uncoveredCases` | `[{id, condition, reason}]` | Conditions this release has not evaluated. Unrepresented narrative objectives are added automatically. |
| `components[ID]` | `name`, `category`, `subsystem`, `material`, `volumeType` (`material`, `envelope` or `gauge`), `purpose`, `rationale` | The component inspector. The stable ID, motion group, occupied volume, mass lines with their basis and shared-allocation notes, electrical load lines and moving cases come from the plan, budgets and motion study. Each unsupplied field shows as missing. A field fixture, payload or service item is shown as excluded from inspection weight; a gauge still needs its own mass line, which may be zero. |
| `fieldInteractions` | `[{title, href, objective, evidence, embed}]` | Links to season-owned field-interaction or physics players. `href` is relative to the release page or an `https:` URL. `objective` names the mission objective; one outside the reviewed narrative is flagged. `evidence` is a description or a `{file, sha256}` pin in the release inputs, which the checker verifies. Optional `embed: true` offers an in-page frame. |

For each path, the stock view takes the limiting pair from pairs that include a moving body: a failure or open interval first, then the smallest gap or interval lower bound. An interval bound has no single limiting pose, so **Jump to limiting pose** needs a witness time. The receipt's `decision` records the final `status` and `firstUnmet` requirement. Clearance findings come first, then weight, voltage, the displaced control, held reopen decisions and missing inputs. The page shows its view-time findings until it loads a `receipt.json` that pins the page and its scene. The conceptual-design return criteria list each accepted conceptual premise from that receipt.

Keep field-interaction and physics players project-owned. Each one is first-class preliminary evidence for its mission task. Put it in the release inputs at `field/NAME.html` beside the review page, link it with `href: "field/NAME.html"` and pin its trial as `evidence: {file, sha256}`. Staging publishes the page and its trial in the release and lists them under `fieldPlayers` in `release.json`. The page must be self-contained. Its first element after the charset, viewport and title is a `Content-Security-Policy` meta with `default-src 'none'` that allows only inline script and style and `data:` or `blob:` media. It may not load an external script, frame, stylesheet, image or font, or use `fetch`, sockets, workers or navigation. Inline everything the playback needs, including its trace. An issued player is immutable; correct it in a new release. The page re-checks each link and sandboxes an embedded player from another origin. The starter includes a clearly synthetic placeholder.

### Migrate an existing release

Issued releases are immutable. Issue the new regions and compressed scene as a new release such as `layout-002`. Copy the plugin's `templates/stage-preliminary-review.py` over `cad/preliminary-design/stage.py` and `templates/preliminary-review-index.html` over `docs/preliminary-design/index.html`. Copy `templates/preliminary-review-fonts/` to `docs/preliminary-design/fonts/` and `templates/preliminary-review-gitignore` to `cad/preliminary-design/.gitignore`. Copy the pages unchanged; the release gate admits only the plugin's stable viewer and font files. Copy the layout inputs into the new release directory, add the presentation fields, delete the copied `package-motion.html`, then run the check with `--write-view`. Stage the new ID and run `--check-index`. A release that was never published may instead be regenerated in place: delete its input-side view and geometry, its `docs` release directory and its ID in `releases.json`, then check and stage it again.

## Handoff check

Open the project-owned URL from a clean checkout. Confirm the header shows the architecture, issue, datum, units, narrative revision, receipt decision and first unmet requirement. Pick a surface and find a part by name; confirm the inspector shows its identity, category, subsystem, motion group, material, volume, mass basis, explanations, load lines and moving cases. Isolate it, restore the full assembly, locate it in the ledgers and select a ledger row. Confirm the opening view fits the robot on the floor and **Fit field interaction** frames the fixtures. In region 6, play the displaced control, jump to its limiting pose and inspect both bodies. Open the pinned receipt and each linked field interaction. Use the component selector and surface picking, orbit underneath, pan, hide labels and scrub a loaded case. Reconcile an editable subsystem against whole-robot mass and battery-side current. Prove that an incomplete roster, an overweight or low-voltage case, and an intentionally obstructed path stay visible even after filtering. Check a nominal path and its adverse control. Link the layout revision, limits, traces and review receipt. List any feature still to be supplied by the season page; the stock player demonstrates prescribed package motion and the budget summary. Project-specific field physics and qualification require their own evidence.
