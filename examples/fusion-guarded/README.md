# Guarded local Fusion workflow

[![Original teaching swerve module rendered in Fusion](../swerve/assembly.png)](../swerve/independent-swerve.f3d)

*Plugin teaching example · Independent-axis swerve module, as saved in Fusion.*

Use the bundled Python client and Fusion recipe to compare two parametric sideplates across a native archive and a STEP export. Start the official local MCP only in a session authorized by its owner. Keep the request journal beside the project's engineering evidence.

## Transaction contract

1. Inspect the active document and establish a baseline before creation. Use a unique job ID. `create` always creates a new disposable document, refuses an existing job marker and checks the expected active-document creation ID. It does not edit the baseline document.
2. Subsequent requests require exactly one open document matching `expectedDocumentId`, the job marker, a workflow revision and a geometry SHA-256. Autodesk states copied documents can share a creation ID; zero or multiple matches fail closed. Do not use document names as identity or relabel an existing document to bypass the guard.
3. Use a new request ID per operation. The fingerprint includes the complete request; a completed identical operation returns its receipt. Changed payloads with the same ID and incomplete operations are rejected. Revision is a recipe-maintained counter, not a Fusion file version or evidence that every possible edit is detected.
4. The bundled client writes and fsyncs an intent before dispatch, uses an exclusive cooperating-client lock and records successful results. It never retries mutations. A timeout or tool exception leaves an unresolved intent: inspect using a new read-only request, reconcile actual geometry and operation attributes, then decide on recovery. Never delete a journal entry merely to force a replay. A stale writer lock after a crash also requires inspection.
5. Geometry is checked before mutation, feature health afterward. Numbers use explicit mm expressions through Fusion's units manager; the API's internal length is cm. The geometry hash covers measured solid bounds, cylindrical faces, volume, thickness and timeline health. It does not cover every property, material or hidden external reference. One writer remains an operational requirement; the lock does not stop another app or UI user.
6. Export only to a new directory. Record bytes and SHA-256, independently reopen F3D and STEP, and check geometry. F3D additionally checks the thickness parameter and six healthy timeline entries; STEP checks exchange geometry only. Local F3D export is the native saved artifact; this workflow does not save to a Team/cloud project.

## Running the bounded example

Run from this directory with Python 3:

~~~sh
python guarded_client.py request.json journal-directory
python -B -m unittest discover
~~~

Every request carries a unique job ID, request ID, stage and the recipe version in guarded_case.py. Begin with baseline, record the active document creation ID, and send it as expectedActiveDocumentId on create. Supply the project's dimensionsMm object with lengthMm, heightMm, gapMm, original thicknessMm and axles (two [x,y] hole-center pairs in millimetres). This recipe reserves a 6 mm radius for both holes. Choose centers that clear the edges and each other. The top-level thicknessMm must equal the original thickness on creation. The second plate plane stays fixed at original gap plus original thickness as you change thickness.

For update, export and reopen include the expected document ID, revision and geometry SHA-256 from the latest inspection plus the original dimensions and current thickness. The update accepts a new thickness between 1 and 10 mm. Use a new output directory on export and pass its two expected file hashes on reopen. The client checks each reopened solid, hole position and volume. Native history also supplies a plate thickness parameter and six timeline entries. Reopened inspection documents close afterward and the original active document regains focus.

For recovery, send a fresh inspect request for the same document and job. Include inspectRequestId to retrieve an earlier operation. Archive files freeze document attributes at export time. Use the external request journal and a fresh geometry inspection to reconcile an interrupted operation.

Measure the workholding and bearing fits before manufacturing. Record material and moving-body mass separately when using the assembly dimensions for simulation.

- [Document creation ID and copied-document identity](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/core_Document_creationId.htm)
- [Fusion API units](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/Units_UM.htm)
- [Official Fusion local MCP installation and operation](https://github.com/Autodesk/ai-integrations/blob/main/fusion/local-mcp-server/README.md)

For a staged job, put `nativeJob: {"bundle": "ABSOLUTE_PRIVATE_JOB_PATH", "registrationSha256": "PINNED_JOB_SHA256"}` in the usual request configuration. Set the registration recipe to `plugin/examples/fusion-guarded/guarded_case.py`. Use the client in the staged package for later requests. Run its read-only `access` stage first with the private writer directories to verify permissions from inside Fusion. It runs the registered verification and lock on the native side for each operation. [Stage and retire a native job](../../docs/native-job.md)
