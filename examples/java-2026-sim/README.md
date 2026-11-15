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
