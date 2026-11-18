# Original FUEL squeeze-fixture CAD

This is a new original fixed test fixture, not a manufacturer intake, a complete robot, an official field surface or demonstrated capture. It does not reuse the old opposed sleeve nip as a ground intake. There are exactly three native solids with distinct roles: one driven sleeve and two fixed supports. Fixed-support volumes are not assigned density, robot mass or inertia.

## Two preserved hypotheses

Both fixtures use a hypothetical single sleeve with outside radius38.1mm, bore radius6.35mm, span200mm and uniform assumed density1200kg/m³. A hypothetical10:1 gear ratio and one motor are configuration assumptions, not a verified gearbox or hardware installation. Shaft/motor/gear inertia, bearings, guards, strength and actual ownership remain missing.

- Compressed: shaft at fixture (0,0,186.1)mm, bottom clearance148mm. A nominal150mm sphere centered on the undeformed floor would have2mm overlap at roller X=0. This is an explicit compliant experiment design, not valid rigid interpenetration or a sourced compression recommendation.
- Nominal control: shaft Z188.1mm, bottom clearance150mm, zero nominal geometric interference. It is an independent input file, not a silent overwrite.

The floor solid spans X[-400,90],Y[-150,150],Z[-20,0]mm. The backstop solid spans X[90,110],Y[-150,150],Z[0,300]mm; its inner face is X90mm. Neither intersects the sleeve. A nominal sphere touching floor and wall would have center(15,0,75)mm, remaining in reach of the compressed sleeve (approximately0.992mm overlap before any support deformation). This explains a candidate layout, not a successful retention/release outcome.

Only the floor top, wall inner face and sleeve cylindrical contact are supplied as analytic descriptors. Model consumers must remain within the declared finite face domains and planar Y=0 scope, and reject unsupported corner, side/end-face or outside-domain interactions. There are no physical side guides establishing that planar constraint. Surfaces are hypothetical fixture geometry, not verified carpet or CAD-to-field registration.

## Native execution and provenance

`python scripts/intake-fixture-cad.py case-studies/2026/intake-fixture-compressed.json NEW_OUTPUT_DIRECTORY` writes original native STEP, rereads it and independently selects the three bodies by unique bounds. Each native solid is compared with its intended analytic solid using intersection/symmetric-difference volume; pairwise intersections must have zero volume within stated numerical tolerances. These are computational checks, not manufacturing tolerances or structural assembly validation. The nominal-control file is run separately.

Native sleeve volume, centroid and inertia tensor under assumed density produce shaft-axis inertia with the perpendicular parallel-axis term. No total assembly mass is emitted. Exact parent FUEL source/config bytes and current graph pins are required. The runner retains input, STEP, properties, source/helper/context hashes and OCP/Python versions, checks changes during execution and refuses reuse of an existing output directory.

`python scripts/test-intake-fixture-cad.py` requires seven native checks with no failures/errors/skips. Coverage includes both variants, nonintersection, analytic inertia cross-check, source/schema/scope rejection, wrong native variant and changed STEP rejection. These are native CAD tests only, not controller, contact or capture execution.

The reviewed source-sized FUEL remains150mm displayed metric nominal with the explicitly recorded5.91in rounding difference and source mass interval. Material/contact coefficients, mass selection and uniform-sphere inertia belong to a separate physics experiment. Normal force cannot be inferred from geometric overlap without that explicitly assumed constitutive law. Dwell/retention, escape disturbances and actual reverse release must be tested separately; a beam event or fixed support is not possession. Engineering acceptance remains blocked.
