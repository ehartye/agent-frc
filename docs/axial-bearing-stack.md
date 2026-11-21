# Check an installed shaft and both bearing seats

Use this exercise when shifting one bearing onto its shoulder creates a clash at the opposite support. Start from the registered cold assembly. Keep both bearings, the shaft and its shoulder, spacers, hub, retainers and outside supports in the scene. A radial bore dimension describes a different interface from an axial stop.

## Read the stack along the actual shaft

Choose a positive world-axis direction and a datum on the installed shaft. Use a signed axial section through each relevant radial band. Record the face normal, axial coordinate and mating material present at the inner ring, outer ring and spacer. Check chamfers, fillets, shields, seals and the land left by any relief. A single bounding box can span a groove or an empty bore. Use the actual section and directional planar seat area when the source provides the mating faces. Keep a supplier's smooth bearing envelope visibly provisional if its separate race faces or rolling elements are missing.

Trace the stationary clamp through the shaft shoulder, correctly sized spacer, inner race and opposite support where the design actually calls for it. Trace wheel or hub loading through its shoulder and outer race. Identify which member fixes the shaft axially and which is intended to float. Reversing thrust may engage a different stop. Specify both load directions and the rolling-element load transfer separately. A spacer that presses on a seal or bridges both races can bind an otherwise clear shaft.

Register actual face spacing and stack lengths with their manufacturing, thermal and installation ranges. Compare the shortest housing span with the longest packed stack, then the largest span with the shortest stack. Use the selected bearing drawing, fit and clamp requirements to judge allowable end float or preload. Measure axial play on the assembled article and check free rotation under the intended clamp and load. Without a tolerance or force–deflection basis, nominal interference or zero distance cannot establish bearing preload, running drag or life.

## Run the exercise

```text
python <plugin>/examples/mechanical-readiness/axial-bearing-stack.py
```

The original synthetic fixture uses two simple concentric rings, a shaft, a hub shoulder and an outside spacer. In the trapped version, shifting the bearing toward one seat puts the opposite ring into the spacer. The exercise proves that **every** offset in its registered 0 to +0.4 mm adjustment collides with at least one fixed part. In the relieved version, the full-scene motion check verifies a 0.32 mm interior stroke of the shaft and both rings. At the separate travel limits the hub shoulder and outer ring have 40.72 mm² of axial seat and the spacer and inner ring have 16.34 mm². These seats occur at different offsets. The fixture demonstrates geometry and has no rolling-element or load rating.

## Replay a project case

First run the [installed motion check](mechanical-methods.md) with every rigidly moving member, all installed neighbors, the saved placement and the proposed change. Check both extremes of the actual adjustment. For a changed spacer or support, restore the original part as an adverse control. Use a short spacer to expose lost seating and an overlong stack to expose interference. Register the appropriate [structural route and coupled load](coupled-support.md) for the target state.

If the design question is whether *any intermediate offset* eliminates the clash, save the following plan with the actual placed STEP hash. Use world-unit millimetres, the signed translation interval and source-based interior points at registered trial offsets. The named parts must experience only that relative translation. Standard mounted motion and service checks still cover the full installation.

```json
{
  "schema": "agent-frc/axial-obstruction@1",
  "step": {"file": "cad/issued/assembly.step", "sha256": "REGISTERED_STEP_SHA256"},
  "moving": ["shaft", "inner race", "outer race"],
  "axis": [0, 0, 1],
  "rangeMm": [0, 0.4],
  "reserveMm": 0.0001,
  "observations": [
    {"pair": ["outer race", "hub shoulder"], "offsetMm": 0, "pointMm": [5.5, 0, 0.2]},
    {"pair": ["inner race", "axle spacer"], "offsetMm": 0.4, "pointMm": [2.6, 0, 4.2]}
  ]
}
```

```text
python <plugin>/examples/mechanical-readiness/axial-bearing-stack.py PROJECT studies/axial-obstruction.json
```

The example verifies each point lies strictly inside both placed solids. It measures the nearest shell boundary and subtracts the declared numerical reserve. Select a reserve consistent with the source geometry and measurement uncertainty. For a positive residual radius *r*, both solids contain a sphere of radius *r* at the witness. When one translates less than *2r*, the two spheres still overlap. The union of these **open** displacement intervals must cover both endpoints and every intermediate offset to report `everyOffsetObstructed: true`. A gap between intervals, including a single point of tangency, leaves that position unproved. A false result means the supplied witnesses did not rule out the full interval. Use the complete motion check to demonstrate a genuinely reachable path.
