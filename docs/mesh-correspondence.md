# Verify the geometry students can actually see

Compare the actual submitted mesh against a cold tessellation of the selected placed STEP. The STEP derives from the saved project Fusion authority. A render receipt and a matching outer bounding box alone cannot show that all installed parts survived export.

```sh
python PLUGIN/scripts/mesh_correspondence.py PROJECT issue/display.json
```

The JSON identifies pinned `step` and `mesh` files, `chordMm`, `angleRad`, and the selected `pose`. Use `"rest"` for the exported model's parked scene. A GLB or glTF can select a named animation and time in seconds using `{"clip":"service stroke","timeS":0.75}`. Supply the matching posed STEP for that instant. The reader composes every reachable node transform including repeated mesh instances, reads indexed or sequential triangles, and supports STEP or LINEAR rigid translation, rotation and scale channels. A time sample checks the selected display pose. Separate native pose and continuous-motion studies establish travel between poses. Unsupported deformations require a registered baked mesh or another qualified method.

The glTF reader converts metres to millimetres and applies the specified proper rigid `glbToCad` transform. This 16-element row-major matrix acts on millimetre XYZ points. Project field axes and glTF axes can differ. Preserve the complete local glTF buffer files with the JSON; the public release must include those same bytes. Binary STL and gzip STL use the source millimetre frame.

Matching oriented facets are assigned once per actual STEP solid. Reordering triangles, merging draw groups or reusing a glTF mesh node does not erase multiplicity. The default coordinate quantization is 0.0001 mm and the maximum supported quantum is 0.001 mm. A complete subset missing an occurrence fails. Different triangles from a different tessellator can leave the comparison open.

## When the tessellators differ

Record the source ID for the facets written for each solid during the actual project export. Preserve this mapping alongside the model. In `surfaces`, give a reviewed tolerance in mm, its engineering basis, a maximum sample budget per direction and a `facets` object keyed by STEP solid. Each value is a list of `[firstTriangle,count]` ranges into the displayed mesh. For glTF the ordering is the selected scene's depth-first node traversal followed by primitive and triangle index. All visible triangles must belong to exactly one physical source solid.

For each mapped solid, the solver checks distance from source to displayed surface and back. A source subtriangle whose corners all project within tolerance to the same target triangle is bounded by convexity. Other subtriangles use a distance bound from their centers or are subdivided. Exhausted budgets stay open. A sampled excursion beyond tolerance identifies its millimetre coordinates and direction. This comparison concerns the two tessellated surfaces. Set source tessellation and engineering limits to respect the original solid features that must remain visible. Recheck actual body colors and readable markings with the capture and native-image tools.

When an older scene lacks per-part ranges, an optional `sampledScreen` with `toleranceMm` and `basis` can identify measured discrepancies in a bidirectional whole-model screen. A finite set of matching sample centers cannot qualify every physical occurrence. Keep the original scene as historical evidence and retain source-to-facet registration in the successor. Preserve animations when regenerating a sanctioned parked mesh.

## Where this comparison applies

A detailed design has [one published view, its design review](design-publication.md#one-viewer-for-one-design). The layout check builds that page's model from the same solids it checks, so it needs no mesh comparison.

Use this command on its own when a project keeps a mesh for another purpose, such as a simulator scene or a print, and wants to know that it holds every installed solid of the STEP. For a GLB or glTF with clips, `pose` selects the clip and time to compare, and the matching posed STEP is the reference.

## Choose when to observe a joint

A playable clip can show motion that the editable assembly reaches immediately after a joint command. A stowed pose that must survive a rebuild calls for a different observation. Commission the stage for every inspection pose in `operatingIntent.poseStages`. Use exactly the identifiers from the reopen record’s `inspectionPoses`, including `saved`. Put the chosen `stage` on each inspection pose submitted to `fusion_issue_station.measure_pose`. When a public animation key claims a particular stage, also set its `keyPoses[].stage` to that exact commissioned value. An unmarked animation key describes finite travel.

| Stage | What the native station does |
| --- | --- |
| `archive-rest` | Opens the exact saved archive and observes the geometry before issuing any joint command. The reserved `saved` pose uses this stage. |
| `command-response` | Applies the specified commands, processes Fusion events, and reads all commanded coordinates and the installed bodies together. Use this for transient travel. |
| `after-recompute` | Applies the commands, processes events, calls `computeAll()`, processes events again, and measures the result. Use this when the assembly must hold its pose through a rebuild on its own. |
| `captured-recompute` | Records the pending position with a Fusion snapshot in the disposable document before rebuilding and measuring. Use this only when the design workflow explicitly requires position capture. |

For example, a synthetic slider can commission `{"saved":"archive-rest","extend":"command-response","service":"after-recompute"}`. Commission `captured-recompute` instead if a captured position is part of the intended service procedure. To claim a newly saved rest position, issue that archive through the normal lineage and cold-open it without commands. Snapshot-assisted recompute proves only the observed state in the disposable document.

The rebuilt stages also record the health and identity of every timeline feature. The reviewer checks all timeline entries, including children of groups. A feature error fails the pose even when the requested coordinate was reached. The checker preserves an already suppressed or rolled-back alternative at the same identity and state as the untouched cold configuration. A newly suppressed required feature, missing feature, warning or unknown rebuilt health needs review. A captured position may add one healthy timeline entry whose entity is a Fusion Snapshot. A new hole, extrusion or unidentified feature leaves the rebuilt pose unqualified. Unmarked historical travel and immediate-response checks do not require a timeline rebuild.

The station records actual coordinates before and after the operation and samples three noncollinear material points per body in assembly-world coordinates. The reviewer checks the source pose, attained coordinates, relative movement of the registered joint members and the fixed chassis. An immediate extension can pass even if a separate service pose returns to zero on recompute. Keep both results. A changed load, actuator holding torque or physical retention needs its own test.

Historical unmarked cold censuses support the original archive rest or an immediate command response. A label on an older receipt cannot establish a later stage. Stronger claims require a new native measurement. The standalone `native:articulation` comparator compares supplied pose values and archive identity only. Use the commissioned native census for a release claim about observation stage.
