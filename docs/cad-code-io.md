# Actual CAD bytes and WPILib IO loop: integration fixture

This opt-in desktop development slice executes an actual compiled candidate prototype through WPILib Encoder/PWM interfaces and consumes inertia extracted from actual original STEP bytes. **The rotated sideplate is a deliberately nonphysical integration fixture**, not a proposed flywheel, actual robot mechanism, physical feasibility result or calibrated robot. Replacing it with authentic rotating geometry is the next priority.

## What the command does

`python scripts/run-cad-io.py --step ORIGINAL_STEP --density ASSUMED_KG_PER_M3 --output NEW_DIRECTORY --java-home EXISTING_JDK17 --gradle-home EXISTING_OFFLINE_CACHE`

All paths are explicit local inputs. No tools are installed, no source CAD is modified, no binary CAD is redistributed and no robot is contacted. Existing output directories are rejected. Required source mismatch, unavailable CAD/toolchain, failed/skipped tests or a source change during execution fails the run. Ordinary `npm test` or Java `test` alone does not run the CAD task or imply this evidence exists.

1. Verify the independently reviewed STEP SHA-256 (`867f68b8ada523487db3cb5289418a1498cd8239f580828783ace7575c18d283`). OCP reads BRep geometry, requires exactly two solids and uniquely selects the low-Z480x260x7mm plate by bounds. Selection does not rely on traversal order.
2. Compute volume, centroid and centroidal inertia tensor from that solid. Cross-check volume against prior native Fusion measurement. This is geometric integration, not the former analytical cylinder formula. The reviewed snapshot's working length unit is millimetres; the exact-file pin and native dimension cross-check matter because STEP may contain several unit contexts.
3. Apply explicitly assumed uniform density: kg = mm^3 * density *1e-9; kg m^2 = mm^5 * density *1e-15. No material was measured or certified. The modeled rotation axis is centroidal Z, parallel to file Z; mounting, balance and shaft/support design are not represented.
4. Recompile pinned GradleRIO/WPILib2026.2.1 Java sources offline and execute `CandidateIoTest` plus opt-in `CadIoTest`. Java independently checks native-file SHA and reads the freshly extracted property bytes.
5. Record600 simulation ticks, compiled controller-class hash, consumed property hash, source/wrapper/dependency hashes, XML test hashes and results. A receipt says executed-development-checks only after the required tests execute without failures/skips. It always says engineering acceptance blocked and robot operation unauthorized.

## Actual feedback path

`CandidateIoController` cannot run on real hardware (`RobotBase.isReal` guard). It reads `Encoder.getRate()`, computes its control output and drives a PWM motor-controller object. It never sees plant state. `CandidateIoRig` separately reads PWM simulation output, multiplies by supplied bus voltage, advances WPILib FlywheelSim, and injects raw encoder pulse period using a separately fixed2048-pulse/revolution fixture convention. Doubling the controller's distance-per-pulse conversion changes actual simulated motion and violates the tracking check; the simulator does not compensate the error by using the configured conversion to generate feedback.

This validates a DIO Encoder/PWM desktop interface path, not a REV CAN adapter, firmware, real encoder fidelity or actual motor-controller hardware. Simulation period, perfect pulse timing and fixed voltage remain assumptions. Controller voltage is limited to the supplied bus; below6V it requests zero. These thresholds and tracking tolerances are development assertions, not approved safety requirements. The disable test checks zero demand, not physical stopping distance or a certified interlock.

The prototype's base controller source is actually executed. Tests exercise baseline/corrupted sensor configurations, not separately built baseline and changed robot-source revisions. Do not claim full code-change acceptance. This receipt is not registered as an accepted adapter in the physics gate; no gate expansion is included.

## Explicit required-domain outcome

- Physics: partial ideal rotating-load dynamics with CAD-derived inertia under assumed density.
- Voltage: partial, fixed supplied bus and applied PWM voltage. No coupled shared battery model.
- Heat: unsupported in this Java slice.
- Friction/contact: no calibrated bearing/transmission/contact model.
- Weight distribution: centroid and inertia of one CAD body are extracted, but no chassis support/contact/load-transfer/tipping model exists.

All five-domain engineering acceptance and physical validation remain blocked. The separate synthetic motor-thermal benchmark does not silently fill this slice's missing coupled effects.

## Next milestone

Use authentic rotating assembly geometry with reviewed material assignments, mount/shaft axis and omitted components; independently verify CAD mass properties. Then compile exact baseline/changed controller revisions into separate runs with production-facing IO contracts, simulate their shared power loads, and add calibrated loss/thermal/contact/weight-distribution effects as relevant. Use separately authorized characterization and holdout measurements. Neither this fixture nor its passing tests authorizes physical operation.

## Grounding

Pinned [WPILib EncoderSim2026.2.1](https://github.com/wpilibsuite/allwpilib/blob/v2026.2.1/wpilibj/src/main/java/edu/wpi/first/wpilibj/simulation/EncoderSim.java) and [HAL Encoder simulation](https://github.com/wpilibsuite/allwpilib/blob/v2026.2.1/hal/src/main/native/sim/Encoder.cpp) establish the actual readback interface used. [OCCT GProp_GProps reference](https://occt3d.com/dev/doc/refman/html/class_g_prop___g_props.html) describes centroidal inertia axes; volume-property Mass() without density is geometric volume, not kilograms. Tested package versions and executable evidence belong in each local run receipt, not inferred from these links.

## Executed negative control

The independent review caught a shared conversion constant between controller and simulator that could cancel a real sensor-scaling error. The physical pulse convention now lives independently in the rig. A serialized source-mutation check doubled only `CandidateIoController.RAD_PER_PULSE`, rebuilt actual Java, and produced two failed IO assertions (three tests executed). Original source bytes were restored and the complete CAD/IO pipeline rerun. That is a useful code-to-behavior negative control, not acceptance of the intentionally faulty candidate. Local run outputs retain the failure log, XML and before/after source hashes; they are not hardware tests.
