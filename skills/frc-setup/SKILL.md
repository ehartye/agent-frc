---
name: frc-setup
description: "Check task-specific Agent FRC runtime and installed Python library health without silently installing dependencies."
---
# Setup and installed-library check

Identify the selected computer, project and task before changing anything. Reuse its documented interpreter/virtual environment or lockfile; do not assume system Python is the project Python. Ask only when project/environment selection is genuinely unresolved. Run the [environment health check](../../docs/setup-health.md), report the actual interpreter, required versus optional libraries, versions and import errors, then recommend the smallest correction. A repository checkout, installed Agent FRC host plugin, physics package and native Fusion application are separate things.

For core artifact/trace work, Python physics libraries are not required. For a selected MuJoCo experiment, check its actual Python executable and pinned MuJoCo/NumPy versions. Import success is not a render/contact/controller validation. Do not silently install, upgrade, switch interpreters or claim compatibility from presence alone. Preserve the user's environment and obtain required authorization before proposed changes. Verify again after an authorized correction.
