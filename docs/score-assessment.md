# Assess one released piece across a clock boundary

A robot can release a piece before its powered period ends, reach a target later and receive a detector result later still. Record those times on the same continuous clock. The field lab can apply the points from the governing period when the observation becomes available.

## Set the clock and target rule

Use the project's release-day manual to set the powered periods. Add `passiveAfterS` to a period only for an actual unpowered interval on the modeled clock. Other robots can continue their next-period actions during an overlapping assessment window. Powered period durations still match the scoring clock.

The following synthetic example gives a tile released before 10 s until 11 s to satisfy a seating criterion and until 12 s for the result to arrive. The final project profile supplies the target definition, period points and the full SHA-256 of its rule source.

```json
{
  "schema": "field-rehearsal/score-assessment@1",
  "clock": "training match seconds",
  "rules": [{
    "id": "opening-seat", "phase": "Opening", "target": "blue-bay", "category": "seated",
    "fromS": 0, "actionUntilS": 10, "passageUntilS": 11, "observationUntilS": 12,
    "attributeTo": "release", "ruleSha256": "SHA256",
    "source": {"file": "rules/edition.pdf", "sha256": "SHA256"}
  }]
}
```

Store this object in `rehearsal.scoreAssessment`. Times are absolute seconds. The action window includes its start and excludes its cutoff. Passage and observation deadlines include their endpoints. Choose `attributeTo: "passage"` when the edition awards the points of the period containing the physical criterion. If target entry must precede deactivation, set `entryUntilS` and report the observed `entryS`. A station with `activeWindows` also needs `checkActivityAt` set to `release`, `entry` or `passage`. A window conditional on an unresolved period leader stays unresolved in the physical evidence review.

## Register the observations

1. Run `node PLUGIN/scripts/score-observations.mjs PROFILE.json --contexts` to obtain the context digest for each match. It covers the field, programs, timing rules, roster and setup. Changes to that context require re-registration.
2. Add a pinned `scoreJournal` with `file` and `sha256` to the match in `rehearsal.series.matches`. Keep paths relative to the profile. Use journal schema `field-rehearsal/score-journal@1`, its `contextSha256`, original `scenario` (match ID), `clock`, `setup`, exact `roster` and an `attempts` array. Each attempt pins a `release` file and, if available, an `observation` file.
3. A release uses schema `field-rehearsal/piece-release@1` and supplies its unique `id`, rule ID in `rule`, `robot`, finite `piece`, `target`, `category`, `scenario`, `clock` and `releasedS`. An observation uses schema `field-rehearsal/criterion-observation@1`. Supply the same actor, piece, target, category, scenario and clock, plus `releaseId`, `releaseSha256`, `result` (`met`, `failed` or `unknown`) and `observedS`. A met criterion requires `passageS`. Include `entryS` for a required entry cutoff.
4. Each mapped file retains its original `sources` as file and SHA-256 references. Bind `piece`, each supplied time, and the observation's `result` to JSON pointers in those sources. For example, `"witnesses":{"piece":{"sha256":"SOURCE_SHA","pointer":"/piece"},"releasedS":{"sha256":"SOURCE_SHA","pointer":"/release/time"}}`. A boolean predicate maps true to met and false to failed. If the same piece returns, list its releases in order. Identify the previous release with `previousReleaseId` and corroborate its intervening `reacquiredS` from the custody trace. A missing passage or incomplete physical trial can retain a release with no observation. Keep derivatives, clock offsets, target registration, prior conditions and the calculation behind each predicate in the project.
5. For a target with finite capacity, its seat is occupied when the measured article passes the criterion, even if the score arrives later. Record and corroborate `vacatedS` when the article leaves. Another article can reuse that place after the observed departure. Conflicting claims on a full target, including simultaneous arrivals without enough seats, require reconciliation.
6. Run `npm run score:review -- PROFILE.json` from the plugin checkout or call the installed script directly. The report distinguishes the observed criterion and its scoring attribution. Use the ordinary kickoff, series or strategy commands to replay the match. On a registered timing rule, the live scoreboard updates only when the same robot releases that actual held ID in the matching simulation tick and the qualifying observation arrives. An edited roster or a missed release cannot borrow a previous run's points.

Projects can retain their existing prescribed scoring behavior without registering delayed assessments. Treat a modeled detector result as evidence for its particular execution. Whole-robot traffic, feasibility, official scoring and physical testing have independent evidence requirements.
