# Segmented contact geometry for all three seasons

Run `python -B scripts/segmented-season-contact.py`, with `--test` for four lightweight checks. The FUEL-only kernel has five further checks via `python -B scripts/segmented-fuel-contact.py --test`. These are standalone geometric probes, not force, control or capture simulations. Their context hashes identify old nominal fixtures; their constants are newly declared original probe configurations rather than automatically consumed fixture physics.

Wheel bounds were inspected from product-linked STEP files:

- 2024:4in MAXSpline wheel, SHA256 `408544394be77d3815d32ab360d8cbb975ccf847366f0d02c77499dc33fe3bb2`, full width24.0125mm, radius50.8mm.
- 2025:REV-21-2030 direct-hex wheel, SHA256 `31c85aa9eb59711c3119e0089d2865bb243f82126007d15e49e4189892882150`, full width12.7mm, radius25.4mm.
- 2026:3in MAXSpline wheel already pinned in native assembly studies, full width24.0125mm, radius38.1mm.

Sources: [REV compliant-wheel product table](https://www.revrobotics.com/ION-Compliant-Wheels/), [4in STEP](https://www.revrobotics.com/content/cad/Compliant-Wheel-4in-MAXSpline.STEP), [direct-hex STEP](https://www.revrobotics.com/content/cad/REV-21-2030.STEP). Cylinders enclosing these bounds are not exact tread geometries. They can overpredict contact. Existing source conflicts concerning width/hardness/material remain unresolved; no density or stiffness is assigned.

Gamepiece dimensions and fixed-orientation idealizations retain the source provenance of `case-studies/2024/note-fixture-nominal.json`, `case-studies/2025/coral-fixture-nominal.json` and `case-studies/2026/intake-fixture-nominal.json`. This is not a new review of season manuals or competition compliance.

At the old continuous-sleeve nominal-tangent heights, the segmented layouts have nonzero minimum geometric separation:

- NOTE:2.10738..2.12067mm bracket at the specified centered flat pose. The ideal torus is the union of minor-radius spheres along its center circle. Sampled minimum distance to finite wheel cylinders provides an upper gap bound; center-circle arc spacing and the1-Lipschitz property of Euclidean set distance provide the conservative lower bound. This preserves the torus hole rather than replacing it with a disk. It does not give a penetration force or material deformation law.
- CORAL:0.08813mm at the centered fixed-X tube pose. The analytic result is restricted to exterior upper contact while the tube spans the full wheel feed-direction envelope. Bore, end-face and arbitrary tube orientation are unsupported.
- FUEL:0.19821mm at the centered sphere pose. Lowering the wheel axis5mm produces two geometric overlap candidates of approximately4.78767mm, not six equally loaded contact patches. Exact sphere-to-finite-cylinder distance includes axial edges, unlike the prior infinite-sleeve centerline model.

The new results demonstrate why old continuous-sleeve contact validity cannot be inherited. A physical model still needs independently justified local/aggregate stiffness, damping, friction, material identification, lateral/angular degrees of freedom, drive dynamics and calibration. Never copy the old aggregate force law onto every wheel and sum it without a load-sharing model. No simulated capture or engineering acceptance is established by these probes.
