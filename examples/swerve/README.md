# Independent-axis swerve teaching module

[![Original teaching swerve module rendered in Fusion](assembly.png)](independent-swerve.f3d)

*Plugin teaching example · Independent-axis swerve module, as saved in Fusion.*

Open [the original Fusion archive](independent-swerve.f3d). It illustrates a wheel and fork with independent revolute joints. The fixed steer motor drives the azimuth gear pitch envelope. A gearmotor rides on the fork and drives the wheel through parallel belt spans. This arrangement makes the two motions easy to inspect and introduces a rotating wire-harness design problem. The dimensions are original classroom choices.

| Feature | Value |
| --- | --- |
| Ground frame | X forward, Y left, Z up. Tread touches Z = 0 |
| Trial wheel | Ø100 mm, 36 mm wide, transverse axle center 50 mm above ground |
| Azimuth | Vertical spindle through the wheel centerline. Pitch radii 9 and 42 mm |
| Final wheel drive | 9 and 18 mm pulley pitch radii. 2:1 final stage before rolling radius |
| Mounting interface | 136 × 106 × 6 mm plate with four 6 mm chassis holes |

## Reproduce the checks

Run the [offline encoder exercise](check-encoders.mjs) from the repository root:

```sh
node examples/swerve/check-encoders.mjs
```

The [sample log](encoder-replay.json) places four copies of the wheel on a synthetic 0.5 m square chassis. Its extra 3:1 motor reduction, installation offsets, encoder polarities and readings are trial values. Each sample holds the module ID, raw absolute angle in degrees and signed motor RPM. The checker converts those readings into measured wheel vectors and compares them with an independent field-relative command, gyro heading and chassis pivot. It exercises a field-relative translation, a positive yaw with one reversed wheel, and rotation around the front-left corner. A stopped pivot wheel may retain an arbitrary azimuth.

To diagnose an error, copy the JSON file, change one corner's drive sign, and run the command with the copied path as its final argument. The report identifies the corner and its velocity error in m/s. Exit codes are 0 for agreement within the declared tolerance, 1 for a vector mismatch and 2 for invalid inputs. This exercise assumes that absolute encoder angles increase counterclockwise. Real hardware needs its own sign and zero evidence.

Run the [native reopen check](check_fusion.py) as a Fusion Python script and select the archive. It opens a temporary document, checks solid counts and grounded state, exercises both joints and compares three independent witness displacements with their expected chords. The report includes the file hash and Fusion version. The script closes the temporary document and returns to the prior one.

## Interpret the native witness

Expect three components containing 5 fixed, 10 carrier and 4 wheel solids. Ground the mounting interface. Rotate the carrier 30° around the vertical spindle. The fork witness at 55 mm radius should travel 28.470 mm, and the wheel witness at 10 mm radius should travel 5.176 mm. Restore the steering angle, then rotate the wheel 30° about its transverse axle. The fork should stay fixed while the wheel witness travels 5.176 mm. Compare measured chord lengths with 2r × sin(15°) and check the nominal tread reaches the ground plane.

The [Fusion Python source](author_module.py) constructs named editable bodies in base features, including the two external belt tangents. Explore motor placement and extraction space in that source or with native direct edits. Pitch envelopes omit teeth, belt tooth engagement and tension adjustment. Bearings, keyed interfaces, wiring restraints, fastener retention, stiffness and traction need independent design evidence. Extend those interfaces before treating a classroom concept as a build drawing.

The motor on the fork rotates with azimuth. Establish a cable route with a verified steering envelope or design a suitable rotating electrical interface before assuming unlimited steering travel. The archive's free revolute models motion only.
