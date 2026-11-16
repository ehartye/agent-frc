# Custom spacer research specification (not released for manufacture)

The stock REV spacer tested in `native-accessory-stack.md` collides with the selected socket-head geometry. The original alternative uses17mm OD and14mm ID. This is a machining hypothesis, not a vendor equivalent or accepted production drawing.

A traceable raw-stock route exists: [Online Metals part1087](https://www.onlinemetals.com/en/buy/aluminum/0-75-aluminum-round-bar-6061-t6511-extruded/pid/1087), reviewed2026-11-16, is19.05mm nominal round6061-T6511 extruded bar, with mill-test-report availability listed. It would require machining both OD and bore and facing each spacer. Its published properties are explicitly reference-only, not design allowables. No order, quote, shop instruction, material selection or machining release was made. Marketplace17x14mm tubing listings were not accepted as tolerance/certification evidence.

For the current FUEL layout, proposed quantities are five6.35mm inter-wheel spacers and two19.43125mm end spacers, all17mmOD/14mmID. Nominal finished lengths total70.6125mm before kerf, workholding or machining allowance. This does not select a stock order length.

The dimensional closure still requires actual supplier limits and an end-float target. Required radial inequalities are:

- spacer minimum ID > maximum shaft corner-circle diameter + specified diametral clearance;
- spacer maximum radius + total eccentricity/runout + required radial clearance < minimum screw-axis radius - maximum screw-head radius;
- minimum wall and face bearing area must support the design axial load with chosen material allowables.

Nominal margins of0.25mm diametral shaft clearance and0.23125mm head radial clearance are not available tolerance budgets without the other parts' variation, shaft flex and runout. No tolerances, surface finish, corner breaks or allowable clamp torque have been invented. A finished-part specification must address perpendicularity/parallelism, burrs, concentricity, usable mating-face area, axial compression and bearing end float. Sum the actual wheel/hub/spacer stack between inner races; do not preload both bearing races or use collar friction as an assumed load rating.

Material/certification, allowable load and completed toleranced drawing remain blocked. For simulation, geometry may remain parametric but mass/inertia, stiffness, thermal expansion and failure thresholds must remain unset or be explicitly labeled sensitivity assumptions.
