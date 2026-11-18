# 2026 nominal phase and interior FUEL assessment

This **separate, conservative rules adapter** evaluates supplied hypothetical passage events. It does not change the abstract comparison harness, turn releases into scores, or insert scoring claims into comparison-run evidence.

```sh
npm run assess:fuel -- case-studies/2026/fuel-assessment-example.json
```

JSON is written to stdout only. No field connection, robot IO, network retrieval or source-document redistribution occurs.

## Exact source and supported facts

Authority is the [2026 Game Manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf), TU22, 166 pages, SHA-256 `5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139`, as already fingerprinted in this repository. The adapter checks this exact metadata pin; it does not redownload or authenticate bytes. Event applicability remains unverified.

- Sections 6.4/6.4.1, pp44-45: AUTO is 20 seconds. TELEOP segments last 10/25/25/25/25/30 seconds. Both HUBs are active in AUTO, transition and endgame. Intermediate availability alternates according to the externally supplied first-inactive alliance.
- Sections 6.5/6.5.1, pp45-46: FUEL passage involves both the top opening and sensor array; assessment continues for specified three-second intervals after deactivation or period end.
- Section 6.5.3, Table 6-4, p47: active-HUB FUEL contributes one point; inactive-HUB FUEL does not contribute points.

The implementation intentionally supports less than the full rules. Exclusion is not a claim that the excluded event cannot score.

## Clock semantics

`phaseAt(timestamp, context)` requires a period (`AUTO` or `TELEOP`), nonnegative integer `elapsedMs`, `clockBasis: nominal-scenario`, `eventApplicability: unverified-archive`, the rule pin and `firstInactiveAlliance: RED | BLUE | UNKNOWN`.

Clocks are period-local. AUTO at 21 seconds is outside its nominal period, **not TELEOP at one second**. The adapter does not determine synchronization, enabled state or the AUTO winner. It never chooses a random tie result or guesses missing FMS selection. UNKNOWN produces unknown HUB availability during alliance shifts, but does not obscure always-active phases.

Phase intervals use half-open boundaries for deterministic lookup. The event assessor separately excludes exact phase boundaries rather than asserting how real sensor/timer simultaneity is ordered.

[WPILib's 2026 game-data documentation](https://docs.wpilib.org/en/stable/docs/yearly-overview/2026-game-data.html) explicitly describes the robot's match time as approximate. [FIRST's timing postmortem](https://www.firstinspires.org/community-blog/2026-newton-match-timing-what-happened-and-whats-next) documents departures from nominal timing. Neither is a justification for treating these synthetic timestamps as observed field data.

## Event and coverage semantics

`assessFuelPassage(event, context)` requires passage/piece IDs, a HUB alliance, hypothetical evidence references and explicit top-entry and sensor-passage timestamps. These are assertions in a synthetic test, not measured trajectories. Only `basis: hypothetical-external-event` is accepted.

- Sensor passage must strictly follow top entry within the same period.
- Both timestamps must lie in the same exact phase, not merely phases with the same availability.
- Exact phase boundaries, phase crossings and post-period events return unsupported/null.
- An active-phase interior returns a conditional contribution of one.
- An inactive-phase interior returns zero only after the newly inactive HUB's three-second exclusion region. The other, newly active HUB is not excluded.
- The exact grace endpoint is also excluded conservatively; this is our scope choice, not an official timing interpretation.
- Missing/corrupt timestamps, cross-period pairs, invalid context or changed rule pins are rejected rather than repaired.

No arbitrary processing delay is inferred. The [official counter assessment](https://firstfrc.blob.core.windows.net/frc2026/FieldAssets/2026-fuel-counter-assessment.pdf) describes observed processing delays and counter issues, not a guaranteed per-piece delay for every event.

## Hand-calculated independent-review vectors

With RED first inactive, times below are TELEOP-relative seconds:

| HUB | Top entry | Sensor passage | Contribution | Reason |
|---|---:|---:|---:|---|
| RED | 11 | 12 | null | Newly inactive grace region |
| BLUE | 11 | 12 | 1 | Newly active phase interior |
| RED | 14 | 15 | 0 | Inactive, beyond grace |
| RED | 36 | 37 | 1 | Newly active phase interior |
| BLUE | 36 | 37 | null | Newly inactive grace region |
| BLUE | 39 | 40 | 0 | Inactive, beyond grace |
| BLUE | 9 | 11 | null | Crosses phase identity despite active status |

These expectations were independently reviewed before implementation. Tests also check mirrored alliance selection, all phase boundaries, UNKNOWN, malformed data and period separation.

## Ledger and limits

`assessFuelLedger` retains every unsupported event and reason, rejects duplicate passage IDs, and reports `supportedEventSubtotal` alongside unresolved counts. Different passages of the same piece are allowed for recycling. No inventory linkage or physical event authenticity is established.

The subtotal is **not a match score, predicted performance, complete FUEL total or lower bound**. Match score, ranking points and win probability remain null. The ledger does not assess launch legality, penalties, tower scoring, disqualification, human-player rules, geometry, trajectories, sensor failures or real-time FMS behavior.

The ledger has a 10,000-event bound, input digest and normalized model-source digest. The graph-linked abstract comparison remains a different evidence type/model with null scores. Integrating this adapter requires a separately reviewed event producer and evidence contract; there is no automatic mapping from `releasedUnverified` or existing comparison traces.

The [scenario annotation workflow](fuel-scenario-annotation.md) can attach this assessor's complete hypothetical ledger to an exact experiment/scenario, with independently supplied passage hypotheses and exact source pins. It does not derive passage events from comparison releases, add run scores or rank designs.
