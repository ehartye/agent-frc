# Task-specific environment health

## Resolve the plugin used by this check

Run the [runtime resolver](../scripts/resolve-plugin-runtime.mjs) from a stable Agent FRC checkout. Determine whether the project accepts a compatible active installation or requires the source revision named in a historical experiment.

For an active local marketplace installation, request a fresh host inventory immediately before launching the project check. The resolver checks the installed cache manifest for the selected identity, marketplace and version. It prints the root and version as JSON.

```sh
codex plugin list --marketplace agent-frc-local --json | node scripts/resolve-plugin-runtime.mjs active agent-frc-local
```

Pass the returned root to the project runner and record the version with its results. Use the configured marketplace name if different. For a custom cache parent, supply the directory containing the marketplace subdirectories as the last argument. The marketplace source checkout can advance independently. If an update removes the resolved directory, discard the incomplete run, resolve again and rerun the full check. The project tests establish compatibility.

For a pinned replay, read the full commit from the project receipt and select an existing clean checkout of that commit. The resolver checks the Git root, revision, pending changes and tracked plugin manifest. It reports failure if the reviewed source is absent.

```sh
node scripts/resolve-plugin-runtime.mjs pinned PATH_TO_REVIEWED_CHECKOUT FULL_COMMIT
```

Compare the recorded input hashes and toolchain versions separately. For a self-contained historical archive, use the project's archive verification and registered digest. Keep local paths in the private run record.

## Check the selected toolchain

For a Python suite that uses both native CAD and simulation, run the combined check with the suite's Python executable and its working directory.

```sh
node scripts/check-environment.mjs --task cad-physics --python PYTHON_EXECUTABLE --cwd TEST_DIRECTORY
```

The probe imports MuJoCo, NumPy and OCP in one Python process. Matplotlib is optional. Supply exact project pins with repeated `--expect distribution=version` arguments. The child inherits the caller's environment and uses the test directory for imports as in `python -m unittest`. If the real suite appends extra import directories after its interpreter's packages, mirror them in order with repeated `--append-path DIRECTORY` arguments. Use trusted project directories and the same interpreter options and environment when running the suite. Keep the JSON report private. It includes working directory, import path order, module origins, versions and import exceptions. A successful check establishes that the selected interpreter can import these libraries together. Run the suite to verify the design.

For a Java simulation project, use `npm run setup:check -- --task java --jdk ABSOLUTE_JDK_PATH --expect-java PROJECT_MAJOR`. Both options are required: reuse the project's existing trusted JDK and its documented major version. For a project requiring Java 17, PowerShell can pass an already selected absolute path with `--jdk "$env:JAVA_HOME" --expect-java 17`. An unset variable fails; this tool does not search for or select another installation.

The Java profile runs only `bin/java -version` and `bin/javac -version` (`.exe` on Windows), directly without a shell. Each probe has a 20-second timeout and 1 MiB output limit. The report retains executable paths, observed versions and expected major; missing runtime/compiler, nonzero exit, timeout, ambiguous/unrecognized version output or a major mismatch yields `ready:false` and exit 2. Java options on a different task and Python options on the Java task are rejected. No Python process, Gradle wrapper, build, dependency resolution or installer is launched.

Readiness covers the selected runtime/compiler major only. It does not verify a complete project toolchain, equal patch versions, a specific vendor, executable authenticity, Gradle cache completeness, WPILib/native dependencies or compilation. Only probe trusted executables. Follow the project's existing offline build command as a separate step and keep its fresh output distinct from this preflight. Windows and POSIX path construction has fixture coverage; actual platform execution must be recorded separately.

Use npm run setup:check -- --task core for Node-only artifact/trace tools. No Python process is launched for core. Use --task physics --python PATH_OR_COMMAND for MuJoCo/NumPy imports, with Matplotlib optional. Use --task native-cad for the optional headless OCP workflow (cadquery-ocp distribution/OCP import); this does not test Fusion or replace a native Fusion deliverable. These are explicit profiles, not universal project requirements.

Supply the project's actual Python executable, including its virtual-environment executable when applicable. The default command python means whichever that command resolves to here, not a claim it is the intended project environment. Output records sys.executable, Python version, prefix/basePrefix and virtual-environment status plus each selected installed distribution version, import health and module location. Imports execute installed package initialization; no installer, network call or hardware operation is requested by the probe. Only use trusted project environments. Each Python probe is bounded by a 20-second timeout and 1 MiB output limit.

Example: npm run setup:check -- --task physics --python python --expect mujoco=4.0.1. Repeat --expect for other selected distribution exact versions from the project's lockfile. No universal MuJoCo version is prescribed. A mismatched required version, missing distribution metadata or failed required import makes ready:false and exit2. Optional failures are visible but do not block readiness; core success or successful required probes exits0. Readiness means only this selected dependency check, not complete project readiness.

Inspect import failure details separately from absent metadata: an installed package can fail because of native binaries or incompatible dependencies; a module may import without distribution metadata. Do not solve either by blindly installing another copy. Module locations can expose unexpected environments/shadowing but the tool does not automatically prove a lockfile or verify package authenticity. No GPU/window renderer, simulation behavior, Gradle/WPILib setup, Fusion sign-in, host-plugin registration or hardware is tested.

The check performs no installation or updates and writes no report file itself. Output may contain private interpreter/module paths and error messages; review before sharing or committing it. Do not put local diagnostics into public repos. Retain task, version expectations and results with private evidence as appropriate.

Validation at introduction: six fixture-based tests cover core no-probe behavior, exact versions, required/optional failures, missing metadata/interpreter, malformed probe output and shell-free arguments. A real system-Python probe correctly reported MuJoCo missing; the selected project virtual environment correctly reported MuJoCo 4.0.1 / NumPy 2.5.5 importable and optional Matplotlib absent. No installation was needed or performed. These observations are not universal version requirements.
