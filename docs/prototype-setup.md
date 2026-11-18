# Local prototype setup and reproducibility

## Demonstrated scope

This repository contains a complete **desktop Java teaching/test project**, plus a three-season retained-body-to-target prototype runner. It is not a deployable Robot/RobotContainer hardware project, a complete field robot, or a build of historical Team254/6328 code. The advanced prototypes may exist only on the local working branch; do not assume a GitHub-main link contains them.

## Existing prerequisites

- Windows. The advanced receipt runner deliberately invokes `java.exe` and `gradlew.bat`; macOS/Linux execution of this chain is unverified.
- An existing JDK17 selected with `JAVA_HOME`. The observed runtime is Temurin17.0.21+9.
- An existing populated Gradle cache selected with `GRADLE_USER_HOME`. Gradle8.11 is pinned by wrapper URL and SHA256; GradleRIO/WPILib2026.2.1 and JUnit5.10.1 are version-pinned, with dependency locking.
- Python available as `python` and PowerShell. Observed versions: Python3.13.12 and PowerShell7.6.9. The integrated flight/body reports use Python standard-library modules; separate native CAD studies additionally require OCP and exact downloaded source artifacts.
- Node20.11+ only for repository tests/manifest validation, not the Java/Python prototype command itself.

No installer or system settings change is part of the runner. A missing wrapper distribution/dependency in the selected cache is an explicit offline failure, not an automatic download. The original Java lesson README documents online first-build behavior; that is separate from this offline workflow. A clean-school-machine bootstrap has **not** been exercised.

## Run and inspect

From the repository root after selecting the existing tools for the shell:

```powershell
python --version
& "$env:JAVA_HOME/bin/java.exe" -version
./scripts/run-prototype.ps1
```

The final line prints a fresh ignored output directory containing:

- `HANDOFF.md`: readable run summary and remaining scope.
- `robot-targets.json` and `robot-run/`: generated chassis approach/pose coupled to the mechanism and target report, with a separate fresh execution receipt.
- `receipt.json`, `runtime.properties`, `tests.xml`, `gradle.log`: bound execution and diagnostics.
- `targets.json`: actual powered exits in explicit hypothetical season target frames.
- `note-body.json`: whole-torus thin-plane and bounded aim/attitude analysis.
- `coral-placement.json`: finite projected tube placement and hypothetical axial sliding stops.

The runner refuses to reuse an existing output directory. A failure retains diagnostics, never relabels old test XML as new execution, and does not imply a physical fault response. Source hashes use normalized UTF-8 text across Git line-ending changes; raw runtime class/JAR and execution-artifact hashes remain byte hashes.

For broader desktop regression, with the same toolchain selected:

```powershell
cd examples/java-2026-sim
./gradlew.bat test headlessDemo --offline --no-daemon --rerun-tasks
```

Deployment tasks are disabled. Nothing contacts a robot. Sensor channels, production encoders, vendor CAN adapters, physical calibration and hardware safety are not supplied by virtual feedback. See [model assumptions and observed outcomes](integrated-prototypes.md) and the example's [simulation boundary audit](../examples/java-2026-sim/SIMULATION-BOUNDARIES.md).

## Evidence boundaries

The original lesson's older test counts describe earlier dated experiments. Current branch receipts describe newer runs; neither should overwrite the meaning of the other. The advanced body studies are original experiments, not proof that historical team examples build. Reproducing the current command on a fresh authorized school machine, with explicit dependency/setup provenance, remains a useful next validation task.

See the [season robot handoff](season-robot-handoff.md) for the three preloaded robot slices, working design inputs and exact remaining gaps.
