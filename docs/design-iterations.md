# Start a new design iteration

Use a restart when the team has chosen to replace a design or reverse its premise. A partial restart can keep a qualified subsystem. Select and import it explicitly after cutover.

## Preserve the outgoing design

Compare the outgoing design with its role. Which result is worth keeping? Which requirement failed, and under what conditions? What would the team change if it began today? Link each answer to the exact evidence. Save a still or screenshot and describe what it shows. Capture a failed trial beside the positive one if both influenced the decision.

Stop editing the outgoing design. Check branches, active authors, live CAD jobs, saved Fusion versions, uncommitted files, ignored runs and private supplier assets. Save and reopen any unsaved work first. For an existing unnumbered project, enumerate the complete selected archives and working evidence to retain. For subsequent rollovers the helper also captures *every file* in the active design and prior import records. Record software commits, source identities and the applicable scope in the evidence list. Keep large and restricted files in private custody.

Copy [the restart plan](../templates/design-restart.json) outside the reserved iteration directories. Fill it in with actual paths and SHA-256 digests. Each evidence ID names one physical artifact. Use the original revision or commit in its source description. Images, design masters and independent results each have their own entries. Only a separately named component or subsystem with kind `element` is eligible for a future import.

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
