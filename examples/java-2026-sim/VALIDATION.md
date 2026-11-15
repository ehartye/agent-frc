# Executed validation — 2026-11-15

Windows x86-64; Temurin Java 17.0.21+9; Gradle 8.11; GradleRIO/WPILib 2026.2.1; JUnit 5.10.1.

Forty-two JUnit behavior tests and one bounded headless demo passed. Ten tests cover mechanism/mode/readiness behavior; four cover command cleanup/disable; six cover trigger/scheduler boundaries; nine cover trajectory generation/tracking, kinematic signs, capture timestamps, late vision insertion, reset baselines, temporal/outlier guards and delayed bias correction. Dependencies were cached; the run used --offline.

The original ideal trajectory completed 182 steps with 0.000589563 m translation and 0.00281310 rad heading error. Peak feedback-requested wheel speed 1.78103 m/s exceeded the 1.5 m/s reference constraint, remaining below the separate 3 m/s fixture output cap. These synthetic values are not real-robot accuracy.

The six-second flywheel demo retained 64 feeding ticks, zero stale-target feed ticks, 35 saturated ticks and zero final target/voltage. Wrapper checksum, distribution pin and resolved dependency lock remain unchanged. [Structured sanitized results](validation/result.json); [artifact manifest](validation/dependencies.json).

Earlier build setup failures were resolved before 0.2.0: JavaExec/native task configuration replaced with supported Test setup; a transient official Maven DNS failure cleared after verification/retry. No network configuration changed.

No upstream team project build, physical robot/camera/CAD test, complete field simulation, other OS verification or binary redistribution audit.

Thirteen additional season-case checks passed; [case results](../../case-studies/validation.json) record the three nominal plants. No whole-robot or native CAD simulation claim.
