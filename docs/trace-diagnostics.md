# Read-only trace diagnostics

Run npm run trace:inspect -- input.json report.json report.html. Both output paths must be fresh and distinct; parent directories must already exist. The tool reads a frozen receipt, never an actively overwritten producer file, and writes a machine-readable diagnostic report plus a self-contained, offline HTML view. It does not change the producer, model or input. Input limit: 32 MiB and 100,000 rows. If output writing fails, a report may already exist; use new paths for a retry rather than overwriting evidence.

This first adapter accepts the existing FRC trace-array shape: finite increasing timeS; optional chassis.vx, note.v[0], relativeRobotXY[0], busV, contacts (normalMagnitudeN/activeSamples), energyJ.residual, newPhaseResidualJ, contactSampleTimeS, command and controller events. It deliberately rejects summary/comparison receipts without trace arrays. Other shapes need a tested adapter, not guessed field aliases. Missing/null measurements are reported as missing and plotted as gaps, never zero. An explicit empty contacts array sums to zero. Plot ranges are independently autoscaled and numeric extrema displayed; compare labels/units, not visual line height across panels.

The dashboard separates accepted endpoint time, actual contact sample time and controller events. It shows latest accepted values, first recorded positive contact in this file (not necessarily global onset), declared held command/next tick, cumulative versus new-phase energy residual, and the rejected query separately. It never substitutes midpoint contact for endpoint force or computes frictional holding headroom. A pure endpoint-force reconstruction remains separate producer evidence.

An explicit partial:true is prominently marked PARTIAL SNAPSHOT. Otherwise finality is not inferred. HORIZON is not success. Missing outcome, time metadata or event history stays missing. Nonmonotonic times and malformed/nonfinite measured fields fail; sample-time/future-observation anomalies are listed without silently repairing them. Timing checks use a small numeric comparison allowance, not a physical tolerance. The tool does not prove controller event completeness, validate held-command causality or compare endpoint checkpoint identity; those remain producer/reviewer checks.

Source file SHA256 is computed from actual bytes and rechecked before output. Upstream source pins are displayed as declarations, not independently verified. Metadata is HTML-escaped; there are no scripts, network calls or remote dependencies. Reports may contain source metadata and commands from their input: review before sharing. No acceptance, safety, capture, calibration or continuous-clearance inference is made.

## Executed validation

Seven synthetic tests cover time separation, missing fields, malformed/nonfinite values, ordering/count errors, timing anomalies, HTML injection escaping, explicit partial state, input preservation and fresh-output refusal. The plugin suite totals 66 tests at introduction.

Read-only real-data checks at introduction:
- 200-row inward tail: SHA256 c76ccc2062f452194c2acf541be1d6918ef4a4e355c910a1ee6511dd85f70021.
- 100-row inward extension: SHA256 e0afc8a9ad10b65bb212836f43d9a2e701c97a70f6c0c145c1d9e4f73678f37d.
- 1503-row immutable partial first-contact milestone: SHA256 aa6b0b5db8a361e0c6446ce5e338ab05e58e2a2e42ba40a660e92b57e2cdc912. Its stepS/controllerPeriodS are absent and correctly displayed missing, not invented.

These runs generated reports, not new physics replays. Large raw traces are not copied into the plugin. Remaining opportunities include independent source-pin verification, schema-specific checkpoint comparison, same-time run comparison, and validated endpoint reconstruction adapters. None is advertised as implemented.
