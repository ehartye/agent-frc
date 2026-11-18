---
name: frc-swerve
description: "Design and explain FRC swerve drivetrains across module hardware, Fusion geometry, WPILib kinematics, sensor calibration, odometry and offline diagnosis."
---

# Swerve drive

Begin with the match maneuver and the constraint that could rule it out. Record the required translation, simultaneous heading change, footprint, available current, traction assumptions and repair time. A holonomic chassis still needs physical space to rotate and traverse the route.

For hardware selection or CAD, open the [mechanical guide and original Fusion assembly](references/hardware.md). Identify the exact module generation, motor, reduction and installed wheel before carrying dimensions or offsets between examples. Preserve azimuth and wheel roll as distinct degrees of freedom. Trace torque, ground loads, swept volume, wiring and service access. Label unmeasured values as assumptions.

For programming or commissioning evidence, open the [controls and localization reference](references/software.md). Maintain one signed frame and module-order table shared by CAD, kinematics, sensors and estimator. Distinguish commanded from observed speed and angle. Test in offline simulation or replay, varying one convention at a time. Keep hardware operation and deployment outside the plugin.

For a design handoff, record the role and measurable capability, module drawing revision, frame and wheel datum, reductions and units, owner of each offset/inversion, evidence for the selected test and the first unresolved failure mode. Compare alternative architectures against the same task.
