# Trigger and scheduler boundaries

[EventTest](src/test/java/org/agentfrc/lesson/EventTest.java) adds six original pure-state regressions at WPILib 2026.2.1. Run gradlew.bat test headlessDemo with Java 17.

| Case | Executed observation |
|---|---|
| Held input after early finish | No restart until release/new press. |
| Input true when bound | No initial rising edge. |
| Input released | Active command ends and clears fake demand. |
| Scheduler disabled | Command stays scheduled and demand is retained until explicit cleanup. |
| Cancel inside execute | End is deferred until the loop boundary. |
| kCancelIncoming | New conflicting command rejected; explicit cancel still works. |

Each test owns a temporary EventLoop and restores the default loop during cleanup. No joystick, motor controller or robot is used. These tests do not reproduce historical teams'2024 runtime.

Sources: [pinned Trigger](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibNewCommands/src/main/java/edu/wpi/first/wpilibj2/command/button/Trigger.java), [pinned scheduler](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibNewCommands/src/main/java/edu/wpi/first/wpilibj2/command/CommandScheduler.java), read 2026-11-15. Original tests; no source body copied. [Execution evidence](VALIDATION.md).
