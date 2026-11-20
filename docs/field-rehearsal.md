# Rehearse a match with occupied robot footprints

The field lab reads a rehearsal description from a project-owned rules model. Use it to compare routes, traffic, lost time and available space before the team chooses a match role. The simulation runs locally in the generated HTML.

## Prepare the external project model

From the team project, pass its own profile to the installed kickoff CLI. Save generated rules and student records with the project. The kickoff guide covers the surrounding workflow. [Project rules model](project-rules-model.md) · [Kickoff field lab](kickoff-field-lab.md)

The optional `rehearsal` section in a profile uses `schema: "field-rehearsal/v1"`. All field coordinates, robot dimensions and obstacle heights are in inches. A complete invented example is available for studying the format. [Training field](../examples/kickoff/training-field.json)

| Model property | What the project supplies |
| --- | --- |
| `basis`, `boundsNote`, `sources` | Source edition and references, geometry assumptions and unresolved dimensions |
| `planes` | Named inward boundary half-planes with an on-plane point `at` and normal `inwardDeg`. These clip the rectangular field extents |
| `obstacles`, `setups`, `bands` | Convex polygon footprints and lowest occupied height, either constant or keyed by setup name. The ground-based solid robot reaches that height when its height equals or exceeds it. Bands are visual references. The field’s existing landmark polygons also occupy floor space |
| `starts`, `mirror` | Three first-alliance start centers and explicit second-alliance X/Y reflections |
| `periods` | Ordered named periods with active duration in seconds on a 0.05-second grid. The rehearsal must cover each scoring phase in order for its full duration when the project supplies a scoring clock |
| `defaults`, `programs`, `resourceLabel` | Trial frame, fixed heading, bumper projection per side, speed, and one initial program selection per start slot. Programs prescribe waypoints and optional service pauses, with optional per-period overrides. Shared-resource steps queue by robot ID when requests are simultaneous |

A waypoint’s `at` may be an alliance-frame point, a `default` point with numbered `slots` overrides, or explicit `blue` and `red` points. Set `frame: "field"` for coordinates already in the common frame. Use `dwell` for seconds of service and `straight` for a mandatory direct leg. Set `lock: true` for the default shared resource or `lock` to a specific resource name. Keep that lock on the final reserved leg and set `release: true` when the robot vacates it. Different resources keep independent request queues. A completed `loop` program repeats. A non-looping program holds at the last destination.

Matching period and scoring-phase names share the clock automatically. To split a scoring phase named `Main play` into separate robot programs, give each consecutive period `"scoringPhase": "Main play"`. For a 45-second phase, a 30-second collection period and a 15-second delivery period use the entire budget. Choose a distinct period name for each behavior. A project with only a rehearsal can supply its own clock.

## Run the rehearsal

1. Open **Rehearse a match**. Both alliances field three robots. The six cards show the opening assignment for each teammate. Expand a card to change a period behavior, copy the trial box, or adjust its speed and bumper. Set the project’s preferred six roles in `defaults.roster`, or use the first published match. Older partial presets inherit the missing numbered slots from `defaults.orders`. Use `createProbe` only for a separately identified clearance experiment.
2. **Play match** runs the six robots and the live scoreboard through the periods. Open **Playback and match setup** to step one second, stop at a period boundary or play a match series. Pose, stock and cargo carry into the next period. Ordinary awards appear when a named piece meets the modeled criterion. Terminal awards wait for the assessment.
3. Save a rehearsal snapshot. The narrative download includes the roster, dimensions, behaviors, active time, requests, waits, blocked poses and high-wait areas. **Reset match** replays the same configuration from the start so students can compare a revised plan.

## Place and serve finite pieces

Give each retrieval station its total initial `stock`. Each unit receives a stable ID. Preloads draw from that stock. A fixed rack can keep its stock at the station. For loose pieces add `floor` with positive `radiusIn`, `positions` in field inches and an optional `captureReachIn` beyond the robot perimeter. Supply one position per unit, or one per remaining unit after preloading. Positive `heightIn` and `massKg`, nonnegative `dragInS2`, and `restitution` between zero and one override the teaching assumptions printed below. The simulator resolves planar bumper, piece, boundary and obstacle contact. Fast or tilted vertical motion and autonomous sensing need separate evidence.

For a staffed source, use `service` in place of `floor`. Supply an `operator` ID, permitted `phases`, positive `secondsPerPiece`, a field-space `outlet`, the piece radius and positive `capacity` for ready stock. Off-field units become available one at a time at the outlet. Stations with the same operator take turns after each completed job. Different operators work in parallel. Jobs interrupted by an ineligible period release no stock. Each station displays ready and reserve counts. Identify service time, capture reach and material properties as sourced values or assumptions. The motion defaults use height equal to the diameter, mass 1 kg, drag 18 in/s² and restitution 0.22.

List additional, role-compatible retrieval IDs in an acquisition waypoint’s `openingAlternatives` when the robot can use multiple sources. The opening assignment matches distinct available IDs to feasible first pickup steps. Compare who can reach a source within its clock and who can instead work from a preload or cover a lane. Traffic or displacement can still prevent a planned pickup. The ledger debits current custody at each acquisition and release. An explicit, timed `returns` rule is required before the same identity can reenter supply. A return onto the floor also needs `at` coordinates. An unlocated miss stays out of play.

A project may route a returned piece to the other alliance’s staffed retrieval station. If the human can score there, configure `service.delivery` with a registered `station`, a project-prescribed `outcome` and its `basis`. The operator consumes that same named piece upon completing the job in an eligible period. A credited result uses the destination’s own points, capacity and active window. A missed or unresolved result earns zero. This is an adjudicated scenario for comparing roles, and its outcome requires independent evidence.

## Interpret a result

The model translates fixed-heading rectangles. The swept footprint includes the bumper allowance. It checks clipped walls, eligible polygon obstacles and moving robots across every segment of a 50 ms step. An approaching robot waits if it cannot claim a collision-free move for the entire tick. On free-route legs the planner can bend around known obstacles. A prescribed direct leg must clear the course as written.

If the loaded robot turns near a wall or structure, trace the rotating bumper corners, carried piece and moving mechanisms across each turn on the same clock as the target event. A piece can reach the detector after the robot has already intersected the field. Carry both findings into the project record. [Verify continuous field-route clearance](field-route-evidence.md).

A reported wait can reflect a narrow opening, mutually blocking behaviors or conservative right-of-way. Each trip counts a completed prescribed task. A score requires additional evidence about game-piece possession and successful release. Acceleration, turning sweeps, mechanism articulation, collision loads and damage need their own experiments. Unknown field contours should be marked as assumptions and modeled conservatively in the external profile.

For a directional collector, set the project robot’s `intake` to `{widthIn, extensionIn}` and specify its heading. Each physical acquisition leg seeks a released piece at its assigned source, with one reservation per robot. The gold intake line marks the front roller, and the ring marks the targeted piece. On contact, the event records the piece center and intake segment, transfers that ID to cargo, and seeks the next one until the requested batch or hopper is full. Empty sources and blocked approaches can cost match time.
