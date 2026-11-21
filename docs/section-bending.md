# Recover bending stress from the actual section

Changing a rail's width, relief or hole row can move its centroid and change the distance to the most stressed material. A solver can use the new moment of inertia and still report a low stress if it retained the old extreme-fiber distance. Reopen the selected STEP, cut the named stock at the load station, and compare its two section moduli with the values used for stress recovery.

```sh
python scripts/section_bending.py . cad/bending-plan.json
```

The plan pins the placed STEP and a separate case register. For a proposed article, identify the proposal. Repeat the cut on the cold Fusion export after installation. The following snippets use an invented 40 × 20 mm solid bar.

```json
{
  "schema": "agent-frc/section-bending@1",
  "step": {"file": "cad/bar.step", "sha256": "<placed STEP digest>"},
  "loadCases": {"file": "cad/bar-cuts.json", "sha256": "<case register digest>"}
}
```

```json
{
  "schema": "agent-frc/section-loads@1",
  "stepSha256": "<same placed STEP digest>",
  "basis": "Teaching case, signed end load at the midspan inspection station.",
  "cases": [{
    "id": "midspan",
    "solid": "Bar",
    "pointMm": [0, 0, 50],
    "normalWorld": [0, 0, 1],
    "bendingAxisWorld": [1, 0, 0],
    "momentNmm": 100000,
    "axialN": 0,
    "comparison": {
      "sectionModuliMm3": [2666.6667, 2666.6667],
      "toleranceMm3": 0.01,
      "basis": "Solid rectangle, 40 × 20² / 6, dimensions in millimetres."
    }
  }]
}
```

Set the plane normal along the beam. Register moment by the right-hand rule and tensile force positive on the positive-normal cut face. The bending axis lies in the cut and passes through the computed area centroid. Transfer all loads to that point before supplying the case. The transverse direction is the plane normal crossed with the bending axis. A missing moment or axial force leaves stress unreported. Identify hypothetical unit loads separately from actual duty loads.

The reviewer cuts the complete installed solid, including holes and reliefs, and integrates material area, centroid, both in-plane second moments and product of area. It evaluates the two extreme stresses using the full in-plane inertia matrix. On an asymmetric cut, the stress gradient may be tilted relative to the transverse direction. The two moduli are ordered by the negative then positive side of the gradient under a positive unit moment. The signed stress array preserves this same fiber order when the moment reverses. Changes in axial force shift both stresses by `N/A`.

For the example, both moduli are 2,666.6667 mm³ and the two extreme bending stresses are −37.5 and +37.5 MPa. Increasing the 20 mm height to 30 mm gives 6,000 mm³ and ±16.67 MPa. Test the old extreme distance against the widened fixture. Also reverse the signed moment on an asymmetric section and check the governing fiber.

Use the exact installed station, material dimensions and complete occurrence identity. Inspect the reported CAD topology tolerance. Repeat at tolerance limits for wall thickness, corner profile, cutout position and load placement. At a shoulder, measure stations on both sides of the feature. A single section cannot establish the governing station over a span. Cut geometry supports the elementary homogeneous, linear-elastic beam model under the supplied axial force and single in-plane bending moment. Verify load sharing for separated faces, and evaluate supports, fasteners, local stress concentration, weld heat-affected zones, torsion, buckling, fatigue and impact independently. [Check the applied support reactions](coupled-support.md) · [Compare missing and added stock](stock-sections.md)
