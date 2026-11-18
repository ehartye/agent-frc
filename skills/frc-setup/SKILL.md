---
name: frc-setup
description: "Check task-specific Agent FRC, Python library and Java toolchain health without silently installing dependencies."
---
# Setup and installed-library check

Identify the selected computer, project and task before changing anything. Reuse its documented interpreter/virtual environment or lockfile; do not assume system Python is the project Python. Ask only when project/environment selection is genuinely unresolved. Run the [environment health check](../../docs/setup-health.md), report the actual interpreter, required versus optional libraries, versions and import errors, then recommend the smallest correction. A repository checkout, installed Agent FRC host plugin, physics package and native Fusion application are separate things.

For core artifact/trace work, Python physics libraries are not required. For a selected MuJoCo experiment, check its actual Python executable and pinned MuJoCo/NumPy versions. Import success is not a render/contact/controller validation. Do not silently install, upgrade, switch interpreters or claim compatibility from presence alone. Preserve the user's environment and obtain required authorization before proposed changes. Verify again after an authorized correction.

## Current checks and historical reconstruction

For Java simulation work, use `setup:check -- --task java --jdk ABSOLUTE_JDK_PATH --expect-java PROJECT_MAJOR` before a build. Select one existing trusted JDK from project guidance; runtime and compiler must both match the requested major. Missing compiler, timeout and unrecognized version output remain failed prerequisites. This check does not run Gradle or prove cache, WPILib, native dependency or build readiness. Keep environment output private and preserve the established project build command as the next separate verification step.

Use `npm test` and `npm run validate` for current portable checks; they do not execute Python studies. For the reviewed historical acquisition case, follow [historical verification](../../docs/historical-verification.md): list supported cases, select an existing interpreter by absolute executable path, and run preflight before explicit `--run`. `ready` is not a test pass; missing history/interpreter is a prerequisite, not a skipped success. The route needs a repository checkout with the reviewed local Git objects, not merely an installed plugin cache. It performs no installation or history fetch and needs no private vault, JDK or native assets for this one case.

Keep existing Python npm study commands classified as working-tree checks. For exact acquisition-history reconstruction, choose `verify:historical` rather than `test:acquisition-contract`. Record the actual exercised interpreter; an eligible version is not a verified compatibility promise. Preserve the original receipts and distinguish this six-test Python contract from Java/native trajectories or physical qualification.
