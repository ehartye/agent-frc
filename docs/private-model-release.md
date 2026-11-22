# Keep the working robot private while checking a public replacement

Run the same source and final-site checks at the release station and in CI. A detailed showcase model needs the signed mechanical issue below. A [work-in-progress preliminary release](#publish-work-in-progress-preliminary-releases) needs a layout-checked receipt and a mission-task case instead, and stays secondary to the approved detailed model. For branch-served Pages, require **Mechanical model eligibility** before merging into the served branch. For generated Pages, verify the final build before upload. Read the gate code, baseline revision and verification key from trusted configuration. Preserve the project’s existing admin policy.


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

## Publish work-in-progress preliminary releases

Two classes of model output can share one site. A **detailed showcase model** replaces the primary view, README still, selector or download only through the full mechanical-readiness gate and a signed issue above. A **work-in-progress preliminary release** presents a whole-robot layout revision while the design is still changing. It does not need detailed-design readiness. It must obey the checked physics and play a meaningful mission task. It stays secondary: the latest approved detailed design remains front and center, and the release is linked and labelled as work-in-progress preliminary design with its status.

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

`root` is the deployed path of the [preliminary review tree](../skills/frc-preliminary-design/references/review-layout-template.md#multiple-releases-and-pages). `primaryEntryPoints` lists the detailed design's deployed entry page, README still and model selector. Keep these, `modelFiles` and field outputs outside `root`. Without the field, the preliminary tree stays under the full gate. The optional `secondaryLink` names one primary entry page that may gain exactly one plain, relative anchor to the tree, such as `<a href="preliminary-design/">Preliminary design (work in progress)</a>`. The anchor uses double quotes and plain text (letters, digits, spaces and `.,()-`). It must sit in ordinary element content, between tags, never inside a tag, attribute, comment, script or other raw-text element. Up to 16 whitespace characters may come with it on each side. Any other difference on that page, a second link, extra attributes, markup inside the anchor or another target still needs a signed detailed-model issue. The primary model, still and selector stay byte-identical.

The final-site audit applies this class only inside `root`:

- **Scope.** Only the stable viewer `index.html`, `releases.json` and the files of `releases/ID/` qualify. A release directory holds `index.html`, `receipt.json`, `motion.json`, `budgets.json`, `limits.json`, `release.json`, the compressed geometry its receipt names, any trial file its record names and the season field players its record lists under `field/NAME.html`. Any other file is rejected. A signed packet cannot authorize a file inside `root`.
- **Physics.** Each added release is bound by digest to an Agent FRC preliminary-check receipt with status `layout-checked`: every nominal clearance case, the inspection mass and every loaded-voltage case pass, the displaced control is rejected, and `missingInputs` and `reopen` are empty. `provisional`, `reopen`, `blocked` and partial `--fail-fast` receipts are refused. The receipt, `motion.json` scene and STEP digest, budget files and checked `index.html` view must equal what the receipt and release record pin. The scene, budget, limit and trial files must parse as their evidence JSON, with no nested glTF document, data URI or base64 glTF binary. The view must be the plugin's own player, with its embedded data escaped as the checker writes it, and must display the receipt's case results, narrative objectives, mass and voltage figures.
- **Mission.** The release record declares at least one mission-task case. Each names a passing operating case in the checked cycle, the accomplishment (`acquired`, `delivered`, `scored` or `climb-held`) and a `narrativeReview` objective whose disposition is `represented`. A `field-interaction-trial` either publishes the trial file that the receipt pins for that case under `transportedBy`, or names a listed field player as `player`.
- **Field players.** A season field-interaction or physics player is first-class mission evidence. Each one is listed in `fieldPlayers` with its `file`, `sha256`, published `trial` pin and represented `objective`. Its trial must be the evidence the checked view pins for that link, or one the receipt pins under `transportedBy`. Every `fieldInteractions[].href` in the checked view must resolve to a listed player in the same release, and every listed player must be linked from the view with the same objective. For a mission case that names a `player`, the trial's `case` must be that case. The page must be self-contained. Its first element in `<head>` is exactly `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'">`, the plugin's canonical policy. Both checkers compare it byte for byte, so the browser refuses every network, frame and form request. A shared tokenizer then rejects any other `http-equiv`, any external script, any frame, object, form or linked resource, any `href` other than an in-page `#` fragment, and any resource URL other than `data:` or `blob:`. As a best-effort heuristic, it also rejects obvious network APIs such as `fetch` and `WebSocket`; the policy, not this pattern, is what blocks network access. The page must show the label "Work-in-progress preliminary design". The tokenizer follows the HTML standard for comments, raw text and inline `<svg>`, and refuses `<math>` and `<foreignObject>`. It is a tokenizer, not a browser. The exact policy is what blocks network access. For the rest, including script-driven top-level navigation, the control is that the season authors these pages and reviews them in its pull request. Like every other release file, an issued player is immutable.
- **Front and center.** Every primary entry point must equal its approved bytes unless a signed detailed-model issue covers it.
- **History.** Releases already in the approved site stay byte-identical. `releases.json` may only append IDs and move `current`. The stable viewer equals the approved copy or the plugin's template. When releases are added, it must show the work-in-progress label and status. The checked player carries the same label when opened directly.

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
  "label": "Work-in-progress preliminary design",
  "status": "layout-checked",
  "receipt": {"file": "receipt.json", "sha256": "<receipt SHA-256>"},
  "view": {"file": "index.html", "sha256": "<checked view SHA-256>"},
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

Staging derives `fieldPlayers` from the checked view. In the layout, link each player as `presentation.fieldInteractions[].href: "field/NAME.html"` with a pinned `evidence: {file, sha256}` trial, and keep the page at `field/NAME.html` beside the checked view in the release inputs. A mission case can point at the player with `{"case": "release", "kind": "field-interaction-trial", "accomplishes": "delivered", "objective": "Acquire, turn and release", "player": "field/release-lane.html"}`.

For a contact-transport trial, use `"kind": "field-interaction-trial"` with `"trial": {"file": "acquire-trial.json", "sha256": "…"}` in `missions.json`. Staging publishes that pinned file beside the receipt. Check a staged release before committing it:

```sh
node PLUGIN/scripts/preliminary-release.mjs verify docs/preliminary-design/releases/layout-002
```

### Adopt the class in a season repository

1. Pin the plugin release that provides `scripts/preliminary-release.mjs`. Copy its `templates/stage-preliminary-review.py` over `cad/preliminary-design/stage.py` and its `templates/preliminary-review-index.html` over `docs/preliminary-design/index.html`. The updated `stage.py --check-index` applies the same physics and mission rules to every listed release.
2. Add `missions.json` beside each new release's `layout.json` and `receipt.json`. A player saved before this plugin release lacks the work-in-progress label: delete its `package-motion.html`, rerun the preliminary check with `--write-view` and save the new receipt. A release that has never been deployed and lacks `release.json` cannot be restaged under the same ID. Remove its unpublished directory and its `releases.json` entry, then run `python cad/preliminary-design/stage.py RELEASE_ID` again. Do not alter a release in the approved site; issue a new ID. If the approved site already serves releases without `release.json`, list their IDs once under `"legacy"` in `releases.json`. They must be the earliest entries, in order, and already be in the approved site. Neither `stage.py --check-index` nor the final-site audit accepts a later or newly added release as legacy.
3. Add `preliminaryReleases`, with `secondaryLink` naming the season index, to the staged policy. If `cad/` is a public root, add `preliminaryInputs` to the source policy. Merge these policy changes on their own, then advance the trusted `approvedCommit` so the audits read them. Then add the single plain link `<a href="preliminary-design/">…</a>` to the season index. The gate accepts it without a signature only when nothing else on the page changes.
4. Keep interacting field parts in a separate fixture STEP in the release inputs. Register each solid as a motion-study fixture pinned by SHA-256. Group the fixtures in an `other` group, and give them one zero-mass ledger line. Re-run the preliminary check before staging.
5. Move each season field-interaction player from outside the preliminary tree into its release inputs at `field/NAME.html`. Make it self-contained under the required policy, inline any trace it fetched, set `href` to `field/NAME.html` and pin its trial evidence in the layout. Rerun the preliminary check with `--write-view`, then stage a new release. Releases already in the approved site keep their old links.
6. Run `local-showcase-release.mjs check` on the final built site. The trusted configuration gains no new fields.

### Preserve a project presentation or historical review

A season can keep its reviewed player at `releases/ID/index.html`. In the trusted staged policy's `preliminaryReleases.presentations`, add an entry keyed by release ID. Its `files` object maps each project presentation filename to its independently approved SHA-256. Include the launch HTML and every project script, stylesheet, compressed JSON scene and supporting Markdown document. Store the genuine checked player beside them as `package-motion.html` and set `release.json`'s `view.file` to that name. Keep the checked receipt, budgets, mission cases and motion pins. The deployed comparison checks the project files and the ordinary physics and mission evidence.

To keep a superseded replay, set the release record's `status` to `historical-review`, `label` to `Historical preliminary review`, `supersededBy` to a later indexed ID, and `knownIssue` to a plain-language description. Put `<aside role="note"><strong>Historical preliminary review</strong> DESCRIPTION</aside>` in its entry page, escaping the description as HTML text. Pin the SHA-256 of this historical `release.json` as `historicalRecord` beside its approved `files`. The checker admits the exact snapshot only as history. The current selection still needs the ordinary checked release.

Projects with an existing selector can pin both `index.html` and `releases.js` under `preliminaryReleases.catalogFiles` in the trusted staged policy. Use the standard chronological index and show the work-in-progress notice, historical limitations and release selection. For a protected source README, the optional trusted source-policy field `preliminaryReadmeLink` names the exact HTTPS site URL. Append one blank line and `a Markdown link labeled Work-in-progress preliminary design to that URL` with a final newline to the original README.

For a project presentation, assemble the project files and checker outputs in its release directory. Run `node PLUGIN/scripts/preliminary-release.mjs verify-catalog docs/preliminary-design --policy SERVED_POLICY` before the first deployment. For one release use `verify RELEASE_DIRECTORY --policy SERVED_POLICY`. On subsequent deployments run the staged-site audit against the approved site to verify immutable history as well.

To feature a preliminary design on the project README, set `preliminaryReadmeArchive` in the independently approved source policy. Supply `readmeSha256`, `archive` (the project-relative Markdown path), `archivedSha256`, `image` (the project-relative PNG), and `imageSha256`. Archive the complete previous README byte for byte. Review the new README, its still and its link to the archive together. The regular staged Pages checks apply to the linked release.
