# Read hardware rules before selecting parts

Reviewed 2026-11-15. These are original study directions and selected facts, not a substitute manual or inspection certificate. Select year, event stage/date and update revision together. Open each canonical source before a hardware decision.

## Navigate the manual

Read conventions and updates first, then the game overview, field description, match/scoring details and G rules. Use section 8 for construction constraints and section 9 for inspection/configuration review. A scoring strategy also needs field geometry and game conduct rules; a mechanism cannot be approved from section 8 alone.

The [2024](../case-studies/2024/rule-reading-map.json), [2025](../case-studies/2025/rule-reading-map.json) and [2026](../case-studies/2026/rule-reading-map.json) maps identify seven hardware/inspection reading areas with page locators and original evidence tasks. Section versions are V8, V11 and TU22 respectively. Exact PDF fingerprints are retained alongside each case. All seven evidence tasks begin unresolved.

| Selected archived fact | 2024 | 2025 | 2026 |
|---|---:|---:|---:|
| R103 weight limit, lb | 125.5 | 115 | 115 |
| R104 perimeter limit, in | 120 | 120 | 110 |
| R104 starting height, in | 48 | 42 | 30 |
| R105 horizontal extension, in | 12 | 18 | 12 |
| R701 image minimum | 2024_v2.1 | 2025_v2.0 | 2026_v1.2 |

Read exclusions, measurement definitions, bumper treatment, field-location limits and exceptions in the linked manuals. Starting height is not a universal in-match envelope. These numbers are source facts, not a recommended robot design. A concept plate does not establish robot mass or packaging compliance.

### The 2024 archive trap

[Team Update 21, April 9](https://firstfrc.blob.core.windows.net/frc2024/Manual/TeamUpdates/TeamUpdate21.pdf) changed the weight allowance and radio provisions for the late-season/Championship transition. The retrieved archive includes those changes. Do not use 125.5 lb or VH-109 as a claim about an early-2024 regional event; reconstruct that event's applicable edition. The new reader deliberately returns event-edition-needs-resolution for a named competition instead of treating the year as sufficient.

Run npm run rules -- --season 2024 --as-of 2026-11-15 --event-stage archive-study. A real event label is allowed, but its edition remains unresolved. The command reads bundled metadata, performs no download and never decides legality.

## Build an evidence packet

1. Record the full proposed robot configuration, exact part/revision inventory and decision owner. Mark every fact as source-derived, measured, modeled or assumed.
2. Draw the power and signal paths. For each actuator, link the exact allowed part/controller pairing, protection and conductor review. A vendor API compiling does not approve its device or wiring.
3. Write the failure response before implementing the command: stale sensor, lost phase authority, brownout/reboot, interrupted command, disable and stored energy. Assign physical retention and isolation review separately from software output zeroing.
4. Keep a migration ledger for image, WPILib/GradleRIO, Java, vendor dependencies and controller firmware. Compare an old team's algorithm with its original runtime before adapting it to the pinned lab.
5. Collect measurements and review evidence. An unfilled cell stays open even when all desktop tests pass. Have a qualified mentor review physical procedures and current event inspection requirements.

## Connect to Java without implying hardware readiness

Java is our teaching choice, not a language mandated by the selected construction-rule review. WPILib's [command-based structure](https://docs.wpilib.org/en/stable/docs/software/commandbased/structuring-command-based-project.html) separates application lifecycle, RobotContainer composition, subsystems and commands. Use a subsystem as the owner of actuator requests and inject simulated IO for desktop work. Keep lifecycle cancellation and command cleanup visible at the call site.

The existing [case lab](../examples/java-2026-sim/CASES.md) provides 13 season checks within 42 JUnit tests: nominal operation, gate/alignment loss, invalid sensor, jam, reduced supply, disable and AUTO deadline. [Cleanup exercises](../examples/java-2026-sim/CLEANUP.md) cover scheduler/trigger call-site behavior. Those tests execute on Java17/WPILib2026.2.1; they do not test the archived roboRIO images, real CAN devices, field network, complete robot or rule inspection.

### Classroom exercise

Give two student groups the same 2024 design proposal but different event dates. Each must identify the applicable update before approving a radio or mass budget. Then map one scoring mechanism to an IO contract and select existing desktop fault tests. Submit the unresolved hardware evidence list as part of the answer. No powered experiment is needed.

## Primary sources and rights

- [2024 manual](https://firstfrc.blob.core.windows.net/frc2024/Manual/2024GameManual.pdf), construction V8, archived final snapshot.
- [2025 manual](https://firstfrc.blob.core.windows.net/frc2025/Manual/2025GameManual.pdf), construction V11, archived snapshot.
- [2026 manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf), TU22.
- [Official season materials](https://www.firstinspires.org/resources/library/frc/season-materials) provide the current English manual/update gateway and prohibit re-hosting their content.

Manual bodies remain outside this package. Share canonical links. The authored review workflow, metadata and code are original; no FIRST diagrams, tables, manuals or hardware assets are bundled. Native Fusion and physical validation remain unexecuted.

For Windows setup, follow [WPILib bundled-JDK guidance](https://docs.wpilib.org/en/stable/docs/software/advanced-gradlerio/jvm-runtime.html): mismatched MSVC runtimes can break native-library loading. Prefer the JDK shipped with the matching WPILib installation and keep machine-specific Gradle paths out of version control. The recorded test here used Temurin 17.0.21+9 on one Windows host; success there does not verify every JDK/runtime combination. No installer or machine setting was changed.
