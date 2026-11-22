# Keep the working robot private while checking a public replacement

Run the same source and final-site checks at the release station and in CI. Every published design holds a status: `in-progress`, `effective`, `superseded` or `withdrawn`. A detailed design becomes `effective`, and takes the primary view, only through the signed mechanical issue below. An [in-progress detailed design](#publish-detailed-designs-by-status) publishes beside it on automated prerequisites: an effective preliminary link, a passing layout check on the Fusion export and a mission animation. A [preliminary design release](#publish-preliminary-design-releases) needs a layout-checked receipt and a mission-task case, and stays secondary to the detailed designs. For branch-served Pages, require **Mechanical model eligibility** before merging into the served branch. For generated Pages, verify the final build before upload. Read the gate code, baseline revision and verification key from trusted configuration. Preserve the project’s existing admin policy.


## Keep a retired robot online during a numbered restart

At cutover, read the active design from its private checkout. Set the project name to the exact name in the trusted source and stage policies. This command prints a small public selection containing the iteration identity, opening digest and a pending issue.

```sh
node PLUGIN/scripts/public-model-release.mjs select PRIVATE_PROJECT POLICY_PROJECT
```

Keep that JSON in the protected CI setting `FRC_ACTIVE_MODEL_SELECTION`. Set `FRC_REQUIRE_ACTIVE_MODEL_SELECTION=true` in the approved verification job. This also works when the public checkout omits private iteration records. A pending selection lets the trusted source and final-site audits retain the exact approved historical output and independently rebuilt field pages. The same setting rejects signed replacements from the previous design. Use the combined local release command for a historic rebuild that still carries its previous packets. Pair verification by itself checks eligibility for a replacement.

For a new whole robot, include `"publicationScope":"whole-robot"` in the independently commissioned operating profile; use `"subsystem"` for a deliberately separate subsystem showcase. Set the numbered delivery's `scope` to this exact value. Run normal private issuance on the active canonical Fusion authority and fresh STEP. A passing numbered packet covers the opening, authority, export lineage, commissioned scope and exact delivered assets. After private approval, run the selection command again with the **source-side signed packet, reviewer public key and project-relative private study path** as its final three arguments. Check the current native issue and update the protected selection with that output. The source and staged packet continue to have separate path inventories. A subsystem destination needs a separately commissioned policy and trusted `FRC_MODEL_SCOPE=subsystem`. Use a distinct destination when publishing both scopes.

Read the setting from trusted workflow configuration before checking a replacement. When CI uses a wrapper, pass it to source audit, staged audit and pair verification. Use a separately trusted verifier pin even where a historic showcase still needs the original builder. The setting carries hashes and a scope; suppliers' private files stay at the qualified station.

## Local release command

Use a clean checkout of the approved commit outside the candidate. Freeze a known approved site's exact digest once with `node PLUGIN/scripts/local-showcase-release.mjs digest APPROVED_SITE`. Retain that digest independently. For the first model on an existing kickoff-only site, include the already published entry page in the protected inventory and require signed delivery for the new CAD assets.

Store the following inputs in the approved project's `.github/showcase-release.json`. Replace the sample digest with the actual frozen SHA-256.

```json
{
  "schema": "agent-frc/local-showcase-release@1",
  "layout": "branch",
  "servedDirectory": "docs",
  "sourcePolicy": ".github/source-policy.json",
  "stagePolicy": ".github/staged-policy.json",
  "sourcePacket": ".github/model-release/source.json",
  "stagePacket": ".github/model-release/staged.json",
  "approvedSiteSha256": "<approved full-site SHA-256>"
}
```

Use `"layout":"built"` for a separately generated site. The [trusted adapter](../templates/prepare-showcase-release.mjs) prepares `station.json` from this register, the approved Git SHA, original presentation build, public reviewer key and any independently rebuilt field output. A station can instead directly supply those values using `approvedCommit`, `approvedSite`, `reviewerPublicKey` and optional `independentFieldRoot`. Relative station paths resolve from its configuration file.

```sh
node APPROVED_PROJECT/scripts/prepare-showcase-release.mjs APPROVED_PROJECT PROJECT PLUGIN FRESH_OUTPUT
node PLUGIN/scripts/local-showcase-release.mjs check FRESH_OUTPUT/station.json PROJECT
```

For a separate build, pass its actual final site as the last argument, e.g. `node PLUGIN/scripts/local-showcase-release.mjs check FRESH_OUTPUT/station.json PROJECT FRESH_OUTPUT/site`. Branch mode walks the registered directory in the checkout and compares every file to its committed Git blob. Both modes reconcile every protected source asset, signed asset in the source packet and both public issue packets to their committed Git blobs, use the two policies from the approved commit, compare the complete final tree against the frozen site, and require the two signed packets to designate the same issue when either is supplied. Changed protected model files require a signed issue. Save stdout as the release receipt only on exit zero, and publish those exact bytes. Changes after review require a new run. [Project setup and CI](project-ci.md)

## Qualify the exact public assets at the private station

Use the complete source-bearing assembly and a clean copy of the released plugin. Before the full private review, set `FRC_OPERATING_REQUIREMENTS` to the independently held commissioning plan and select the approved profile. [Operating intent and native joint coverage](operating-intent.md) If a supplier permits only derived views, keep its STEP and F3D outside the public artifact. Have the reviewer retain their Ed25519 private key outside all project trees. The public verifier needs only the corresponding public key and the signed receipt.

```sh
node PLUGIN/scripts/public-model-release.mjs issue PRIVATE_ROOT issue/readiness.json delivery.json PRIVATE_SIGNING_KEY.pem NEW_PACKET.json
node PLUGIN/scripts/public-model-release.mjs verify PUBLIC_ROOT NEW_PACKET.json TRUSTED_PUBLIC_KEY.pem PROJECT_ID
```

The delivery JSON contains `project`, a clearly bounded `scope` and `files`. Each entry has the path relative to the public root and an optional `local` path inside the private issue for the same bytes. List every exposed camera still, geometry file, native download, selector or variant mapping and alias that will change. The private distribution register binds these origin files to the reviewed assembly and license basis. The issuer independently reruns the native-solid check and writes a signed public packet with digests. The signature does not publish the private STEP, model paths, evaluator data or signing key.

For the built-in highlight/README builders, set `mechanicalReadiness` to `{"signedPacket":"issue/public-model.json"}` and configure trusted `FRC_MODEL_PROJECT` and `FRC_MODEL_REVIEW_PUBLIC_KEY` in the builder's environment. The key file must live outside the candidate tree. A static public site can instead deploy the prebuilt, signed views directly and audit its final staged output.

## Guard a branch-served public directory

Commit the trusted policy with the previously approved release. Use `agent-frc/public-model-policy@1` with `project`, `publicRoots` (such as `["docs"]`) and `modelFiles` (exact repo-relative paths). Include all deployed hero images, model selectors, model-bearing HTML or embedded JavaScript, manifest/mesh files and download aliases, including linked robot files elsewhere in the repository. The verifier also walks the current and historical public directories for CAD file formats. Project entry points that generate a URL at runtime need a project-local route/DOM test that resolves its final asset against this inventory.

```sh
node PLUGIN/scripts/public-model-release.mjs audit REPO APPROVED_COMMIT policy/model-files.json
node PLUGIN/scripts/public-model-release.mjs audit REPO APPROVED_COMMIT policy/model-files.json NEW_PACKET.json TRUSTED_PUBLIC_KEY.pem
```

The first command permits changes outside the model inventory while preserving previous model bytes. The second admits a changed registered asset only when its public path and bytes match the separately trusted signed issue. Pin the approved Git commit externally. A moving default branch cannot identify the historical release. Keep critical policy and workflow changes under independent review.

## Guard a custom, generated site

Compare the fully assembled deployment directory after capture rewriting, alias generation or other postprocessing. Obtain the previously approved output from a trusted release or archived artifact. Keep its digest and the trusted staged policy outside the candidate’s control.

```sh
node PLUGIN/scripts/public-model-release.mjs audit-staged APPROVED_OUTPUT CANDIDATE_OUTPUT TRUSTED_POLICY
node PLUGIN/scripts/public-model-release.mjs audit-staged APPROVED_OUTPUT CANDIDATE_OUTPUT TRUSTED_POLICY NEW_PACKET.json TRUSTED_PUBLIC_KEY.pem
```

A staged policy uses `agent-frc/staged-model-policy@1`, the trusted `project`, the required `modelFiles` and `mutableFieldPages`. List only independent field-lab HTML files there. The full comparison rejects other added, changed or removed output without a signed replacement. Keep model selectors, the hero, archives, assets and legacy routes outside the mutable list. Run this check on the directory actually passed to upload. The dependent deploy job runs only on success, so a failed candidate leaves the current site online.



A changed field page is exempt only when its exact bytes equal a clean independent rebuild outside both deployment trees. In trusted CI, run the pinned plugin's `kickoff.mjs --profile … --output …` or `strategy-lab.mjs … --html …` with the project-owned data, then set `FRC_VERIFIED_FIELD_ROOT` to that independent output root. Rebuild each of the named field-only pages. Apply the same fixed, reviewed postprocessing to both independent and proposed outputs if a project customizes them. A candidate cannot supply the reference executable or replace this directory. A signed mechanical receipt covers changed render receipts, stills, selected models and gallery views.

When the source tree and final Pages output use different filenames, issue each delivery list for the same reviewed model. Run `node PLUGIN/scripts/public-model-release.mjs verify-pair SOURCE_ROOT SOURCE_PACKET STAGED_ROOT STAGED_PACKET TRUSTED_PUBLIC_KEY PROJECT_ID` against the actual two trees before deployment. Both signatures and every listed file must verify. The project, scope, configuration, archive, STEP, study and solid count must agree. Keep the staged inventory check for extra public files.

If a field page also emits independently generated JSON, list each exact existing path under `mutableFieldData` in the approved staged policy. Its contract can specify the exact `schema` value and/or the exact array of top-level `keys`. Pin both where available. A representation without its own schema uses the full key inventory. Both staged files must parse as the approved object shape; any changed bytes must exactly match the independently regenerated file in `FRC_VERIFIED_FIELD_ROOT`. Keep CAD selectors, manifests and their asset inventories under the mechanical model gate.

## Publish preliminary design releases

Two classes of model output can share one site. A **detailed showcase model** becomes effective and replaces the primary view, README still, selector or download only through the full mechanical-readiness gate and a signed issue above. An [in-progress detailed design](#publish-detailed-designs-by-status) sits beside it. A **preliminary design release** presents a whole-robot layout revision from the preliminary design phase. It does not need detailed-design readiness. It must obey the checked physics and play a meaningful mission task. It stays secondary: the latest approved detailed design remains front and center, and the release identifies itself as preliminary design with its [design status](design-phase-detail.md#design-status). A preliminary design release may be in progress or effective: an effective one is the project's accepted preliminary design, which detailed design builds on.

Opt in through the approved staged policy. The final-site audit reads it from the approved commit, never from the candidate.

```json
{
  "schema": "agent-frc/staged-model-policy@1",
  "project": "Teaching project",
  "modelFiles": ["models/robot.glb"],
  "mutableFieldPages": [],
  "preliminaryReleases": {
    "root": "preliminary-design",
    "primaryEntryPoints": ["index.html", "media/robot-still.png", "models/selector.json"],
    "secondaryLink": "index.html"
  }
}
```

`root` is the deployed path of the [preliminary review tree](../skills/frc-preliminary-design/references/review-layout-template.md#multiple-releases-and-pages). `primaryEntryPoints` lists the detailed design's deployed entry page, README still and model selector. Keep these, `modelFiles` and field outputs outside `root`. Without the field, the preliminary tree stays under the full gate. The optional `secondaryLink` names one primary entry page that may gain exactly one plain, relative anchor to the tree, such as `<a href="preliminary-design/">Preliminary design</a>`. The anchor uses double quotes and plain text (letters, digits, spaces and `.,()-`). It must sit in ordinary element content, between tags, never inside a tag, attribute, comment, script or other raw-text element. Up to 16 whitespace characters may come with it on each side. Any other difference on that page, a second link, extra attributes, markup inside the anchor or another target still needs a signed detailed-model issue. The primary model, still and selector stay byte-identical.

The final-site audit applies this class only inside `root`:

- **Scope.** Only the stable viewer `index.html`, `releases.json` and the files of `releases/ID/` qualify. A release directory holds `index.html`, `review-scene.json.gz`, `receipt.json`, `motion.json`, `budgets.json`, `limits.json`, `release.json`, any trial file its record names and the season field players its record lists under `field/NAME.html`. Any other file is rejected. A signed packet cannot authorize a file inside `root`.
- **Physics.** Each added release is bound by digest to an Agent FRC preliminary-check receipt with status `layout-checked`: every nominal clearance case, the inspection mass and every loaded-voltage case pass, the displaced control is rejected, and `missingInputs` and `reopen` are empty. `provisional`, `reopen`, `blocked` and partial `--fail-fast` receipts are refused. The receipt, `motion.json` scene and STEP digest, budget files and `index.html` page must equal what the receipt and release record pin. The motion, budget, limit and trial files must parse as their evidence JSON, with no nested glTF document, data URI or base64 glTF binary. The [review scene](../skills/frc-preliminary-design/references/review-layout-template.md#scene-data-and-who-supplies-it) the page reads must be pinned by the receipt (compressed bytes, content digest and size, decompressed within a fixed bound), valid against its schema, and repeat the receipt's issue, STEP and motion pins, exact case set and results, rejected displaced control, narrative objectives, parked-assembly result, duty figures and mass. Its limit, mass lines and duty loads must equal `limits.json` and `budgets.json`, and its own decision never claims a checked result. The gate does not compare the page's markup or script: the plugin's stock review page is the starting place every season copies, and a season may change its copy. The season's own pull request review covers what its page does. `preliminary-release.mjs verify RELEASE --compare-template` and `stage.py --check-index --verifier …` report, for information only, whether a page is the stock page, how it differs and whether it declares a Content-Security-Policy. The stock page ships one by default; the gate does not require it.
- **Mission.** The release record declares at least one mission-task case. Each names a passing operating case in the checked cycle, the accomplishment (`acquired`, `delivered`, `scored` or `climb-held`) and a `narrativeReview` objective whose disposition is `represented`. A `field-interaction-trial` either publishes the trial file that the receipt pins for that case under `transportedBy` or `freePath`, or names a listed field player as `player`.
- **Field players.** A season field-interaction or physics player is first-class mission evidence. Each one is listed in `fieldPlayers` with its `file`, `sha256`, published `trial` pin and represented `objective`. Its trial must be the evidence the review scene pins for that link, or one the receipt pins under `transportedBy` or `freePath`. Every `fieldInteractions[].href` in the review scene must resolve to a listed player in the same release, and every listed player must be linked from the scene with the same objective. For a mission case that names a `player`, the trial's `case` must be that case. The page must be self-contained. Its first element in `<head>` is exactly `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'">`, the plugin's canonical policy. Both checkers compare it byte for byte, so the browser refuses every network, frame and form request. A shared tokenizer then rejects any other `http-equiv`, any external script, any frame, object, form or linked resource, any `href` other than an in-page `#` fragment, and any resource URL other than `data:` or `blob:`. As a best-effort heuristic, it also rejects obvious network APIs such as `fetch` and `WebSocket`; the policy, not this pattern, is what blocks network access. The page should name the preliminary design release it belongs to; the gate does not check its wording. The tokenizer follows the HTML standard for comments, raw text and inline `<svg>`, and refuses `<math>` and `<foreignObject>`. It is a tokenizer, not a browser. The exact policy is what blocks network access. For the rest, including script-driven top-level navigation, the control is that the season authors these pages and reviews them in its pull request. Like every other release file, an issued player is immutable.
- **Front and center.** Every primary entry point must equal its approved bytes unless a signed detailed-model issue covers it.
- **Phase.** Each added release's `release.json` carries `"phase": "preliminary-design"`, so it cannot be mistaken for the released detailed model. This record field is the only identity the gate checks; the stock page displays "Preliminary design" and the design status for readers.
- **Design status.** The mutable `releases.json` may carry `designStatus`, mapping listed release IDs to `in-progress`, `effective`, `superseded` or `withdrawn`; a listed release without an entry is in progress. At most one release is effective. A new release enters in progress (or effective). Allowed changes against the approved index: in-progress to effective, the previous effective to superseded (required whenever another becomes effective), and any status to withdrawn; nothing returns from superseded or withdrawn. A release made effective needs a layout-checked receipt and, when any release was effective before, a receipt checked against the last one: its `previousCheckpointSha256` equals the SHA-256 of that release's published `receipt.json`, and every entry in its `priorDecisions` is `repeatVerified`. A release may be added directly as effective in the same index edit when these conditions hold; otherwise it enters in progress. Run the preliminary check with `--previous` that receipt before staging, because an issued receipt never changes. `effectiveHistory` lists every release made effective, in order, and may only grow, so withdrawing an effective release does not waive the check. Legacy and historical releases cannot become effective; a historical review counts as superseded. `current`, the release the stable URL opens, must be the effective release, or the newest in-progress release when none is effective. Status changes never touch an issued directory. Mark a release with `python cad/preliminary-design/stage.py --set-status RELEASE effective` (or `withdrawn`) in a reviewed pull request; no signature is needed.
- **History.** Releases already in the approved site stay byte-identical. `releases.json` may only append IDs; `current` and `designStatus` follow the rules above. The stable viewer equals the approved copy or the plugin's template, It shows each release's design status.

Every other added, changed or removed output keeps the full gate. The audit trusts the receipt's recorded results; it does not rerun the checker. The player's tessellated solids are display data that the audit does not compare with the STEP. Keep the season's checker run, its inputs and review under the project's own controls. Without `preliminaryInputs`, the source audit treats a release input STEP inside a public root as a detailed model asset; see [source-side release inputs](#source-side-release-inputs).

### Source-side release inputs

The template keeps each release's editable inputs, including a block-level `package.step`, under `cad/preliminary-design/releases/ID/`. When a public root contains them, opt that tree into the class in the approved source policy:

```json
{
  "schema": "agent-frc/public-model-policy@1",
  "project": "Teaching project",
  "publicRoots": ["docs", "cad"],
  "modelFiles": ["cad/robot.step"],
  "preliminaryInputs": {"root": "cad/preliminary-design/releases"}
}
```

The source audit admits a new `ID/package.step` directly inside that tree without a signature only when the same directory holds a layout-checked `receipt.json`. That receipt must pass the physics rules above. The layout, STEP, motion, view and budget files must match its pins. A directory already in the approved commit is immutable: no file may change, appear or disappear. Any other CAD file, including extra or nested geometry in a release directory, keeps the full gate. `layout.json` must pin the same STEP and motion as the receipt. A new STEP may not duplicate any committed, registered or signed model outside the tree. `modelFiles` and signed files cannot sit inside the tree, so a preliminary input is never the primary model. The receipt is the season's own checker output; the audit does not rerun the checker, so review the run that produced it. With a source commit, every file in a new release directory must equal its committed bytes. A release can also carry its interacting field parts in a separate STEP, such as `ID/field-fixtures.step`. The audit admits that file when the motion study the receipt pins names it as a fixture source with the same SHA-256. The audit reads the STEP instance by instance, skipping comments and respecting strings. Every product must be a simple, unescaped registered fixture solid, with one solid body per product. Every shape representation must be reached from a registered fixture product through its product definition formation, product definition, product definition shape and shape definition representation, with exactly one per product. The audit refuses any representation no fixture product reaches. Surface, wireframe and tessellated models, representation relationships and instanced assemblies are refused. Every fixture ID must sit in a receipt group with role `other` that holds only fixtures. No fixture ID or solid may name a robot member or a solid in `package.step`. Any mass line that names a fixture must hold only fixtures, at `[0, 0]` kg. Like the package, it may not duplicate a committed, registered or signed model. The audit checks names and structure, not geometry, so review the fixture file in the season's pull request like any other preliminary input.

### Release record

The project's `stage.py` writes `release.json` from the checked receipt and the input directory's `missions.json`:

```json
{
  "schema": "agent-frc/preliminary-release@1",
  "release": "layout-002",
  "issue": "synthetic-package-layout-002",
  "phase": "preliminary-design",
  "status": "layout-checked",
  "receipt": {"file": "receipt.json", "sha256": "<receipt SHA-256>"},
  "view": {"file": "index.html", "sha256": "<page SHA-256>"},
  "scene": {"file": "motion.json", "sha256": "<motion SHA-256>", "stepSha256": "<STEP SHA-256>"},
  "missionCases": [
    {"case": "release", "kind": "operating-case", "accomplishes": "delivered", "objective": "Acquire, turn and release"}
  ],
  "fieldPlayers": [
    {"file": "field/release-lane.html", "sha256": "<page SHA-256>",
     "trial": {"file": "release-lane-trial.json", "sha256": "<trial SHA-256>"}, "objective": "Acquire, turn and release"}
  ]
}
```

`status` is the receipt's physics result, `layout-checked`; the release's design status lives in `releases.json`. Staging derives `fieldPlayers` from the review scene. In the layout, link each player as `presentation.fieldInteractions[].href: "field/NAME.html"` with a pinned `evidence: {file, sha256}` trial, and keep the page at `field/NAME.html` beside the review page in the release inputs. A mission case can point at the player with `{"case": "release", "kind": "field-interaction-trial", "accomplishes": "delivered", "objective": "Acquire, turn and release", "player": "field/release-lane.html"}`.

For a contact-transport trial, use `"kind": "field-interaction-trial"` with `"trial": {"file": "acquire-trial.json", "sha256": "…"}` in `missions.json`. Staging publishes that pinned file beside the receipt. Check a staged release before committing it:

```sh
node PLUGIN/scripts/preliminary-release.mjs verify docs/preliminary-design/releases/layout-002
```

### Adopt the class in a season repository

1. Pin the plugin release that provides `scripts/preliminary-release.mjs`. Copy its `templates/stage-preliminary-review.py` over `cad/preliminary-design/stage.py` and its `templates/preliminary-review-index.html` over `docs/preliminary-design/index.html`. The updated `stage.py --check-index` applies the same physics and mission rules to every listed release.
2. Add `missions.json` beside each new release's `layout.json` and `receipt.json`. A release built before the stock review page and its scene must be regenerated: delete its `package-motion.html` and any `*.geometry.json.gz`, rerun the preliminary check with `--write-view`, save the new receipt and stage it under a new ID. Records issued with the earlier `label` stay valid for releases already published. A release that has never been deployed and lacks `release.json` cannot be restaged under the same ID. Remove its unpublished directory and its `releases.json` entry, then run `python cad/preliminary-design/stage.py RELEASE_ID` again. Do not alter a release in the approved site; issue a new ID. If the approved site already serves releases without `release.json`, list their IDs once under `"legacy"` in `releases.json`. They must be the earliest entries, in order, and already be in the approved site. Neither `stage.py --check-index` nor the final-site audit accepts a later or newly added release as legacy.
3. Add `preliminaryReleases`, with `secondaryLink` naming the season index, to the staged policy. If `cad/` is a public root, add `preliminaryInputs` to the source policy. Merge these policy changes on their own, then advance the trusted `approvedCommit` so the audits read them. Then add the single plain link `<a href="preliminary-design/">…</a>` to the season index. The gate accepts it without a signature only when nothing else on the page changes.
4. Keep interacting field parts in a separate fixture STEP in the release inputs. Register each solid as a motion-study fixture pinned by SHA-256. Group the fixtures in an `other` group, and give them one zero-mass ledger line. Re-run the preliminary check before staging.
5. Move each season field-interaction player from outside the preliminary tree into its release inputs at `field/NAME.html`. Make it self-contained under the required policy, inline any trace it fetched, set `href` to `field/NAME.html` and pin its trial evidence in the layout. Rerun the preliminary check with `--write-view`, then stage a new release. Releases already in the approved site keep their old links.
6. Run `local-showcase-release.mjs check` on the final built site. The trusted configuration gains no new fields.

### Preserve a project presentation or historical review

A season can keep its reviewed player at `releases/ID/index.html`. In the trusted staged policy's `preliminaryReleases.presentations`, add an entry keyed by release ID. Its `files` object maps each project presentation filename to its independently approved SHA-256. Include the launch HTML and every project script, stylesheet, compressed JSON scene and supporting Markdown document. Store the genuine checked player beside them as `package-motion.html` and set `release.json`'s `view.file` to that name. Keep the checked receipt, budgets, mission cases and motion pins. The deployed comparison checks the project files and the ordinary physics and mission evidence.

To keep a superseded replay, set the release record's `status` to `historical-review`, `label` to `Historical preliminary review`, `supersededBy` to a later indexed ID, and `knownIssue` to a plain-language description. Put `<aside role="note"><strong>Historical preliminary review</strong> DESCRIPTION</aside>` in its entry page, escaping the description as HTML text. Pin the SHA-256 of this historical `release.json` as `historicalRecord` beside its approved `files`. The checker admits the exact snapshot only as history. The current selection still needs the ordinary checked release.

Projects with an existing selector can pin both `index.html` and `releases.js` under `preliminaryReleases.catalogFiles` in the trusted staged policy. Use the standard chronological index and show each release's preliminary-design status, historical limitations and release selection. For a protected source README, the optional trusted source-policy field `preliminaryReadmeLink` names the exact HTTPS site URL. Append one blank line and a Markdown link labeled `Preliminary design release` to that URL, with a final newline, to the original README. A README that already carries the earlier `Work-in-progress preliminary design` link stays accepted.

For a project presentation, assemble the project files and checker outputs in its release directory. Run `node PLUGIN/scripts/preliminary-release.mjs verify-catalog docs/preliminary-design --policy SERVED_POLICY` before the first deployment. For one release use `verify RELEASE_DIRECTORY --policy SERVED_POLICY`. On subsequent deployments run the staged-site audit against the approved site to verify immutable history as well.

To feature a preliminary design on the project README, set `preliminaryReadmeArchive` in the independently approved source policy. Supply `readmeSha256`, `archive` (the project-relative Markdown path), `archivedSha256`, `image` (the project-relative PNG), and `imageSha256`. Archive the complete previous README byte for byte. Review the new README, its still and its link to the archive together. The regular staged Pages checks apply to the linked release.

## Publish detailed designs by status

Every design, in every phase, holds one status in its published index: `in-progress`, `effective`, `superseded` or `withdrawn`. Each phase of a project has at most one `effective` design. Making another design effective marks the previous one `superseded`. `withdrawn` means pulled with no replacement. The detailed design index uses the same list, `designStatus` map and `current` pointer as the preliminary release index.

A detailed design reaches the site at one of two levels:

| Status | Gate | Where it shows |
| --- | --- | --- |
| `in-progress` | Automated, no signature: an effective preliminary link, a passing layout check on the Fusion export and a mission animation | Beside the effective design, labelled. It takes the primary view only when no effective design exists |
| `effective` | The signed mechanical-readiness issue above, unchanged | The primary view: entry page model, README still and selector |

Opt in through the approved staged policy, beside `preliminaryReleases`:

```json
"detailedDesigns": {
  "root": "detailed-design",
  "legacy": {"design": "draft-001"},
  "secondaryLink": "index.html",
  "withdrawn": []
}
```

`root` is the deployed design tree. `legacy` names the model the site published before this process, or is `null` when it published none. A legacy design holds the primary view under the full gate, exactly as before, until a signed design supersedes it or a declaration withdraws it. `secondaryLink` optionally names one primary entry page that may gain one plain anchor to the tree, such as `<a href="detailed-design/">Detailed designs</a>`, under the same rules as the preliminary link. A page that both policies name may gain both links in one change, one plain anchor to each tree. `catalogSha256` optionally pins a project catalog page in place of the plugin's [stock catalog](../templates/detailed-design-index.html).

The tree holds the catalog `index.html`, the index `designs.json`, one immutable directory per design under `designs/ID/` and the archive of withdrawn files under `archive/ID/`.

```json
{
  "schema": "agent-frc/detailed-design-index@1",
  "preliminaryIndex": "../preliminary-design/releases.json",
  "current": "detail-002",
  "beside": "detail-003",
  "designs": ["draft-001", "detail-002", "detail-003"],
  "designStatus": {"draft-001": "superseded", "detail-002": "effective", "detail-003": "in-progress"},
  "supersededBy": {"draft-001": "detail-002"},
  "preliminary": {"detail-003": "layout-002"}
}
```

The final-site audit checks declared state and data. It leaves the markup of the entry page to the season's pull-request review.

- **Index.** Designs only append. A new design enters `in-progress` or `effective`. An `in-progress` design can become `effective` or `withdrawn`. An `effective` design becomes `superseded` when another becomes effective, or `withdrawn`. A `superseded` design can only become `withdrawn`, and `withdrawn` is final. At most one design is `effective`. Several can be `in-progress`; withdraw the ones the project abandons. Issued design directories and archives stay byte-identical.
- **Primary view.** `current` must be the effective design, else the newest in-progress design, else `null`. `beside` must be the newest in-progress design when an effective one exists. While an effective or legacy design exists, or any registered model file or other model geometry outside the two design trees is still published, every primary entry point keeps its approved bytes unless the signed issue covers it. Register model geometry under `modelFiles`; with `detailedDesigns`, a primary entry point cannot be a geometry file. While no detailed design is effective, the primary entry points are not signature-protected; the season's PR review covers them. With no effective design and no published model, the entry points may change without a signature so the page can show the in-progress design, or say that no detailed design is published and point to the current preliminary design. The signature lock returns in the same change that makes a design effective. A model counts as published in any geometry format, plain, gzipped or zipped, and as any zip archive.
- **In-progress gate.** A new in-progress design passes three checks. (a) Its record links a preliminary release by ID, by the SHA-256 of that release's `release.json` and by the SHA-256 of its receipt, and the preliminary index gives that release the status `effective`. (b) Its directory holds a `layout-checked` receipt from this plugin's layout check, run on the STEP exported from the registered current Fusion design: every clearance case, the inspection mass and every loaded-voltage case pass and the displaced control is rejected. The receipt covers every motion case, the cycle and the displaced control of the linked release. The record binds the Fusion authority register, export lineage, native archive and exported STEP by digest, and the receipt's STEP digest equals the exported one. (c) At least one mission case plays a `represented` narrative objective on that geometry with passing evidence, as an operating case or a receipt-bound field-interaction trial. The directory holds the same checked files as a preliminary release, with `design.json` in place of `release.json`. The record holds only the fields shown below. A signed packet cannot stand in for these checks.
- **Effective gate.** A design is `effective` only when the verified signed mechanical-readiness packet lists its `designs/ID/design.json`, and the record's STEP and archive digests equal the packet's. The existing rules for the registered model files, the entry points, the active selection and the paired source and staged packets all still apply. Passing the automated gate never makes a design effective.
- **Withdraw.** A design becomes `withdrawn` only when the approved policy declares it under `withdrawn` with the same reason. See [withdraw a design](#withdraw-a-design). Removing a model, or dropping a design from the index, without that declaration fails as before.
- **Re-link warning.** When the preliminary release that a live detailed design links is no longer `effective`, the design stays published and the audit still passes. The audit reports it under `designs.warnings` and as a workflow warning, and the stock catalog reads the preliminary index and shows the warning on that design. Stage a new design on the effective preliminary release to clear it.

The audit trusts the recorded receipt and digests. It does not rerun the layout check or open Fusion, so review the station run that produced them. `stage` replays the register and lineage with `fusion_authority.py` and refuses a receipt on any other STEP.

### Design record

```json
{
  "schema": "agent-frc/detailed-design@1",
  "design": "detail-003",
  "issue": "synthetic-detail-003",
  "label": "In-progress detailed design",
  "preliminary": {"release": "layout-002", "sha256": "<release.json SHA-256>", "receiptSha256": "<receipt SHA-256>"},
  "fusion": {"authoritySha256": "<register>", "lineageSha256": "<lineage>", "archiveSha256": "<native archive>",
    "stepSha256": "<exported STEP>", "configuration": "Installed assembly in its stowed pose", "revision": "review-r3"},
  "receipt": {"file": "receipt.json", "sha256": "<receipt SHA-256>"},
  "view": {"file": "index.html", "sha256": "<checked view SHA-256>"},
  "scene": {"file": "motion.json", "sha256": "<motion SHA-256>", "stepSha256": "<exported STEP>"},
  "missionCases": [
    {"case": "release", "kind": "operating-case", "accomplishes": "delivered", "objective": "Acquire, turn and release"}
  ]
}
```

A design issued directly as effective carries `schema`, `design`, `label` and a `fusion` object with the signed issue's `stepSha256`, `archiveSha256` and `configuration`.

### Stage, promote and withdraw

Export the STEP from the registered Fusion design, then run the [preliminary layout check](preliminary-design.md) on a layout that names that STEP and repeats the linked release's motion cases, cycle and displaced control. Keep `missions.json` beside the receipt, as for a preliminary release.

```sh
node PLUGIN/scripts/detailed-design-release.mjs stage SITE --policy STAGED_POLICY --design detail-003 --inputs CHECKED_INPUTS --preliminary layout-002 --project PROJECT_ROOT --authority cad/fusion-authority.json --lineage cad/lineage.json
node PLUGIN/scripts/detailed-design-release.mjs effective SITE --policy STAGED_POLICY --design detail-003
node PLUGIN/scripts/detailed-design-release.mjs effective SITE --policy STAGED_POLICY --design detail-004 --packet STAGED_PACKET
node PLUGIN/scripts/detailed-design-release.mjs withdraw SITE --policy STAGED_POLICY --design draft-001
node PLUGIN/scripts/detailed-design-release.mjs refresh SITE --policy STAGED_POLICY
```

`stage` writes the design directory and updates the index. `effective` marks a design effective and supersedes the previous one; with `--packet` it first writes the record of a new design from the signed issue. Issue the staged packet with `designs/ID/design.json` in its delivery list. `refresh` registers the legacy design, recomputes `current` and `beside`, and prints any re-link warning. Each command only edits files. The final-site audit decides.

### Withdraw a design

Withdrawing takes two reviewed changes and no signature.

1. Declare it in the approved staged policy, and merge that change by itself:

   ```json
   "withdrawn": [
     {"design": "draft-001", "reason": "Rough draft published before the design-status process.",
      "files": ["index.html", "media/robot-still.png", "models/selector.json", "models/robot.glb"]}
   ]
   ```

   For the design that holds the primary view, `files` must list every registered model file and primary entry point. For any other design it is empty. Then advance the trusted approved commit so the audit reads the declaration.
2. Run `withdraw`. It copies each listed file to `archive/ID/PATH`, removes the model files and marks the design `withdrawn` with the declared reason. Edit the entry page, still and selector to follow the primary view rule: show the in-progress design, or say that no detailed design is published and link the current preliminary design.

The audit requires every listed file under `archive/ID/` with its approved bytes, the model files gone from their paths, no effective design in the same change and the reason unchanged. To replace the primary design in one change, issue the signed successor instead; it supersedes the earlier design. The design stays in the index and the catalog lists it under the archive, labelled withdrawn. A withdrawn path can stay empty, and a later signed effective design can publish there again. Once a design is effective, an old declaration frees nothing. A bad build cannot withdraw a design: without the declaration, the removal fails.

For a branch-served site, or source models in a public root, add the twin declaration to the approved source policy. The source audit frees each file only while the committed index shows the design `withdrawn` and no design `effective`, and only when the archive path holds the approved bytes. A design that is effective in the approved index must itself be declared and withdrawn. A freed model file must leave its path.

```json
"detailedDesigns": {
  "index": "docs/detailed-design/designs.json",
  "withdrawn": [
    {"design": "draft-001", "reason": "Rough draft published before the design-status process.",
     "files": {"docs/models/robot.glb": "docs/detailed-design/archive/draft-001/models/robot.glb",
               "docs/index.html": "docs/detailed-design/archive/draft-001/index.html"}}
  ]
}
```

To replace a README that features the withdrawn model, use the existing `preliminaryReadmeArchive` handoff: archive the complete previous README byte for byte and pin the new README and its preliminary still.

### Migrate a season repository

1. Pin the plugin release that provides `scripts/detailed-design-release.mjs`. Adopt the [preliminary class](#adopt-the-class-in-a-season-repository) first. Withdrawing a design does not depend on the preliminary status, so it works while every preliminary release is still `in-progress`. Before staging the first detailed design, give the release it builds on the status `effective` in the preliminary index.
2. In one policy-only change, add `detailedDesigns` to the staged policy. Set `legacy` to an ID for the model the site publishes now, and declare it under `withdrawn` if it is to be pulled. In the same change, register every model-bearing output the site publishes under `modelFiles`, including extra downloads, viewer manifests and mesh files, and name each one in the declaration. An unregistered output cannot be removed, and a geometry file left published keeps the entry points under the signature. Add the source-policy twin when the served directory or a model file is in a public root. Merge, then advance the trusted approved commit.
3. In the next change, run `refresh` to publish the catalog and index with the legacy design, then `withdraw` if declared. Update the entry page, README and selector for the new primary view. Run `local-showcase-release.mjs check`.

   When a project script builds the site, the script must change, because the audit moves nothing. Build the approved commit locally and run `refresh` and `withdraw` on that output once. Commit the resulting design tree, with its catalog, `designs.json` and `archive/ID/`, as static source that the script copies into the site. Stop emitting the withdrawn model files. Keep emitting the entry page, still and selector, now for the new primary view.
4. Stage each new detailed design with `stage`. It publishes beside the effective design, or as the primary view when none exists.
5. When a design passes the signed mechanical-readiness review, list its `design.json` in the staged delivery, issue the packets and run `effective`.
