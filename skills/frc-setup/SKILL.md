---
name: frc-setup
description: "Check task-specific Agent FRC, Python library and Java toolchain health without silently installing dependencies."
---
# Setup and installed-library check

If setup is the entry point for resuming a robot investigation, follow the [design continuation procedure](../../docs/strategy-first-continuation.md) before choosing the next mechanism experiment. For a runtime health request, use the task check below.

Identify the selected computer, project and task before changing anything. Reuse its documented interpreter/virtual environment or lockfile; do not assume system Python is the project Python. Ask only when project/environment selection is genuinely unresolved. Run the [environment health check](../../docs/setup-health.md), report the actual interpreter, required versus optional libraries, versions and import errors, then recommend the smallest correction. A repository checkout, installed Agent FRC host plugin, physics package and native Fusion application are separate things.

For core artifact/trace work, Python physics libraries are not required. For a selected MuJoCo experiment, check its actual Python executable and pinned MuJoCo/NumPy versions. Import success is not a render/contact/controller validation. Do not silently install, upgrade, switch interpreters or claim compatibility from presence alone. Preserve the user's environment and obtain required authorization before proposed changes. Verify again after an authorized correction.

## Current project checks

For a suite that imports native CAD and simulation packages together, use `setup:check -- --task cad-physics --python PYTHON_EXECUTABLE --cwd TEST_DIRECTORY`. Match the project's actual test import paths and retain the private diagnostic before running its tests.

For Java simulation work, use `setup:check -- --task java --jdk ABSOLUTE_JDK_PATH --expect-java PROJECT_MAJOR` before a build. Select one existing trusted JDK from project guidance; runtime and compiler must both match the requested major. Missing compiler, timeout and unrecognized version output remain failed prerequisites. This check does not run Gradle or prove cache, WPILib, native dependency or build readiness. Keep environment output private and preserve the established project build command as the next separate verification step.

Run the selected project’s offline checks with its declared prerequisites. Record the command, revision, versions and outcome. Keep an unavailable prerequisite visible.

Use npm test and npm run validate from the plugin checkout for its portable checks.
