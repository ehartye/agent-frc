# Held premises in a preliminary design

Most preliminary designs never need this page. Use it when a receipt reads `reopen`, when a plan registers `premises`, or when a later version must clear a hold that an earlier receipt recorded.

A premise is a condition an earlier decision relied on, such as an approach face or an acquisition time. When the current design leaves the accepted range, the check reopens the phase that chose the premise instead of passing the layout.

## Contents

- [Register a premise](#register-a-premise)
- [What reopens, and where](#what-reopens-and-where)
- [Clear a hold on a later version](#clear-a-hold-on-a-later-version)
- [Move a file the held receipt names](#move-a-file-the-held-receipt-names)
- [Resume a held delivery position](#resume-a-held-delivery-position)

## Register a premise

Use the machine-readable phase names `conceptual-design` and `preliminary-design`. Register each premise under `premises` in the plan.

- Its acceptance record gives a named scenario, a unit, a source, a numeric interval or categorical condition, the affected groups and the phase that chose it.
- Its current observation gives the same identity and unit, the plan's `issue` name and the actual field that holds the value in a source measurement.
- The `issue` name binds the observation to this design. A record may still repeat a digest of the design or the STEP, and a repeated digest that differs leaves the premise provisional.

The scenario text is part of the identity. The observation, the upstream evidence and a held acceptance that predates `fieldInput` must repeat it exactly.

To let the wording follow a revised condition, add the same short `scenarioId` to each record. When both records declare a `scenarioId`, the IDs decide and the `scenario` descriptions may differ. When either lacks one, the exact text still decides.

The receipt lists `scenarioId` with the premise, the observer's wording as `observedScenario` when it differs, and both wordings of a resumed hold under `scenarioRevised`. Two different IDs keep any hold open and are named in `missingInputs`. A hold recorded without a `scenarioId` keeps its exact-text rule.

Unknown data, or an observation made on an earlier `issue`, leaves the decision provisional. The synthetic example accepts the front approach and a 2–3 s acquisition only for its selected cycle.

## What reopens, and where

| Finding | Reopens | Do this |
| --- | --- | --- |
| A nominal clearance violation | **Preliminary design**, for the moving groups and their neighbours | Move or reshape the layout. Rerun those paths and the control |
| A premise chosen in conceptual design leaves its range, such as a side approach in place of the front approach, or acquisition above 3 s in the example | The **conceptual design trade study**, for the dependent interfaces | Check in with the user. Rerun the matched field route with the revised capability and compare the objective and the time reserve |

Work that depends on the reopened premise waits. Independent work continues against its own verified interfaces.

## Clear a hold on a later version

Keep the held receipt in the design's folder and pass it on the next check:

```sh
node scripts/design.mjs preliminary-check PROJECT revised-layout.json --previous held-layout.json --require-checked
```

The check repeats the affected cases. For a held field premise it checks the current plan and the original registered actor, match and input, replays the named first-party field profile and compares the full saved result. The held receipt passed with `--previous` identifies the held plan. An upstream decision may still repeat its digest as `previousPlanSha256`, which is then compared.

Supported replay inputs are a named program step's dwell, a named scoring step's delivery stand-off, robot speed, height and heading, and a modeled front pickup mouth. An independently chosen different face needs a rehearsal that represents it. An unsupported repeat stays open.

The project chooses the duty, threshold and acceptance of the resulting field strategy. A first check with no prior receipt cannot clear an earlier hold.

A field replay clears only a `conceptual-design` hold. Clearance, weight and voltage holds in preliminary design clear through their own repeated cases.

## Move a file the held receipt names

A held receipt records each premise acceptance and its evidence by project-relative path and the SHA-256 the check read. No author types a hash for this: `relocations` maps an old path to a new path. If the project later moves one of those files, declare the move on the revised plan:

```json
"relocations": {"premise-delivery-accepted.json": "experiments/premises/premise-delivery-accepted.json"}
```

- The check follows a relocation only for a file read from the held receipt: a held premise acceptance, or the evidence an older held acceptance cites.
- It follows it only when the file at the new path has exactly the recorded SHA-256. A relocated file with different bytes leaves the hold open with `Relocated held file OLD -> NEW does not match its pinned SHA-256`.
- Each followed relocation is recorded on its prior decision under `relocated` and in the receipt's `heldRelocations`, with the old path, new path and hash, whether or not the hold clears.
- A new path must stay inside the project.
- A relocation is rejected when it names a file that the revised plan or its premise records name, or when no `--previous` receipt is supplied.

Without `relocations`, a moved held file stops the check.

## Resume a held delivery position

When the held premise is the distance the robot delivers from, move that scoring step in the field profile, then rerun the match series with `scripts/rehearsal-series.mjs`. Check the run for [permanent robot wait cycles](match-series.md#find-and-resolve-robot-wait-cycles) before relying on its result.

Register the premise in inches (`"unit": "in"`) and name the step in `fieldInput`, identically in the original and repeated decisions:

```json
{"match": "trial-1", "actor": "B1", "input": "stepPosition", "period": "Main play",
 "stepIndex": 1, "stepLabel": "Deliver to bay", "station": "blue-bay"}
```

The upstream `fieldReplay` adds the `profile` and saved `result` to the same fields. The check reproduces the full saved result, then resolves the step for that robot's alliance and slot on the same profile. All of these must hold:

- The step is a scoring `attempt` at the named scoring station.
- The premise value equals the planar distance from the resolved point to the station's center, within 1e-6 in.
- The rehearsal's own wall and obstacle test clears the robot footprint at that point in the match setup.
- In the saved match the robot delivers at least one carried piece at that station during the named period. The game records a delivery only from inside the station's release radius or area.

A displaced, blocked or out-of-station position, a different step or station, or another unit leaves the hold open. Inspect a step directly with:

```sh
node scripts/rehearsal-step-pose.mjs PROFILE.json trial-1 B1 "Main play" 1
```

The stand-off is a center-to-center planar distance. It does not represent approach heading, release height or mechanism reach.

### A hold saved before `fieldInput`

A held delivery-position acceptance saved before `fieldInput` records may still name its step in its own `source`, under `fieldReplay` or `fieldInput`. The check derives the held input from that evidence.

The evidence must name the same match, actor, period, step index, step label and station as the `stepPosition` repeat, with the same value types. It may also name the input and a `program`, and nothing else. A named program must be the one the actor runs in that period of the saved result. Every named step record must agree, and the held and repeated premises must share a scenario and unit.

When nothing in the evidence identifies the step, the hold stays open and the receipt lists `Held premise ID predates fieldInput and its evidence does not identify the step`. A record naming a different step lists `evidence identifies a different field step`.

### A hold that names no single step

A generic held premise names no step. Its evidence might be the whole field profile. It needs a series-wide repeat that names only the actor and scoring station:

```json
{"input": "stationPosition", "actor": "B1", "station": "blue-bay"}
```

The revised premise carries its own unit and range, in inches from the station center. The held premise may use another unit or reference, and the check does not compare values between the two premises. It compares the premise ID, phase, scenario and held plan. The saved series result must reproduce exactly.

Every scoring attempt that actor's programs make at that station, in every period of every series match, must stand off within the revised range and leave the footprint clear. In each match where the actor attempts there, at least one attempt must deliver a carried piece. Attempts that find no cargo after a supply empties count for position but not for delivery.

Each failure is listed with the prefix `Station replay:`, naming the match, period and step where it applies. A premise accepted with this `fieldInput` repeats the same way. A single-step `stepPosition` repeat cannot clear a generic premise. List the attempts directly with:

```sh
node scripts/rehearsal-step-pose.mjs PROFILE.json --station B1 blue-bay
```

The repeat covers the series the project already saved, so that series sets its cost. Keep the series as short as the premise needs.
