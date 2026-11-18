# Original NOTE torus fixture, native geometry only

Two source-pinned alternatives create a genuinely holed native torus proxy, a transverse annular sleeve and a fixed floor. This is CAD evidence, not contact/IO execution, a manufacturer mechanism or a selected team design.

The2024 manual ArenaV8 section5.7 page34 gives NOTE14inOD/10inID/2in thickness and 8.3 +/- 0.2 oz. The derived major radius152.4mm and minor radius25.4mm use an EXTRA circular tube-profile idealization; the source dimensions do not prove actual foam cross-section. Source mass endpoints remain separate, not inferred from native volume or a density assumption.

The torus axis is+Z with referencecenter(-220,0,25.4)mm; orientation andY0 are externally constrained. The sleeve axis is+Y, radius50.8mm,bore6.35mm,span400mm,centerX0 andZ99.6mm compressed or101.6mm nominal. Floor-to-sleeve clearances48.8/50.8mm imply2/0mm nominal interference with source thickness, not calibrated preload. The initial reference pose has POSITIVE separation from the roller in both variants; no initial grip is claimed. Native extraction reports that gap.

The original floor spansX[-700,700],Y[-250,250],Z[-20,0]mm. Sleeve density1200kg/m3,gear10 and one motor are hypotheses. Native tensor/shaft inertia is only for that ideal sleeve. Torus/floor mass, assembly mass, guides, shaft/bearings/transmission and structural strength remain unknown.

## Geometry and later contact boundary

For a full-span transverse roller above the flat torus, project the major ring ontoX: qX=clamp(rollerX,noteX-majorR,noteX+majorR),qZ=noteZ. The exterior gap is distance((qX,qZ),(rollerX,rollerZ)) minus rollerR and minorR. This is the projection of a real torus, NOT a filled disk. Two symmetric rim loci Y = +/- sqrt(majorR^2 - (qX-noteX)^2) merge at the projection endpoints. At the center the vertical beam can see the hole while off-center rims still touch the roller. Beam geometry must remain annular.

A later force model may declare one aggregate effective compliance/friction law, not silently double per-patch stiffness then halve it at merger. No individual contact pressure or foam deformation is established. Floor support is similarly an aggregate hypothesis. Unsupported tilt,lateral motion,roller-end/side collisions or free angular dynamics must fail closed.400mm span covers355.6mm OD only under the centered flat constraint. A constraint reaction moment does no angular work in this reduced model; it is not a designed physical guide.

Native checks use explicit millimetres, pre/post STEP hashes, unique body roles, symmetric-difference volume, analytical torus volume and an independent axial bore probe. Independent native minimum-distance checks at center and both exterior ends verify the ring projection. Sleeve/floor and torus/floor volumetric intersection is forbidden; any torus/sleeve overlap is recorded only as intentional compliance hypothesis, not rigid fit. Generated STEP/properties stay private. Source/graph/config hashes prove consistency, not authentication or physical qualification.

Run `python scripts/test-note-fixture-cad.py` (exactly9 tests, no failures/errors/skips) and `python scripts/note-fixture-cad.py case-studies/2024/note-fixture-compressed.json NEW_OUTPUT_DIRECTORY`. Capture, scoring, powerless recovery, damage safety and all five-domain engineering acceptance remain unestablished. Contact coefficients remain null until a separate reviewed experiment.
