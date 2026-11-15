# Executed validation — 2026-11-15

Windows x86-64, Temurin Java 17.0.21+9, Gradle 8.11, GradleRIO/WPILib 2026.2.1.

- Compilation succeeded. Ten JUnit behavior tests passed.
- The separate headless demo test passed: six virtual seconds; peak 2999.98 RPM; 64 feeding ticks; zero stale-target feeding ticks; 35 saturated-output ticks; final target and applied voltage both zero. These are synthetic model results, not physical robot measurements.
- Deprecated command scheduling calls were replaced with CommandScheduler scheduling before the final passing run.
- Gradle wrapper JAR matched its published SHA-256. Distribution checksum is pinned; resolved dependency locks and [artifact manifest](validation/dependencies.json) are retained.
- An initial JavaExec/native configuration attempt failed and was replaced with the supported Test-task native setup. An official Maven DNS failure cleared after DNS verification and a single retry; no hosts/proxy/network configuration was changed.

[Machine-readable result](validation/result.json). Other OS/architectures, real mechanisms, cameras, field trajectories and robot deployment remain untested. No compiled runtime bundles are redistributed.
