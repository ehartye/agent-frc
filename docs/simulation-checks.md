# Compare replay and trajectory evidence

Run `npm run --silent simulation:check -- request.json receipt.json`. Freeze the request before collecting results. The receipt must carry its raw file SHA-256 in `requestSha256`. A producer can compute that digest with Node's `crypto.createHash('sha256')` over the exact file bytes. The command reads two local JSON files and reports what they establish. Exit 0 means all required comparisons passed, 1 means a complete comparison exceeded a bound, and 2 means the evidence is incomplete, ambiguous or invalid.

## Independent replay inventory

Use schema `frc-simulation-checks/request-v1` and kind `replay-inventory`. Supply a nonempty `replays` array. Each entry identifies a run, replay kind and integer step, and declares one or more metrics with a name, units and maximum absolute difference. For example:

```json
{"schema":"frc-simulation-checks/request-v1","kind":"replay-inventory","replays":[{"run":"fine","kind":"cold","step":10,"metrics":[{"name":"velocity","units":"m/s","maxAbs":0.003}]}]}
```

The matching receipt uses schema `frc-simulation-checks/receipt-v1`, the same kind, the frozen request digest and observed replay entries. Each metric supplies `difference` in its declared units. Use distinct required entries for cold replays and alternative solvers. Missing or duplicate observations yield unknown. The report preserves failed metrics even if another metric is missing. Additional non-required replays are reported separately.

## State samples on a common clock

Use the same schemas with kind `trace-alignment`. The request names two distinct `traces`, a clock `origin`, positive `tickSeconds`, `quantity`, `units`, a nonnegative `maxAbs`, an inclusive integer-tick `interval` and sorted `requiredTicks` including its endpoints. Choose the underlying shared time unit fine enough to represent both sampling grids. Use observed timestamps converted exactly to that unit. Rounding a step ratio or shifting a trace to improve its resulting error can create false matches.

In the receipt each trace has an `id`, the same origin, tick size, quantity and units, `timeBasis: "common-clock"` and sorted unique `samples` of `[tick, value]`. The checker compares all genuine intersections in the interval, retains unmatched ticks per trace and reports every missing required tick. Optional `diagnostics` retain independent phase-relative studies. A favorable alignment at another phase cannot change the common-clock result. Values between shared samples remain unmeasured.

See the runnable [nominal and negative fixtures](../test/simulation-checks.test.mjs) and the [refinement evidence companion](refinement-evidence.md).
