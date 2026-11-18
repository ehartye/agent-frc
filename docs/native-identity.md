# Native occurrence ancestry and source identity

Run `npm run native:identity -- expected-manifest.json observed-receipt.json`. Exit 0 means supplied identities match, exit 1 means a well-formed mismatch, and exit 2 means malformed or unresolved evidence. This compares an independent body inventory with source identities resolved through supplied occurrence ancestry; it does not open CAD, authenticate a capture, resolve transforms or approve clearance. Evidence basis stays `synthetic`, `native-observed` or `human-reported`.

Capture actual parent-child links. Do not infer ancestry by splitting display names, use body labels as source IDs, or flatten imported component trees. Instance IDs must distinguish repeated occurrences of one source component. Bind the inventory to the exact saved/reopened archive. A changed export or enumeration requires an independently reconciled mapping.

The manifest has exactly these fields:

```json
{
  "schema": "agent-frc/native-identity-manifest@1",
  "archiveSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "allowedEvidenceBases": ["synthetic"],
  "bodies": [{"id":"solid-1","occurrenceId":"child","sourceId":"source-1","sourceOwnerId":"root"}]
}
```

The separate receipt has exactly these fields:

```json
{
  "schema": "agent-frc/native-identity-receipt@1",
  "archiveSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "evidenceBasis": "synthetic",
  "occurrences": [
    {"id":"root","parentId":null,"sourceId":"source-1"},
    {"id":"child","parentId":"root","sourceId":null}
  ],
  "bodies": [{"id":"solid-1","occurrenceId":"child"}]
}
```

These are invented schema examples, not native evidence. Each occurrence declares `parentId` and `sourceId`, using null for a root or absent local metadata. The nearest non-null source in the ancestry wins; child metadata overrides inherited metadata. Output records the effective `sourceId` and the `sourceOwnerId` where it was found. The independent manifest binds both values and the body occurrence. No name fallback exists.

Source identity is not instance identity. Imported assemblies may repeat one source index or local body identifier across several occurrences. `nativeBodyKey(occurrenceId, localBodyId)` from `scripts/native-identity.mjs` creates an unambiguous JSON tuple string for callers that need an instance-qualified body key. Use verified occurrence and local-body IDs; the helper does not discover or authenticate them. Do not build a dictionary keyed only by source index, silently overwrite duplicate matches, or concatenate IDs with an ambiguous delimiter. Combined keys must fit the contract's 2,000-character ID limit.

An empty assembly container is a valid ancestry node. It may carry source metadata inherited by descendants even though it contains no direct bodies. Keep the node and its parent links; enumerate its actual descendant solids separately. Do not invent a body, query body index zero, or omit its descendants because the direct body count is zero.

Duplicate IDs, missing parents, orphaned bodies, cycles (including unused nodes), unresolved body sources and malformed fields fail closed. Inventories are bounded to 10,000 rows each; traversal is iterative. Missing or extra bodies, a changed archive, an unexpected source owner or a disallowed evidence basis cannot match. Multiple bodies may legitimately inherit one source.

Include hidden bodies in the intended physical inventory. Visibility and display exclusions do not establish physics exclusions. The checker has no visibility filter, but it cannot detect a producer omission if the independent manifest repeats it. Prepare the complete expected inventory before checking results. Record any service or visualization exclusions and reasons separately; this helper does not decide whether exclusions are justified.

Carry the mapping into the [native witness contract](native-cad-feedback.md), preserving archive, transform, phase and representation boundaries. Identity agreement cannot establish that an envelope is material or that source CAD is registered to an installed part.
