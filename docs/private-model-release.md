# Keep the working robot private while checking a public replacement

Run the same source and final-site checks at the release station and in CI. For branch-served Pages, require **Mechanical model eligibility** before merging into the served branch. For generated Pages, verify the final build before upload. Read the gate code, baseline revision and verification key from trusted configuration. Preserve the project’s existing admin policy.

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
