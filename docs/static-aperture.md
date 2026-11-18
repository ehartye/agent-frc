# Static aperture screening

This slice compares two controlled drawing dimensions with explicitly hypothetical complete-robot dimensions. It does not construct a collision-free rectangle or simulate trench travel. No nominal field-reference coordinate or candidate CAD transform is used.

## Contract and reproducibility

`assessStaticAperture(fieldPackage, candidate, request)` in `scripts/static-aperture.mjs` accepts a closed candidate descriptor (`frc-static-envelope-input/v1`) and exact package/candidate hashes. Candidate dimensions are bumper-inclusive and must include all stowed mechanisms for the stated assumption. `sourceArtifactPin` records attribution only: this standalone module does not resolve or authenticate the upstream graph artifact. A future graph adapter must resolve that exact pin before claiming graph-backed provenance. Full input assumptions and digests remain in the result.

Only `stowed-static-upright`, `width-across-aperture` is supported; `unknown` scope yields unresolved axes. Width and height use supplied nominal values plus nonnegative upper uncertainty. Unknown values remain null. Length is retained but unassessed: there is no corridor depth or yaw model. Unsupported moving configurations are rejected rather than silently projected.

Select welded or AndyMark explicitly. The current reviewed snapshot is FE-2026 Rev B sheets 8/10 from the official dimension PDF, SHA-256 `3e2c1a0c35424a66821186584dda4f6709221ac8eb88036e09091452b8235f82`. The module requires the exact reviewed dimensions/tolerances and per-sheet source pins. Changed source evidence requires a fresh review and model revision, not just a new package hash.

- Welded lower width: (50.34 - 2.00) * 25.4 = 1227.836 mm.
- AndyMark lower width: (49.82 - 2.00) * 25.4 = 1214.628 mm.
- Lower height: (22.25 - 0.25) * 25.4 = 558.8 mm.

For each assessed dimension: remaining margin = source lower limit - candidate nominal - candidate upper uncertainty - requested dimensional reserve. The requested reserve must be explicitly positive or unknown; it is a **total dimension reserve**, not a per-side gap. A 0.000001 mm numerical equality band is treated as boundary-unresolved, never as a physical tolerance allowance.

An axis may exceed the conservative limit while another is unresolved; the overall result then retains the exceeded-limit flag and both axis details. Exceeding this worst-case assumption does not establish physical impossibility. Passing both inequalities only satisfies the scalar screen, not safe operation, legality, collision clearance, reachability or traversal. Event applicability remains unresolved.

## Reusable workflow

1. Pin source/variant/configuration before computing any bound.
2. Separate reviewed source measurements from derived arithmetic and hypothetical robot assumptions.
3. Carry uncertainty explicitly; never replace missing values with zero.
4. Check dimensional scope (bumpers, appendages, configuration) before arithmetic.
5. Retain source, candidate, request and model digests; rerun on any dependency change.
6. Compare candidate margins under identical variant and reserve assumptions, without choosing a team design.
7. Escalate to corridor/swept-volume and physical tests only after reviewing those additional inputs.

## Validation and use

`node --test test/static-aperture.test.mjs` exercises hand-calculated margins, variant differences, boundary behavior, monotonicity, unknowns, source/version mismatch, malformed values and no coordinate promotion. Arithmetic fixtures are explicitly synthetic, not fabricated robot measurements.

CLI: `node scripts/static-aperture.mjs field-package.json candidate.json request.json`.

The result intentionally keeps collisionFree, traversable, robotLegality, travelTimeSeconds, retrievedPieces, matchScore and selectedCandidate null. It creates no graph artifact and never feeds the comparison harness with invented cycle times or scoring events. Public documentation is self-contained; the dedicated FRC wiki can retain the reusable method separately without becoming a runtime dependency.

## Cross-subsystem contracts and safety boundary

This module is not an interlock or deployment gate. A hypothetical complete-envelope declaration does not prove agreement among drivetrain, bumpers, intake, storage, shooter, wiring or moving mechanisms. Before advancing beyond this screen, each subsystem must provide configuration-specific maximum extents and uncertainty, and the assembled robot contract must account for simultaneous states and swept motion. Any missing configuration or incompatible envelope remains unresolved; no component dimension is promoted to a complete-robot fact. Mechanical interfaces, mass/center of gravity, power/current, control ownership, fault responses and safe-state behavior require separate evidence and tests. None is established by a passing width/height inequality.

The model source digest includes this module and both transitive field-validation modules, with normalized line endings. Changed guards invalidate the source pin just as changed calculation code does.
