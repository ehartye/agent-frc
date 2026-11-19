# Check power before crediting a loaded maneuver

Can the robot strafe and turn while lifting a piece it still holds? Two small, offline studies separate the drivetrain calculation from the evidence for retention. All numerical values here belong to an invented classroom fixture. Use the installed module's reductions, directions, loads and tolerances for a student design.

## Follow power through one module

Run the [signed shaft exercise](../../../examples/swerve/shaft_power.py) from the repository root.

```sh
python examples/swerve/shaft_power.py
```

Use radians per second for shaft and joint rates, N·m for torque and watts for power. In the example the drive rotor runs at four times wheel roll rate plus 1.5 times azimuth rate. The steer rotor runs at eight times azimuth rate. With ground contact disabled, let the speed map be **A**. Shaft speed is **A** times joint speed. The ideal joint torque is **A** transposed times shaft torque. The two dot products must agree. Apply any gearbox loss separately, with a direction and an identified place for the dissipated power.

Exercise a held wheel, held steering and simultaneous motion in both directions. Reversing the coupling term on the torque side alone creates a 4.8 W discrepancy in the mixed case. Reversing it on both maps still conserves power. To establish the physical sign, lock wheel roll and compare the drive rotor direction with an independent shaft measurement during positive steering. The example supplies an invented sign witness. Record an unknown sign when the installed design lacks that observation.

At each motor compare electrical input at its leads, shaft output and winding heat. With positive current into the motor and positive torque out, the remaining loss is **VI − τω − I²R**. A passive steady-state model requires a nonnegative remainder within its uncertainty. Add the changes in stored electrical and mechanical energy when measuring across a boundary that includes those stores. In a reciprocal ideal SI model the torque constant in N·m/A equals the back-EMF constant in V/(rad/s). Independently fitting catalog stall torque and free speed can break this identity. Fit a reciprocal constant and explicit friction or other measured losses, then recheck the original motor data and both directions.

| Motor-lead case | Electrical input | Shaft output | Winding heat |
| --- | ---: | ---: | ---: |
| Motoring | 15 W | 10 W | 5 W |
| Shorted braking | 0 W | −20 W | 20 W |
| Power flowing out at the leads | −5 W | −10 W | 5 W |

The example also pairs an impossible −3 W loss at one motor with +4 W at another. Their sum hides the failure. To establish battery regeneration, trace controller configuration, bridge losses and signed bus current separately. The [shared supply comparison](../../../docs/shared-power-review.md) addresses voltage at a selected location under overlapping loads.

## Follow an independently moving piece

Run the [loaded motion exercise](../../../examples/swerve/loaded_motion.py). Add `--csv maneuver.csv` with a new output filename to inspect every time step.

```sh
python examples/swerve/loaded_motion.py
```

The four wheels have finite roll and steering response. Their attained vectors determine chassis motion. The lift has its own response. A free point mass starts on the floor, is approached by the open pads and moves under gravity, floor support and bounded friction at the pads. One continuous clock carries wheel angles and rates, chassis pose, lift, piece position and velocity through pickup and travel. The contact model uses compliant opposing pads and an assumed friction coefficient of 0.65. Chassis motion is kinematic and omits tire slip and reaction from the payload. Use a coupled mass/contact model for design loads.

Read commanded strafe, turn and lift next to their attained rates. In this fixture simultaneous motion requires more than 0.20 m/s lateral speed, 0.25 rad/s yaw and 0.07 m/s upward lift speed. Credit grip after 0.10 s of continuous two-sided load (at least 2 N per pad), seat separation at most 12 mm and relative speed at most 0.045 m/s. For loaded travel also require the piece itself to be over 20 mm off the floor. The complete trajectory retains any witness gaps.

| Pad preload per side | First grip dwell | Attained simultaneous motion | With a lifted, observed piece | End state |
| --- | ---: | ---: | ---: | --- |
| 12 N | 0.652 s | 1.212 s | 1.092 s | Piece held at 0.229 m |
| 3 N | 0.652 s | 1.212 s | 0 s | Both pads clear at 1.438 s. Piece on floor |

The requests and wheel histories match across the two trials. To repeat this check on a robot, identify which sensors can observe the piece independently of the mechanism command, establish pad loads or calibrated proxies, and time-align them with measured wheel, gyro and lift signals. Another robot's dwell and thresholds require their own error bounds. Rehearse missing or occluded observations before granting a scored event.
