# Editable robot blockout

Create a metric blockout, try a chassis opening and export a revision for CAD review.

~~~sh
node scripts/design.mjs new robot.json
node scripts/design.mjs validate robot.json
node scripts/design.mjs opening robot.json robot-open.json on
node scripts/design.mjs export robot-open.json cad-review
~~~

To attach project dimensions and rule evidence during creation, pass a project JSON path after the output path. Each supplied section replaces the corresponding default. The following illustrative profile records a local engineering constraint and its edition locator. Replace the example URL and values with the actual project sources.

~~~json
{
  "id": "prototype",
  "workspace": {
    "lengthM": 8, "widthM": 5,
    "targetSizeM": [0.15, 0.5, 0.4], "pieceSizeM": [0.12, 0.10, 0.08],
    "pieceCenterM": [1, 0.5, 0.04], "basis": "Measured bench layout"
  },
  "rules": [{"id": "height", "maximumM": 0.85, "sourceId": "fixture"}],
  "sources": [{"id": "fixture", "url": "https://example.org/drawing", "locator": "Edition A, sheet 1", "scope": "Fixture overhead clearance", "sha256": null}]
}
~~~

~~~sh
node scripts/design.mjs new robot.json project.json
~~~

The blockout export is a provisional handoff. After role selection, the whole-robot designer tests a [shared package layout](package-layout.md) on a placed STEP and hands the selected issue to the subsystem designers.

The source artifact uses schema agent-frc/design-artifact@2. Record the robot pose, target pose and the reason for each datum under frames. Reference boxes use x, y, z sizes in metres. Target origin is its center. The object center uses the world frame. The field rectangle starts at x = 0 and is centered on y = 0. Replace the illustrative poses, route, cycle times and requirements with the project's measurements. Populate the planning links to distinguish which action or mechanism depends on each requirement. Use reviseDesign to edit an existing artifact, advance its revision and discard prior check results.

The four supported upper bounds are frame-perimeter, bumper-zone (upper edge), height (all modeled robot volumes), and stow (front extension when starting). Each requires a source record with an edition and a section locator. Missing bounds remain unknown. Support and coverage stay open for assembly review.

The export directory contains design.json, geometry.json, checks.json, HANDOFF.md and blockout.scad. Open the SCAD in OpenSCAD to inspect the robot and two registered reference boxes. The reversible cut affects the chassis plate and body envelope and preserves a 50 mm illustrative support strip. Inspect remaining material, object paths and the bumper attachments separately. CAD uses millimetres. geometry.json also carries the field dimensions. Validate a completed cycle against observed motion before using the rehearsal budget for throughput decisions.
