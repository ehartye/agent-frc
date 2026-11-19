# Does the action still have enough voltage?

Start with the movement the robot needs to finish. Choose the physical inlet that powers it, the time window when it must work and the project's minimum voltage there. Compare the same action and wiring under two schedules or source conditions. The input comes from the team's model or recorded measurements.

## Try the invented carriage

```sh
npm run power:review -- examples/power/comparison.json
```

The carriage needs 9 V while it travels from 0 to 1 s in this example. It draws 6 A from the common supply. Starting the 10 A fan in the first half-second brings the modeled carriage inlet to **8.3 V**, 0.7 V below its floor. Starting the same fan after travel leaves **9.8 V** at the inlet throughout travel. Only the second trial also supplies a successful position outcome. These are synthetic teaching inputs. [Comparison](../examples/power/comparison.json) · [Overlapping loads](../examples/power/overlap.json) · [Staggered loads](../examples/power/stagger.json)

For your own project, replace the example argument with your comparison path. Read each trial's `limiting` entry for the voltage location, witness time or interval, margin and concurrent currents. Check `unknowns` and the functional `outcome` separately before choosing a schedule. Zero source current is valid evidence for a scheduled-off load. An absent current channel leaves its contribution unknown.

## Project file contract

Use two UTF-8 JSON traces and one comparison. All paths resolve relative to the comparison. Compute each trace's SHA-256 over its exact file bytes. Keep the original solver or log revision, conversion description and assumptions with the project. The digest lets another reader verify the supplied bytes. Sensor calibration, model validity and the choice of voltage floor require separate evidence.

| Comparison field | Meaning |
|---|---|
| `schema` | `frc-power-comparison/v1` |
| `actionId`, `busId`, `clockId` | Shared action, physical supply and clock identities for both trials |
| `window: {fromS,toS}`, `maxSampleIntervalS` | Action interval in seconds and largest accepted sample period. Equal endpoints request a single instant. A duration includes its start and excludes its end. |
| `requiredLoads` | Unique load IDs whose source-side contributions must cover the window. An empty list asks about voltage alone. |
| `locations: [{id,minV}]` | Physical voltage locations and individual floors. Omit `minV` or use null for an observation without a known threshold. |
| `trials: [{id,condition,trace:{file,sha256}}]` | Two distinct trials. Use the same action and physical locations across their source or scheduling conditions. |
| `fallback: {description,trialId?}` | Optional proposed action schedule and its matching trial, if tested. |

Each trace uses `frc-power-trace/v1` and repeats the comparison's `actionId`, `busId`, `clockId`, and its own `trialId` and `condition`. Its `units` are `{"time":"s","voltage":"V","current":"A"}`. Set `provenance.kind` to `modeled` or `measured` and identify the evidence in `provenance.source`. To report a functional result include `outcome: {status,description}`. Status is `observed-success`, `observed-failure` or `unknown`. A modeled outcome applies to that model.

Supply ordered, nonoverlapping `rows`. Each has `fromS`, `toS`, a `voltages` array and a `currents` array. Use empty arrays to preserve a known gap. A row with `fresh:false` marks stale input. A positive-duration bin that exceeds the declared sample period leaves continuity unresolved. A fresh witnessed violation can still locate a failure inside that bin.

| Observation | How to encode and interpret it |
|---|---|
| Voltage at an instant | `{location,kind:"point",valueV,atS}`. The time must lie in its row. It can prove a violation at that instant. |
| Attained minimum | `{location,kind:"minimum",valueV,atS?}`. The voltage actually reached this value in the bin. A low minimum in a bin that crosses the action boundary needs a witness time inside the window to prove the violation happened during the action. |
| Conservative lower bound | `{location,kind:"lower-bound",valueV}`. A bound at or above the floor supports the covered interval. A lower bound beneath the floor leaves the minimum unresolved. |
| Current | `{id,kind,valueA}`. Use `source` for a named load's draw from the common source, `phase` for motor phase current, or `bus-total` with the common bus ID for total draw. Positive supply current denotes draw. In a duration row declare currents only when the source supports those values concurrently throughout that bin. Use a zero-duration row for a point reading. Retain time-varying or unmatched currents in the original trace until they can be aligned. |

A `complete` electrical review has supporting coverage for every required voltage and source-current channel. A demonstrated low voltage yields `violated` even if another channel is missing. Other gaps yield `incomplete`. The report keeps voltage observations with unknown thresholds and identifies the evidence still needed. A proposed fallback earns `supported` only with complete electrical evidence and a successful functional outcome in its matched trial. All three electrical statuses produce a report and exit successfully. Malformed or incompatible evidence and digest mismatches exit with an error.
