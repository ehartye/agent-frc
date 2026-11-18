# Choose a module that fits the job

A conventional swerve pod has an azimuth bearing carrying a steerable fork and a wheel axle carried by that fork. Trace load from tread through hub, axle, bearings and fork into the chassis. Trace drive and steering power separately. Independent motors with different drive paths can have different mechanical coupling. A differential module instead coordinates two motors to create roll and azimuth. Its specific transmission determines signs, ratios and the remaining torque when both actions are requested. Derive the motor mixing matrix from the selected transmission, then apply simultaneous steering and wheel requests to check motor-speed and current limits.

| Design decision | Measurement to bring back |
| --- | --- |
| Wheel diameter and reduction | Measure rolling distance under representative load. Record motor turns per wheel turn, tread condition, surface and uncertainty. Carry both the nominal drawing diameter and the measured effective diameter into the controls review. |
| Motor and sensor placement | Overlay actual motor, shaft, encoder and connector envelopes. Sweep the carrier through its allowed azimuth range and check cable strain and access to the calibration datum. |
| Torque path and service | Check bearing supports, retention, tooth or belt clearance, drive ratio swaps and the direction each replaceable part must leave the assembly. For a purchased module, inspect its exact revision and service instructions. |

For chassis packaging, map the four steering axis centers relative to one robot origin. Check wheel-to-ground height in the loaded configuration, all-azimuth clearance to structure and mechanisms, fastener heads, harness bend and extraction room. Give a student a specific service task such as removing the tread with the robot on blocks. Identify which accesses the CAD model actually establishes and which require a mockup. Inspect tread attachment and wear, axle retention and gear/belt condition according to the selected module's instructions.

## Inspect the teaching assembly

Open the [original Fusion module](../../../examples/swerve/independent-swerve.f3d) and its [geometry and verification notes](../../../examples/swerve/README.md). Ground the mounting interface and isolate the two revolutes. Observe the fork when steering, then the axle when rolling. The belt spans and pulley pitch envelopes explain the drive path. They leave detailed tooth geometry, belt selection and tensioning open.
