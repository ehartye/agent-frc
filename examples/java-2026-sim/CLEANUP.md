# Command cleanup laboratory

Run gradlew.bat test headlessDemo with the pinned Java 17/WPILib 2026.2.1 baseline. [CleanupTest](src/test/java/org/agentfrc/lesson/CleanupTest.java) adds four original tests using numeric demand only.

Predict these outcomes before running:

| Scenario | Expected fixture result | Why |
|---|---|---|
| Normal finite sequence | demand reaches 0 | Trailing cleanup becomes active. |
| Cancel during active step | deliberately incomplete sequence retains 1 | Cancellation skips later children. This is a teaching counterexample, not recommended robot code. |
| runEnd cancellation or requirement conflict | demand reaches 0 | Active command end callback resets it. |
| Driver Station disable | demand reaches 0 | Non-disabled command is canceled by scheduler processing. |

Do not substitute CommandScheduler.disable(): that method stops run processing and is not cancelAll. In-loop cancellation can queue until iteration end. The [worksheet](../../worksheets/command-lifecycle.csv) records immediate versus next-periodic observations separately.

Sources: [sequential lifecycle](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibNewCommands/src/main/java/edu/wpi/first/wpilibj2/command/SequentialCommandGroup.java), [runEnd factory](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibNewCommands/src/main/java/edu/wpi/first/wpilibj2/command/Commands.java), [scheduler](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibNewCommands/src/main/java/edu/wpi/first/wpilibj2/command/CommandScheduler.java), [trigger](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibNewCommands/src/main/java/edu/wpi/first/wpilibj2/command/button/Trigger.java), all v2026.2.1 read 2026-11-15. Trigger held/release behavior is a reading exercise, not one of the four executed tests. Original code; no upstream body copied.

Historical team caller reviews show why source tracing matters: readiness entry gates, end callbacks, defaults and periodic outputs are separate. These tests do not execute those teams' code or verify real motor stopping. [Execution evidence](VALIDATION.md).
