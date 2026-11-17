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

Source evidence: the 2024 experiment at commits 947a6f2 and 4101b85 includes electrical midpoint and explicit fast-coupled tests plus fresh equivalence receipts. It compares all 752 successful rows and the terminal exception while retaining the 513-point sampled root scan. The stored trace is decimated for display; the runner compares/hashes every row. These finite fixtures do not establish equivalence for all states or globally complete root discovery. New projects must run their own controls rather than copy the receipt's acceptance fields.

## Checkpoint schema and physical continuity

A recursive “every nested leaf is finite” check accepts empty containers and wrong shapes. Declare exact required fields, numeric scalar types (reject booleans), vector dimensions, finite values, coordinate conventions and shared clock. Validate complete cumulative energy fields and initial-energy reference, not just pose. Bind source/model identity and physical configuration against independent expected values before restoring. Do not silently accept a new model because its field names match.

Test round-trip continuation against uninterrupted integration from a nonzero-motion state. Preserve cumulative work/loss accounting across the boundary. Test missing fields, scalar replaced by an empty array, nested vectors, boolean components, wrong vector length, absent energy entries, changed configuration/source identity and inconsistent clocks. Reject before partially mutating a live plant. Checkpoints must be deep snapshots rather than aliases.

The source correction c1f312b makes these shapes explicit in continuation_state.py and tests/test_continuation_state.py. This document does not provide a generic restore function: state schemas and migration rules belong to the model. Explicit migration needs separately reviewed conservation and accounting evidence, not relabeled source pins.

## A dwell is not capture

At an acquisition-to-retention handoff, preserve the actual piece position, velocity, spin, rotor phase, clock and energy. A desired indexed position is a controller goal, not permission to snap the piece into a convenient historical contact patch.

Require three separate gates: a complete robot/piece geometry corridor through the next motion; an achievable contact wrench with gravity, commanded accelerations, moments and actuator limits; and state/energy continuity. A finite belt contact patch alone proves none of the other gates. Static lift force is necessary but not sufficient for dynamic retention. A passing geometry witness cannot cure insufficient friction force, and extra numerical stiffness cannot stand in for an actual spring/backing mechanism with measured installed preload and load path.

Preserve counterexamples and unknowns. At source commit 6b4eb84, a valid local contact patch coexisted with whole-robot pitch interference and a failing necessary static-force bound. This is a design lesson, not a reusable numerical tolerance or a recommended mechanism. Explore indexing, compliant backing or supported transport as alternatives; test each with the same actual handoff state and updated source-bound contact evidence.

## Portable source bytes before a run

Hash the bytes actually executed, not a normalized reconstruction. Before a reproducible run, verify intended source/configuration inventory against the committed/indexed bytes under the project's explicit encoding and line-ending policy. Git text normalization and editor BOM changes can make a clean-looking receipt nonportable. Recheck pins after the run. If normalization changes inputs, preserve the old receipt and generate a fresh run; never rewrite its historical pins to fit a new commit. Byte identity establishes provenance only, not physical correctness.

## Moving mass and phase allocation

When unlocking lift/pitch degrees of freedom, partition mechanism mass and inertia out of the chassis representation before adding them to a coupled model. Document which body owns each physical mass, where its center and inertia are expressed, and how constraints change. Preserve world momentum and cumulative energy/work across the mapping; distinguish energy-reference offsets from physical work. Do not add the same moving assembly twice or reset the ledger to hide a jump. If previously constrained modes gain new state, define their incoming velocities and account for any actual impulses or work rather than inventing them.

A fixed-base actuator fixture is not a moving-chassis continuation. Reject moving-base checkpoints at a fixed-base API, or use explicitly coupled generalized dynamics with chassis reactions and a consistent mass matrix. A stationary fixture's reaction load or zero constraint work cannot be silently reused on a translating base. Required negative controls include duplicate mechanism mass, zeroed incoming velocity, cleared cumulative work, an inconsistent reference energy and a moving state passed to a fixed-base step. Compare a mapped continuation against the physical identities before testing a complete maneuver.

Published source snapshot 5094c48 retains the fixed-base restriction in sim/actuation/mechanics.py and explicit contact/patch boundaries in the integration modules. These are subsystem contracts, not evidence that the later combined pilot has been reviewed or that a full lift succeeds.

## Preload travel is part of the acquisition path

Screen the entire moving cassette, its bearings/pulleys/supports and the piece through advancing feed, not only an already-indexed held pose. Explore preload travel together with piece translation, tolerances and rotor phase. Retain the zero-travel baseline and rejected travel/offset pairs; staged opening/closing needs an explicit controller/contact model, not an assumed collision-free transition. Valid finite patches do not imply holding force, usable preload range or feasible drive work.

The finite native screen at 2f80f5b preserves advancing-feed counterexamples that a held-pose-only check misses. It samples one side, centered motion and nominal source clocking, not continuous clearance or full phase/tolerance coverage. Required test controls include a held pose that clears while an intermediate feed position overlaps, a support added to the inventory, and a changed preload state that invalidates historical patch evidence. This remains guidance, not a new sweep implementation.
