# Record which inputs a simulation actually used

Assign a role before identifying a file. A source receipt and a trajectory receipt may both be called `receipt.json`. Each belongs under its own key, with a SHA-256 digest of its original bytes. The [portable producer example](../examples/simulation-input-roles/produce.mjs) also records how a base configuration became the effective settings. It runs offline with Node.

From the repository root, run this single line:

```sh
node examples/simulation-input-roles/produce.mjs --source examples/simulation-input-roles/source/receipt.json --trajectory examples/simulation-input-roles/trajectory/receipt.json --base examples/simulation-input-roles/base.json --override examples/simulation-input-roles/fast.json --override examples/simulation-input-roles/slow.json
```

The example reads the two receipts as byte streams. It records the raw-byte digest of the base and each override in application order. Give each override a unique ID and a `changes` object. The base sets both allowed keys, Boolean `brakeEnabled` and nonnegative finite `speedLimitMps`. Overrides supply one or both keys. A later assignment to the same key wins. Missing roles, duplicate IDs, unsupported keys and invalid value types produce a diagnostic and exit 2.

In this example the last override sets the speed limit to 0.3 m/s. Reverse the two overrides to get 0.8 m/s. The effective digest hashes compact UTF-8 JSON with the two keys sorted lexically and no trailing newline. Omitting both overrides produces the same settings as the first invocation, while the ordered provenance records which inputs were applied.

Provide immutable input files for the duration of production. Keep the originals and their existing receipts. The digest identifies bytes and settings. This producer does not replay a trajectory, authenticate a source or establish which commands a controller delivered.
