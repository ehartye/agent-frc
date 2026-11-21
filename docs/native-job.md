# Keep a native job's dependencies through cold readback

A long Fusion job can finish creating geometry after its original plugin cache or feature worktree has disappeared. Before dispatch, stage the exact plugin issue and the project's frozen inputs in private station storage. Keep the job there while Fusion reopens the native document, exports STEP, runs any deferred inspections and restores the original document set.

## Stage before dispatch

Use the checkout's clean `npm run plugin:stage` output, or an installed local package that contains `.agent-frc-stage.json`. The release manifest identifies the source commit and SHA-256 of every packaged file, including Python siblings, templates and other resources. Keep the job's independently frozen registration digest in the existing guard's request intent. Choose a unique job ID and existing private station directory outside the cache and feature worktree.

```json
{
  "schema": "agent-frc/native-job@1",
  "jobId": "trial-plate-a",
  "pluginCommit": "FULL_PLUGIN_COMMIT",
  "pluginInventorySha256": "SHA256_OF_DOT_AGENT_FRC_STAGE_JSON",
  "recipe": "inputs/cad/build_plate.py",
  "inputs": [
    {"path": "cad/build_plate.py", "sha256": "RECIPE_SHA256"},
    {"path": "cad/plate.json", "sha256": "PARAMETERS_SHA256"}
  ]
}
```

```sh
python scripts/native_job.py stage PACKAGE PROJECT JOB.json EXPECTED_JOB_SHA256 STATION
python scripts/native_job.py verify STATION/trial-plate-a EXPECTED_JOB_SHA256
```

Reuse the project's actual input hashes for all project code and data the recipe reads later, including CAD source, if it must survive worktree retirement. The private copy preserves relative paths and marks copied files read-only. Resolve these files through `NATIVE_JOB["inputs"]` or `CONFIG["jobInputs"]`. Keep outputs, request journals and any station signing key outside the staged input and plugin directories. The station verifies the full job in a private temporary directory, then publishes it with one rename under a publication lock. Repeating the same registration returns the existing verified job. A competing publisher or a changed registration with the same ID cannot replace it. A separate lease protects execution on the native station. Keep the normal source-authority preflight for designs whose latest saved revision is required.

## Run on the shared station

For a project-owned guarded transport, generate its normal Fusion `run(context)` source **before** submitting the request. In the transport process import `fusion_script` from the reviewed `scripts/native_job.py` and call it with the staged directory, independently frozen registration SHA-256 and the existing request configuration. Send the returned script through the usual journaled request. This wraps the registered recipe and runs its verifier and job lock inside the native execution. Preserve the guarded client’s request identity, document checks, terminal receipt and timeout recovery.

The recipe receives `CONFIG["plugin"]` as the staged scripts directory. Load sibling modules from that directory; use `NATIVE_JOB["inputs"]` for staged project dependencies. `CONFIG["project"]`, when supplied by the project, may still name a writable project or private issue folder. A recipe that reads code from an absolute cache or old checkout path must be adapted before dispatch. For a multi-step job, wrap each queued native request using the same registration; independently pin each additional distinct recipe under its own registration if needed. Keep the station bundle through the last native event. For a direct native invocation, `with using_job(bundle, registration_sha256) as job:` exposes the same verified paths. It checks for changed files, unexpected modules and conflicting previously loaded helper modules before the call. For a long single native invocation, call `NATIVE_JOB["verifyDependencies"]()` immediately before a delayed import or readback. The wrapper verifies the complete package again when the request returns. An absent lock means no cooperating call currently holds it. Verify the terminal station record before retirement.

The bundled [guarded teaching client](../examples/fusion-guarded/README.md) accepts a `nativeJob` object with `bundle` and `registrationSha256` in its usual request configuration. Select `plugin/examples/fusion-guarded/guarded_case.py` as the recipe and use its ordinary `jobId`. Run the client from the staged plugin for later requests. Preserve the original asset rights when retaining the job.

## Check access as the station operator

The staging account may be able to read files that the signed-in Fusion process cannot open. Before dispatching CAD work, run the guarded client's read-only `access` stage against the actual frozen bundle. It can check any registered recipe. Run the client from a readable, pinned plugin package. Supply a fresh request ID, the existing private journal and the actual existing output directories. For an export that creates its own subdirectory, probe the directory that will contain it.

```json
{"stage":"access","jobId":"trial-plate-a","requestId":"access-01","nativeJob":{"bundle":"ABSOLUTE_FROZEN_BUNDLE","registrationSha256":"PINNED_JOB_SHA256","writeDirectories":["ABSOLUTE_OUTPUT_PARENT","ABSOLUTE_NATIVE_JOURNAL"]}}
```

```sh
python -B examples/fusion-guarded/guarded_client.py access.json CLIENT_JOURNAL
```

Fusion takes and releases the real use lock, reads and hashes every registered dependency, and creates, flushes, reads and deletes a fresh test file in each specified directory. The receipt identifies the job, plugin commit, Fusion process and original document state. Keep it with the request journal. Recheck after changing user, package, permissions or destination. Include the same `writeDirectories` in the staged operation so the guard repeats the access checks before opening the recipe. Use separate directories for frozen inputs and writable results.

To diagnose from the signed-in user's ordinary terminal, run `python -B scripts/native_job.py preflight BUNDLE REGISTRATION_SHA256 OUTPUT_DIRECTORY [OTHER_DIRECTORY ...]`. Its receipt identifies the calling process. Use the in-Fusion stage for dispatch evidence. If access fails, prefer staging as the station user. On Windows, inspect the ACL on the *specific job directory*. If the station owner authorizes a repair, grant the actual operator read and execute on that job's frozen files/directories and limited write access on its external lock and actual output/journal directories only. Keep the exact file inventory and registration hash, then rerun under a fresh request ID. Existing document state and unrelated files must be preserved.

## Retire after release

A client timeout leaves the station job unresolved. Use the existing read-only inspection and request journal to determine what Fusion actually did. On a terminal outcome the station operator retains a release record outside the bundle, bound to this job ID and registration SHA-256.

```json
{
  "schema": "agent-frc/native-job-release@1",
  "jobId": "trial-plate-a",
  "registrationSha256": "EXPECTED_JOB_SHA256",
  "nativeReleased": true,
  "outcome": "completed",
  "before": {"documents": [], "active": null},
  "after": {"documents": [], "active": null},
  "evidence": {
    "native": {"path":"issued/plate.f3d","sha256":"NATIVE_SHA256"},
    "step": {"path":"issued/plate.step","sha256":"STEP_SHA256"},
    "readback": {"path":"issued/cold.json","sha256":"OBSERVATION_SHA256"}
  }
}
```

Use the actual before/after document IDs and active ID. The readback must identify the same `archiveSha256` and `stepSha256` and record `restored: true`. For a confirmed terminal abort use `outcome: "aborted"` and pin a `diagnostic` JSON file under `evidence` that identifies the same `jobId`, `outcome: "aborted"`, and `restored: true`. Pin the complete station release record independently and keep it with the job's external journal. Both directories below must be on the same filesystem.

```sh
python scripts/native_job.py retire STATION/trial-plate-a EXPECTED_JOB_SHA256 RELEASE.json EXPECTED_RELEASE_SHA256 PRIVATE_ARCHIVE
```

A successful retirement moves the checked job out of active storage into the private archive. A live native lock, changed evidence or missing readback leaves it in place. The operating system releases a lock when its owning process exits. The small station lock files remain available for future calls. After an interruption, inspect the native application and journal before issuing another request. A preparation directory left by a process crash was never published under the job ID; a retry can stage a fresh copy. The operator can apply the project's ordinary private retention policy to the archive. These checks establish dependency continuity; the design still needs its own mechanical and publication reviews.
