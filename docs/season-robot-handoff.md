# Three runnable season robot slices: handoff

## Run now

On the existing Windows toolchain, from this repository root:

```powershell
./scripts/run-prototype.ps1
```

Select the existing JDK17 and populated Gradle cache with `JAVA_HOME` and `GRADLE_USER_HOME`. [Exact prerequisites and limits](prototype-setup.md) include Gradle8.11, GradleRIO/WPILib2026.2.1, JUnit5.10.1 and the observed Python/PowerShell versions. This command installs nothing and has no robot deployment targets.

Open the generated **HANDOFF.md** first. The same output directory includes source-bound receipts, subassembly/body sensitivity reports and **robot-targets.json**. The `robot-run` subdirectory contains the separate fresh robot execution receipt/XML/log. The three-season run includes 12 robot scenarios: supply variants, both CORAL mass boundaries and the preserved original CORAL plan.

## Connected robot behavior

Each model starts with one preloaded piece. An original ideal differential-drive controller approaches a season-specific target-relative pose, settles for 200 ms, then authorizes the existing virtual pregrip/gate and powered guide. Actual simulated docking error, not the perfect goal pose, determines the target-relative launch origin and heading. Global time includes approach and mechanism execution. A virtual pose timestamp stalled at0.28s is rejected when older than30ms, and an immobilized drive times out; both prevent mechanism activation. These are model diagnostics, not real sensor adapters.

| Season | Current robot slice | Working design inputs | Bounded result |
|---|---|---|---|
| 2024 | Preloaded fixed-angle SPEAKER approach and launch | 50° guide; 0.0003 kg m² per roller; duty0.6; target-relative aim1.95m; fixed NOTE attitude hypothesis | At12V, about17.5mm whole-torus thin-plane margin after docking error;9V fails |
| 2025 | Preloaded low-level CORAL approach and release | Horizontal guide;0.0005kg m²; refined duty0.04, exit target(.15,.08)m; original faster duty0.08 retained | Refined plan conditionally stops inside the isolated floor patch at assumed μ0.3/0.5 for both masses and supplies; original plan and low-friction controls fail |
| 2026 | Preloaded fixed-angle HUB approach and launch | 60° guide;0.0005kg m²; duty0.6; target-relative aim−2m | At12V, about252mm sphere thin-plane margin after docking error;9V fails |

These are useful simulation outcomes, not official scores. Lower supply and unfavorable friction remain genuine failures rather than being hidden by configuration.

## What remains before broader use

**Nothing further is needed to rerun the bounded exploratory models on the already configured host.** Improvements below expand scope or fidelity, rather than prerequisites for trying the current simulation.

1. **Robot integration:** acquisition from an empty robot, possession/indexing transitions, multiple pieces, field-wide approach constraints and collision-aware chassis/bumper envelopes.
2. **Drive/mechanism coupling:** dynamic traction, recoil, pose estimation, shared power during simultaneous motion and mechanism operation. Current drive is ideal kinematics and held stationary during launch; powered-mechanism energy is not whole-robot energy.
3. **Sensing and hardware:** production I/O adapters, encoder/channel/conversion checks, actuator/contact measurements, attachment compliance and real stop behavior. Virtual feedback and ideal rigid joints remain explicit assumptions.
4. **Season interactions:** NOTE roof/wall/aerodynamics; FUEL funnel/rim/sensor passage; CORAL installed trough, impact/rolling/settling and robot-contact exclusions. No component-plane result is an official score.
5. **Portable handoff:** verify a clean authorized school machine's dependency/bootstrap process; macOS/Linux advanced runner execution, full deployable Robot/RobotContainer project and historical team-code builds remain unverified.

The current source is local development work unless publication is separately verified. No purchasing, installation, robot operation or release was performed.
