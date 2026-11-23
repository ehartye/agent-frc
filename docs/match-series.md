# Rehearse a series of complete matches

To compare continued piece scoring with a timed change to a final objective, register the project’s approach sites, shared capacity and terminal conditions. [Terminal objectives](terminal-objectives.md)

Define representative behavior for each robot in each period, including likely partners and opponents. Record where the assumptions come from. Test contrasting opening and driver-controlled choices, start each match with fresh stock and record traffic, waits and provided opportunities. Use a separate independently observed scoring criterion when reporting design results.

The [training profile](../examples/kickoff/training-field.json) includes two alliances, finite stock, two periods and three different complete matches. In **Rehearse a match**, choose **Published scenarios** to run the project’s registered lineups or **My roster · 3 matches** to repeat your current setup. Press **Play match series at 10×**. Each student match starts with the same roster, period behaviors, obstacle setup and fresh stock. Removing every robot lets you observe an empty field for three full matches. **Reset match** restores your editable lineup at the opening clock, even after watching a published scenario. **Save rehearsal snapshot** records the source and results for your narrative. Blue and red rosters remain grouped while students add and remove robots. Each circle or rectangle shows an eligible action region. Source marks and counts show aggregate supply. The robot's carried count moves with its footprint. The numbered station key shows supply remaining or pieces attempted. Select a station in the accessible legend to isolate its marker. A scoring station with a finite `capacity` records excess transfers as occupied, awarding zero points for those pieces. Credited pieces release their slots when they return to play. Playback advances the ordinary collision kernel at its original fixed step.

Run the same schedule from the installed plugin:

```sh
node <plugin>/scripts/rehearsal-series.mjs <project>/kickoff/rules-model.json results.json
```

In the project's `rehearsal` model:

| Input | Meaning |
| --- | --- |
| `stations[]` | Give each a unique `id`, `label`, `kind` (retrieval or scoring), `side` (blue, red or both), `piece` type, absolute field `at:[x,y]` and positive `radiusIn` around the robot center. Optional `areaIn:[[xmin,ymin],[xmax,ymax]]` replaces that circular eligibility test. Use `displayAt` for a physical goal away from its legal approach. |
| Retrieval | `stock` counts individually identifiable pieces at kickoff, including stock reserved for preload. Use separate station IDs for distinct field areas or piece types. |
| Scoring | `points` is a nonnegative integer or a map of period names to points. State the modeled `criterion`. Optional `activeWindows` list `phase,fromS,toS` with an inclusive start and exclusive end. Optional `firstPeriodLeader` conditions the window on an alliance's first-period credited piece count. Enter a match `tieWinner` for a determinate tie decision. |
| Program action | On an existing arrived waypoint, after its dwell, set `station` to an ID or a `{blue,red}` ID map, `operation` to acquire or attempt, and optional positive `quantity`. An attempt may prescribe `outcome` as credited, missed or unresolved; the default is unresolved. Alliance, compatible cargo, actual position and target activity still gate it. |
| Stock return | A scoring station may declare `returns:{missed:{station:"loose-supply",delayS:1}}` and equivalent entries for credited, inactive or unresolved attempts. The same piece ID becomes available after the configured active-clock delay. A piece with no declared return stays at its terminal outcome. |
| Match series | `series.matches[]` lists `id`, behavior `basis`, obstacle `setup` and `roster`. Each robot has a `side`, `slot` and `plans` keyed by every configured period name. Optional `capacity` (default one) and `preload:{station,quantity}` define its opening load. |

The JSON receipt includes every match, period cutoff, robot position/waits, station events with piece IDs, pending returns, remaining stock and modeled alliance scores. One robot cannot take pieces already acquired by another. Existing profiles without stations retain their unscored traffic rehearsal. To use an old profile in a complete student series, declare the periods, likely behaviors, game stock and stations that the project can support. A missed shot, inactive target and unresolved outcome are recorded separately. No projectile, grip-force or sensor model is inferred from a prescribed action.

## Find and resolve robot wait cycles

Two robots can block each other permanently. A move that would touch another robot is rejected for that tick, and the route planner steers around walls and obstacles but not around robots. When two routes meet head-on, or several robots each wait on the next, every member's next move is rejected again, and the cycle holds until the period ends. **Existing rehearsal results can contain these permanent cycles.** A result containing one understates what those robots would do, because a driver would steer around the other robot. Exchanging the duties of two adjacent start slots is a common cause.

Each `rehearsal-series.mjs` run reports every robot-to-robot wait cycle that holds for at least 1 s of active clock. Each report line names the match, period, robots, start time, duration and whether the cycle cleared or held to the period end. The lines go to standard error, so a successful run can now print there, and the saved result bytes do not change. Other tools that run the rehearsal engine do not print these lines. To count the cycles behind a held series result without replacing it, run:

```sh
node <plugin>/scripts/rehearsal-series.mjs <project>/kickoff/rules-model.json --report-deadlocks
```

The `agent-frc/rehearsal-wait-cycles@1` report lists `cycleCount`, `permanentCount`, `matchesWithCycles` and each cycle. It also gives the `resultSha256` of the series result it describes, so you can match it to a saved file. With an `OUTPUT.json` argument the result is still written there.

To let the rehearsal resolve cycles, set `"waitCycles": "yield"` in the `rehearsal` model. After a cycle has held for 1 s, the member latest in roster order (blue before red, then by slot) replans around every other robot's current footprint. If it cannot reach its destination, the next member tries. Earlier members keep their routes. Each period that yields records `deadlocks` entries with the cycle, its start, the yield time and the robot that yielded (`null` when no member could detour). The yield is a planning convention, not a model of driver negotiation.

Opting in changes the profile bytes and the series result for any match with a cycle. Re-run the series, review the new outcome and re-accept any field premise that depends on it. A series without cycles produces the same matches with only its profile hash changed.
