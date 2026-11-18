# Guarded local Fusion workflow

This original disposable-design recipe is version 1.0.0. It uses Autodesk's built-in local MCP and Python API. No cloud or community service is involved. Enable the official server only with the owner's permission and verify the installed build against Autodesk's current security advisory. The tested build was 2706.1.17; the listener was 127.0.0.1:27182. A loopback endpoint is not an authentication boundary.

## Transaction contract

1. Inspect the active document and establish a baseline before creation. Use a unique job ID. `create` always creates a new disposable document, refuses an existing job marker and checks the expected active-document creation ID. It does not edit the baseline document.
2. Subsequent requests require exactly one open document matching `expectedDocumentId`, the job marker, a workflow revision and a geometry SHA-256. Autodesk states copied documents can share a creation ID; zero or multiple matches fail closed. Do not use document names as identity or relabel an existing document to bypass the guard.
3. Use a new request ID per operation. The fingerprint includes the complete request; a completed identical operation returns its receipt. Changed payloads with the same ID and incomplete operations are rejected. Revision is a recipe-maintained counter, not a Fusion file version or evidence that every possible edit is detected.
4. The bundled client writes and fsyncs an intent before dispatch, uses an exclusive cooperating-client lock and records successful results. It never retries mutations. A timeout or tool exception leaves an unresolved intent: inspect using a new read-only request, reconcile actual geometry and operation attributes, then decide on recovery. Never delete a journal entry merely to force a replay. A stale writer lock after a crash also requires inspection.
5. Geometry is checked before mutation, feature health afterward. Numbers use explicit mm expressions through Fusion's units manager; the API's internal length is cm. The geometry hash covers measured solid bounds, cylindrical faces, volume, thickness and timeline health. It does not cover every property, material or hidden external reference. One writer remains an operational requirement; the lock does not stop another app or UI user.
6. Export only to a new directory. Record bytes and SHA-256, independently reopen F3D and STEP, and check geometry. F3D additionally checks the thickness parameter and six healthy timeline entries; STEP checks exchange geometry only. Local F3D export is the native saved artifact; this workflow does not save to a Team/cloud project.

## Running the bounded example

Use Python 3 and the two bundled files; no pip dependencies. Run `python guarded_client.py request.json journal-directory` against an already authorized official local server. Keep journals and native files outside public repositories. Use a fresh request ID for each read-only inspection as well. The bundled client executed a read-only recovery inspection successfully at actual revision 4 while the caller held stale revision 0, returning the earlier completed update receipt. Mutating live recipe calls used the earlier stdlib local MCP harness. Synthetic journal tests cover pending-intent refusal, changed-payload refusal and cached completion without network dispatch. Crash, network-timeout and concurrent-writer failure injection have not been executed.

Every request needs `recipeVersion: "1.0.0"`, a job ID, request ID and stage. `baseline` reports current documents; only use it in a session whose scope is authorized. `create` also requires `expectedActiveDocumentId`, `dimensionsMm` copied from the reviewed 2026 case CAD inputs and `thicknessMm: 6.35`. `update`, `export` and `reopen` require `expectedDocumentId` and `expectedRevision`; read-only `inspect` requires identity/job but deliberately ignores stale revision and can return an earlier operation via `inspectRequestId`; mutating operations require `expectedGeometrySha256` computed by the recipe's `fingerprint` function on the last readback. Include the same dimensions and current thickness. `update` sets a thickness from 1 to 10 mm. `export` requires a new `outputDirectory`; `reopen` requires that directory plus `expectedHashes` keyed by `f3d` and `step` from the export receipt. The original active document is restored after the operation.

This is an intentionally narrow two-plate fixture, not a general CAD command runner. Inspect the code and request before execution. Geometry uses fixed sketch outlines and holes plus a thickness parameter; it is not a fully constrained assembly. The second plane is fixed at the original gap plus original thickness, so changing thickness changes the clear gap. This is reported, not silently treated as a constant-gap assembly.

## Executed 2026 concept evidence

On 2026-11-16 the two 480 x 260 mm concept plates were created at 6.35 mm thickness with diameter-12 mm placeholder holes centered at (90,65) and (350,65) mm. Their second plane is at z=306.35 mm. Thickness was changed to 7 mm; the resulting clear gap is 299.35 mm, not 300 mm. Both bodies remained solid with six healthy timeline entries. F3D reopened with the 7 mm parameter and history; STEP reopened with the same geometry and no parametric history. The three earlier disposable mounting-plate documents retained identical measured geometry and modification flags, and the original active document was restored.

Live negative checks rejected wrong document, wrong job, stale revision, changed expected geometry and changed payload under an existing request ID. An identical completed update returned the prior receipt; independent inspection confirmed revision 2 and two bodies. These checks do not prove crash atomicity, cross-process exactly-once execution, whole-design preservation under arbitrary edits, or security against hostile clients.

## CAD-to-Java boundary

The sideplate envelope and axle holes were measured in native CAD. The 2026 case's roller radius of 30 mm and mass of 0.6 kg remain assumptions: no roller body, material density or mass-property measurement was created. The simple solid-cylinder approximation gives inertia 0.00027 kg m2. `FlywheelSizingLab` changes assumed radius to 60 mm at fixed mass, predicts four times the inertia, and tests slower initial acceleration with unchanged unloaded steady speed at 6 V. This connects a design assumption to a plant prediction; it does not infer inertia from the plate geometry.

WPILib 2026.2.1 uses direct plant truth with NEO constants. No REV device adapter, encoder, firmware, wheel contact, game-piece deformation/flight, bearing loss, battery sag or physical motor has been tested. The recipe does not establish bearing fits, structural strength, assembly interference, guarding, manufacturing readiness or season legality.

## Official references

- [Document creation ID and copied-document caveat](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/core_Document_creationId.htm), accessed 2026-11-16.
- [Fusion API units](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/Units_UM.htm), reviewed 2026-11-15.
- [Official local MCP](https://github.com/Autodesk/ai-integrations/blob/main/fusion/local-mcp-server/README.md), reviewed 2026-11-15.
- [Autodesk security advisory](https://www.autodesk.com/trust/security-advisories/adsk-sa-2026-0008), reviewed 2026-11-15.

Only original code and summaries are included; Autodesk/FIRST assets and documentation bodies are not bundled.

Native archives are snapshots taken during export: their embedded operation attributes may show the export as in-flight and an earlier workflow counter. Do not treat a reopened archive as a completed-operation journal or replay its pending request. External receipts plus fresh inspection govern recovery.
