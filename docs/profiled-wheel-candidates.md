# Profiled wheel-bank candidate generator

Run `npm run candidate:profiled` for three separate **layout hypotheses**, not substitute simulation inputs or accepted hardware. The read-only generator pins the original nominal fixture bytes and emits researched parts, proposed wheel/support stations and explicit missing evidence.

Instead of enlarging a round sleeve bore and still lacking a torque path, this candidate family uses commercially profiled wheels:
- NOTE: REV-21-2457 four-inch MAXSpline medium wheels with REV-21-2037-PK2 aluminum hex MAXHub candidates.
- CORAL: REV-21-2030-PK4 two-inch direct-hex medium wheels, with no redundant MAXHub.
- FUEL: REV-21-2456 three-inch MAXSpline medium wheels with the aluminum hex MAXHub candidates.

The reference shaft is REV-21-1135 rounded-hex stock, not the short kit shaft. Proposed lengths are geometry hypotheses, not cut instructions; no finished end thread is assumed. REV-21-1916-PK4 bearings, REV-21-2286-PK10 retaining plates and REV-21-2900-PK4 collars are researched support/retention candidates, not complete installed load paths. Housings, spacers, hub count/orientation, fastening, axial stack and tolerances remain open.

Wheel counts, pitch and support locations are original hypotheses. The layout check verifies only non-overlapping nominal wheel envelopes and that proposed bearing stations bracket those envelopes while remaining inside shaft ends. It excludes hub/collar/fastener envelopes and cannot establish assembly clearance or support capacity.

**This is a segmented-contact redesign.** Spaced wheels do not reproduce the old continuous sleeve. Native geometry, inertia, lateral contact gaps, NOTE hole interaction, CORAL orientation, and FUEL contact must be re-evaluated before simulation reuse. Existing source and simulated results are left unchanged. Catalog hardness or mass does not supply a calibrated force law, inertia or thermal model.

The CORAL wheel retains a recorded source disagreement: the current product family says glass-filled nylon/TPR and medium 40A, while the linked 2021 drawing was previously reported as polypropylene/TPU and REV-21-2030 45A. This pass did not reopen that drawing. Do not choose density or constitutive properties from either until variant identity is resolved.

The output contains source URLs, locators and review limitations. Rolling pages are not historical-season availability evidence. No vendor body or CAD is copied; no physical inventory, fit, qualification, fabrication or installation is asserted. All engineering acceptance remains blocked.

Next implementation step: review one season's candidate, resolve the hub and axial stack from exact drawing/native evidence, create a new assembly with defined housing datums, then build a new segmented-contact model. Do not repin old native/simulation receipts as evidence for this alternative.
