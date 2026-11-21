# Check a proposed part placement

Before an agent adds or moves robot hardware, identify its intended root-frame pose and the nearby physical interfaces. For an existing accepted design, use a separately saved, self-contained Fusion archive. Stage the native job including its plugin dependencies when it will run on a shared station. [Keep a native job reproducible](native-job.md)

Use `fusion_checked_placement.checked_placement(app, accepted_archive, accepted_sha256, new_archive, request, edit)` from the installed plugin’s `scripts` directory. The project’s `edit(design)` callback performs its native insert or move in a disposable copy of the accepted assembly. Limit the callback to that supplied design and the requested placement. It must leave saving and exporting to the guard. The source archive remains available after a veto, a native exception or an interrupted client. Store the returned receipt with the decision. Adopt the newly emitted F3D only after a pass.

For a rigid move, specify the full rooted occurrence path in `occurrence` and the 16-number Fusion world matrix in `worldTransformCm`. For a new copy of a previously placed subassembly, also name that exact `sourceOccurrence`. A repeat can instead specify `worldDeltaFromSourceCm` to transform the measured source pose in the root frame. Check the original wheel center or mounting datum before repeating it. Fusion can compensate the imported geometry inside an already translated wrapper. The guard checks the identity and attained transform of each descendant in root coordinates. It checks that fixed neighbors retain their pose and material geometry. A new physical subtree with no such template also gets its internal pairs checked.

For example, a project placing a second copy of its first carriage can use this Fusion callback.

```python
from fusion_checked_placement import checked_placement

def insert(design):
    root = design.rootComponent
    template = root.occurrences.itemByName("Carriage:1")
    root.occurrences.addExistingComponent(template.component, target_matrix)

request = dict(occurrence="Carriage:2", sourceOccurrence="Carriage:1",
               worldTransformCm=list(target_matrix.asArray()), interfaces=[])
receipt = checked_placement(app, baseline, baseline_sha256, successor, request, insert)
```

The two native kernels measure common volume in mm³. A new nonmating overlap stops the placement. Each optional interface identifies exactly two bodies using `bodies: [[fullOccurrencePath, nativeBodyName], ...]`, a written `basis` and one of these policies.

| Kind | Engineering limits | What the placement establishes |
| --- | --- | --- |
| `clearance` | Positive `minGapMm` | The attained gap meets that minimum with no material overlap. |
| `bearing` | Nonnegative `maxGapMm` | The faces are within the seating gap with zero positive overlap. Qualify the actual bearing area and load separately. |
| `fit` | Positive `minCommonMm3` and `maxCommonMm3` | The exact pair lies within its engineered material-overlap interval. Supply `evidence` with the project-relative approved fit record and SHA-256. The record uses `agent-frc/placement-fit@1`, `acceptedSha256`, the two exact `bodies`, the engineering `basis` identifying the drawing, and both volume bounds. Pass its project root as `evidence_root`. |

The reporter names both bodies and the proposed pose on a measured clash. A missing, invalid or disagreeing required measurement holds the proposal. Review the witnessed placement again after a configuration change. The endpoint check leaves insertion travel, known numerical discrepancies, unchanged internal contacts, attachment, load and complete operating motion to the [full mechanical review](mechanical-readiness.md).

## Move a nested child in the root frame

In a synthetic fixture the seat begins at (10, 20, 0) cm and its axes are rotated +90° about robot Z. A plate positioned at (1, 2, 0) cm in that seat belongs at (8, 21, 0) cm in the robot. Its corner at plate-local (1, 0, 0) cm belongs at robot (8, 22, 0) cm. Register the named child, parent matrix and expected material corner from the drawing before editing. If the moving child is a wrapper, set `materialOccurrence` to the full path of its body-bearing descendant. Select the corner in that descendant’s own coordinates.

The packaged regression exercises this example with synthetic Fusion objects, including a displaced material corner, a missing joint and a joint with the wrong endpoints. A native run on the selected archive supplies the actual joint, timeline and physical-point observations.

Stage the [worked edit and cold inspection](../examples/mechanical-readiness/root_frame_placement.py) with the complete installed plugin. The caller below uses the loaded example as `example` and Fusion's `adsk.core` as `core`. It assumes a parametric assembly with a free, independently identified plate. The project supplies the accepted F3D, its registered digest and a fresh output path.

```python
plan = dict(parent="Seat:1", occurrence="Seat:1+Plate:1", body="Plate",
            backing="Seat:1+Backing:1", jointName="Plate clamp",
            jointMotion=adsk.fusion.RigidJointMotion.classType(),
            parentWorldCm=[0,-1,0,10, 1,0,0,20, 0,0,1,0, 0,0,0,1],
            worldTransformCm=[0,-1,0,8, 1,0,0,21, 0,0,1,0, 0,0,0,1],
            cornerLocalCm=[1,0,0], cornerWorldCm=[8,22,0])
desired = core.Matrix3D.create()
if not desired.setWithArray(plan["worldTransformCm"]):
    raise ValueError("Invalid commissioned matrix")

def attach_in_owner(owner):
    # The two sibling occurrences are native to the joint's owning component.
    plate = owner.occurrences.itemByName("Plate:1")
    back = owner.occurrences.itemByName("Backing:1")
    if not plate or not back:
        raise ValueError("Missing sibling in the joint owner")
    joint = owner.asBuiltJoints.createInput(plate, back, None)
    if not joint or not joint.setAsRigidJointMotion():
        raise ValueError("Could not specify the rigid joint")
    added = owner.asBuiltJoints.add(joint)
    if not added:
        raise ValueError("Rigid joint creation failed")
    added.name = plan["jointName"]

observations = {}
def edit(design):
    observations["afterJoint"] = example.edit_nested(design, plan, desired, attach_in_owner, adsk)

request = {key: plan[key] for key in ("occurrence", "worldTransformCm")}
report = example.guard.checked_placement(app, accepted, accepted_sha256, output, request, edit)
```

For a passing guard result, open the exact successor in its own document. Write the returned warm and cold observations to the project receipt alongside the guard decision.

```python
from hashlib import file_digest

if report["status"] == "pass":
    with output.open("rb") as source:
        successor_sha = file_digest(source, "sha256").hexdigest()
    if successor_sha != report["successorSha256"]:
        raise ValueError("Successor archive changed before reopening")
    prior = app.activeDocument
    manager = app.importManager
    doc = manager.importToNewDocument(manager.createFusionArchiveImportOptions(str(output)))
    try:
        reopened = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
        observations["cold"] = dict(archiveSha256=successor_sha,
                                    **example.inspect_attachment(reopened, plan, adsk))
    finally:
        doc.close(False)
        if prior and prior.isValid:
            prior.activate()
```

Look up a nested child in `design.rootComponent.allOccurrences` by its complete path. Its root-context proxy takes the desired world matrix directly. Skip the setter when the pose already matches. For a new child created in an owning component, compute its creation transform as `inverse(parentWorld) × desiredWorld`. An occurrence held by an existing joint needs a deliberate edit to that joint. Inspect a nested parent lock through `isGroundToParent`; reading or setting `isGrounded` on an owner-local nested occurrence can throw. Reapplying a parent lock can restore the old pose. Capture a pending position when the edit is intended to persist. Confirm that editing a shared component definition affects only the intended instances before using this recipe.

The example resolves the child again after the joint and recompute, measures native-to-proxy material witnesses, and checks the commissioned corner in the robot frame. It also reads the joint from the owning component, resolves both endpoints in their full assembly contexts and verifies its motion type, suppression state and timeline health. Preserve those readings. On a guard pass, rehash the output against `report["successorSha256"]`, open that file in a fresh document, then run `example.inspect_attachment(reopened_design, plan, adsk)` and save its result. Check the required feature health there. For a moving attachment, use its specified joint type and also check an off-axis material landmark, the parked supports, a signed excursion and the return. A parked corner alone qualifies only that parked check. [Verify the cold issue](fusion-authority.md)

## Read a refused placement

When Fusion recomputes the proposal, the guard checks the requested occurrence in the root assembly before it measures any body pair. A `PlacementPoseError` stops the operation and carries a JSON-serializable `receipt`. The exception text also contains that JSON for clients that already record errors.

Read `reason` first. With `missing-occurrence`, inspect the rooted occurrence path and the insertion or removal operation. With `pose-mismatch`, compare the registered target with the observed occurrence after recompute. `priorWorldTransformCm`, `requestedWorldTransformCm` and `observedWorldTransformCm` are row-major 4×4 assembly-world matrices with translations in cm. A missing occurrence has a null observed matrix. An insertion has a null prior matrix. A relative insertion also names its source occurrence and reports the composed absolute target. The native call includes the digest of the accepted input archive.

Save the receipt with the authoring trial. Check whether a constraint, grounding change or recompute moved the occurrence, then retry from the accepted archive. Geometric interference has its own measured-pair result once the occurrence reaches the requested pose.
