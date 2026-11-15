# Fusion concept package

Three original, deliberately incomplete sideplate concepts accompany the cases. All lengths are assumed millimetres; none are official field or robot-envelope dimensions. The two axle holes are placeholders, not bearing fits or a fabrication drawing.

Run `node scripts/case-artifacts.mjs` from the plugin root to regenerate each sideplate DXF/SVG and Java resource properties from case.json. Run `npm run cases:validate` to detect stale artifacts. These portable vector files were generated; importing them into Fusion is a separate verification step.

In Fusion, open Utilities → Scripts and Add-Ins, add the existing FrcCaseConcepts folder and run its script. It creates new unsaved designs and writes local F3D/STEP files under native-output. It does not save to an Autodesk cloud project or replace an existing design. Do not run repeatedly over valued exports; move the previous generated output first.

The script uses explicit units. Coordinate values convert mm to Fusion's internal cm; extrusion thickness uses an expression. The outline is an input-driven snapshot, not a fully constrained parametric assembly. Change case inputs and regenerate. No rollers, bearings, fasteners, joints, chassis, guarding or load paths are modeled.

Current execution state: Fusion launched but presented Sign in Failure. Native script execution/export/reopen and interference checks are unperformed. Python parsing and cross-file checks do not prove the Autodesk API ran. Once access is restored, inspect the two plate bodies, dimensions and hole profiles; export and reopen; record actual application version and defects.

Official API references: [script workflow](https://help.autodesk.com/view/fusion360/ENU/?guid=GUID-9701BBA7-EC0E-4016-A9C8-964AA4838954), [extrusion method](https://autodeskfusion360.github.io/FusionAPIReference/Fusion_API_Documentation/files/ExtrudeFeatures_addSimple.htm), [export sample](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/ExportToOtherFormats_Sample.htm). Reviewed 2026-11-15. This is original code; no Autodesk samples or assets are bundled.
