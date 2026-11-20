# Find the current Fusion design

Keep one project authority register at `cad/fusion-authority.json`. Project setup records the designated design before the first engineering export. The register names the whole system or the explicitly bounded subsystem, its active configuration, revision and source policy. Keep historical publications and alternate designs in separate records. A document title, a revision integer without its design identity, or the most recently touched STEP file cannot establish the current design.

```json
{
  "schema": "agent-frc/fusion-authority@1",
  "id": "student-assembly",
  "configuration": "Installed robot in its service pose",
  "nativeConfiguration": "unconfigured",
  "revision": "shop-review-r3",
  "basis": "Design lead selected the installed assembly for the current shop review.",
  "source": {"kind":"cloud","dataFileId":"<stable Fusion DataFile ID>"},
  "pinnedChildren": []
}
```

For a configured design, set `nativeConfiguration` to the exact Fusion row ID. For an offline master, set `source` to `{"kind":"offline","archive":{"file":"cad/student.f3d","sha256":"<full digest>"}}`. An offline check establishes the latest archive explicitly registered by the project. A cloud check measures the latest saved cloud version of the designated design as of export. Cloud child references must be current, or pinned to a specific `id` and `versionId` with a reviewed `basis`. Unresolved links, a modified cloud document, and a different configuration leave the new issue unqualified.

## Save and resume

1. Before editing or resuming in another checkout, read the tracked authority register at the revision the team is developing. Recover the actual native file by the declared ID or archive digest. Check the operating configuration, project revision and any explicit supplier revision pins. A copy with the same visible name does not inherit authority.
2. Save the current native design. For cloud projects, finish the save/sync and open its latest revision. For offline work, record the new authoritative archive and SHA-256 in the project register. When switching masters or rolling back, commit the superseded and replacement identities, scope, reason and reviewer in the project history. Keep the historical public release separately identifiable.
3. In Fusion’s Python environment, call `fusion_authority.export_issue(app, project_root, authority_path, new_issue_directory)` from the installed [exporter](../scripts/fusion_authority.py). Pass absolute paths; the fresh issue directory belongs inside the private project. A cloud export uses the selected saved design and captures the exact native archive, root STEP and recursive linked-version observations. The offline path imports its registered archive in a separate document and exports the root STEP. The exporter closes only its own temporary document and restores the prior active one.
4. From a fresh checkout with access to the project-owned native files, verify the issue with the installed plugin.

```sh
python PLUGIN/scripts/fusion_authority.py PROJECT cad/fusion-authority.json issue/lineage.json
```

5. Supply those two files as pinned `authority` and `lineage` in the mechanical-readiness study. Use only the resulting archive and STEP in downstream checks. A changed reference, source or configuration requires a new export and fresh affected checks. If the cloud master may have advanced, reopen it and rerun the native exporter before signing a release. The portable preflight alone cannot query Fusion cloud freshness.
6. Cold-open the saved issue with [the native body and interference collector](../scripts/fusion_issue_inventory.py). The `capture(app, archive, output, batch=256, pose=None)` entry enumerates every body and measures potentially intersecting pairs. The saved pose defaults to `{"id":"saved","joints":[]}`. To inspect another checked position, supply its id and joint records with `group`, `type` (joint or asBuilt), `occurrence` (root is @root), `name`, `coordinate` (slideValue or rotationValue) and `nativeValue` in cm or radians. A changed pose gets a new output path. A partial run writes a progress file and returns its completed-pair count. Repeat the identical invocation to resume. Record the final source-bound result for every declared pose.
7. Reconcile each native body with its placed export, review the identity and physical meaning of each positive common volume, and inspect the actual continuous travel before publishing. The release checks also cover material, tooling, retention, life and strength. Keep the last approved model available while a successor is under review.

Run the [native control](../examples/mechanical-readiness/native-control.py) in Fusion with `exercise(app, fresh_output_directory, installed_scripts_directory)`. It builds an original bracket, cylinder and clear comparison body, saves and cold-reopens an archive, and exercises a resumable one-pair scan. A solid collision and an overlapping bounding box with zero common material must produce different readings.
