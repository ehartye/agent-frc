# Three-season mechanism laboratory

Original controller and WPILib plants for the [case studies](../../case-studies/README.md). Run `gradlew.bat --offline --no-daemon test headlessDemo` with the prepared Java 17 environment, or omit --offline when dependencies must be obtained. No robot deployment exists.

[SeasonMechanism](src/main/java/org/agentfrc/lesson/SeasonMechanism.java) uses FlywheelSim for the two shooter concepts and gravity-enabled ElevatorSim for the placement concept. [SeasonCaseTest](src/test/java/org/agentfrc/lesson/SeasonCaseTest.java) exercises all three nominal cycles and failure boundaries. Outputs are numeric; inventory events are synthetic.

The same WPILib 2026.2.1 baseline is used for every case. This is historical game analysis with a modern pinned teaching runtime, not reproduction of 2024/2025 robot binaries. CAD assumptions generate the resource properties. Cylinder inertia is an approximation; lift mass and drum radius are declared assumptions.

Readiness, alignment and an external ACTIVE gate must all hold before feed. INACTIVE/UNKNOWN stops feed; a missing discharge event latches a jam fault. These policies are deliberately conservative design choices. They do not encode all season rules or certify field legality. In particular, the 2026 inactive-HUB gate is a scoring strategy, not a prohibition claim.

The ideal plants omit game-piece contact, trajectories, impacts, thermal/current limits, electrical battery sag, mechanical restraint, structural strength and field collision. Zero voltage can still leave a spinning wheel or falling carriage. No FMS parsing, real sensors, actuator IO or whole-robot autonomous route is implemented.

Sources: [pinned ElevatorSim](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibj/src/main/java/edu/wpi/first/wpilibj/simulation/ElevatorSim.java), [WPILib simulation overview](https://docs.wpilib.org/en/stable/docs/software/wpilib-tools/robot-simulation/physics-sim.html), reviewed 2026-11-15. No upstream source copied.

The autonomous deadline helper accepts caller-supplied elapsed AUTO time and stops mechanism demands at the selected case boundary. It is not a full autonomous route or FMS/Driver Station clock adapter.

Read the [simulation interface audit](SIMULATION-BOUNDARIES.md): direct plant/kinematic feedback is not a physical sensor or vendor CAN encoder adapter. No vendor simulation API is implemented or tested.

## 2026 inertia sensitivity

`FlywheelSizingLab` and `FlywheelSizingTest` connect the assumed 0.6 kg, 30 mm-radius roller to an ideal solid-cylinder inertia. A 60 mm assumed radius gives four times the inertia at fixed mass; the plant compares early acceleration and four-second unloaded speed at 6 V. Native sideplates do not measure roller mass, radius, contact or ballistics. No CAN/vendor simulation adapter is present. The initial two-second convergence assertion was too strict (about 1 rpm residual); the explicit four-second horizon is tested instead. This is a model exercise, not physical validation.
