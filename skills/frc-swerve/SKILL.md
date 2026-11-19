---
name: frc-swerve
description: "Design and explain FRC swerve drivetrains across module hardware, Fusion geometry, WPILib kinematics, sensor calibration, odometry and offline diagnosis."
---

# Swerve drive

Start an unspecified robot drivetrain as four independently steered swerve modules. Honor an explicitly specified drivetrain and preserve a historical robot's recorded configuration. Guide the student through the [supplier and in-shop comparison](references/hardware.md#compare-purchased-and-shop-built-modules) before choosing modules or freezing chassis holes. The default selects the architecture. The team selects the implementation.

For a purchased module, use the manufacturer's exact assembly, motor, wheel and selected gearing in the student Fusion project wherever available. Verify which options the supplied file actually contains. Record absent internals, simplified geometry or substituted options and check mounting and steering frames independently. Use the teaching fixture for instruction. Follow the [student Fusion handoff and supplier-model requirements](../frc-mechanism-cad/SKILL.md) for the installed design.

Begin with the match maneuver and the constraint that could rule it out. Record the required translation, simultaneous heading change, footprint, available current, traction assumptions and repair time. A holonomic chassis still needs physical space to rotate and traverse the route.

For hardware selection or CAD, open the [mechanical guide and original Fusion assembly](references/hardware.md). Identify the exact module generation, motor, reduction and installed wheel before carrying dimensions or offsets between examples. Preserve azimuth and wheel roll as distinct degrees of freedom. Trace torque, ground loads, swept volume, wiring and service access. Label unmeasured values as assumptions.

For programming or commissioning evidence, open the [controls and localization reference](references/software.md). Maintain one signed frame and module-order table shared by CAD, kinematics, sensors and estimator. Distinguish commanded from observed speed and angle. Test in offline simulation or replay, varying one convention at a time. Keep hardware operation and deployment outside the plugin.

For a coupled simulation, [check signed shaft power and follow the free piece](references/loaded-simulation.md). Challenge an inconsistent torque map, a motor that creates work and a weak grip during the same commanded maneuver.

For a design handoff, record the role and measurable capability, module drawing revision, frame and wheel datum, reductions and units, owner of each offset/inversion, evidence for the selected test and the first unresolved failure mode. Compare alternative architectures against the same task.
