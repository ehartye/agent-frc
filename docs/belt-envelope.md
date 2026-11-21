# Inspect a smooth belt around toothed pulleys

A purchased assembly may represent a flexible belt as a solid band. A tooth can enter that band in the saved model. Before changing center distance or cutting stock, compare the installed representation with the belt specification. Keep the original overlap, both pulley identities and every obstruction from the complete parked and moving assembly review.

This diagnostic covers an open, uncrossed loop on two parallel circular pitch axes with straight external tangents. It compares the full smooth band and measures radial metal extrema at chosen axial sections. A toothed or twisted belt, timing idler, crowned pulley, tensioner or changing route needs a model that covers its actual shape and motion.

```sh
python scripts/belt_envelope.py . cad/belt-plan.json
```

The following original teaching example uses millimetres. Register the independently chosen component dimensions in a second file. Replace the digest placeholders with SHA-256 values for the actual project files.

```json
{
  "schema": "agent-frc/belt-envelope@1",
  "step": {"file": "cad/assembly.step", "sha256": "<placed export digest>"},
  "dimensionSource": {"file": "cad/belt-dimensions.json", "sha256": "<dimension register digest>"},
  "belt": "Loop",
  "pulleys": [
    {"solid": "Left pulley", "centerAtStartMm": [0, 0, 0]},
    {"solid": "Right pulley", "centerAtStartMm": [32, 0, 0]}
  ],
  "axisWorld": [0, 0, 1],
  "stationsFromStartMm": [0.3, 2, 3.7],
  "obstacles": ["Guide"],
  "pitchLengthToleranceMm": 0.001,
  "shapeResolutionMm3": 0.1
}
```

```json
{
  "schema": "agent-frc/two-pulley-dimensions@1",
  "basis": "Invented classroom belt and pulleys at nominal dimensions.",
  "pitchMm": 4,
  "beltTeeth": 28,
  "pulleyTeeth": [12, 12],
  "widthMm": 4,
  "pitchToInnerMm": 1,
  "pitchToOuterMm": 1
}
```

Use the exact installed solid identifiers and world pulley-axis points at the first axial edge of the belt. Point the axis toward the opposite edge. Use the drawing’s pitch, tooth counts, axial width and signed distances from the pitch line to the represented inner and outer surfaces. Record any inferred dimensions as hypotheses. Choose the length and volume resolutions from the source precision and engineering decision. The example’s two 12-tooth pulleys and two 32 mm spans require 112 mm of pitch length.

Read the pitch length, actual belt-face types, cylinders and [complete section comparison](stock-sections.md) together. The section comparison includes both directed material differences against the registered band. If those operations disagree, retain the discrepancy. At each transverse station the reviewer checks endpoints and interior extrema of circular edges on the selected metal solid. It reports how far the metal reaches relative to the two nominal belt radii. A flange beyond a station or a feature between stations needs its own section or full-volume inspection.

The pair observations retain the raw common volume and result validity for both pulleys and the named obstacles. Challenge the assessment with a displaced center, an obstruction driven into a straight span, and the same obstruction in the empty loop cavity. Check nonmating hardware separately through the entire commissioned travel using the [whole-assembly readiness review](mechanical-readiness.md). Never extend a finding about one tooth and belt to a guard, fastener, neighboring shaft or rail.

The report always leaves mating and load open. Qualifying a working drive calls for a compatible belt/pulley tooth form, wrap and engagement, installed tension and adjustment range, axial tracking and flange clearance, plus a sourced torque and speed rating or a suitable loaded test. A grip tire or compliant game article also needs its applicable force–travel evidence and hard-core clearance.
