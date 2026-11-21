# Verify Fusion volumes and scoped machining

A rigid transform preserves material volume. Fusion exposes both `BRepBody.volume` and `BRepBody.getPhysicalProperties(VeryHighCalculationAccuracy).volume`. The same solid can return a positive direct volume and zero through the high-accuracy physical-properties method on a temporary copy. Use the native body's physical volume for mass. Record the copy, its transform and its bounds separately for assembly placement. A larger accuracy setting cannot validate a failed reading.

## Compare a supplier import with an installed solid

If a source volume and a reopened part disagree, retain the original readings with their units, kernel and build, accuracy setting, and whether each body was temporary or document-owned. A difference between integration methods can occur on unchanged geometry. Preserve the registered dimensional and volume tolerances for the retest.

1. Identify the original file and constituent, installed archive and full occurrence/body path, configuration and expected transform. Import the original into a disposable document in the same Fusion build used to reopen the installed archive. Call `fusion_volume_readback.observe(app, body)` on each while the document is open. The helper measures each persistent definition in its local frame using direct volume and both High and VeryHigh physical properties. It returns mm³ and retains errors for individual methods. Save each observation under its full registered body ID in a JSON record with `modelSha256` for the file actually opened and `bodies` mapping IDs to observations.
2. In a project-owned study record, give both `source` and `candidate` a `model` file pin, an `observations` file pin and the selected `body` ID. Each file pin contains project-relative `file` and `sha256`. Set `method` to the commissioned API, such as `physicalProperties.VeryHigh`, and `toleranceMm3` to the project resolution. Run `python scripts/fusion_volume_readback.py PROJECT STUDY.json`. Retain that study and any earlier mixed-method, STEP or temporary-body result.
3. Inspect each signed same-method delta. An unavailable, zero or incompatible commissioned observation needs a fresh reading. Conflicting paired outcomes at the chosen resolution need independent evidence. A consistent volume qualifies just the volume comparison. A rigid displacement or moving a bore to the opposite end can preserve volume exactly. Check installed world landmarks and run the existing bidirectional [source-shape check](mechanical-methods.md#resolve-a-contradictory-source-shape-measurement) against the exact component and registered transform. Preserve material assignments, geometry discrepancies and motion findings separately.

## Run the two-plate experiment

1. In Fusion's Scripts and Add-Ins dialog, create a Python script named `study` and use the supplied [study.py](../examples/fusion-volume/study.py) as its script file. Run it and choose a writable local folder. It creates a unique subdirectory with two disposable Fusion archives and an observed `receipt.json`. It closes the documents it creates and restores the originally active document.
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


On Fusion 2706.1.17, direct volume was 24 cm³ for the native plate and both copies. Very-high physical properties returned 24 cm³ on the native solid and zero on each copy. The true overlap returned six faces, 2 cm³ direct and zero via very-high properties. The disjoint Boolean succeeded with an empty face set. The unrestricted neighbor reopened at 23.21460184 cm³ and the target-only neighbor at 24 cm³. [Original native observations](../examples/fusion-volume/observed.json)
