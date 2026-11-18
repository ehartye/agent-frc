> Historical scope note: this review describes the original lesson classes below. The separate desktop-only CandidateIo prototype now implements an actual DIO Encoder/PWM simulation path and an opt-in native STEP property adapter; see [CAD/code IO scope](../../docs/cad-code-io.md). Its deliberately nonphysical fixture does not replace these original classes or establish robot validation.

# Simulation interfaces and unverified sensor paths

Reviewed 2026-11-15 against the actual source and dependency declarations. The lesson is a generic desktop plant/policy exercise on Java 17, GradleRIO/WPILib 2026.2.1. It contains no EncoderSim, physical Encoder object, vendor motor-controller client or vendor simulation adapter. No vendor library version, controller firmware or adapter has been chosen or tested.

## What the tests actually read

| Local class | Input and feedback path | Evidence boundary |
|---|---|---|
| Launcher | Numeric voltage into FlywheelSim; PID reads plant angular velocity directly | Ideal plant feedback; no encoder conversion, transport or controller emulation |
| SeasonMechanism | Numeric voltage into FlywheelSim/ElevatorSim; position() reads plant RPM/metres | 2024/2026 flywheel and 2025 gravity-elevator slices; no sensor adapter |
| TrajectoryLab | Requested wheel velocities converted to a pose increment | Ideal differential-drive kinematics; no drivetrain dynamics, encoders or CAN network |
| PoseEstimatorLab | Caller supplies numeric wheel distances, gyro angle, timestamps and vision pose | Estimator/policy tests; sensor acquisition and frame calibration are outside the wrapper |

DCMotor.getNEO() chooses motor constants for a mathematical plant. It does not instantiate a SPARK controller, reproduce its integrated encoder, or validate REVLib behavior. Likewise, an injected sensorValid flag tests a policy branch; it does not simulate stuck counts, quantization, bias, bus loss or real sensor status codes.

## WPILib versus vendor sensor simulation

WPILib's [hardware-instance tutorial](https://docs.wpilib.org/en/stable/docs/software/wpilib-tools/robot-simulation/drivesim-tutorial/simulation-instance.html) distinguishes EncoderSim for a WPILib Encoder from encoders connected to CAN motor controllers, which need the relevant vendor simulation support. The [v2026.2.1 implementation](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibj/src/main/java/edu/wpi/first/wpilibj/simulation/EncoderSim.java) uses the encoder's FPGA index and EncoderDataJNI. The latest tutorial was also checked, but its development context is not evidence that the pinned lesson implements a newer API.

The [physics tutorial](https://docs.wpilib.org/en/stable/docs/software/wpilib-tools/robot-simulation/physics-sim.html) treats plant advancement and writing model output into a simulated sensor as separate operations. Our current mechanism tests bypass that second path by reading plant truth directly. They therefore cannot detect a wrong production sensor channel, inversion, conversion factor, zero offset, CAN feedback selection or update cadence.

## Required before claiming an adapter is validated

For a proposed device, first record exact controller model/revision, vendor Java and native versions, firmware context, supported desktop platform and official simulation documentation. Leave these fields unselected until a concrete implementation exists. Do not invent a universal CAN encoder adapter or substitute EncoderSim for a vendor device.

Write a model-to-sensor contract: shaft being measured; motor/mechanism ratio; radians, rotations, RPM or metres; sign; offset/reset epoch; timestamp; update period; noise/quantization; validity and stale-data behavior. Decide which layer owns each conversion so gearing is not applied twice.

An adapter exercise should read the same API consumed by production control: capture controller demand and supply assumptions, advance the model, transform its output to the vendor's documented simulated sensor state, then assert the readback through the production sensor API. For a WPILib DIO Encoder exercise, use the matching Encoder/EncoderSim pair instead. Neither path has been implemented in this lesson.

Review positive/negative motion, known travel, reset with nonzero state, reverse direction, disable, reduced supply and rejected/late data where the chosen API supports it. Mark unsupported fault simulation explicitly. Keep model-truth assertions separate from API-readback assertions.

## Physical parameters still unmeasured

The case JSON supplies synthetic roller dimensions/mass, solid-cylinder inertia, gearing, carriage mass, drum radius and travel bounds. None came from a native Fusion mass-property check, system-identification run or measured robot. Bearing/transmission friction, reflected inertia, changing spool radius, load compliance, backlash and efficiency remain unverified.

The existing supply argument clamps requested voltage; it is not a coupled battery/current/controller simulation. No sensor noise is configured in these mechanism constructors. ElevatorSim travel bounds are numerical constraints, not validated hard-stop strength or a physical retention design. Game-piece contact, ballistics, thermal limits and field collisions remain outside the model.

## Recorded result and next exercise

The existing 42 JUnit tests and one bounded demo remain valid evidence for their declared algorithm/plant fixtures. This review changes documentation and metadata only; no Java source, parameter, dependency or runtime was changed, and no fresh Java execution is claimed. Generic code can be useful without establishing sensor integration or physical accuracy.

Next independent exercise: select one concrete device and official versioned simulator, or an explicit DIO Encoder teaching path, then implement a separate readback contract test. Keep the current generic exercise as a baseline. No hardware operation, deployment, native Fusion use or installation is authorized here.
