# Powered opposed-roller guide to local targets

A separate bounded model now generates exit speed from two NEO motor models, the existing shared electrical supply, roller inertia and dissipative slip against a constrained translating piece. Existing fixed-floor intake and flywheel-readiness fixtures are unchanged. This is not a selected hardware assembly or a calibrated launch model.

## Explicit hypotheses

Two equal directly driven rollers, each inertia 0.004 kg m2, spin for two seconds from rest. An external feeder introduces the piece at 0.2 m/s; its kinetic energy is accounted separately. Normal force is prescribed at 15 N per roller, friction coefficient 0.8, smoothed slip scale 0.05 m/s. There is no normal-force actuator, compliant nip, finite wheel-segment contact, independent piece spin, controller tracking, structural guide/load analysis or thermal/current-limit model.

Representative masses are NOTE 0.235 kg, CORAL 0.65 kg and FUEL 0.215 kg. Roller radii are 50.8/25.4/38.1 mm. NOTE and FUEL use a 0.3 m guide, 0.6 duty, and 50/60 degree elevation. CORAL uses a 0.15 m horizontal guide and 0.08 duty. These are hypotheses, not component specifications. Supply comparisons use 9 and 12 V open-circuit voltage with the existing 0.02 ohm battery model.

The guide reaction enforces straight translation without doing work. Equal opposed contacts assume cancellation of piece torque. Gravity along the guide is included. A fresh atomic test receipt binds source inputs, actual runtime classes, the loaded WPIMath DCMotor class/jar, run token in both runtime output and XML, and test output. Flight starts from the actual integrated guide exit, found by bounded bisection within the final RK4 step. The final speed is never reset to the earlier prescribed target-study velocity.

## Findings and checks

At the tested normal load, NOTE and FUEL are friction-force-limited over this short guide: both voltage cases produce about 7.54 and 7.87 m/s respectively while leaving different roller energy and friction losses. Equal exit speed is not voltage independence generally. CORAL exits at about 0.81/1.07 m/s. Reduced normal-load tests reduce NOTE/FUEL exit energy. Unpowered shorted rollers can dissipate energy through motor braking; zero duty is not modeled as an open electrical circuit.

The energy ledger includes piece translation, two roller inertias, gravity, motor mechanical work, initial feeder energy and positive slip dissipation. Tests compare 100 and 50 microsecond steps, preserve no-contact and unpowered controls, and reconstruct energy independently from receipt values. This is limited timestep sensitivity, not hardware accuracy or a general convergence proof.

## Local target integration, not scoring

Eighteen explicit endpoint-pose hypotheses use the actual six exit states:
- NOTE: three horizontal distances, source-bounded nominal speaker plane, center crossings only. Torus extent/orientation, roof/walls and sensor are not assessed.
- FUEL: three distances, nominal HUB height and the prior conservative whole-sphere regular-hex thin-plane test. Four cases pass that limited projection and two miss. Funnel/rim thickness, tolerances, sensing and installed registration remain absent.
- CORAL: three isolated floor-part-local positions with a hypothetical 10 mm gap. Constant-gravity continuation reaches the tube-center tangent height, but finite-patch collision, settling, installed floor mating and robot separation are not established.

Target time retains the powered plant clock plus flight time. Every installed registration, target sensor passage and score remains unknown. The earlier intake/catcher is NOT connected to this new feeder entrance; that transport/arming transition still needs a continuous model. Mechanical bank/guide compatibility and gate/brake acceptance remain unresolved independently.
