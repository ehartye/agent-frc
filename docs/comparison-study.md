# Abstract 2026 concept and strategy comparison

This is an executable **hypothetical inventory/scheduling experiment**, not a match predictor or physical simulator. It compares concept and policy assumptions against the same source-pinned 2026 field semantic package without inventing field coordinates.

Run:

```sh
npm run compare -- case-studies/2026/comparison-experiment.json case-studies/2026/field-package.json
```

The command writes JSON to stdout only. Redirect it to your own result file if desired. `runTrial` also supports independent workers with disjoint output destinations. No robot IO, installation, network retrieval, hardware operation or automatic winner selection is provided.

## What actually executes

The supplied benchmark uses three hypothetical buffers, two threshold policies, three scenarios and eight seeds: **144 runs**. It evaluates every concept-policy combination, rather than attributing a policy difference to a robot difference. Names do not establish a real robot design. In particular, the modest buffer is not a tower/climb model.

Each tick first moves any scheduled replenishment from a finite reserve into available stock. A robot then performs at most one abstract action: acquire, release, idle or cooldown. Acquisition moves pieces from source to robot; release moves them to a terminal `releasedUnverified` inventory. Failed attempts leave pieces in place. A cooldown of one skips the next tick, so the next possible action is two ticks later. No same-tick acquire/release is allowed.

A policy releases only during an explicitly assumed opportunity window and only when its threshold is met. Full-batch waiting can strand a partial final load; this is deliberately observable policy behavior, not automatic tail flushing. Windows are half-open tick intervals. All scenario stock counts, replenishments, probabilities, capacities, throughput and cooldown values are labeled hypothetical. Depot replenishment is a benchmark transfer assumption, **not an asserted official game rule**.

The current field package supplies source/version identity and validates that retrieval/scoring entity IDs exist with the correct purpose. The experiment does not interpret natural-language rule summaries as executable rule logic. World geometry, path travel, robot approach, flight/contact, phase authority, scoring assessment, penalties, endgame and power are unimplemented. Unknown geometry is therefore neither treated as free space nor silently replaced with coordinates. Collection/release counts describe abstract transactions only. `score` and `winProbability` remain null, and physical reachability remains `not-assessed`.

## Repeatability and fairness

- Every run pins its field package, concept, policy, scenario, model-source digest, Node version, tick size/count, seed, observation contract and metrics.
- Model-source hashing normalizes CRLF to LF. A digest detects consistency, not source authenticity or approval.
- Exogenous draws are keyed by scenario, seed, process, tick and opportunity slot. Candidate IDs and invocation order do not consume or shift a shared RNG stream.
- Independent processes reproduce the same trace; sequential candidate ordering does not affect run IDs or results. The full configuration digest changes when input array ordering changes, but individual run identity does not.
- Compare concepts holding policy fixed, or policies holding concept fixed, within each scenario. Output retains all seed-paired differences, not just a pooled rank or cherry-picked best run.
- The stopping rule is a fixed tick count. Any run-level execution failure is retained with its manifest and partial trace, and invalidates its paired summary rather than dropping it. Invalid input fails before a cohort starts.
- A conservation check runs after every tick across available stock, reserve, robot buffer and released-unverified stock.

This benchmark does not establish equal cost, mass, build time or practical feasibility between concepts. Those resource budgets are absent, not assumed equal. Policies receive the same abstract observations; this is not a model of driver skill or perception. No tuning is performed. Per-seed differences show stochastic variation **inside this model**, not confidence in physical performance. The most useful next step is sensitivity testing with evidence-backed parameter ranges, not declaring a winner.

## Evidence and validation

`comparison-validation.json` is a compact executed record containing exact input/model pins, run counts and a digest over all run outcomes and trace digests. Full traces are produced by the command, not bundled in that record. Re-run against matching pins to reproduce them. This evidence is separate from the decision chain; it does not silently create a capability contract, approved design or hardware result.

Tests cover deterministic replay, concurrent workers, input ordering, paired seeds, candidate-name invariance, capacity/conservation, empty sources, finite replenishment, zero-success faults, half-open windows, missing source IDs, mixed field hashes, invalid quantities and retained unknowns. The complete existing repository gates still apply.

## Next integration boundary

Before promoting this to a match model, add independently validated official phase/scoring adapters, source-backed initial layouts, robot-specific affordances and calibrated dynamics. Introduce physical travel, arrival and assessment as separate events. Preserve the current abstract results as their own model version; never relabel them as scores. Before using real team parameters, supply explicit measured evidence and authorized resource inputs through a new reviewed adapter rather than changing the hypothetical-basis label.

## Resource bounds

Validation caps concepts/policies at 20 each, scenarios at 100, runs at 10,000, planned pair-summary rows at 10,000, total trace ticks at 100,000 and draw-work estimates at 2,000,000. These are implementation limits, not FRC constraints. Replenishment and windows are preindexed per trial, and pair summaries use indexed candidate/seed groups rather than repeated full-run scans. Larger studies require an explicitly reviewed streaming/batch implementation rather than relaxing limits silently. Standalone trial manifests retain the full hypothetical assumption statement and limitations, not only hashes.

The [decision-chain linkage adapter](comparison-chain.md) can now execute this benchmark and attach separate hypothetical experiment/run evidence with exact pins and stale propagation. It does not claim the synthetic concepts simulate the preliminary robot envelopes or an approved team strategy.
