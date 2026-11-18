# Could the robot reach this scoring event?

A detector can register a piece even if an earlier command drove the simulated robot through a wall. Record what the detector saw. Check the occupied route from the start of the mission to the event before using that event to compare strategies.

```sh
node examples/field-route/make-example.mjs artifacts/route-example
npm run field:route -- artifacts/route-example/request.json
```

The example checks an invented carriage and parcel passing a post. All dimensions are metres and times are seconds on one clock. Each six-number box gives minimum X, Y, Z followed by maximum X, Y, Z in the installed field frame.

Each detector, swept-enclosure or refinement document includes a `sourceEvidence` file reference and SHA-256. Keep the original observations, trajectory bounds or native solver output so a reviewer can reproduce or challenge the reported figures.

| Project file | What to record |
|---|---|
| Scenario | Pin the field, robot, transform and trajectory files by SHA-256. Name every robot body, placed obstacle and piece. Set the mission start, clearance margin and nonoverlapping time intervals. Split at each change in carried inventory and at scoring observations where possible. |
| Detector | Bind the scenario digest and clock. Give each observed event a distinct ID, piece and time. Preserve the original detector evidence and distinguish one continuous occupancy from a new entry. Apply the project's actual scoring rules separately. |
| Swept enclosures | Bind the same scenario and clock. Give continuous field-frame bounds covering every expected moving body, carried piece and obstacle for each full interval. Include moving obstacles over that time. Endpoint boxes alone can miss a collision during rotation or articulation. |
| Refinement | For overlapping bounds, attach a pinned JSON record with the scenario digest, clock, backend, moving body, obstacle, interval and method. A continuous lower bound above the margin clears the pair. A measured positive material intersection above tolerance records the time, pair and volume. An unexamined part of an interval keeps the result pending. |

Use `continuous-lower-bound` with `minGapM` for a complete pair interval, or `material-intersection` with `timeS`, `volumeMm3` and `toleranceMm3`. For intentional compliant contact, declare the pair and limits in the scenario's `contactResponses`. Supply a `coupled-contact-response` refinement with the same trajectory digest, a pinned `dynamicsEvidence` file, a named `contactModel`, `completeInterval`, `continuationIntegrated`, and the measured `maxPenetrationM` and `maxResidualM`. Review the external solver and verify that its response actually produced the later trajectory.

The result retains every detector event and reports its route as supported, pending or infeasible. It lists missing registration, unresolved intervals and identified contacts. A collision on a later leg leaves an earlier verified event intact. Review the producers' geometry, transforms, time coverage and detector calibration before using their bounds. [Invented example](../examples/field-route/make-example.mjs) · [Field rehearsal](field-rehearsal.md) · [Sensor evidence](sensor-observability.md)
