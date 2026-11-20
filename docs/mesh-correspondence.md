# Verify the geometry students can actually see

Compare the actual submitted mesh against a cold tessellation of the selected placed STEP. The STEP derives from the saved project Fusion authority. A signed render receipt and a matching outer bounding box alone cannot show that all installed parts survived export.

```sh
python PLUGIN/scripts/mesh_correspondence.py PROJECT issue/display.json
```

The JSON identifies pinned `step` and `mesh` files, `chordMm`, `angleRad`, and the selected `pose`. Use `"rest"` for the exported model's parked scene. A GLB or glTF can select a named animation and time in seconds using `{"clip":"service stroke","timeS":0.75}`. Supply the matching posed STEP for that instant. The reader composes every reachable node transform including repeated mesh instances, reads indexed or sequential triangles, and supports STEP or LINEAR rigid translation, rotation and scale channels. A time sample checks the selected display pose. Separate native pose and continuous-motion studies establish travel between poses. Unsupported deformations require a registered baked mesh or another qualified method.

The glTF reader converts metres to millimetres and applies the specified proper rigid `glbToCad` transform. This 16-element row-major matrix acts on millimetre XYZ points. Project field axes and glTF axes can differ. Preserve the complete local glTF buffer files with the JSON; the public release must include those signed bytes. Binary STL and gzip STL use the source millimetre frame.

Matching oriented facets are assigned once per actual STEP solid. Reordering triangles, merging draw groups or reusing a glTF mesh node does not erase multiplicity. The default coordinate quantization is 0.0001 mm and the maximum supported quantum is 0.001 mm. A complete subset missing an occurrence fails. Different triangles from a different tessellator can leave the comparison open.

## When the tessellators differ

Record the source ID for the facets written for each solid during the actual project export. Preserve this mapping alongside the model. In `surfaces`, give a reviewed tolerance in mm, its engineering basis, a maximum sample budget per direction and a `facets` object keyed by STEP solid. Each value is a list of `[firstTriangle,count]` ranges into the displayed mesh. For glTF the ordering is the selected scene's depth-first node traversal followed by primitive and triangle index. All visible triangles must belong to exactly one physical source solid.

For each mapped solid, the solver checks distance from source to displayed surface and back. A source subtriangle whose corners all project within tolerance to the same target triangle is bounded by convexity. Other subtriangles use a distance bound from their centers or are subdivided. Exhausted budgets stay open. A sampled excursion beyond tolerance identifies its millimetre coordinates and direction. This comparison concerns the two tessellated surfaces. Set source tessellation and engineering limits to respect the original solid features that must remain visible. Recheck actual body colors and readable markings with the capture and native-image tools.

When an older scene lacks per-part ranges, an optional `sampledScreen` with `toleranceMm` and `basis` can identify measured discrepancies in a bidirectional whole-model screen. A finite set of matching sample centers cannot qualify every physical occurrence. Keep the original scene as historical evidence and retain source-to-facet registration in the successor. Preserve animations when regenerating a sanctioned parked mesh.

## Use the gate

The standard CAD still and browser viewer use the same binary STL. The private gate checks the submitted triangle count, current source hash, actual part geometry and submitted still/mesh identities. For custom meshes, add a pinned `meshStudy` to the file’s distribution row, with the same structure described above. Give every posted mesh its own registered source, scope and pose. A failed or open correspondence prevents the replacement. Field-only media can be verified through an independent trusted field build. A gallery-only CAD image still requires the authorized model issue.
