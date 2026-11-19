# Read nominal field geometry

Use `validateReferenceGeometry` from `scripts/field-references.mjs` with the project's catalog, source records and season. Give each field variant its own frame, units, drawing revision, locator and digest. Label point references and projected lines with their role, derivation and uncertainty.

Call `getFieldReference` with an exact package hash, feature ID, variant, frame and intended use. Use the result for visualization or preliminary strategy. A scoring pose also needs robot envelope, entry orientation, rules and clearance. Treat candidate CAD transforms as inspection-only until independent measurements establish their registration.

## Challenge the field reference

A controller can report a good alignment when its target and landmarks share a survey error. Test how much relative displacement the accepted action can tolerate.

1. Save the achieved robot or release state, its time, the target-map revision and the independent source of the comparison geometry. Name each frame, transform direction and unit. Record the nominal observer decision, if available, and the geometric margin against the project's acceptance threshold.
2. Choose the translation or rotation that closes the smallest relevant clearance. Give the signed direction, the pivot for a rotation, and a reason for its magnitude, such as a survey tolerance. Label a proposed sensitivity range as an assumption. In a fixed-state replay, shift the target map while holding the achieved motion, heading and release velocity fixed in the independent frame. A target-local solver can apply the inverse transform to the robot and released body together. For a rotated frame, re-express the heading and velocity in that frame as well. Moving both sides of the comparison by the same transform preserves their relative geometry.
3. Compare the nominal result with the adverse result. If feasible, bracket the threshold with one displacement on each side. For a closed-loop trial, perturb only the map used by the observer, run the controller again and evaluate its new achieved state in the original independent field frame. Preserve the observer's accept, reject or unavailable result alongside the signed geometric margin and threshold.

Record the source revisions, applied transform, uncertainty and the decision that changes. A modeled passage is a geometric result. Report a sensor event only when the trial supplies one, and identify prebuild results and physical verification separately. If the only available truth comes from the same map as the observer, record that registration remains unresolved.
