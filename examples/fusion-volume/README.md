# Verify Fusion volumes and scoped machining

A rigid transform preserves material volume. Fusion exposes both `BRepBody.volume` and `BRepBody.getPhysicalProperties(VeryHighCalculationAccuracy).volume`. The same solid can return a positive direct volume and zero through the high-accuracy physical-properties method on a temporary copy. Use the native body's physical volume for mass. Record the copy, its transform and its bounds separately for assembly placement. A larger accuracy setting cannot validate a failed reading.

## Run the two-plate experiment

1. In Fusion's Scripts and Add-Ins dialog, create a Python script named `study` and use the supplied [study.py](study.py) as its script file. Run it and choose a writable local folder. It creates a unique subdirectory with two disposable Fusion archives and an observed `receipt.json`. It closes the documents it creates and restores the originally active document.
2. From the plugin checkout, run `node examples/fusion-volume/compare.mjs <generated-folder>/receipt.json`. To replay the issued observation offline, use `node examples/fusion-volume/compare.mjs examples/fusion-volume/observed.json`. The command checks the receipt against the exact study source and the two-plate design.
3. Open either saved archive to inspect the cut. The plates have the same outer dimensions after machining in both designs. Compare the neighbor’s actual solid volume to its own pre-cut reading. For a production cut, enumerate **each** solid crossed by the tool, specify exactly which native solids participate, and verify the saved design after reopening.

| Observation | Independent witness |
|---|---|
| Native stock, unplaced copy, translated and rotated copy | A 6 × 4 × 1 cm plate occupies 24 cm³. A +90° rotation about Z and a (10, 8, 5) cm translation put its bounds at (6, 8, 5) to (10, 14, 6) cm. |
| Known overlap on the temporary Boolean path | The overlapping box shares 1 × 2 × 1 cm with the placed plate. Its surviving material must measure 2 cm³ and occupy the expected bounds. |
| Known separation on that same path | The second box starts 2 cm beyond the placed plate. That independent X gap establishes separation in this example. Preserve the Boolean return, empty topology or error. A failed Boolean or zero properties reading on a general pair leaves the result unknown. |
| Unrestricted cut | A 1 cm diameter bore crosses both plates. Each loses π/4 cm³. An unchanged outside box on the neighboring solid conceals the loss. |
| Target-only cut | `ExtrudeFeatureInput.participantBodies = [target]` keeps the neighboring plate at 24 cm³. Inspect both named solids before cutting, immediately afterward and after a fresh archive import. |

Inspect `unusableVeryHighVolumeReadings` in the checker output. Its entries are method-specific failures preserved alongside the positive direct readings. The positive and disjoint controls qualify this exact configuration and API path. Recheck the controls for a different Fusion build, geometry, representation or measuring method. When direct and analytic volumes disagree or there is no independent evidence of separation, retain the case as unresolved.


On Fusion 2706.1.17, direct volume was 24 cm³ for the native plate and both copies. Very-high physical properties returned 24 cm³ on the native solid and zero on each copy. The true overlap returned six faces, 2 cm³ direct and zero via very-high properties. The disjoint Boolean succeeded with an empty face set. The unrestricted neighbor reopened at 23.21460184 cm³ and the target-only neighbor at 24 cm³. [Original native observations](observed.json)
