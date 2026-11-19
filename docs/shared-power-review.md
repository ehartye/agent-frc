# Does the action still have enough voltage?

Start with the movement the robot needs to finish. Choose the physical inlet that powers it, the time window when it must work and the project's minimum voltage there. Compare the same action and wiring under two schedules or source conditions. The input comes from the team's model or recorded measurements.

## Try the invented carriage

```sh
npm run power:review -- examples/power/comparison.json
```

The carriage needs 9 V while it travels from 0 to 1 s in this example. It draws 6 A from the common supply. Starting the 10 A fan in the first half-second brings the modeled carriage inlet to **8.3 V**, 0.7 V below its floor. Starting the same fan after travel leaves **9.8 V** at the inlet throughout travel. Only the second trial also supplies a successful position outcome. These are synthetic teaching inputs. [Comparison](../examples/power/comparison.json) · [Overlapping loads](../examples/power/overlap.json) · [Staggered loads](../examples/power/stagger.json)

For your own project, replace the example argument with your comparison path. Read the `interpretation` for each trial's modeled or measured electrical result and functional outcome, including an unknown outcome. It names the limiting row's source, phase and total current readings and any remaining evidence gaps. Open `limiting` for the voltage location, witness time or interval, margin and concurrent readings. Check the status of any proposed fallback before choosing a schedule. Zero source current is valid evidence for a scheduled-off load. An absent current channel leaves its contribution unknown.

### Check the device ceiling across operating states

Run `npm run power:review -- examples/power/regulator/comparison.json` to compare two regulator settings. Both keep the synthetic sensor above its 4.80 V floor under load. At its settled, open connector the standard trim gives a 5.20 V upper bound against a 5.30 V ceiling. Raising the trim gives a 5.35 V upper bound. That leaves a 0.05 V gap in the guarantee. An actual overvoltage would require an attained value above the ceiling. Startup, disconnection transients and the connected input each need evidence for their own state. [Editable study](../examples/power/regulator/comparison.json)

Use `frc-power-comparison/v2` and `frc-power-trace/v2` on both trace files. Keep the loaded action, floor and current channels described below. Add the following fields.

| Field | What to record |
|---|---|
| Comparison `upperRequirements` | One entry per physical `location` and operating `state`. Include the device ceiling `maxV` and `ratingSource`. Use an explicit null and explain the gap when the rating is unknown. |
| Trace `upperEvidence` | For each supported pair give `location`, `state`, `kind`, `valueV` and `source`. Use an empty array for a missing study. Identify model or instrument, revision, wiring, supply and load conditions in the source. The trace digest binds the record to the trial. |
| `upper-bound` | Maximum possible voltage under the named conditions. A bound at or below the ceiling covers that state. A higher bound leaves it unresolved. |
| `maximum` | Highest **attained** value across the entire declared state. The value must also bound that state. Use `point` for the largest sampled value when behavior between samples is unknown. |
| `point` | An attained value above the ceiling proves an exceedance. A point at or below the ceiling leaves other instants unresolved. Set `fresh: false` for stale evidence. |

The report preserves each trial's `minimumStatus` and gives its `upper` assessments with source, state, signed margin and reason. Positive upper margin means headroom. A witnessed violation takes precedence over missing evidence. A supported fallback requires the minimum, every named ceiling and a successful functional outcome in the same trial. The v1 minimum-only format still rejects ceilings. Use v2 to include them in the verdict.

## Project file contract

Save the comparison and both traces as UTF-8 JSON. Use a relative trace path such as `runs/first.json` with no drive prefix. Compute each trace's SHA-256 over its exact file bytes. Keep the original solver or log revision, conversion description and assumptions with the project. The digest lets another reader verify the supplied bytes. Sensor calibration, model validity and the choice of voltage floor require separate evidence.

| Comparison field | Meaning |
|---|---|
| `schema` | `frc-power-comparison/v1` |
| `actionId`, `busId`, `clockId` | Shared action, physical supply and clock identities for both trials |
| `window: {fromS,toS}`, `maxSampleIntervalS` | Action interval in seconds and largest accepted sample period. Equal endpoints request a single instant. A duration includes its start and excludes its end. |
| `requiredLoads` | Unique load IDs whose source-side contributions must cover the window. An empty list asks about voltage alone. |
| `locations: [{id,minV}]` | Physical voltage locations and individual floors. Omit `minV` or use null for an observation without a known threshold. |
| `trials: [{id,condition,trace:{file,sha256}}]` | Two distinct trials. Use the same action and physical locations across their source or scheduling conditions. |
| `fallback: {description,trialId?}` | Optional proposed action schedule and its matching trial, if tested. |

Use a shared local time origin, such as the start of the trial. Convert original timestamps to elapsed seconds at their original precision before exporting numeric JSON fields. The reviewer rejects a window edge, sample edge, witness time or maximum interval whose decimal value changes when read and written as a JavaScript number. Equivalent decimal and exponent spellings are accepted. Record the time origin and conversion with your trace so another reader can align the action and both trials.

Each trace uses `frc-power-trace/v1` and repeats the comparison's `actionId`, `busId`, `clockId`, and its own `trialId` and `condition`. Its `units` are `{"time":"s","voltage":"V","current":"A"}`. Set `provenance.kind` to `modeled` or `measured` and identify the evidence in `provenance.source`. To report a functional result include `outcome: {status,description}`. Status is `observed-success`, `observed-failure` or `unknown`. A modeled outcome applies to that model.

Supply ordered, nonoverlapping `rows`. Each has `fromS`, `toS`, a `voltages` array and a `currents` array. Use empty arrays to preserve a known gap. A row with `fresh:false` marks stale input. A positive-duration bin that exceeds the declared sample period leaves continuity unresolved. A fresh witnessed violation can still locate a failure inside that bin.

| Observation | How to encode and interpret it |
|---|---|
| Voltage at an instant | `{location,kind:"point",valueV,atS}`. The time must lie in its row. A fresh reading at the requested instant establishes the voltage there even in a wide bin. Required load currents still need their own coverage. |
| Attained minimum | `{location,kind:"minimum",valueV,atS?}`. The voltage actually reached this value in the bin. A low minimum in a bin that crosses the action boundary needs a witness time inside the window to prove the violation happened during the action. |
| Conservative lower bound | `{location,kind:"lower-bound",valueV}`. A bound at or above the floor supports the covered interval. A lower bound beneath the floor leaves the minimum unresolved. |
| Current | `{id,kind,valueA}`. Use `source` for a named load's draw from the common source, `phase` for motor phase current, or `bus-total` with the common bus ID for total draw. Positive supply current denotes draw. In a duration row declare currents only when the source supports those values concurrently throughout that bin. Use a zero-duration row for a point reading. Retain time-varying or unmatched currents in the original trace until they can be aligned. |

A `complete` electrical review has supporting coverage for every required voltage and source-current channel. A demonstrated low voltage yields `violated` even if another channel is missing. Other gaps yield `incomplete`. The report keeps voltage observations with unknown thresholds and identifies the evidence still needed. A proposed fallback earns `supported` only with complete electrical evidence and a successful functional outcome in its matched trial. All three electrical statuses produce a report and exit successfully. Malformed or incompatible evidence and digest mismatches exit with an error.
