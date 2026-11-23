# Find the current Fusion design

Keep one authority register under the active design root at `cad/fusion-authority.json`. Project setup records the designated design before the first engineering export. The register names the whole system or the explicitly bounded subsystem, its active configuration, revision and source policy. Keep historical publications and alternate designs in separate records. A document title, a revision integer without its design identity, or the most recently touched STEP file cannot establish the current design.

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

## Resume a registered master

1. Read `iterations/active.json` in the receiving project and follow its `root` to `cad/fusion-authority.json`. An unnumbered project uses `cad/fusion-authority.json` at the project root. If a numbered design lacks its pointer or the selected design is still pending its first issue, record that state and recover the missing evidence or author the first issue. An older issue remains available for historical replay.
2. Recover the registered archive, its exported STEP and the corresponding `lineage.json` at their recorded project-relative paths. Resolve the [installed runtime](setup-health.md#resolve-the-plugin-used-by-this-check). From an ordinary terminal, run the installed verifier with the project directory and the two paths relative to it. Quote paths containing spaces.

   ```sh
   python "PLUGIN_ROOT/scripts/fusion_authority.py" "PROJECT_ROOT" "REGISTER_RELATIVE_PATH" "LINEAGE_RELATIVE_PATH"
   ```

   Read the reported revision, configuration, observation time, policy and both SHA-256 values. The verifier also checks the exporter bytes. If it reports a mismatch, compare the project pointer, register, issue and tool identity to the recorded inputs. Recover the exact source and exporter for a pinned replay. A successful offline check establishes the registered file identities. A cloud result reports the exporter's observation as of the recorded time.
3. For a mechanical review, look for complete native inventories from that same archive for the commissioned poses. Where a required receipt is absent, run the packaged `fusion_issue_inventory.capture` in Fusion on the verified archive in a disposable document. Pass absolute `pathlib.Path` values for the archive and a fresh private output, and the project's pose record. A parked-only check uses `pose=None`.

   In the Fusion recipe, use the active `adsk.core.Application` and put the checked plugin's `scripts` directory on the Python import path.

   ```python
   import fusion_issue_inventory

   result = fusion_issue_inventory.capture(app, archive, output, pose=commissioned_pose)
   ```

   If a batch returns `complete: false`, repeat with the same archive, pose and output path. Leave the adjacent generated `.progress.json` in place. If you supplied `checkpoint=`, use that same checkpoint path. Give each further pose a separate output. A completed census can still report unresolved pairs or measured intersections. Review those findings with the corresponding pose and keep missing evidence open. [Native pose capture and review](#save-and-resume)

## Resume a native contact batch

Read `completedPairs`, `unresolvedPairs` and `unexaminedPairs` together. Completed pairs include attempted pairs whose results are unresolved. Each pair records the exact two bodies and separate results for Fusion interference and the temporary BRep intersection. If a method fails, the collector keeps its error and the other method's observation, and proceeds to the next pair while the design is valid.

A batch budget leaves the unexamined tail for the next call. A `stop` reports that the design is unavailable, including the next pair when known. Recover the native session and cold-open the identical archive, pose and collector to resume its checkpoint. A terminated host can resume from its last atomic checkpoint. Keep the historical checkpoint and use a fresh output and checkpoint when the collector changes. A completed scan with unresolved measurements still requires investigation before release.

## Move a design to another computer

The Fusion archive is a project file. Commit it with the authority register, the export lineage and the exported STEP, and push. Git moves them: another computer starts with `git pull`. No file is held outside the project and no hash travels by another channel.

1. On the first computer, save the design, export the archive and the STEP with the [exporter](#save-and-resume), and commit the archive, `cad/fusion-authority.json`, the lineage and the STEP together. Use `*.f3d binary` and `*.f3z binary` in `.gitattributes`, or Git LFS for large archives.
2. On the other computer, pull, then ask which file is the one current design. The command replays the register and lineage and fails when the archive or STEP in the checkout is not the one they name.

   ```sh
   python PLUGIN/scripts/fusion_authority.py PROJECT cad/fusion-authority.json issue/lineage.json
   ```

3. Open that archive in Fusion and verify it before editing: the design identity and configuration equal the register, the timeline is healthy, and a measurement you know from the last session reads the same. Report from the reopened file.
4. If a cloud design may be ahead of the committed archive, open the cloud version, export again and commit before continuing. Work from one of the two, never from both.

For a task that needs more than the registered pair, such as a separately saved child or a comparison export, `native_handoff.py record` writes an inventory of the selected files with their sizes and digests, and `native_handoff.py check` verifies each one in place in the other checkout. Commit the inventory with the files it lists.

```sh
python PLUGIN/scripts/native_handoff.py record PROJECT LINEAGE_RELATIVE_PATH selection.json cad/handoff.json
python PLUGIN/scripts/native_handoff.py check PROJECT cad/handoff.json
```

`selection.json` is a JSON list of `{"path", "role", "basis"}` rows, or `[]` when the registered pair is enough. Roles are `child-native`, `diagnostic-native`, `diagnostic-step`, `historical-native`, `historical-step` and `private-input`. The check takes the inventory's SHA-256 as an optional last argument and compares it when given. This verifies the files; assembly pose and mechanical readiness need their own evidence.

## Save and resume

1. Before editing or resuming in another checkout, read the tracked authority register at the revision the team is developing. Recover the actual native file by the declared ID or archive digest. Check the operating configuration, project revision and any explicit supplier revision pins. A copy with the same visible name does not inherit authority.
2. Save the current native design. For cloud projects, finish the save/sync and open its latest revision. For offline work, record the new authoritative archive and SHA-256 in the project register. When switching masters or rolling back, commit the superseded and replacement identities, scope, reason and reviewer in the project history. Keep the historical public release separately identifiable.
3. In Fusion’s Python environment, call `fusion_authority.export_issue(app, project_root, authority_path, new_issue_directory)` from the installed [exporter](../scripts/fusion_authority.py). Pass absolute paths; the fresh issue directory belongs inside the project and is committed with it. A cloud export uses the selected saved design and captures the exact native archive, root STEP and recursive linked-version observations. The offline path imports its registered archive in a separate document and exports the root STEP. The exporter closes only its own temporary document and restores the prior active one.
4. From a fresh checkout with access to the project-owned native files, verify the issue with the installed plugin.

```sh
python PLUGIN/scripts/fusion_authority.py PROJECT cad/fusion-authority.json issue/lineage.json
```

5. Supply those two files as pinned `authority` and `lineage` in the mechanical-readiness study. Use only the resulting archive and STEP in downstream checks. A changed reference, source or configuration requires a new export and fresh affected checks. If the cloud master may have advanced, reopen it and rerun the native exporter before the review. The portable preflight alone cannot query Fusion cloud freshness.
6. Cold-open the saved issue with [the native body and interference collector](../scripts/fusion_issue_inventory.py). The `capture(app, archive, output, batch=256, pose=None)` entry enumerates every body and measures potentially intersecting pairs. The saved pose defaults to `{"id":"saved","joints":[]}`. To inspect another checked position, supply its id and joint records with `group`, `type` (joint or asBuilt), `occurrence` (root is @root), `name`, `coordinate` (slideValue or rotationValue) and `nativeValue` in cm or radians. A changed pose gets a new output path. A partial run writes a progress file and returns its completed-pair count. Repeat the identical invocation to resume. Record the final source-bound result for every declared pose.
7. Reconcile each native body with its placed export, review the identity and physical meaning of each positive common volume, and inspect the actual continuous travel before publishing. The release checks also cover material, tooling, retention, life and strength. Keep the last approved model available while a successor is under review.

Run the [native control](../examples/mechanical-readiness/native-control.py) in Fusion with `exercise(app, fresh_output_directory, installed_scripts_directory)`. It builds an original bracket, cylinder and clear comparison body, saves and cold-reopens an archive, and exercises a resumable one-pair scan. A solid collision and an overlapping bounding box with zero common material must produce different readings.


## Keep independent pose observations when one trial stops

Commission the parked pose and each required movement against the same saved configuration, archive digest and derived STEP. Give each trial its own registered request, output file and checkpoint. Start the parked collector with an empty joint list. For a commanded movement, open a disposable copy, command the registered joint, measure the attained coordinate and material landmarks, then close without saving. Reopen the original and confirm its parked landmarks. An operation that assigns a joint coordinate needs a write-capable disposable document even if the coordinate is its saved value. A failed movement can leave the parked inspection available.

Run the ordinary mechanical readiness review with the original pinned receipts. Read `nativePoseReviews` for each file, digest, observed pose and status. A checked row covers that pose's inventory and contact checks. A measured penetration retains its original pose and quantity. An absent trial stays open. Changed bytes, a different archive or malformed data cannot qualify a pose. Preserve the failed journal beside the study, rerun that trial under a new output name and update its source pin after review. A missing required pose keeps the complete design ineligible for release. [Mechanical readiness](mechanical-readiness.md)

## Record native observations at the station

In the live Fusion Python environment, use [the installed native station](../scripts/fusion_issue_station.py). Call `export_current(app, project, new_issue)` on the designated saved design, then `measure_pose(app, project, lineage_path, new_pose_receipt, station_folder, pose=None, batch=256)` for the saved and each declared pose. A large model may need multiple batches. Repeat the same invocation until it reports completion. The station keeps intermediate pair results in `station_folder`, a working directory outside the project, and writes each finished observation into the project.

The readiness review accepts each native observation as the agent at the station recorded it. No key, signature or environment variable takes part. The review requires the raw export and every declared native pose on the same archive and STEP, as well as a recognized Fusion archive with design and BRep content. A record issued by an earlier plugin version may have a `.native-signature.json` file beside it. The review does not read that file. Test fittings and hand-written JSON can exercise the evaluator; a native observation requires executing the native export and scan.

The [desktop coupon exercise](../examples/mechanical-readiness/native-coupon.py) creates two original made parts, a pocketed base and its removable gauge, cold-opens their assembled native archive and captures the native witness. Call `capture(app, fresh_project, installed_scripts, station_folder, rigid=True)` for the positively constrained stationary control. Pass `moving=True` for the measured slider. With both options off the gauge is free, and the fixed-assembly qualification remains open. Then run `python examples/mechanical-readiness/prepare-coupon.py PROJECT` to prepare an explicitly synthetic downward-bearing duty for this native model. The tested gate applies only to that scoped example. Inspect the positive seat, actual tessellated mesh and documented limiting assumptions before accepting the result.

For the linked-motion exercise, pass `coupled=True`. The three solid parts include a fixed receiver and two sliding gauges joined by a physical drive key. Read both gauge tips and a fixed base vertex at each calibrated position. The digital inspection article travels 3 mm with the gauges onto two fixed receiver lands. The blocked comparison commands travel and returns to its starting position. Review the operating plan and simulated transfers before running the review. The example pins `commissioning.json` in its study and `issue/teaching-observer.json` in its transfer study.

Before dispatching a long Fusion job, [stage its exact dependencies on the native station](native-job.md). Use the same private job directory for authoring, export and deferred cold readbacks.

For a project with `iterations/active.json`, follow its active design root before recovering older records. After a decision to start over, use `frc-start-over` to preserve the evidence and open a fresh numbered design. [Design iterations](design-iterations.md)
