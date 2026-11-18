# Check whether a recorded game piece can reach a target height

Use this screen after a simulated game piece has separated from the robot. With gravity as the only remaining force, its current height and upward speed give an upper bound for its future center height. Add a bounding radius to obtain an optimistic whole-piece upper bound. A piece already descending reaches its highest future point at the recorded sample.

Save the unchanged model and a trace containing a `samples` array. Each selected sample supplies `position`, `velocity`, `gravity` as XYZ arrays, `units: "m,m/s,m/s²"`, `frame`, `datum`, `boundingRadius`, `contactFree` and `gravityOnly`. Verify the source basis for the contact and force declarations. Use metric Z-up coordinates.

Create a request with `model` and `trace` file paths and SHA-256 digests, a zero-based `sampleIndex`, and a `target` object. The target contains `units: "m"`, `lowerEdge`, `uncertainty` (or null), its source `locator`, `frame`, `datum` and `registration` (`registered`, `assumed` or `unresolved`). Run `npm run release:height -- request.json`.

A negative margin places the entire piece below the lowest plausible edge under the declared assumptions. A nonnegative margin leaves passage, sensor sequencing and scoring open. A conditional floor datum stays visible in the output. Mismatched frames or ongoing contact leave the height comparison unresolved.
