# Faster queries, faithful continuation, honest phase handoffs

Status: source-reviewed guidance and test contract, not a new motor model, checkpoint loader or capture validator. The plugin's executable helpers remain separately documented. Use this checklist when optimizing a simulator or moving between experiment phases; preserve student choices about model fidelity and required evidence.

## Pure electrical queries inside a coupled solve

A bus-voltage root search may repeatedly need electrical power without needing a complete mechanical preview for each trial. Extract that smaller query only after tracing which midpoint quantities depend on candidate voltage. Freeze an explicit start-state/configuration snapshot. Recompute every voltage-dependent quantity; cache only quantities shown independent of voltage. Do not infer independence from one nominal trajectory.

Keep the reference implementation unchanged. Preserve root-search domain, grid, branch choice, solver tolerances, domain exceptions and the final coupled mechanical preview. Reducing the root scan or bypassing contact/voltage checks is a different numerical change and needs separate evidence. Commit the explicit implementation, not runtime source rewriting from an exploratory script.

Required test contract:

- Compare query output with the reference across the full configured voltage grid, randomized finite states, signed rotor speeds, drive/coast/brake modes, contact/no-contact and low-voltage boundaries.
- Snapshot plant coordinates, rotor states and cumulative energy before factory construction and repeated queries. Require exact preservation afterward, including failure paths. Also test repeated/reordered queries; a numerical query must not advance time or consume state.
- Compare every full-step row, including coordinates, momenta/velocities, rotor state and energy ledger, not just endpoints or plotted samples. Compare terminal exception type/message and the state remaining after the exception.
- Bind independently enumerated source/configuration/geometry inputs, numerical settings, initial state and both implementations. Record the complete row count and ordered trace digest; a display may decimate rows, but the comparison may not.
- Use exact equality when claiming an algebraically equivalent implementation. If platform arithmetic requires tolerance, predeclare per-field absolute/relative policy and explain the changed claim; never relax it after seeing disagreement.
- Include negative controls: mutate state inside a query, alter an intermediate energy row, truncate both display traces, change a domain exception, or skip the final mechanical preview. Each must defeat the relevant equivalence assertion.

Benchmark only after equivalence passes. Record machine/runtime conditions, repeated timing policy and measured scope. A speedup in one bounded model is not a universal performance promise or physical validation. An unchanged unknown-domain stop remains unknown, not successful acquisition.

## Checkpoint schema and physical continuity

A recursive “every nested leaf is finite” check accepts empty containers and wrong shapes. Declare exact required fields, numeric scalar types (reject booleans), vector dimensions, finite values, coordinate conventions and shared clock. Validate complete cumulative energy fields and initial-energy reference, not just pose. Bind source/model identity and physical configuration against independent expected values before restoring. Do not silently accept a new model because its field names match.

Test round-trip continuation against uninterrupted integration from a nonzero-motion state. Preserve cumulative work/loss accounting across the boundary. Test missing fields, scalar replaced by an empty array, nested vectors, boolean components, wrong vector length, absent energy entries, changed configuration/source identity and inconsistent clocks. Reject before partially mutating a live plant. Checkpoints must be deep snapshots rather than aliases.

## A dwell is not capture

At an acquisition-to-retention handoff, preserve the actual piece position, velocity, spin, rotor phase, clock and energy. A desired indexed position is a controller goal, not permission to snap the piece into a convenient historical contact patch.

Require three separate gates: a complete robot/piece geometry corridor through the next motion; an achievable contact wrench with gravity, commanded accelerations, moments and actuator limits; and state/energy continuity. A finite belt contact patch alone proves none of the other gates. Static lift force is necessary but not sufficient for dynamic retention. A passing geometry witness cannot cure insufficient friction force, and extra numerical stiffness cannot stand in for an actual spring/backing mechanism with measured installed preload and load path.

## Portable source bytes before a run

Hash the bytes actually executed, not a normalized reconstruction. Before a reproducible run, verify intended source/configuration inventory against the committed/indexed bytes under the project's explicit encoding and line-ending policy. Git text normalization and editor BOM changes can make a clean-looking receipt nonportable. Recheck pins after the run. If normalization changes inputs, preserve the old receipt and generate a fresh run; never rewrite its historical pins to fit a new commit. Byte identity establishes provenance only, not physical correctness.

## Moving mass and phase allocation

When unlocking lift/pitch degrees of freedom, partition mechanism mass and inertia out of the chassis representation before adding them to a coupled model. Document which body owns each physical mass, where its center and inertia are expressed, and how constraints change. Preserve world momentum and cumulative energy/work across the mapping; distinguish energy-reference offsets from physical work. Do not add the same moving assembly twice or reset the ledger to hide a jump. If previously constrained modes gain new state, define their incoming velocities and account for any actual impulses or work rather than inventing them.

A fixed-base actuator fixture is not a moving-chassis continuation. Reject moving-base checkpoints at a fixed-base API, or use explicitly coupled generalized dynamics with chassis reactions and a consistent mass matrix. A stationary fixture's reaction load or zero constraint work cannot be silently reused on a translating base. Required negative controls include duplicate mechanism mass, zeroed incoming velocity, cleared cumulative work, an inconsistent reference energy and a moving state passed to a fixed-base step. Compare a mapped continuation against the physical identities before testing a complete maneuver.

## Preload travel is part of the acquisition path

Screen the entire moving cassette, its bearings/pulleys/supports and the piece through advancing feed, not only an already-indexed held pose. Explore preload travel together with piece translation, tolerances and rotor phase. Retain the zero-travel baseline and rejected travel/offset pairs; staged opening/closing needs an explicit controller/contact model, not an assumed collision-free transition. Valid finite patches do not imply holding force, usable preload range or feasible drive work.

## Finite input is not a valid physical domain

Validate exact scalar types before arithmetic: in languages where booleans are numeric, explicitly reject them for physical quantities. Finiteness is necessary, not sufficient. Apply semantic sign/range constraints (for example, positive free length), units, and the model's documented parameter envelope. Do not invent a manufacturing tolerance merely to bound a program input; distinguish a numerical model domain from supplier/measured uncertainty.

Then validate derived quantities as well. Finite inputs can overflow products, squares, accumulated work or division near singularities. Require finite force, energy and other numeric outputs before returning or adopting a state; catch arithmetic exceptions and reject atomically. Keep intentionally unknown outputs explicitly unknown rather than converting them to zero. An error is not permission to reset plant momentum or clear the energy ledger.

Required controls include booleans in each physical scalar, zero/negative values where forbidden, missing/wrong-shaped inputs, NaN/infinity, and finite extreme magnitudes that overflow derived values. Check ordinary boundary/nominal cases still work and, where appropriate, independent force/energy consistency. Require failure before state mutation and before writing an accepted receipt. Test serializing results with nonfinite values disallowed: a permissive JSON encoder must not hide an invalid physical result. These are guidance/test requirements, not evidence of a complete physical model or automatic overflow-proof arithmetic.

## Contact quadrature needs phase tests, not only energy gradients

A force that correctly differentiates a discrete potential can still represent contact poorly. Verify both algebraic consistency and spatial sampling: coarse surface cells may miss a real narrow patch completely, and a shifted material grid may change force even when an axisymmetric body's physical shape is unchanged. Such grid-phase yaw moments are numerical anisotropy, not newly discovered material torque.

Use physical surface-area weights and state the pressure-density units. Keep the quadrature weights attached to their physical cells; do not renormalize remaining active cells to preserve a desired force when contact is lost. Compare integrated area against an analytic/reference surface area where available. Record resolution, material-grid phase, active area, force, moment and potential together. Evaluate refinement AND phase shifts, including finite-height edges and other supported features, at predeclared accuracy budgets. Timestep convergence cannot repair underresolved spatial contact.

Required controls: coarse-grid zero versus refined nonzero contact; phase-shift sensitivity under a physically unchanged shape; equal/opposite wrench and global frame transformation; potential/work finite differences; no active-cell renormalization; and explicit rejection of unsupported contact features. Document which were executed versus proposed, preserve failures, and keep friction, damping, preload equilibrium and actuator reactions separate when absent from the law. This plugin supplies guidance, not the source pressure solver.

## Changing constitutive law changes the continuation problem

Do not silently reuse an old acquisition checkpoint with a different constitutive law. For this workflow, rerun acquisition from the original no-contact initial state under the same new law before claiming a continuous handoff. Any alternative explicit model migration needs independently reviewed state/energy mapping and a physical interpretation; matching endpoint pose or resetting the initial-energy field is insufficient. Preserve old failures and source identities alongside the new experiment. Neither a converged hypothetical law nor a passing energy test establishes a retained game piece or completed robot cycle.

## Accelerate candidate rejection, preserve the exact narrowphase

A vectorized transform can round differently from a scalar transform even when both express the same formula. At a contact boundary, a tiny difference can alter classification and downstream force. For an exact-parity acceleration, use padded vectorized bounds only to reject impossible candidates; recompute retained points with the original scalar transforms, contact helpers and evaluation order. Preserve material coordinates, area weights, grid phase and accumulation order. A faster coarse grid is a different model experiment, not this optimization.

Bounds must enclose the transforms the reference actually uses. If a validated near-unit basis retains a tiny scale, normalizing it only in the broadphase can underbound the reference geometry. This differs from an API whose contract explicitly normalizes its input: follow the narrowphase's coordinate semantics, not a universal normalization rule. State padding/error assumptions and numerical range, reject nonfinite bounds, and retain unsupported deep/cavity/tie outcomes rather than culling them into a false success.

Required test contract: exact reference parity across random rigid frames, accepted near-unit transforms, wraps, caps, separation and near-boundary states; identical domain failures for unsupported geometry; immutable cached material arrays; unchanged source/configuration bytes before and after the benchmark; and full contact plus derived-force/potential/work comparison before timing claims. Include the failed vector-transform implementation as a negative fixture where practical. Distinguish source-test reproduction, receipt verification, fresh benchmark replay and independent review in reports. No accelerated contact implementation is copied into this plugin.

### Early-return domain parity is a separate gate

Add an adversarial control for every shortcut, including globally separated early returns: exercise extreme finite coordinates, overflow-prone unit conversions and invalid model-domain inputs before success can bypass checks. Require the reference and optimized implementations to reject the same unsupported inputs without state mutation. A broadphase geometric separation cannot authorize an input the narrowphase contract rejects. Fix and independently review the input-domain preflight, then produce fresh source-bound evidence; retain old receipts and do not relabel an acquisition run made with the previous source.

## Challenge study boundaries without deleting physical checks

When a run stops, ask students which kind of boundary was reached: a chosen study extent, a model-validity limit (unsupported contact/attitude/material regime), a conservative possible-obstacle gate, or independently established physical interference. Record the exact reason, coordinate frame, source and evidence. A study endpoint is not automatically a physical wall; equally, challenging an assumption does not authorize ignoring model validity or attaching a game piece ideally.

Before extending a study extent, trace every dependent assumption: obstacle inventory/prefilters, contact-law support, cached bounds, units and lateral/height/attitude limits. Rebuild candidate inventory from the full source inventory for the new extent. Merely changing the final coordinate rejection can omit obstacles filtered out under the old range. Keep the physical narrowphase, unknown outcomes and original negative controls unchanged unless a separately justified model change is explicit.

Use this reviewable experiment record before rerunning:

- Original stop reason and classification; proposed study extent and why it is worth testing.
- Original/new domain identity, source pins, full obstacle inventory and candidate-filter derivation.
- Unchanged law/state/energy fields and remaining unsupported domains; explicit changes listed separately.
- Synthetic old-prefilter-missed obstacle negative, old-domain parity, unfiltered-inventory parity and new-boundary rejection.
- Same-time coarse/half-step comparisons, controller event timing, contact support, cumulative energy and outcomes, including lost contact and further unknown stops.

Do not compare a midpoint force from one step size with an endpoint or different-time midpoint from another. Reconstruct like-for-like quantities at a common physical time with the same law, and label midpoint versus endpoint evidence. Passing static inventory probes does not establish the actual trajectory; retain separate receipts and verification levels. This is a conversational experiment/test contract, not an implemented domain-extension tool.

## Controller clock phase is checkpoint state

Restoring plant fields, controller memory and fault latch is insufficient when a split occurs between controller ticks. Preserve the held actuator command, absolute next update time, last observation/event time and scheduler policy. Do not reset a local loop counter and issue an early command on resume. Preserve actuator/plant momentum while the held command remains active.

A domain-only continuation must retain physical state, accumulated work and controller clock phase while recording a distinct model-domain identity. No reset, ideal retention latch or successful intake is implied by crossing the old experimental guard. These lessons came from challenging an overly narrow study, not from relaxing a proven physical constraint.

## Current tests and historical evidence are different questions

The [historical verification command](historical-verification.md) now implements a bounded version of this contract for `acquisition-contract`: seven reviewed regular-file blobs, explicit interpreter selection, preflight versus execution results, raw/legacy hash checks and unchanged-input verification. It is separate from `npm test`/`npm run validate` and from the existing Python npm working-tree study commands. Only Python 3.13.12 has been exercised for this implementation; the broader eligible version range is not a compatibility claim. Other historical studies are not automatically covered.

A corrected implementation can legitimately fail an old receipt's working-tree hash check. Do not make that test green by rewriting the receipt, silently ignoring the changed input, or presenting broad discovery across incompatible source identities as one passing suite. Maintain separate commands for current-source behavior and selected historical-source reconstruction. A new run under corrected source gets a new identity, even when every physical row matches its predecessor.

For a portable historical verifier, use a fixed reviewed registry of receipt hashes, complete expected dependency paths/hashes and exact test bytes. Recover only those bytes from trusted repository history; fail when a required blob is missing, including in a shallow clone. Commit IDs can change after cherry-picking, so validate actual content rather than assuming a familiar abbreviated commit exists. Extract into a disposable directory, reject unsafe paths, links and special archive entries, use explicit subprocess argument lists, run only allowlisted tests and recheck dependency hashes afterward. Preserve the working tree and original receipts. Do not fetch/install a substitute implementation to fill a missing pin.

This is source reconstruction, not an OS security sandbox: tests still execute with the process's authority. A matching hash is not permission to run untrusted code. Use only already-authorized, reviewed repository code, and record the executable/runtime and environment limits. Selected historical unit tests are not a fresh full trajectory, complete dependency/environment lock, physical calibration or proof that every historical failure was fixed.

Required negative controls: mutated registry/receipt/test bytes; omitted or added dependency; missing historical blob; unsafe path or archive link; dependency mutation during execution; and a failed subprocess. Require no accepted result on failure. Report the exact test subset and source identity, distinguishing a fresh simulation replay from receipt verification and source reconstruction.

## Controller transitions do not reset the plant

Distinguish controller initialization from physical phase changes. At a command-policy transition, preserve time, coordinates, velocities/momenta, rotor state, contact history and cumulative energy/work. Initialize controller state only when the experiment explicitly calls for it. When continuing the same policy, retain its observation history, timers and latched faults rather than quietly starting a new controller. Bind the incoming checkpoint, observation timing, command policy and source identity. Test that constructing the controller cannot mutate the plant and that a rejected step cannot partially advance it.

A changed command need not produce an immediately different trajectory. In the bounded 2024 study, nominal and stale/no-pinch controls have different commands or fault states but equal physical traces: both drivetrain paths brake, while the nominal pinch demand falls below existing rotor back-EMF and coasts under the declared one-direction drive law. That is a model-specific control observation, not evidence that faults are harmless, disabled motors stop instantly, or control logic is ineffective. Inspect actual motor mode, current, torque, bus solution and dissipation channels; do not demand heat in a particular ledger bucket when the modeled loss occurs elsewhere.

Preserve negative controls and actual rejected trial states. A model-domain limit is not automatically a collision, capture failure or safety verdict. An observer recheck after rejection may overwrite a 'last query' variable with the accepted state; reconstruct or save the rejected trial separately without committing it. Keep stopping distance, still-moving endpoints and withheld claims visible when comparing earlier versus later braking.

For timestep comparisons, compare rates at the same physical time and state convention. Stored midpoint force rows from different step sizes refer to different times. Reconstruct endpoint rates purely, with the declared command and electrical-state convention, before calling their difference a force-convergence result. If using the last recorded bus, say so rather than implying a new endpoint electrical equilibrium. Temporal refinement is not spatial/grid convergence or capture evidence.
