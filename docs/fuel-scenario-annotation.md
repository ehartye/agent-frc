# Scenario-level hypothetical FUEL annotation

This workflow adds practical provenance for a **supplied hypothetical event fixture**. It does not give the compared robots scores. It connects an exact experiment/scenario to independently stated top-entry/sensor-passage hypotheses and the conservative nominal-rule assessor.

Use `annotateScenarioFuel(study, request)` from `scripts/fuel-scenario-annotation.mjs`. Start with `templates/fuel-annotation-request.json` and replace its null `experimentRef` with the exact experiment pin from `executeAndLinkComparison(...).receipt.experiment`. The selected scenario ID must be one of that experiment's exact scenario-input bindings. Alternatively, the CLI reads a bare linked study JSON and the filled request:

```sh
npm run --silent annotate:fuel -- linked-study.json annotation-request.json
```

It prints `{study, assessmentPin}` and does not overwrite files. A comparison-link CLI result is wrapped in `{study, receipt}`; extract its `study` member before using this CLI. Real private team data must not be committed or published without authorization.

## Four separate record kinds

1. **fuel-assessor-model:** exact assessor source digest, model ID and archived TU22 rule snapshot, checked against the selected Game Analysis.
2. **hypothetical-fuel-source:** an attributed hypothetical assumption with ID, revision, statement and hash. This is not sensor evidence or independent corroboration.
3. **hypothetical-fuel-event-set:** complete events/context, exact experiment/config/scenario/game/model pins and resolved source references. Its association is `independent-scenario-fixture`, with `comparisonDataUse: identity-only`.
4. **fuel-assessment-evidence:** complete unchanged output of `assessFuelLedger`, input/output hashes and linker digest, plus the exact event-set/context dependency pins.

An annotation gets a fresh child branch of the experiment branch. Scenario identity is checked against the experiment's exact direct dependency, then inherited transitively. No new cross-branch permission is introduced. Ordinary design and run-evidence isolation remains unchanged.

## No hidden event producer

The caller must explicitly supply both timestamps using nominal, period-local AUTO/TELEOP clocks and the first-inactive alliance or UNKNOWN. No code converts benchmark ticks, release counts, launch actions or assumed delays into passage events. `runRef`, trace fields, measured sensor provenance and unsupported request fields are rejected. The fixture may not be used as per-concept performance evidence, paired run output, a complete inventory history or a ranking.

Every event reference must resolve to one declared `hypothetical-passage-assumption` source record. Missing, duplicate, wrong-purpose and circular-reference fields reject rather than implying corroboration. Source attribution and hashes provide consistency, not trusted authorship or physical authenticity.

## Nulls, limits and freshness

All unsupported event records and null contributions survive unchanged. The supported-event subtotal remains exactly labeled as a supplied-event component, not a score, forecast, complete FUEL total or lower bound. Empty or entirely unsupported ledgers may have arithmetic subtotal zero, but do not imply zero scored points. Match score, ranking points, win probability, run score, paired comparisons and selected candidate remain null. Inventory linkage remains `not-implemented`.

Only a current exact experiment pin and its fresh game/scenario dependency closure can be annotated. A revision to the experiment/config, concept/policy/scenario, game/rules, event/context, hypothetical source or assessor invalidates dependent annotation evidence. Merely re-pinning an old assessment does not rerun it; a new event-set/model pin requires a fresh assessment. New files on disk do not automatically revise stored graph records: explicitly ingest changed source/model versions before interpreting freshness.

The wrapper allows at most 256 events, 64 source records, 16 unique references per event and 256 KiB of input JSON; source statements are at most 2,048 characters. The assessor's original malformed/duplicate/cross-period checks still apply. Invalid input produces no partial graph mutation. No scoring rules, grace behavior or timestamp interpretation are changed by this wrapper.

Run `npm test`, `npm run validate`, `npm run evaluate` and `npm run cases:validate`. Tests compare the entire ledger and dependency pins, not just its subtotal.

The graph validator enforces closed content, pin, event, source, context, snapshot and ledger/result schemas as well as the execution helper. Directly appended records cannot smuggle `runRef`, candidate selection, release-derived links or circular source fields into these v1 artifacts. This rejects unsupported structure; it does not authenticate the supplied hypothetical statements.
