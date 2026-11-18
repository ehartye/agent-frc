# Compare controller inputs and trajectory coverage

Use the [contact refinement checker](contact-convergence.md) to compare the declared numerical results. The companion also compares the commands a producer reports delivering and the trajectory regions it reports checking. Its JSON includes the complete original numerical result and separate schedule and coverage results per study and run.

Run the bundled synthetic case from the repository root with Node. This command uses the request digest frozen before the observations:

```sh
node scripts/check-refinement-evidence.mjs examples/refinement-evidence/manifest.json examples/refinement-evidence/receipt.json examples/refinement-evidence/request.json examples/refinement-evidence/evidence.json --request-sha256 ba88018f68330e4f7e78a63dca749135a7b64579d60f0fa9e5f9962efcc2cf92
```

Expect exit 0, a numerical status of `within-declared-bounds`, a `matched` schedule and `covered` coverage in both studies. Both studies use a shared fine run. Engineering acceptance stays blocked. The published request digest is also in [request.sha256](../examples/refinement-evidence/request.sha256).

## Freeze the comparison

1. Retain the two original v1 documents and select the named studies and run IDs from their manifest. A run used by both axes has one observation.
2. Before observing runs, write [request.json](../examples/refinement-evidence/request.json) and independently retain its SHA-256. Use the original digest as the CLI argument. Recalculating it from post-run inputs loses this independence.
3. Write [evidence.json](../examples/refinement-evidence/evidence.json) with each run's observed schedule and coverage, plus lowercase `manifestSha256`, `receiptSha256` and `requestSha256` of the exact bytes. A newline change affects a digest. Each of the four JSON documents has a 5 MB limit. Input files are read-only.
4. Read each result in its original scope. Matching command schedules and matching numerical summaries answer different questions. A failed sampled support observation can coexist with complete coverage of requested samples.

## Controller schedule

The request supplies a `schedule` per study and the producer supplies one per run. Declare the following fields in both:

- `clock` contains the reference `origin`, positive `periodSeconds` and the model time at tick zero (`tickZeroSeconds`). `window` contains two integer ticks, start inclusive and end exclusive. Their model times must lie within the v1 numerical horizon.
- `channels` lists unique IDs and exact target units. Incompatible units or clocks leave parity unknown. No unit conversion or target tolerance is applied.
- `entry` contains the held target and phase of every channel immediately before the first included event. A channel can retain a different command for the entire window without emitting an event.
- `events` contains all delivered changes, each with integer `tick`, `channel`, finite `target` and `phase`. Preserve observed order including successive writes in the same tick. An explicit empty list means that the producer recorded no changes within that interval.

An incompatible or incomplete declaration leaves the run unknown. For comparable schedules, the first changed entry or event identifies the run and both supplied values. A difference in a feedback-controlled experiment can be legitimate. The result reports that the actual inputs differed.

## Coverage

Each study in the request names a nonempty `coverage` list. Each run in the evidence contains its observations. Every record has a named time `origin` and `units` of `s`. The same origin and units must cover the request.

| Kind | Required fields | What can satisfy the request |
|---|---|---|
| `startup` | Increasing two-number `interval` | One reported independent startup replay beginning at time zero and covering the requested interval |
| `continuation` | `interval` and `checkpoint` with `id` and raw-byte `sha256` | One reported continuation with the same checkpoint name and digest covering the requested interval |
| `poses` | Nonempty unique `poseIds` | The union of explicitly observed pose IDs in the same coordinate/time reference |

For each observation include `findings`, an array that may be empty. A finding supplies a short `outcome` and `detail`, plus an observed `poseId` or a two-number `interval` inside its parent record. For example, a fixed-pose observation can preserve `{"poseId":"airborne","outcome":"failed","detail":"Support bound below weight"}`. Keep each finding attached to the sampled pose or interval. Six fixed poses establish coverage of those six poses only. A downstream continuation can satisfy a request to repeat from its named checkpoint. An independent startup request requires an independently replayed upstream trajectory.

## Read the exit code

- **0** — supplied numerical summaries fall within declared bounds, delivered schedules match and all requested coverage is present.
- **1** — sufficient evidence shows different delivered commands or the original v1 checker reports `not-converged`, including changed discrete outcomes.
- **2** — an invalid or missing input, stale digest, unknown numerical result, incompatible schedule or incomplete coverage prevents a complete comparison. This takes precedence when other studies also report a difference. The report keeps available numerical and local observations.

The checker compares declarations against a caller-supplied expectation. Source authentication, solver execution, calibration and physical qualification require separate evidence. A [producer recipe](simulation-input-roles.md) illustrates binding repeated filenames and ordered configuration overrides.
