# Target-local geometry and exit-state experiments

Three different target models now produce limited geometric evidence. None is connected to an actual launcher/placement exit state, target sensor or complete field frame. Existing reference-only field catalogs and their prohibited-use gates are unchanged.

## NOTE: tilted SPEAKER opening

The official GE-24300 Rev A sheet 2 (PDF p120) supplies 41.38 in inside width, low/high edges at 78.13/82.90 in above assembly bottom and 18.11 in horizontal reach. These scalar endpoints imply a 14.756 degree side-profile plane, whereas the manual states 14 degrees. That unresolved difference is retained, not silently averaged. Default drawing tolerance is +/-0.50 in and is not propagated into the nominal experiment. [Official 2024 drawings](https://firstfrc.blob.core.windows.net/frc2024/FieldAssets/2024FieldDrawings.pdf).

In an explicitly hypothetical assembly-local frame, a rigid NOTE torus follows constant-gravity motion with prescribed velocity and fixed orientation. Exact torus directional supports bound its projection while the body crosses the infinitely thin rectangular plane. Twenty-seven velocity/lateral/orientation cases yield one positive conservative nominal clearance, at approximately 17.8 mm. The same exit velocity with a horizontal NOTE fails that bound. A failed conservative screen is not necessarily an actual collision. Roof, walls, bounce, spin/lift, drag, deformation and sensor passage are absent.

## FUEL: HUB top plane

GE-26300 sheet 4 (PDF p25) specifies 72.000 +/-0.500 in height and 41.932 +/-0.500 in **outside** hex dimensions. The inner 41.73 in value on FE-2026 Rev B sheet 4 (PDF p4) is a parenthesized reference with no tolerance. The outside tolerance must not become an inner-aperture tolerance. [Official 2026 drawings](https://firstfrc.blob.core.windows.net/frc2026/FieldAssets/2026-field-dimension-dwgs.pdf).

Twenty-seven prescribed sphere trajectories vary horizontal speed, lateral offset and the three sourced height cases. Nine pass a conservative full-sphere projection test across a nominal regular-hex thin plane. The model checks both first-body and last-body descending crossings; convex side inequalities bound the full crossing interval. Regularity/orientation and inner size are hypotheses, not certified field geometry. No funnel, rim thickness, flight calibration or sensor array is modeled. All point contributions remain unknown.

## CORAL: trough part-plane, not installed trough

GE-25313 Rev A (PDF p182) defines a nominal floor part with unrounded local vertices, in inches: (0,0), (18.38,0), (13.15,9.38), (0,9.38). The plate is 0.25 in HDPE with typical 0.13 in corner radii and default two-place tolerance +/-0.01 in. The original OCP test patch omits radii and holes. [Official 2025 drawings](https://firstfrc.blob.core.windows.net/frc2025/FieldAssets/2025FieldDrawings.pdf).

Nine fresh native fixtures distinguish 10 mm separation, nominal tangency,1 mm overlap and off-patch placement. Tangency is zero distance with zero intersection volume; overlap is a geometric obstruction/compression witness, not measured preload or support capacity. The installed floor/bracket/back/lip transform is unresolved. A bracket's 105-degree bend does not independently prove a 15-degree installed floor slope. The assembly lip height 17.88 in and manual 18 in above carpet also retain their separate datum statements. Same-alliance robot contact and other-level exclusion remain unknown, so no L1 scoring is generated.

## Integration and evidence boundary

The common exit-state helper checks right-handed orthonormal local frames, solves plane crossing analytically and conserves specific energy in the constant-gravity model. Source-code and piece-fixture dependencies are pinned in each report. Thirteen Python tests include fresh native CORAL replay, dense reconstruction of NOTE/FUEL projection bounds, low-energy/lateral/orientation controls and explicit unknown scoring. The event adapter rejects these partial plane observations as substitutes for complete target events.

These are plant-generated **local geometric observations from prescribed initial states**, not mechanism-generated release events. Next is continuity from mechanism exit velocity/orientation into each target model, plus actual SPEAKER roof/HUB funnel-sensor geometry and the CORAL installed mating transform. Brake/guide acceptance, all previous 250 ms failure controls, source revisions and unverified historical component availability remain unchanged.
