# Start a new design iteration

Use a restart when the team has chosen to replace a design or reverse its premise. A partial restart can keep a qualified subsystem. Select and import it explicitly after cutover.

## Preserve the outgoing design

Compare the outgoing design with its role. Which result is worth keeping? Which requirement failed, and under what conditions? What would the team change if it began today? Link each answer to the exact evidence. Save a still or screenshot and describe what it shows. Capture a failed trial beside the positive one if both influenced the decision.

Stop editing the outgoing design. Check branches, active authors, live CAD jobs, saved Fusion versions, uncommitted files, ignored runs and private supplier assets. Save and reopen any unsaved work first. For an existing unnumbered project, enumerate the complete selected archives and working evidence to retain. For subsequent rollovers the helper also captures *every file* in the active design and prior import records. Record software commits, source identities and the applicable scope in the evidence list. Keep large and restricted files in private custody.

Copy [the restart plan](../templates/design-restart.json) outside the reserved iteration directories. Fill it in with actual paths and SHA-256 digests. Each evidence ID names one physical artifact. Use the original revision or commit in its source description. Images, design masters and independent results each have their own entries. Pre-register known reusable elements individually. The team can select a proper child later from a sealed native design using the [private extraction workflow](#select-an-occurrence-after-cutover).

```text
python <plugin>/scripts/design_iteration.py start PROJECT PLAN.json --vault PRIVATE-CUSTODY
python <plugin>/scripts/design_iteration.py check PROJECT --vault PRIVATE-CUSTODY
```

The first cutover archives the outgoing decision at `iterations/001/retrospective.json` and creates `iterations/002/design/` empty. It stores checked bytes by digest in the private custody folder. Keep that folder in protected, backed-up storage. A single atomic update to `iterations/active.json` switches everyone to the new design. Commit the numbered records and pointer together. The next restart advances from 002 to 003. Replaying an interrupted preparation with identical inputs can finish it. A competing or stale plan must read the current pointer again.

## Work only in the active design

Read the pointer before consulting old branches, experiments or CAD tabs. Start the new role or architecture record under the active root. Create a **new Fusion design** and save its new identity. Use the reserved iteration ID for the new authority register, under `iterations/NNN/design/cad/fusion-authority.json`. References in this register and native receipts are relative to the project checkout. For an offline master, save a fresh native root under this design. A cloud master needs a distinct Fusion data-file ID. A blank successor can be active before a new native issue exists. The student showcase keeps serving the previously approved issue until the new one qualifies.

To bring forward one part, consult its archived evidence and decide whether it earns a place on the new robot. Recreate or insert the selected item manually in the new design. Record the exact source and resulting file hashes, current purpose, changed loads or interfaces, and the test it must pass again. Save a separate import source file for subsequent edits. For a mounted subsystem also verify the cold installed occurrences, new host attachment, motion and load at the installed pose. Use the normal [article roster](article-functions.md) and [mechanical readiness](mechanical-readiness.md) checks.

```text
python <plugin>/scripts/design_iteration.py carry PROJECT ONE-IMPORT.json
python <plugin>/scripts/design_iteration.py check PROJECT --vault PRIVATE-CUSTODY
```

[Manual import record](../templates/design-import.json). The helper records the decision after the designer brings the file across. Checks compare archive hashes, numbered history and imported files. A new filename or changed bytes cannot prove original authorship, and an import record alone cannot establish that a mounted component remains qualified. Inspect the new native root and roster before release. Ordinary projects keep their existing layout until they choose a numbered restart.

## Select an occurrence after cutover

When the team discovers a reason to keep a specific component after retirement, leave the original retrospective and its seal intact. Choose the exact occurrence in the saved parent configuration. Use full paths to distinguish repeated instances. A compound selection can contain several explicit solid-bearing leaf components. Record why each belongs, how its surroundings changed and which installed checks must be rerun.

The cold inventory reads joints and rigid groups in root assembly context. It keeps the owning occurrence, the complete paths of the members, joint type, suppression and measured angle or travel when available. Distinct copies of a shared definition keep their own endpoints. If a rooted collection omits a local relationship, or a member cannot be resolved in its recorded owner, the capture stops before a selection can be accepted.

1. Copy the exact sealed native archive into a [private staged job](native-job.md). Select its SHA-256, saved pose, configuration, occurrence paths and a unique export ID before the run. Keep the reviewed recipe hash with the registration. Begin with Fusion at Home. The following project recipe calls the packaged read-only collector; the output must be a fresh directory under the registered writable location.

   ```python
   def run(context):
       import adsk.core
       import json
       import runpy
       from pathlib import Path

       inputs = Path(CONFIG["jobInputs"])
       plan = json.loads((inputs / "selection.json").read_bytes())
       capture = runpy.run_path(str(Path(CONFIG["plugin"]) / "fusion_occurrence_extract.py"))["capture"]
       capture(adsk.core.Application.get(), inputs / "parent.f3d", plan["sourceSha256"],
               plan, CONFIG["jobId"], Path(CONFIG["nativeJob"]["writeDirectories"][0]) / "extraction")
   ```

2. The collector reads the whole saved occurrence, solid and joint inventory. It reopens the parent, exports each chosen component, reopens every resulting F3D, and records local body names, material IDs, topology counts, bounds and volumes. A failed export or cold read leaves the selection unresolved. Preserve the terminal report and the full original bundle. Independently review the recipe, parent custody, paths, matrices, source joints and resulting archive hashes.
3. Fill in the [child selection request](../templates/archived-occurrence-request.json). Its six input references identify the whole-parent inventory and terminal readback, the frozen extraction registration and project recipe, the terminal extraction result and its exact group manifest. Keep the child F3Ds beside that manifest as emitted. The project-owned request may reference private files. Have the reviewer independently record its SHA-256. Create the intended manifest folder under the active design.

   ```text
   python <plugin>/scripts/design_iteration.py carry-child PROJECT REQUEST.json --expected REQUEST_SHA256 --vault PRIVATE-CUSTODY
   python <plugin>/scripts/design_iteration.py check PROJECT --vault PRIVATE-CUSTODY
   ```

4. Inspect the new selection manifest. It lists each member's original full path, transform in centimetres, body names and private archive digest, along with internal joints, joints that connect to parts outside the selection, and affected rigid groups. The original F3Ds and raw evidence stay in private hash-addressed custody. Review metadata for supplier or team restrictions before sharing it. A checkout without custody reports private replay pending. Reuse of a previously named element still uses the ordinary `carry` command.
5. Import the chosen members manually into the fresh active Fusion design. Exporting component definitions separately drops assembly-level attachments. Re-establish these on the new mounting datums and check joint limits, signs and intended motion against the original source. Bind the cold successor and installed article roster, verify actual placements and qualify the new attachment, travel, load and service access. Selection alone leaves installed revalidation pending. The existing showcase continues to serve its last approved issue.

The check requires a strict subset of the original solid identities. It also checks the union when more than one selection uses the same retired master. The collector supports solid-bearing leaf components; subdivide an assembly explicitly before requesting a compound selection. Its cold comparison records component identity and basic geometric properties. Use the installed shape and readiness methods for engineering qualification.

## Resume from a fresh checkout

Commit the active pointer, opening and retired decisions, import receipts and empty-directory markers together. The helper seeds iteration-local Git attributes to preserve exact bytes. If the project already defines these attributes, verify the committed image and receipt hashes against the original files after checkout. Select an image by its evidence ID in the retrospective. Its SHA-256 identifies the original image in private custody.

An early prototype saved the first retrospective before it included the opening digest. Its owner can seal the original committed cutover while keeping the original records byte-identical. Supply the independently retained original commit and its private custody directory.

```text
python <plugin>/scripts/design_iteration.py seal PROJECT --from-commit ORIGINAL-CUTOVER-COMMIT --vault PRIVATE-CUSTODY
```
