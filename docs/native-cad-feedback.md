# Native CAD verification lessons and tooling backlog

These are reusable CAD verification requirements, not implemented native-CAD capabilities of the portable blockout CLI. Keep project CAD, receipts and measurements in the consuming project; this plugin does not redistribute third-party geometry.

## Audit mounting interfaces separately from motion

A clear moving mechanism or game-piece path does not establish a sound static assembly. Inventory all cartridge, carrier, support, plate, bearing and pulley interfaces. Preserve raw baseline contacts, identify intended mates separately from unexplained interference, and compare each affected pair before and after a change. Do not filter away initial contacts merely because the model started that way. Record stable part IDs, source revisions and the exact transform set. A repaired local interface must not silently invalidate another path.

## State exactly what a bound proves

A coarse axis-aligned bound can overestimate curved geometry. Treat it as conservative screening, not a precise small-clearance witness. Record kernel/version, bounding method, triangulation use, shape tolerances, transforms and units alongside any clearance number. When method choice materially changes the result, retain both results and explain the difference. Validate against known geometry and native narrow-phase checks rather than selecting whichever number passes. Uncertain or failed geometry operations must remain unknown/failing, never silently become clearance.

## Sample intermediate poses and preserve counterexamples

Endpoint or a few showcase poses can miss intermediate contact. Specify the sampled parameter grid, omitted ranges and interpolation assumptions; retain failing poses and pair-level evidence. Add negative controls with known contact and clear separation to establish that the checker can distinguish them. A finite sampled sweep is not a proof of continuous clearance, dynamic safety, load capacity or full game-piece variation coverage. Use finer or continuous methods where the acceptance question requires them.

## Make expensive native sweeps observable

Report completed rows/offsets and source-bound partial results during long Boolean batches. Checkpoint the input fingerprint, transforms, completed work, failures, elapsed time and next work unit. Resume only when dependencies still match. Partial progress is not acceptance; cancellation or kernel errors must leave an explicitly incomplete result.

A hollow torus represented only by its outer box can generate many unnecessary narrow-phase calls. Explore a conservative annular broadphase, but prove rejection bounds against containment, tangency, tilt, transform and tolerance cases before relying on it. A part inside the central opening is different from a part inside the outer envelope. Any uncertain case proceeds to native narrow phase. Keep solid-validity and Boolean-result checks after optimization; a speedup must not change pass/fail semantics.

## Actionable plugin backlog

1. Add a reusable all-interface audit contract with baseline and before/after pair records.
2. Add method-qualified bounds and native receipt metadata, with known-shape/negative-control tests.
3. Add a sweep runner with incremental checkpoints, cancellation, fingerprinted resume and explicit incomplete state.
4. Add a proven conservative hollow-piece broadphase with containment and tolerance regressions.
5. Wire these into an optional native backend only after dependency, licensing and host validation. The current JavaScript artifact remains parameterized spatial planning, not a native Boolean engine.

Completion means tested reusable plugin functionality, not a one-off exploratory script or a note in the robot repository. Preserve the distinction between a captured lesson, implemented tool, verified test and released capability.

## Implemented: bounded native-witness receipt checker

Run `npm run native:witness -- receipt.json expected-manifest.json`. This reads only two local JSON files and emits a classification; it never calls a CAD kernel, changes geometry or uploads evidence. Exit 0 means no material overlap above the declared tolerance at the supplied finite witnesses only; exit 1 means declared material overlap; exit 2 means unknown/invalid/stale/incomplete. None means a robot is safe, legal or fabrication ready.

The new `agent-frc/native-witness@1` contract is separate from the unchanged design artifact schema. It requires source pins for trajectory, geometry, transforms and backend; declared expected witness IDs; completion state; kernel/version, bound method, triangulation and shape-tolerance metadata; volume units and tolerance; and per-witness immutable state hash, pair IDs, conservative contact, rotor phase registration, solid validity, Boolean completion and measured overlap volume. The CLI requires an independently prepared `agent-frc/native-witness-manifest@1` document, not expected values copied from the receipt.

A rotating component without phase registration remains unknown even when reported native material volume is zero. The output retains that observed volume without promoting it to a continuous clearance result. A synthetic-test receipt always remains unknown for native qualification. Producer-declared hashes and metadata are not cryptographic proof of a real CAD run: verify original captures, source availability and phase registration separately. A malicious producer could invent a receipt; this checker validates consistency and prevents accidental promotion, not fraud.

The current checker covers one finite receipt. Before/after comparisons, reusable all-interface audits, checkpoints/resume, continuous sweeps and conservative annular broadphase remain backlog. Numerical/native tests are still owned by the producer. Tests here use synthetic receipts and malformed, stale, phase-unknown, incomplete and error counterexamples.

## Continuous feedback loop

At each meaningful native milestone or tool failure, the producing worker sends a compact evidence packet: source commit and receipt, observed friction, generalized contract, counterexample, proposed test and remaining uncertainty. Do not wait for end-of-project cleanup. The plugin worker classifies it as guidance, reusable implementation or unresolved research; implements the smallest portable tested improvement; links it from the relevant skill; and pushes only that scoped change. Keep an explicit status: reported, source-verified, implemented, tested, pushed for review, merged, released. A pushed PR is not an installed capability.

The rotor-phase lesson is implemented as this receipt gate. Its originating design report distinguished conservative filled-envelope stops from native material at sampled source clocking; untracked phase prevents automatic clearance. The precise numerical robot result is intentionally not asserted here without its source receipt. Partial receipt finalization failures must never be treated as accepted evidence; rerun or resume only against pinned complete inputs.

### Earlier receipt-only API boundary

This is a supplied-receipt consistency checker, not a complete trajectory/dependency acceptance gate. Only the four receipt-level pins are compared with independently supplied expected values. Per-witness state hashes and phase-registration hashes are syntax-checked, not compared against an independent state manifest. Witness inventory and volume tolerance remain producer-declared. Do not use exit 0 for automated trajectory adoption. This limitation remains true of the exported `assessWitnessReceipt` compatibility API only. The CLI now uses the stronger independent-manifest assessment below. Neither API authorizes trajectory adoption.

## Implemented: independent expected witness manifest

The CLI now uses `assessWitnessManifest(receipt, manifest)`. Its manifest has exactly `schema`, `pins`, `methodPolicy` and `witnesses`. Schema is `agent-frc/native-witness-manifest@1`; pins retain the four source hashes. `methodPolicy` repeats the seven method fields (`kernel`, `version`, `volumeUnits`, `volumeTolerance`, `boundMethod`, `triangulation`, `shapeToleranceIncluded`) as independently chosen expected values. Every field must match exactly, so a producer cannot quietly enlarge its tolerance or change the bounding method.

Each expected witness has exactly `id`, `stateHash`, `pair` (ordered two-part identity), `rotating` and `phase`. Phase is null when unresolved or stationary, otherwise `{angleDeg, registrationHash}`. Phase angles use [0,360); equivalence/wrapping is not silently inferred. Duplicate IDs are rejected, inventory comparison is order-independent, but pair ordering is intentionally exact. Null phase for a rotating component remains unknown even if the producer agrees.

Prepare and version this manifest from the intended trajectory states, source geometry, transforms and approved numerical policy before running the producer. Independently verify phase registration and digest computation. Do not generate it from the completed receipt: doing so defeats the comparison. The checker catches stale row hashes, swapped parts, changed phase, jointly truncated receipt/inventory, and method/tolerance drift. Incomplete receipts can preserve expected inventory for progress but remain unknown.

This is still a bounded evidence-consistency gate, not verification that the producer ran the stated kernel or that all relevant intermediate states were sampled. Source receipt availability, authentic captures, physically appropriate tolerance, continuous clearance, loads and real game-piece behavior need separate evidence.

## Cross-discipline phase handoffs

Use the [simulator continuation and handoff contract](simulator-equivalence.md) when a modeled contact state becomes a proposed carried pose. Preserve actual state and require geometry corridor, achievable wrench and continuity separately. A local patch or position dwell is not capture. This is source-reviewed guidance; no new contact solver or checkpoint loader is implemented here.

## Boolean and interior-witness disagreement

A valid solid and a completed Boolean operation do not by themselves establish a trustworthy clearance result. If an intersection reports empty material while points classify strictly inside both operands, retain UNKNOWN and archive the exact discrepant case. Distinguish strict IN from ON/boundary/tangent classification. Record point coordinates, frame, inward displacement, classifier tolerance, shape tolerances, kernel/version, operand identity/order, source hashes and transform/phase state. A point displaced from a face is not automatically a valid interior witness; classify it against both actual operands.

Repeat with reversed operands and each source solid where appropriate, preserving all outcomes rather than choosing the preferred one. Reopen the exported geometry and verify its bytes/topology as separate checks. These are cross-checks using the same kernel, not independent physical ground truth. Neither empty intersection nor a contradictory point witness should silently authorize geometry adoption, nor does rigid foam overlap automatically establish an unsafe force.

## Numerically stable conservative bounds

An accepted near-unit direction is not exactly unit length. Validate finite shape/type and a documented nonzero near-unit norm range, then explicitly normalize before projecting. For a ring torus with normalized symmetry axis n, major radius R and tube radius r, its half-extent along coordinate i is R * hypot(the other two components of n) + r. This is the stable equivalent of R * sqrt(1 - n_i squared) + r; subtracting near-equal numbers can lose a tiny but material transverse extent. Clamping a negative radicand to zero does not restore a conservative bound.

Required test contract: near-unit scaling, near-axis positive/negative and permuted components, independently parameterized surface containment, malformed/zero vectors, exact touching and gaps just around the declared numerical margin. A finite surface sample is a counterexample search, not a mathematical proof of global enclosure. Explicitly budget numerical error/margin for the target precision and scale; do not reuse a case-specific numerical margin as a universal tolerance. An overlapping bound remains unknown, and separation from one enclosing representation says nothing about omitted parts, forces or physical qualification.

## Receipt dependency closure includes checking helpers

Pin not only the generator and geometry but imported Boolean, classification, bounds and transform helpers that determine the verdict. Prepare expected dependency inventory independently of the receipt writer. Checking every hash already listed in a receipt cannot detect a missing dependency. Inspect direct/transitive imports and dynamic/configured inputs; bind kernel/runtime versions separately. Prefer a controlled dependency manifest with tests over trusting a manual list or assuming an import scan captures runtime-loaded files.

Negative controls should mutate an imported verdict helper without changing the top-level script, remove that helper from the producer inventory, and change a transform/classifier configuration. Each must defeat freshness/closure checks against the independently expected inventory. This is a required validation contract, not an implemented automatic Python dependency tracer or a claim that regenerated robot receipts have passed.
