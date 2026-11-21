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

## Read a refused placement

When Fusion recomputes the proposal, the guard checks the requested occurrence in the root assembly before it measures any body pair. A `PlacementPoseError` stops the operation and carries a JSON-serializable `receipt`. The exception text also contains that JSON for clients that already record errors.

Read `reason` first. With `missing-occurrence`, inspect the rooted occurrence path and the insertion or removal operation. With `pose-mismatch`, compare the registered target with the observed occurrence after recompute. `priorWorldTransformCm`, `requestedWorldTransformCm` and `observedWorldTransformCm` are row-major 4×4 assembly-world matrices with translations in cm. A missing occurrence has a null observed matrix. An insertion has a null prior matrix. A relative insertion also names its source occurrence and reports the composed absolute target. The native call includes the digest of the accepted input archive.

Save the receipt with the authoring trial. Check whether a constraint, grounding change or recompute moved the occurrence, then retry from the accepted archive. Geometric interference has its own measured-pair result once the occurrence reaches the requested pose.
