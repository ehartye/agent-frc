# Combined six-wheel FUEL bank: nominal interference milestone

`python -B scripts/inspect-combined-bank.py` builds42 part instances in memory: six wheels, twelve hubs, twelve socket screws, five inter-wheel spacers, two end spacers, two bearings, two collars and one original shaft envelope. Native CAD is fetched temporarily and hash-verified; it is not exported or committed. The receipt records vendor hashes, script/helper hashes, runtime versions and all instance bounds. Script hashes normalize UTF-8 BOM/newlines for cross-checkout consistency; vendor STEP hashes cover raw bytes.

## Computation scope

The recorded local-frame run classifies861 pairs.768 are separated by conservative axis-aligned bounding boxes.38 native common operations provide direct evidence for93 remaining pairs, with55 explicitly recorded equivalence reuses. Twelve screw/tapped-hole pairs contain expected interference between simplified major-diameter screw solids and modeled tap holes. These are NOT thread-engagement, preload, stripping-strength or torque acceptance. There are no unexpected nominal solid intersections among the evaluated/equivalent pairs.

Two equivalences are explicit:

1. Identical wheel-unit instances differ only by shaft-axis translation. Their relative poses match; common-volume and common bounds translate accordingly.
2. The original shaft envelope is a constant prismatic cross-section. A wheel/hub wholly contained between its ends has the same local intersection with that section at each station. This is not valid for a stepped, drilled, keyed, bent or otherwise varying shaft. Strict containment is checked before reuse.

Native unit booleans are evaluated in source-local frames to avoid numerical problems introduced by large translated instances. Earlier global-coordinate attempts stalled at a translated wheel/hub pair and were stopped without a result. This receipt is a local-frame/equivalence classification of the combined layout, not a completed exhaustive global-coordinate boolean replay. No computational failure was counted as a geometric pass.

## What remains unresolved

The housing study in `season-units-and-housing.md` is still separate. Plate/retainer mounting screws, nuts, anchorage, drive coupling and motor/gearbox are absent from this bank. Custom spacer material/tolerances and physical thread engagement remain unresolved. Shaft mass/inertia is invalid because its original envelope omits the stock's center hole and ends. Manufacturing fit, bearing race loads/end float, friction, stiffness, deformation, heat and calibration are unverified. Wheel hardness/material source conflicts remain unresolved.

The result is useful nominal assembly evidence for a provisional simulation fixture, not a fabrication release or a calibrated simulation-ready robot.2024/2025 have separately checked representative native wheel units and explicit segmented-contact geometry probes, not complete combined banks. All three seasons retain blocked engineering acceptance. No validity from the former continuous-sleeve simulations transfers to these segmented assemblies.
