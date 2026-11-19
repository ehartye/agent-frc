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

1. Populate either alliance with up to three robots. Select their behavior for each active period. The default uses the first slot on each side. **Use trial box** copies the editable frame dimensions, height and heading to that robot. Set its assumed bumper projection and speed.
2. Choose the modeled obstacle setup. Start, pause, step one second, or run to the period end. The scene also reports blocked paths and waits per robot. The clock freezes at each deadline. Starting the next period retains the frozen poses. An assessment delay after a period adds no active driving time.
3. Save a rehearsal snapshot. The narrative download includes the roster, dimensions, behaviors, active time, requests, waits, blocked poses and high-wait areas. **Reset match** replays the same configuration from the start so students can compare a revised plan.

## Interpret a result

The model translates fixed-heading rectangles. The swept footprint includes the bumper allowance. It checks clipped walls, eligible polygon obstacles and moving robots across every segment of a 50 ms step. An approaching robot waits if it cannot claim a collision-free move for the entire tick. On free-route legs the planner can bend around known obstacles. A prescribed direct leg must clear the course as written.

If the loaded robot turns near a wall or structure, trace the rotating bumper corners, carried piece and moving mechanisms across each turn on the same clock as the target event. A piece can reach the detector after the robot has already intersected the field. Carry both findings into the project record. [Verify continuous field-route clearance](field-route-evidence.md).

A reported wait can reflect a narrow opening, mutually blocking behaviors or conservative right-of-way. Each trip counts a completed prescribed task. A score requires additional evidence about game-piece possession and successful release. Acceleration, turning sweeps, mechanism articulation, collision loads and damage need their own experiments. Unknown field contours should be marked as assumptions and modeled conservatively in the external profile.
