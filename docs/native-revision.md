# Native edit persistence and independent interface checks

Run `npm run native:revision -- expected-manifest.json observed-receipt.json`. Exit 0 means the supplied lifecycle observations match independent expectations; exit 1 means a mismatch; exit 2 means invalid or incomplete inputs. This read-only JSON checker never edits, opens, saves or recomputes CAD. Synthetic input remains synthetic even when it matches.

## A successful delete call is not persistent removal

Before modifying an owned native copy, identify the exact occurrence/body instance and record its baseline geometry, transforms and source identity. Source indices and names may repeat. Select a unique target using verified instance ancestry and geometry; do not take the first matching source index or delete all matches.

Capture body states immediately after the edit, after a successful recompute, and after saving and reopening the exact archive. A transient deletion may be undone by design history. Reacquire bodies from the actual result rather than trusting old references. Equal counts can conceal a restored old body and a missing replacement; compare exact identities and geometric/state witnesses.

In a history-based Fusion design, inspect the supported native Remove feature for persistent removal when appropriate to the authorized operation. Do not assume direct `deleteMe` and a timeline removal have identical persistence. The API, feature ownership, design mode and downstream references need local verification. A successful feature creation is also insufficient: verify its health and intended target, recompute, save/reopen, and compare inventories. Direct designs may legitimately have no timeline feature. This guide is not authorization to delete or suppress geometry.

## Contract

The manifest contains exactly `schema`, `operationId`, `baselineArchiveSha256`, `savedArchiveSha256`, `allowedEvidenceBases`, `before`, `after`, and `requiredFeatureIds`. Schema is `agent-frc/native-revision-manifest@1`. Archive values are lowercase SHA-256. Allowed bases are a nonempty subset of `synthetic`, `native-observed`, `human-reported`. Each body list contains unique `{id, stateSha256}` rows; an intentionally empty result must be explicitly expected. Required feature IDs are unique strings; use an explicit empty array when no persistent feature is required.

The receipt contains exactly `schema`, `operationId`, `baselineArchiveSha256`, `savedArchiveSha256`, `reopenedArchiveSha256`, `evidenceBasis`, and `stages`. Schema is `agent-frc/native-revision-receipt@1`. Stages must appear once each in this order:

```json
[
  {"name":"before","bodies":[],"featureIds":[]},
  {"name":"after-edit","bodies":[],"featureIds":[]},
  {"name":"after-recompute","bodies":[],"featureIds":[]},
  {"name":"after-reopen","bodies":[],"featureIds":[]}
]
```

This fragment illustrates structure, not observed evidence. Populate the complete physical body inventory at every stage, including hidden bodies. Each stage's `bodies` uses the same `{id, stateSha256}` rows. Required operation feature IDs must be observed at all three post-edit stages. Additional unrelated features are allowed; their health and dependency effects require separate native verification.

Prepare the intended before/after inventory independently. Define and retain the body-state hashing recipe and original records: occurrence/body identity, source/representation, verified geometric witnesses or exact geometry bytes, units, transforms and any preserved material/state fields. Hashes alone cannot verify that a producer actually measured geometry. Do not hash only counts or labels, or copy expected state hashes from the receipt being checked. Tolerances and canonicalization must be explicit in the producer's record; this comparator compares exact hashes and performs no geometry normalization.

The expected saved-archive hash comes from independently checking the actual saved bytes before assessing the reopen receipt. It is not guessed before creation or copied from an unverified receipt. The reopened archive must match it. Operation IDs and baseline/saved pins also must match. A changed archive, missing stage, restored body, missing replacement, changed unrelated body or missing required feature prevents a match.

## Game-piece and assembly checks are separate

A clear game-piece path says nothing about motor, shaft, support, bearing, plate or actuator interference. Independently enumerate relevant assembly pairs as well as piece-route pairs before producing evidence. Use separate source-bound [native-witness manifests](native-cad-feedback.md), or include both explicitly named sets in one independent manifest. Missing assembly witnesses must remain unknown even when all piece-route rows pass.

Retain baseline and revised assembly-pair results, including unchanged intentional contacts and newly increased intersections. Classify joints and material/proxy differences explicitly; never subtract all baseline contacts or label them acceptable merely because they existed before. A repaired pair can expose another conflict. Use the exact final recomputed/reopened geometry and invalidate prior route and interface receipts after a revision. Finite geometry evidence does not establish fit, compliant forces, motion under load or physical readiness.

`native:revision` deliberately assesses persistence only. A match does not imply either the piece-route or assembly-interference audit ran or passed. The separately prepared `native:witness` coverage contract guards those inventories; supplied declarations still need authentic native execution and independent review.
