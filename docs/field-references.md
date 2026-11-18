# Read nominal field geometry

Use `validateReferenceGeometry` from `scripts/field-references.mjs` with the project's catalog, source records and season. Give each field variant its own frame, units, drawing revision, locator and digest. Label point references and projected lines with their role, derivation and uncertainty.

Call `getFieldReference` with an exact package hash, feature ID, variant, frame and intended use. Use the result for visualization or preliminary strategy. A scoring pose also needs robot envelope, entry orientation, rules and clearance. Treat candidate CAD transforms as inspection-only until independent measurements establish their registration.
