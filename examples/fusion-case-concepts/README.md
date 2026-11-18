# Fusion concept package

Three original, deliberately incomplete sideplate concepts accompany the cases. All lengths are assumed millimetres; none are official field or robot-envelope dimensions. The two axle holes are placeholders, not bearing fits or a fabrication drawing.

Run `node scripts/case-artifacts.mjs` from the plugin root to regenerate each sideplate DXF/SVG and Java resource properties from case.json. Run `npm run cases:validate` to detect stale artifacts. These portable vector files were generated; importing them into Fusion is a separate verification step.

In Fusion, open Utilities → Scripts and Add-Ins, add the existing FrcCaseConcepts folder and run its script. It creates new unsaved designs and writes local F3D/STEP files under native-output. It does not save to an Autodesk cloud project or replace an existing design. Do not run repeatedly over valued exports; move the previous generated output first.

The script uses explicit units. Coordinate values convert mm to Fusion's internal cm; extrusion thickness uses an expression. The outline is an input-driven snapshot, not a fully constrained parametric assembly. Change case inputs and regenerate. No rollers, bearings, fasteners, joints, chassis, guarding or load paths are modeled.

Current execution state: Fusion access is restored. The original three-case batch script has not been run. A separate [guarded adaptation](../fusion-guarded/README.md) executed the 2026 two-sideplate geometry on 2026-11-16, changed thickness from 6.35 to 7 mm, and verified F3D/STEP reopen. The 2024/2025 native concepts, interference, load and manufacturing checks remain unperformed. The original batch script still has overwrite risks; prefer the guarded new-directory workflow.

Official API references: [script workflow](https://help.autodesk.com/view/fusion360/ENU/?guid=GUID-9701BBA7-EC0E-4016-A9C8-964AA4838954), [extrusion method](https://autodeskfusion360.github.io/FusionAPIReference/Fusion_API_Documentation/files/ExtrudeFeatures_addSimple.htm), [export sample](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/ExportToOtherFormats_Sample.htm). Reviewed 2026-11-15. This is original code; no Autodesk samples or assets are bundled.
