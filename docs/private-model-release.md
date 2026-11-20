# Keep the working robot private while checking a public replacement

The protected job is **Mechanical model eligibility**. Run it before a Pages artifact upload and on pull requests that can change the published branch. For branch-served Pages, require a pull request and require this named check before merging changes to the served directory. Add the required status after its first successful run. Preserve the repository’s existing admin override. Read the gate code, baseline revision and verification key from trusted configuration. A candidate must not select its own key or rewrite its own baseline.

## Qualify the exact public assets at the private station

Use the complete source-bearing assembly and a clean copy of the released plugin. Run the full review before making the issue. If a supplier permits only derived views, keep its STEP and F3D outside the public artifact. Have the reviewer retain their Ed25519 private key outside all project trees. The public verifier needs only the corresponding public key and the signed receipt.

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
