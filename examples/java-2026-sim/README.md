# Java 2026 desktop lesson

Original educational model for **Java 17, Gradle 8.11, GradleRIO/WPILib 2026.2.1 and JUnit 5.10.1**. It uses WPILib commands, HAL desktop simulation, a FlywheelSim plant, feedback and an explicit timestamp/readiness policy. It has no deployment targets, robot addresses, vendor hardware API or physical I/O.

Run with JDK 17 selected for this shell:

```text
gradlew.bat test headlessDemo
# macOS/Linux: ./gradlew test headlessDemo
```

The first run downloads Gradle and published dependencies. The wrapper distribution checksum is pinned. Build products and caches are ignored and are not part of the plugin. If the wrapper is unavailable, use Gradle 8.11 with the same tasks. Desktop native libraries must support the host platform; see the validation record for platforms actually tested.

The bounded demo advances six virtual seconds and prints aggregate observations. JUnit exercises intake interlocks, continuous feed readiness after speed loss, stale/missing/future vision, timeouts, mode cleanup, subsystem conflicts and invalid setpoints. A simulated disturbance changes plant speed; it is not a measured game-piece impact.

All inertia, gearing, gains, setpoints, tolerance and latency limits are **synthetic fixtures**, not recommended robot parameters or safety limits. The intake/feeder are logical states; piece transport, jams, structural loads, electrical losses, calibration, full field geometry and real driver controls are not modeled. No rule compliance, shot accuracy or hardware safety is established.

Architecture: Launcher owns synthetic mechanism state; VisionGate makes a pure timestamp/target decision; Modes supplies bounded commands and cancellation; Demo drives local virtual time. Real robot adaptation would require reviewed I/O, season constraints, physical measurements and qualified supervised validation.

See [dependency and source notices](THIRD_PARTY.md). The original lesson code is MIT under the repository license. The build configuration is a desktop-only adaptation informed by the official BSD-licensed 2026 template; upstream notices are retained.

The [navigation laboratory](NAVIGATION.md) adds original trajectory and delayed-pose exercises with nine regression tests. These augment the mechanism suite; all physical/CAD limits above remain.

The [cleanup laboratory](CLEANUP.md) adds four pure-state lifecycle regressions, including a deliberately incomplete trailing-cleanup counterexample.

The [event laboratory](EVENTS.md) adds six trigger/scheduler-boundary regressions.

The [three-season laboratory](CASES.md) adds original flywheel/elevator control slices and thirteen tests.

For Windows setup, follow [WPILib bundled-JDK guidance](https://docs.wpilib.org/en/stable/docs/software/advanced-gradlerio/jvm-runtime.html): mismatched MSVC runtimes can break native-library loading. Prefer the JDK shipped with the matching WPILib installation and keep machine-specific Gradle paths out of version control. The recorded test here used Temurin 17.0.21+9 on one Windows host; success there does not verify every JDK/runtime combination. No installer or machine setting was changed.

Read the [simulation interface audit](SIMULATION-BOUNDARIES.md): direct plant/kinematic feedback is not a physical sensor or vendor CAN encoder adapter. No vendor simulation API is implemented or tested.

## Advanced local prototype runner

The original lesson boundaries above describe its baseline model, not every later experiment in this branch. For the version-pinned, offline retained-body-to-target chain, use the [prototype setup checklist](../../docs/prototype-setup.md) and [integrated model guide](../../docs/integrated-prototypes.md). These newer experiments add explicit transport/flight hypotheses; they do not turn the baseline lesson into a deployed hardware project or establish a historical team-code build.
