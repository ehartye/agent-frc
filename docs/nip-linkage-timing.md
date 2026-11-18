# Opposed nip linkage and closure timing

## Sourced transmission candidate

A single vertical timing-belt loop could move top and bottom carriages in opposite directions by attaching them to opposing straight runs. That is an original linkage hypothesis, not an assembled mechanism.

The exact longer-belt candidate is TTB-0164, variant 49610207822123, 200-tooth 1000-5M-09, paired nominally with the previously sourced 20-tooth 5 mm-pitch, 9 mm-width pulley. The [vendor page](https://www.thethriftybot.com/products/single-sided-9mm-wide-htd-timing-belts) lists that size. Variant identity comes from the earlier hash-verified JSON snapshot; a fresh JSON request returned 403, so this does not assert current stock or availability.

The 800 mm belt would give a 350 mm pulley-center spacing. With the explicitly assumed 40 mm clamp length and 20 mm end exclusion, it fails the open-carriage center-position screen for all three seasons, even NOTE by about 0.2 mm. The 1000 mm belt gives 450 mm spacing and nominal margins about 49.8/43.45/12.9 mm for NOTE/CORAL/FUEL. Belt teeth, tension, offset links, guide mounting, shaft support and collision-free installation remain unverified.

## Drive screen, not actuator acceptance

The prior source-pinned NEO550/9:1/MAXPlanetary-brake candidate is screened for two opposite-moving carriages over 60 mm each. Both carriages contribute inertia; gravitational cancellation is assumed only for equal masses, with a separate 0.1 kg imbalance case. Friction, efficiency, current cap and rotor-equivalent inertia remain independent hypotheses.

All sixteen 20 ms cases fail the necessary free-motion envelope; all sixteen 250 ms and sixteen 400 ms cases pass that limited screen. It excludes compression force after contact, tracking, jerk, dynamic brake arrest and structural loads. Passing cannot establish the closure deadline or acceptable gripping force.

## Fresh native motion and actual exit-state continuity

Thirty-six prescribed closure sweeps cover three seasons, pitches 0/10/20 degrees and closure durations 250/400 ms. Each uses nine native samples plus conservative distance bounds between samples.

Moving cases begin with the actual representative catcher exit position, signed velocity and clock from the preceding receipt. Subsequent body velocity and triangular nip motion are prescribed, not a force-coupled replay. Stationary cases are a separate retained-body hypothesis with the body centered on the receiving station; they do not silently relocate the real catcher.

For FUEL, all six moving cases are certified to miss the closing nip entirely over the checked interval. The prior instantaneous-contact force model therefore cannot be carried into these closure trajectories. Stationary cases produce rigid contact/interference witnesses, but those do not validate preload, compression or traction. NOTE/CORAL contacts and any unresolved intervals likewise cannot be treated as accepted grips.

## Consequences for season goals

- NOTE: real closure/contact and orientation remain necessary before reusing any local speaker trajectory. A center-plane crossing is still not a torus/roof/sensor result.
- CORAL: preserve both sourced mass endpoints and rollback controls. Closure/placement must account for orientation and the unresolved installed trough transform; a contact witness is not a scored state.
- FUEL: a delayed closing nip cannot simply catch the current moving exit. A retained/pregrip arrangement, changed receiving location, or a different feeder is required before the powered exit can feed a physical HUB chain.

Next architecture work should locate the retained body and receiving nip together, model the actual linkage/guide swept volumes, and verify force/pose before releasing the catcher. None of the results authorizes hardware acceptance or scoring.
