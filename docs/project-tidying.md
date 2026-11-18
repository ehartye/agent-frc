# Tidy a CAD project without losing work

Use this workflow when many audit copies, exports or Fusion tabs obscure the current design or consume resources. Tidying means making the active project and evidence understandable, not deleting history or silently saving over a design. Confirm the scope of authorized organization; file deletion, cloud permissions and closing unsaved work retain their separate approval requirements.

## Inventory before action

List open documents by exact identity, title, saved/unsaved state, source provenance and purpose. Identify the owner's current assembly and any ongoing operation. Record which documents are source references, failed experiments, verified copies, or unknown/user-authored work. Similar titles are not proof of duplication. Never close by tab position or a broad title wildcard.

Keep unknown or unsaved user work open and ask only about the specific unresolved disposition. Do not change appearances, physical materials, geometry or design mode as a side effect of cleanup. Preserve supplier-derived content privacy; a private export must not be moved into a public repository just to simplify folders.

## Decide what actually needs keeping

When an imported or untitled design becomes the working draft, give it a name the next operator can recognize. Include the assembly or subsystem, the change under study, and its role. For example, `Intake – pivot clearance – active draft` distinguishes the editable design from a comparison copy. Record the source design and revision or native archive digest alongside the draft.

For a requested Fusion save, use the intended document and the authorized project and folder. Check who can access the destination when the design includes restricted geometry. After saving, read back the active tab title, document saved state and resulting design location and version. A local F3D export preserves a native archive and can leave the working tab untitled and unsaved. If only local storage is authorized, record the archive and the tab state separately.

If the immediate readback fails, check the destination folder for the saved design's file ID and version and inspect the tab again. Retry only after resolving whether the first save completed.

Prefer one clearly named active assembly, a small set of useful comparison documents and source-linked evidence. Reuse a verified existing saved copy when it already preserves the exact state. Do not create a new archive for every cleanup or accumulate redundant exports by default. A distinct failed experiment may deserve preservation because its counterexample explains a decision; duplicate views of the same verified file may not need another artifact.

For each proposed closure, record the exact document identity, disposition and recoverable source. Save only within authorization. If a new archive is necessary, use a descriptive project-relative name and provenance note, keeping original/imported/proxy and supplier restrictions explicit. Do not overwrite the canonical assembly or relabel a rejected trial as current.

## Verify recovery before closing

Reopen the selected saved artifact in isolation and compare the properties relevant to recovery: document identity, body/source inventory, joints, native parameters/history and outstanding unsaved changes. File existence or a successful export call alone is insufficient. Native and exchange formats preserve different information; a STEP file does not substitute for the required editable Fusion file. Record reopen evidence before closing the exact verified duplicate. If equivalence is uncertain, leave it open.

Close each agent-created inspection copy when its check is complete and its recovery source is verified. Recheck the open-document inventory and active document identity. The operator should see one clearly named active draft, with any other retained tab identified by purpose. Keep unrelated or unverified unsaved work open. If cleanup also aims to improve responsiveness, record the observed document count and resource use. A busy Fusion main-thread script may make an OS responsiveness indicator false while still progressing. Inspect staged progress receipts and active task state before calling it a hang or closing it.

## Long operations and timeout reconciliation

Chunk expensive authoring/checking work where practical and write durable per-stage progress with operation/document IDs. A client/HTTP timeout does not prove the native operation stopped. Reconcile completion/progress and resulting document state before retrying; blindly resubmitting can duplicate geometry or corrupt the audit trail. Never cancel another worker's operation as cleanup. Preserve failed attempts and distinguish command submission, operation completion, export and reopen verification.

## Finish with a compact project map

Record: active native assembly; editable source; latest evidence and unresolved issues; archived counterexamples worth keeping; and the exact documents closed with their recovery source. Keep paths portable in public records and personal storage details private. Deferred cleanup is acceptable when preserving uncertain work is more important than reclaiming resources.

This workflow reflects native Fusion audit cleanup lessons, but it is guidance rather than an automatic tab closer, archive manager or permission grant. The operator must verify actual state and authorization at each consequential step.
