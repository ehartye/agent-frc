# NOTE torus exterior-contact experiment

This offline development hypothesis keeps the NOTE as a flat circular torus, not a filled disk. Its source nominal OD/ID/thickness imply major radius152.4mm and minor radius25.4mm only under the extra circular-cross-section idealization. Actual foam profile, compliance, friction and load distribution are not measured. Source mass midpoint is separate from native proxy volume. The original sleeve inertia uses assumed uniform density, not a commercial wheel identity.

The native full-span transverse roller is centered at Y0, with400mm span. The supported domain requires at least20mm margin beyond the entire torus width on each side. Orientation and Y0 are externally constrained; reaction moment does zero angular work. Tilt, lateral motion, roller ends, free rotation, foam damage and actual physical guides are unsupported.

For ring projection qX=clamp(rollerX,noteX-majorRadius,noteX+majorRadius), qZ=noteZ, distance from roller axis to q gives overlap=rollerRadius+minorRadius-distance. Inside the projected ring interval, two symmetric off-center rim loci exist; they merge at its endpoints. One assumed aggregate force law is split equally across two loci, or carried by one merged locus. Stiffness is not doubled or halved at that transition. The centerline beam remains annular and sees the hole even while off-center roller contacts persist.

The aggregate normal law is k*overlap*max(0,1+d*overlapRate), using assumed5000N/m roller and50000N/m floor stiffness,d=5s/m. Friction is regularized with0.01m/s scale,roller mu0.8 and floor hypotheses0,.2,.4,.8. The floor law is also aggregate, not a measured distributed ring-pressure field. Normal losses, friction losses, spring energy, motor work and constrained-body mechanical residual are bookkeeping within this model, not temperature or global electromechanical conservation validation.

A prepositioned NOTE starts atX−220mm,Z25.4mm with incoming+.15m/s, initially outside roller contact. Actual offline WPILib encoder/DIO/PWM code runs at20ms and uses independently injected raw counts. At beamX0, two complete blocked-to-clear pulses are required before stop. The hole is not counted as completion after one pulse. A4s controller timeout faults; horizon4.4s includes postcommand behavior. A stopped beam sequence is not capture, shooting, field scoring or reliable acquisition. High-friction stall or unsupported regeneration remains failure evidence, not adjusted away.

Zero-duty means ideal short-circuit brake. No actual REV firmware, charging/regeneration clamp or thermal/current-limit dynamics are modeled. The existing supply model rejects unsupported regeneration. Both compressed and nominal original native configurations remain separate. Nominal initial tangency is not permanent absence of gravity-induced contact. Every RK stage is domain-checked; whole aligned trajectories are compared at0.1/0.05ms.

The runner pins source, native geometry/context, retained experiment, consumed inputs and compiled classes, and requires strict non-skipped native/Python/Java counts before execution flags become true. These establish reproducibility, not calibration. All mandatory engineering domains remain blocked; scoring,capture,release,R204 powerless recovery,R206 damage safety and complete robot acceptance remain unverified.

## First declared scenario outcomes

The nonzero floor-friction cases stop before reaching the nip and time out. The compressed zero-friction case reaches roller contact but encounters unsupported regeneration before completing the second beam pulse. The nominal zero-friction case can coast through both beam pulses on its initial incoming speed without roller contact, then leaves the supported finite domain. That sensor completion is not evidence of powered transport. These are retained failures and diagnostic controls, not a successful feed milestone. Metadata separates the last controller phase/pulse count from the full trajectory outcome; maximum roller normal force covers evaluated RK stages, not a continuous physical maximum. Unsupported failure time is bracketed to its controller tick, not presented as a precise event-time solve.


## Unresolved mechanical interface

No shaft, gearbox or assembly fit is verified. In particular, the reviewed REV-21-1879 half-inch hex output is not the circular12.7mm bore used in this original sleeve proxy. Those interfaces must not be represented as a mating assembly. The gear ratio and motor coupling in this numerical experiment are explicit hypotheses, not an implemented connection to that product.
