# CORAL runtime placement and conditional axial stop

This consumes the 48 CORAL exit/registration rows in `integrated-prototype-targets.json`, not a prescribed launch speed. Run `python -B scripts/coral-placement.py` to reproduce the JSON and `npm run test:coral-placement` to verify it.

The official GE-25313 RevA part-local floor outline is converted from inches to meters. The finite horizontal tube uses the existing source-bound half-length 150.8125 mm and radius 57.15 mm. Each inward polygon normal is eroded by `halfLength * abs(n dot axis) + radius * sqrt(1-(n dot axis)^2)`. Fixed yaw is an explicit hypothesis, not sensed orientation.

Baseline positions and velocities are unchanged. At +/-15 degrees their +X velocity is not axial, so the axial stop model is deliberately inapplicable. Improvement hypotheses rotate velocity and tube together, preserving runtime speed and vertical component, and search exit X 0.15..0.25 m and Y 0.08..0.14 m in 10 mm increments. Height is unchanged. These are local design registrations, not demonstrated installed placements.

The landing model removes vertical speed perfectly inelastically and preserves horizontal speed. Hypothetical Coulomb axial sliding uses mu 0, 0.1, 0.3 and 0.5; distance is v squared / (2 mu g). Mu zero preserves the no-stop control. Neither friction nor impact behavior is calibrated. Because the patch is convex and projection fixed, containment at landing and stop proves containment along the straight swept projection. Tests independently reconstruct rectangle corners across intermediate positions.

Results across 144 rows per friction hypothesis (repeated source registrations, not statistical trials):

| mu | Baseline conditional contained stops | Improved conditional contained stops |
|---|---:|---:|
| 0 | 0 | 0 |
| 0.1 | 0 | 0 |
| 0.3 | 4 | 36 |
| 0.5 | 8 | 54 |

Baseline failures remain in the report. A best-grid result is not an optimization certificate or a tolerance margin. The model excludes holes, corner radii, pressure distribution, rolling, spin, settling, walls, compliance and installed transforms. It does not prove support on a perforated floor or scoring. Mechanical acceptance and official score remain unresolved. Source report, geometry, evidence and generator are pinned as normalized UTF-8 text; this records analytical consumption of an existing runtime receipt, not a fresh Java execution.
