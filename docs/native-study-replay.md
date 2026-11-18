# Replay a clearance study on a saved Fusion draft

A study can reuse a source registration across several sampled motions. The project supplies an approved Fusion project, folder, file and saved version, the original source receipt and a reference observation from independently trusted geometry. The adapter searches open documents, compares their live native state and performs intersections on temporary copies. A different tab can stay active throughout.

## Prepare the binding

1. Preserve the source evidence receipt from the original study and its independently recorded SHA-256. Record what the receipt identifies and verify its relationship to the reference. An unchanged digest establishes byte identity.
2. In Fusion's Python main thread, add the plugin's `scripts` directory to the project runner's import path. Capture the original reference while that trusted design is available. `document` below is the document already identified by the project's original registration.

   ```python
   import json
   from native_study_replay import capture_reference

   reference_path.write_text(json.dumps(capture_reference(document)), encoding="utf-8")
   ```

3. Verify the intended saved file and version against the approved project destination. `destination_of(saved_document)` returns the native IDs for comparison. Save the approved values and receipt digest in a project-owned `approval.json`. The example identifiers below are invented.

   ```json
   {
     "destination": {
       "projectId": "project-id", "folderId": "approved-folder-id",
       "fileId": "saved-file-id", "versionId": "saved-version-id", "versionNumber": 1
     },
     "sourceReceiptSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
   }
   ```

4. Prepare the project binding from the independent records. The command requires a new output file. Preserve the binding beside the original study. Capturing the candidate as its own reference only describes the candidate and cannot establish equivalence with a lost original.

   ```text
   node <plugin>/scripts/prepare-native-study.mjs approval.json reference.json source-receipt.json binding.json
   ```

## Register an archive whose component revisions changed on save

Fusion can assign different opaque component revisions to an imported archive and a saved document even when all solid body revisions agree. An ordinary binding reports the mismatch. To qualify a one-time transition, preserve the original archive and a historical JSON receipt that identifies its SHA-256.

1. Use the project's independent source registration to inspect the original archive in Fusion. Record the output of `capture_transition_reference(original_document)` as `original.json`. Independently verify the saved destination and record `capture_transition_reference(saved_document)` as `saved.json`. Store both files and their exact byte hashes. The capture adds precise component-local bounds, surface area, volume and counts of lumps, faces, edges and vertices for every registered solid.
2. Create a separate transition approval. Include the same `destination` and `sourceReceiptSha256` fields as above, plus `originalReferenceSha256`, `savedReferenceSha256`, `archiveSha256` and `archiveDigestPointer`. The pointer identifies the exact archive digest field inside the historical JSON receipt. For a top-level field named `archiveDigest`, use `/archiveDigest`. Each input digest covers the exact file bytes.
3. From the project directory, create a new binding using the original archive and both captures.

   ```text
   node <plugin>/scripts/prepare-native-study.mjs --transition approval.json original.json saved.json source-receipt.json original.f3d binding.json
   ```

The conversion checks the actual archive against its approval and historical receipt. It verifies every B-Rep revision, identity, measurement, occurrence transform, grounding relationship and articulation row across the two captures. The binding records the exact original and saved component revision for every occurrence and the digests of the independent inputs. Keep the captures and receipt with the binding for review. A new pose uses the ordinary strict saved-version checks below, including exact saved component revisions. A later revision change requires investigation.

## Run two queries

Choose each operand's exact key from `reference["bodies"]` after inspecting its occurrence and local body identity. The root occurrence has an empty path. Repeated component instances have distinct keys. A display-name change to the document leaves this identity intact. A changed body label or ambiguous local mapping requires independent reconciliation.

```python
import json
from native_study_replay import ReplayError, resolve_open_source

binding = json.loads(binding_path.read_text(encoding="utf-8"))
try:
    source = resolve_open_source(app, binding, receipt_path)
    for path in query_paths:
        query = json.loads(path.read_text(encoding="utf-8"))
        result = source.run(query)
        save_project_result(result)
except ReplayError as error:
    report_study_failure(error.status, error.path, str(error))
```

Here `app` is Fusion's application object. The project runner supplies its paths, result writer and failure reporter. Run synchronously on the application's main thread. The adapter reads the approved source receipt, resolves the open saved destination and re-observes structure before every query. Neither prior success nor a change in active tab selects a source. If Fusion reports the pinned document modified, review the changes before repeating a saved-version study.

Each query uses a distinct ID, two solid body keys, units `cm`, and one or more poses. Supply a proper rigid 4 × 4 matrix per pose in row-major order. The delta acts in assembly world space on the moving body's registered world placement. The target stays at its registered placement. This Python example translates the moving body 1 cm along world X.

```python
query = {
    "queryId": "shift-in-world-x",
    "movingBody": moving_key,
    "targetBody": target_key,
    "units": "cm",
    "poses": [{"id": "one-centimeter", "worldDelta": [
        1, 0, 0, 1,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]}]
}
result = source.run(query)
```

The result identifies the binding, saved version, receipt digest, operands, query, each pose matrix and intersection volume in cm³. Separated bounding boxes establish zero overlap at that pose. Other sampled pairs require a successful Fusion temporary-body intersection. A native failure interrupts the query. Preserve the error separately from completed results. Finite samples leave motion between poses unexamined. A zero volume can include touching surfaces.

## What the binding checks

Cold reads can initialize Fusion revision metadata. Capturing the original reference requires two consecutive identical observations within three reads. Further changes produce an `unstable` diagnostic identifying the differing field. Every subsequent verification compares directly against the approved reference.

The observer traverses actual component occurrences and records their ancestors, local placements, grounding, component IDs and revisions, and solid body names and revisions. A component-level joint contributes its type, endpoints, local joint frames, suppression and supported motion state, axes and enabled limits. The observation also includes as-built joints and rigid groups. Instances retain separate world placements. Visibility does not remove solids from the traversal. Meshes, nonsolid B-Rep bodies, motion links and assembly constraints require an extended contract and produce an unsupported result.

| Status | What to inspect |
| --- | --- |
| `missing` | Open the approved saved file and retry. |
| `ambiguous` | Inspect duplicate candidates or duplicate registered identities. |
| `changed` | Review the reported receipt, destination, version or geometry field against the original. |
| `unavailable` or `unsupported` | Supply the absent evidence or qualify the reported native feature. |
| `invalid` | Repair the malformed binding, operands or pose inputs. |
| `query-failed` | Inspect the identified native operation and retain its failure. |

The caller controls any decision to open, import, save or revise a draft. The resolver and geometry adapter perform none of those operations. A successful study describes sampled solid intersection on the identified registration. Physical contact, loaded deformation and mechanism behavior require their own evidence. See the [native identity contract](native-identity.md) for occurrence-qualified keys.
