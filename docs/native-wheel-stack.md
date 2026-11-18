# Pinned native wheel and opposed-hub placement experiment

This opt-in experiment is isolated from all previous NOTE/CORAL/FUEL control/contact models. Run `python -B scripts/inspect-wheel-stack.py`; it requires installed OCP and ordinary access to the two exact public manufacturer STEP URLs. The script checks their hashes before import, uses temporary source files, emits original numeric observations, and does not export or redistribute vendor CAD. Missing dependencies, changed source bytes and failed native operations fail the run. Ordinary npm tests do not execute it.

The recorded run in `case-studies/2026/native-wheel-stack-exploration.json` uses:
- Product-linked 3-inch MAXSpline compliant-wheel STEP, 2022-04-05, two solids. The same link is provided for soft and medium variants; this does not identify actual material or hardness.
- REV-21-2037 aluminum MAXHub STEP, 2022-03-31, one solid.

Observed wheel core end faces are X = +/-11.90625 mm. The separate full wheel envelope reaches +/-12.00625 mm. Hub shoulder is at native Z = 6.35 mm, flange outer face at 7.9375 mm and central boss at 8.73125 mm. The visual hub drawing's 7.9 mm dimension excludes its separately marked 0.8 mm boss; do not falsely label overall-versus-body dimensions a proven revision conflict.

The original placement hypothesis seats two hub shoulders against the core end faces, points their axes outward, and clocks the opposed hub 180 degrees relative to the other. At 0-degree phase, native wheel/hub and hub/hub common volumes were zero. Rotating both hub phases by 30 degrees produced about 489.257 cubic millimetres of overlap per wheel/hub pair. This deliberately incompatible control demonstrates that the nominal intersection check can distinguish orientation. It is not a manufacturing-clearance, tolerance, strength or contact-force test.

The resulting central-boss-to-boss axial envelope is 28.575 mm. This already matters to the earlier proposed FUEL bank's 30 mm wheel pitch: only 1.425 mm remains between these nominal boss envelopes, before any fastener head, spacer, collar, tolerance or flex. A wheel-width-only layout check is insufficient.

The hub drawing labels five #10 clearance holes and one #10-32 threaded hole. It does not supply a selected screw SKU, permissible torque, thread class, usable thread length or strength. A two-opposed-screw hypothesis with 25.4 mm under-head length gives 6.35 mm nominal axial reach into the opposite hub using the observed face datums. This is NOT certified thread engagement: chamfer, incomplete thread, head seating, access and clearance are not resolved. No screw was added to the native experiment or selected for procurement.

Sources:
- https://www.revrobotics.com/content/cad/Compliant-Wheel-3in-MAXSpline.STEP
- https://www.revrobotics.com/content/cad/REV-21-2037.STEP
- https://www.revrobotics.com/content/docs/REV-21-2037-DR.pdf (2022-06-16, visually inspected)
- https://www.revrobotics.com/content/docs/Compliant-Wheels-MAXSpline-DR.pdf (2023-11-28, visually inspected)
- https://www.revrobotics.com/ION-Compliant-Wheels/
- https://docs.revrobotics.com/ion-build/structure/hardware

The wheel drawing labels 23.8 mm width and medium 45A, while the rolling product page states 25.4 mm family width and generic medium 40A. Core/full native bounds have separate datum scopes and cannot alone explain all differences. Preserve those sources separately; obtain variant/revision applicability before physical specification or calibrated material assignment.

Native shaft, screw, bearing, retainer, collar and housing assemblies are absent. No mass/inertia, full tolerance stack, load capacity, stiffness, thermal model, fabrication or physical fit is established. Fit, procurement and engineering acceptance remain blocked. Previous continuous-sleeve contact results do not transfer.

Validation: `python -B scripts/test-wheel-stack.py` runs four checks of transform geometry, positive-control common volume and the recorded experiment's discriminating result. The recorded result test is not a new source download/native replay.
