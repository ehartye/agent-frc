# Current checks and historical verification

Run `npm test` and `npm run validate` for the current portable plugin. These commands do not run Python studies. Skill validation accepts LF and CRLF metadata without rewriting files; errors name the repository-relative skill path, a diagnostic code and the reason. LF remains the source-authoring convention.

Use `verify:historical` when you need the reviewed historical acquisition contract. It reconstructs a fixed source set from local Git objects, independently of mutable working-tree study files. Run it from a repository checkout with Node 20.11+ and Git available. An installed plugin cache without the required Git history is not a substitute checkout. No private vault, recovery bundle, native geometry, JDK or Python package installation is needed for the supported case.

## Select and inspect the case

```sh
npm run verify:historical -- --list
npm run verify:historical -- --case acquisition-contract
```

The list contains only `acquisition-contract`. The second command checks the seven reviewed source identities, then reports `prerequisite` with `python-required` (exit 2) because no interpreter was selected. It does not extract files or run historical tests. Missing local history can be reported first. The runner never fetches missing Git objects or installs an interpreter.

Choose an existing interpreter appropriate to the task, then replace `<absolute-python-executable>` below with its absolute executable-file path. Quote paths containing spaces; a command name such as `python` alone is not accepted by this route.

```sh
npm run verify:historical -- --case acquisition-contract --python "<absolute-python-executable>"
```

This preflight reads Git objects and probes the selected interpreter with `--version`. `ready` (exit 0) means the prerequisites are satisfied, not that a test ran. Python 3.10 or newer, below 4.0, is an eligible candidate range. Eligibility does not establish tested compatibility for every version. The implementation was exercised with Python **3.13.12**: six historical tests passed, including a check against a fresh public-origin clone. That result does not extend to untested versions or other historical studies.

## Execute the reviewed source

```sh
npm run verify:historical -- --case acquisition-contract --run --python "<absolute-python-executable>" --output acquisition-result.json
```

Choose a new output filename in an existing writable directory. `--output` is optional; stdout always reports the result. For a JSON-only stream without npm's command banner, use `node scripts/check-historical.mjs` with the same arguments. Existing output files are never replaced. Publication uses a completed sibling file and a no-replace hard link; if the filesystem cannot support publication, the command reports `failed` with `output-failed` rather than pretending the report was saved.

Execution creates an owned temporary directory, writes the seven reviewed regular files byte-for-byte, and invokes the selected executable with exactly `-I -B scripts/test-acquisition-contract.py`. The test uses Python's standard library. The Java files in the source set are hash inputs, not compiled or executed code. A 60-second timeout bounds the test process; no extra execution arguments are accepted.

The result binds the registry hash, expected and recovered file identities, interpreter identity, exact arguments, raw child stdout/stderr, test inventory, before/after hashes and cleanup outcome. Expected file identities are retained even when history is missing; an observed tree mismatch also records its blob ID, mode and type before failing. `passed` requires the pinned program to exit successfully with its six-test completion summary and all seven inputs unchanged. The checkout and original receipts are preserved. Normal completion removes only the owned temporary directory after collecting evidence; cleanup failure is a failing completion with the retained path reported. Before extraction or child execution, a synchronous stderr JSON line with event `historical-temporary-directory` identifies the exact owned directory. Preserve stderr as well as the final stdout JSON: an interrupted process may never emit its final result and can leave that directory needing separately verified cleanup. Never clean unrelated temporary directories based on the name prefix alone.

## Read the result

Verification results use `agent-frc/historical-verification-result@1`. Inspect `mode`, `status`, `issues`, `execution` and `scope`, not just the exit code.

| Status | Exit | Meaning |
|---|---|---|
| `ready` | 0 | Preflight passed; no historical test execution. |
| `passed` | 0 | The one allowlisted historical program passed and inputs stayed unchanged. |
| `prerequisite` | 2 | Required local history or an eligible interpreter is unavailable. |
| `mismatch` | 2 | Available source/pin identities disagree, or an execution input changed. |
| `failed` | 1 | Test, timeout, execution, cleanup or output publication failed. |
| `invalid` | 2 | Request or reviewed-registry structure is unsupported, malformed or unsafe. |

Missing prerequisites are not skipped passes. A child test can pass while final cleanup/publication fails; retain both facts. The implementation is controlled execution of reviewed code, not an OS security sandbox. Hash agreement identifies bytes; it does not make arbitrary code trustworthy or prove physical correctness.

## Source and hash boundaries

The committed registry is `case-studies/historical-verification-registry.json`. Its acquisition case contains the implementation, two JSON input datasets, two Java source inputs, the expected acquisition receipt and the exact Python test. It resolves regular-file blobs from public integration commit `ff8e87665b76b8491606ac6847333809ee82b526`; the original feature branch is not required. A shallow clone lacking that locator or its objects reports a prerequisite instead of fetching automatically. Registry/command overrides are not exposed by the CLI.

Raw SHA-256 checks bind the exact recovered and executed bytes. The old acquisition receipt separately hashes UTF-8-sig-decoded, newline-normalized text re-encoded as UTF-8. Those algorithms differ in general. They agree for this reviewed source set because its blobs contain neither BOM nor CRLF. The runner preserves both checks; it does not normalize extracted execution bytes or rewrite old receipt pins.

The six tests concern freshness, energy/continuity, controls, rebound/stop-loss, domain and mass bounds. Passing them reconstructs that historical Python contract only. It is not a fresh Java trajectory, native geometry replay, hardware calibration or whole-robot acceptance, and it does not resolve every older study failure.

## Existing working-tree Python studies

These npm commands keep their existing behavior: they invoke `python -B` through PATH and read the current working tree. They are opt-in study checks, not the isolated historical route. Inspect each study's prerequisites and select the appropriate existing environment before running it.

| npm command | Working-tree test |
|---|---|
| `test:maxlift-pair` | `scripts/test-maxlift-fastened-pair.py` |
| `test:coral-placement` | `scripts/test-coral-placement.py` |
| `test:acquisition-contract` | `scripts/test-acquisition-contract.py` |
| `test:acquiring-robot` | `scripts/test-acquiring-robot.py` |
| `test:acquired-targets` | `scripts/test-acquiring-robot-targets.py` |

For historical acquisition reconstruction, use `verify:historical`, not `test:acquisition-contract`. Other Python study files have no supported registry case yet. See [experimental-study limits](experimental-studies.md) and [source/continuation principles](simulator-equivalence.md#current-tests-and-historical-evidence-are-different-questions).
