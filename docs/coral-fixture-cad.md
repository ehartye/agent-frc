# Original finite hollow CORAL fixture

This CAD-only experiment creates three separate native solids: one upper annular driven sleeve, a fixed floor, and a genuinely hollow finite CORAL geometry proxy. It does not execute transport, robot code, capture or scoring. Two independently named configurations preserve compressed and nominal alternatives; neither is a team decision.

## Source and authored geometry

The exact pinned 2025 manual, Arena V4 section5.7.1 page33, gives nominal11 7/8in length,4.5in OD and4in ID,1.1–1.8lb. These yield301.625mm length,57.15mm outer radius and50.8mm inner radius. The foam-core PVC description supplies no stiffness/friction/density calibration. The full hollow native proxy is an idealized source-sized shape, not manufacturer CAD. Its mass is NOT inferred from native volume. The source interval remains separate; no midpoint is silently selected here.

Original sleeve assumptions: radius25.4mm, bore radius6.35mm, span152.4mm, uniform density1200kg/m3, gear10 and one motor. Only the sleeve has assumed-density mass and native axis inertia. Its axis is +Y atX0,Z137.7mm compressed or139.7mm nominal. Floor clearances112.3/114.3mm imply2/0mm nominal overlap with114.3mm OD, not a sourced compliant design recommendation.

The fixed floor spansX[-600,600],Y[-150,150],Z[-20,0]mm. The hollow proxy reference center is(-160,0,57.15)mm with axis+X. This is a declared entry pose only; a later simulator must transform the finite axial ends with the moving tube. Neither floor nor proxy gets a native mass/density or aggregate assembly inertia.

## Native evidence and limitations

Extraction reads actual STEP bytes with explicit millimetres, pins bytes before/after, matches exactly three roles by bounds and symmetric-difference volume, and derives sleeve inertia from its native tensor. Sleeve/floor and tube/floor must have no volumetric intersection. Tube/sleeve intersection is recorded separately as intentional compliance hypothesis, NOT a rigid-fit pass. Native tube volume is tested against an annular tube and not a filled cylinder. Numerical shape tolerances are not manufacturing tolerances.

The later reduced contact model is only planarXZ atY0 with externally locked tube orientation. It may evaluate exterior upper surface/top-end edge when the roller axis is above the tube top, and lower exterior against the finite floor. Full hollow CAD does not validate arbitrary3D bore, annular end-face, lateral/roller-end or corner contact. Those unsupported interactions must fail closed in a consumer, not be treated as absent collisions. A constraint supplies unmodeled reaction torque; no free rotation, bending, buckling, structural strength or guide design is established.

Source/context/config/STEP hashes bind the exact planning branch and original shape. They establish consistency, not physical source authentication or engineering qualification. Unknown friction/damping/stiffness remain null. No physical retention, L1 scoring, powerless recovery, gamepiece damage safety or five-domain acceptance is claimed.

Run `python scripts/coral-fixture-cad.py case-studies/2025/coral-fixture-compressed.json NEW_OUTPUT_DIRECTORY` with installed OCP. Native regression: `python scripts/test-coral-fixture-cad.py` requires exactly8 tests without failures/errors/skips. Output directories must be new; original generated STEP/properties stay private, not checked into the repository.
