# FUEL geometric-contact and held-in-nip experiment

This is an original, fixed-support, planar squeeze fixture, not a buildable or calibrated robot intake. It replaces the previous prescribed engagement window with detected sphere/roller/floor/backstop contact, while executing actual WPILib encoder, digital-input and PWM controller code. A single native annular sleeve supplies only its assumed-density rotational inertia. The floor and backstop are fixed geometric supports, not official field geometry or a robot mass model.

The separately pinned compressed candidate places its roller center at (0,0,186.1) mm, radius 38.1 mm, above the floor Z=0: 148 mm nominal clearance versus source-sized 150 mm FUEL. The 2 mm interference is an unvalidated compliance hypothesis. The separately pinned nominal control uses 188.1 mm center height. Backstop inner X=90 mm is nonintersecting with the sleeve; its presence does not establish capture. The sphere stays on externally constrained Y0. Only the supported face regions are modeled, not corners, ends, shaft/bearing/support strength or lateral escape.

## Laws and numerical checks

The FUEL mass is the reviewed manual interval midpoint; uniform sphere inertia is assumed. Each contact uses positive overlap δ and Fn=kδ max(0,1+dδdot), with k N/m and d s/m. This form is described in [Drake's compliant point-contact documentation](https://drake.mit.edu/doxygen_cxx/group__compliant__contact.html), inspected 2026-11-16, but this code does not run Drake or import its parameter defaults. No coefficient is calibrated to FUEL, carpet or a vendor wheel. Tangential force is a separate regularized Coulomb hypothesis, −μFn tanh(slip/0.01m/s), with no exact static-stick guarantee.

For roller-to-sphere normal n, tangent t=(nz,−nx), slip=v·t−rωsphere−Rωroller. Sphere and roller torques are −rFt and −RFt. This reaction loads the actual motor model/shared-supply API rather than granting transport free energy. Normal spring energy ½kδ², clipped/unclipped normal loss, and friction loss are accounted in a mechanical work ledger. RK4 and full aligned trajectory refinement of states, bus voltage/current, cumulative losses and mechanical residual check numerical error. Neither loss is a temperature prediction; empirical motor Kt/Ke mismatch still prevents a global electromechanical energy-validation claim.

## What is and is not achieved

The one declared initial trajectory starts sphere center X=−60 mm, Z=75 mm with incoming velocity 0.15m/s. This is not general acquisition from rest. Controller observes independent 2048-count/revolution raw encoder input and ideal vertical-ray sphere beam occupancy, never plant pose or force. It commands acquire, neutral dwell and optional reverse using 20 ms updates. Zero duty is ideal short-circuit brake, not coast or guaranteed safe stop.

The supported result is bounded **held-in-nip behavior**: exactly 30 sampled observations at 0.72, 0.74, …, 1.30 s have |X|<5mm, |vx|<2mm/s and roller normal force>5N. These are discrete experiment observations, not proof of continuous retention or a possession contract. No disturbance envelope is validated. Regularized friction permits slow creep. The sphere does not establish backstop/pocket retention, and a controller DWELL state or beam alone cannot certify capture.

Continuous drive and the requested reverse sequence can be back-driven by spring/piece motion. They remain explicit **unsupported-regeneration rejections**, including their state diagnostics and 20 ms sensing latency. Passing a negative test that expects this rejection is not successful release. No current clamp, coast substitution, electrical acceptance or hidden parameter profile change repairs that gap.

Contact coefficients and controller constants are fixed, source-pinned assumptions in this model version, not a general JSON-programmable plant. The experiment manifest is validated against that fixed hypothesis; native geometry and inertia are passed through consumed input properties.

Native source/config/property bytes, actual compiled controller/model classes, experiment inputs, required test counts and full traces must be pinned by the execution runner. A skipped/missing test is not evidence. Source-sized geometry and actual code execution do not establish material fidelity.

All engineering acceptance remains blocked: physics and voltage are partial ideal models; friction/compliance are assumed; thermal dynamics, real current limits/regeneration, robot mass distribution/load transfer, calibration and qualified physical verification are absent. Capture, score and whole-robot validation remain null/false. This is not a completed 2026 prototype and does not upgrade 2024/2025 readiness.
