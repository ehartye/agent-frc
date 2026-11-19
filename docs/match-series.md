# Rehearse a series of complete matches

Define representative behavior for each robot in each period, including likely partners and opponents. Record where the assumptions come from. Test contrasting opening and driver-controlled choices, start each match with fresh stock and record traffic, waits and provided opportunities. Use a separate independently observed scoring criterion when reporting design results.

The [training profile](../examples/kickoff/training-field.json) includes two alliances, finite stock, two periods and three different complete matches. Open the kickoff field lab, choose **Rehearse a match** and **Play match series at 10×**. Blue and red rosters remain grouped while students add and remove robots. Each circle or rectangle shows an eligible action region. Source marks and counts show aggregate supply. The robot's carried count moves with its footprint. The numbered station key shows supply remaining or pieces attempted. Select a station in the accessible legend to isolate its marker. A scoring station with a finite `capacity` records excess transfers as occupied, awarding zero points for those pieces. Credited pieces release their slots when they return to play. Playback advances the ordinary collision kernel at its original fixed step.

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
