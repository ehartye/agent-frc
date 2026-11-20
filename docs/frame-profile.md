# Set the frame and bumper outline

New blockouts start with the two back corners cut diagonally in plan view. Local +X is forward and +Y is left. The front corners stay square. The rear cutbacks each measure one tenth of the shorter frame dimension along X and along Y. A 700 × 640 mm starter therefore cuts 64 × 64 mm from each rear corner. This is an editable packaging assumption. Check wheel-module travel, gearbox and mounting space, rail joints, bumper supports and attachment access before sizing the actual cuts.

## Choose the project outline

A newly initialized project stores its choice in `cad/frame-profile.json`. Existing design evidence and prior saved artifacts keep their explicit outlines. `design new` reads the setting from the project containing the output file. A project JSON supplied to that command can override it with a `frameProfile` property. `rules compile` copies the project setting into its newly written field profile. An explicit trial, rehearsal robot, or project profile can supply its own shape.

```json
{"kind":"rear-chamfer","shortSideFractions":[0.1,0.1]}
```

Use `{"kind":"rear-chamfer","cutbacksMm":[45,65]}` for measured fore-aft and transverse cutbacks, or `{"kind":"square"}` when the project calls for square corners. For a different convex outline, choose `{"kind":"convex-outline","vertices":[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]]}` and supply strictly counterclockwise normalized points. The enclosing width and length run from −0.5 to +0.5. Re-entrant outlines need a project-owned detailed model and a declared conservative collision envelope.

## Inspect the plan in Fusion

Run `node scripts/design.mjs new PROJECT/cad/blockout.json` and `node scripts/design.mjs export PROJECT/cad/blockout.json PROJECT/cad/frame-export` from the plugin checkout. Insert the exported `frame-plan.dxf` on the Fusion XY plane in millimetres. Check its forward edge, origin, envelope and diagonal lengths before applying native dimensions and design constraints. The OpenSCAD blockout and geometry JSON use the same vertices.

The frame, backing, padding and cover form continuous closed plan loops. The starter reserves 25%, 73% and 2% of the assumed bumper depth for backing, padding and cover respectively. Override project `bumperConstruction` with backing, padding and cover objects containing their measured fractions and material descriptions. Set the total bumper depth in the design parameters and verify all thicknesses in the native assembly. Each face offsets along its own normal. The intersections of the offset side and diagonal faces form their miters. All three bumper layers retain their ordinary full-height vertical section along both chamfers. Fabric seams, corner forming, crush response and physical supports need project evidence.

For equal rear cutbacks c and total depth t, the outer bounding-box cutback is c + (2 − √2)t. The two frame cuts reduce the rectangular perimeter by 2(dx + dy − √(dx² + dy²)) and its area by dx·dy. The square front corners still set the centered nominal turning radius. The Field Lab’s rehearsal draws and collides the rotated occupied polygon against walls, structures and other robots. The scoring opportunity corridor uses a width-based rectangular estimate; confirm close passages in the occupied-body rehearsal or native geometry.

Supply the applicable project manual edition, update cutoff and source locators before making inspection claims. An optional project `frameRuleReview` contains `edition`, `cutoff` (YYYY-MM-DD), a registered `sourceId`, and `checks`. Each check records `topic` (frame-perimeter, corner-coverage, backing-and-padding or attachment), a `locator`, a `finding` (supported, conflict or unknown) and its `basis`. After reviewing that exact geometry, save the output of `node scripts/design.mjs frame-basis ARTIFACT.json` as the review’s `reviewedBasis`. Pin the manual source digest and include registered, digest-pinned `assemblySourceIds` for construction and attachment findings. Editing the cutbacks, mounting layout, layer materials, cutouts or evidence basis requires a fresh review before a finding can carry forward. The checker reports each project finding separately from computed perimeter and open structural checks. A closed sketch by itself establishes neither legality nor strength.
