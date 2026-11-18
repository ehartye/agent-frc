# Guided passive retention and release architecture

This is a bounded alternative to the rejected direct P16 gate drive, not a selected or validated mechanism. Earlier spring-pin, false-HOLD and zero-output counterexamples remain unchanged.

## Exact component candidate

Southco R4-EM-43-161 is a push-to-close electronic rotary latch with auto-relock, cam status switch, connector and thru-hole mounting. The associated small striker is R4-90-511-20 (M6, 7.5 mm striker diameter); R4-EM-72 is the 4/6-series override cable mounting kit. The catalog describes auto cycling after an unlock signal and an optional mechanical override. Recommended supply is 12-24 V; signal specification is 8-26 V with up to 25 mA input. This is not a direct 5 V roboRIO logic connection. [4/6-series catalog](https://files.southco.com/static/Literature/r4-em-ld.en.pdf), [exact latch listing](https://southco.com/en_in_int/r4-em-43-161).

The cable override provides an alternative mechanical release path during power loss. That does not specify latch behavior for every interrupted actuation phase or guarantee retention under robot loads. Both vendor PDFs are byte-pinned in `guided-retention-evidence.json`; no vendor CAD is redistributed. [Override documentation](https://files.southco.com/static/Literature/r4-em-mech.en.pdf).

## Architecture and load path

A conceptual gate translates vertically in two guides. A raised-position catch holds it out of the intake; releasing that catch allows gravity-assisted descent. A bottom rotary latch receives a striker carried by the gate and can retain the down position mechanically. These are two distinct holding functions, not one latch magically serving both positions.

Longitudinal piece force must pass through gate structure and guide bearings into the frame. The bottom striker/latch handles retention loads according to its actual orientation and installation; it cannot be credited with unspecified force capacity. A lift/reset mechanism is still needed to raise the gate after release. Electronic latch release alone cannot lift it, and the P16 timing rejection still applies to a rapid reset. Manual override is a service/access provision, not an autonomous safety response.

Mounting panels, fasteners, guide bearing spacing, striker approach alignment, retained overlap and side-load friction need a native assembly and load analysis. The inspected catalog did not establish rated load, release latency or interrupted-cycle behavior for this exact application. No fit, duty-cycle or structural acceptance is inferred.

## Mechanical timing and native geometry checks

The original gate heights imply ideal frictionless fall times of approximately 0.120/0.165/0.186 seconds for NOTE/CORAL/FUEL, even with zero latch-release delay. Only approximately 0.130/0.085/0.064 seconds remain within the existing 0.25-second deadline for release and other delays. Catalog auto-relock wording is not a timing bound.

Thirty-six scalar sensitivity cases vary explicitly hypothetical gate mass, guide friction and side load. At 0.2 kg, coefficient 0.05 and 50 N side load, assumed sliding friction exceeds weight and the gate stalls. At 0.5 kg under the same side load/friction, FUEL closure exceeds 0.25 seconds. These are counterexamples, not chosen mass, friction or hardware ratings. Gravity also delivers impact energy that must be absorbed; adding a latch does not eliminate that energy.

Nine fresh OCP paths use the original gate/piece solids and a parabolic gravity trajectory. Six stationary/forward-piece paths receive conservative 2 mm inter-sample clearance certificates. All three constant rearward 400 mm/s paths produce native collision witnesses. This shows why a slower passive descent cannot inherit the earlier 20 ms contact validity.

The proof uses the maximum relative speed over the entire drop, including accelerating vertical gate motion, rather than an average speed. Tests independently reconstruct every certified adjacent interval. These are prescribed, fixed-pose paths, not a coupled gravity gate and deforming piece simulation or an assembly of the Southco parts.

## Power-off phases remain distinct

- Raised and caught: retention depends on the actual raised catch and load path; an open gate still does not capture the piece.
- Release command in progress: exact cam/trigger position after power interruption is unknown.
- Falling: removing electrical power does not arrest gravity or prevent an obstructed descent.
- Down and engaged: engagement depth, capacity, mounting and jam behavior require evidence; a cam switch is not proof of a sound load path.
- Unloading/resetting: lifting and re-engagement are separate operations; interrupted reset cannot be assumed safe.

The necessary evidence is a measured release/reset timing envelope, a phase-by-phase power-interruption test, actual guide/latch/striker load-path qualification, and independent engagement sensing. Electrical interface, competition legality, physical watchdog behavior and safe-state choice remain blocked. No component was purchased, robot operated or safety guarantee made.
