# Inspect hidden backing behind a bumper cover

A continuous visible cover can conceal several separate installed backing bodies. Before opening the candidate, identify the support, each backing piece, the cover and every other installed physical body in the fit scope. Use the assembly occurrence path and component-local body name together. Preserve the expected installed bounds in millimetres. A display-only export cannot establish the hidden inventory. [Occurrence identity](native-identity.md) · [Installed physical quantities](assembly-accounting.md)

## Run the practice assembly in Fusion

The [study](../examples/backing-fit/study.py) generates two disposable local F3D archives, reopens them separately and restores the originally active document. Put `study.py`, [geometry.py](../examples/backing-fit/geometry.py) and [expected.json](../examples/backing-fit/expected.json) together in a Fusion Python script folder named `study`. Run `study` from Scripts and Add-Ins and select a writable parent folder. The new study directory contains both archives, the expectation file for those exact archives and `observed.json`.

From the plugin checkout, run:

```sh
node examples/backing-fit/compare.mjs <study-directory>/expected.json <study-directory>/observed.json
```

To replay the published observations, use the two JSON files under `examples/backing-fit/`. The command returns a nonzero exit for an incomplete final inventory, insufficient bearing or interference. A predecessor collision remains in the report after an explicitly registered replacement passes its own reopened fit check.

## What the measurements show

The visible cover wraps four hidden backing occurrences. All four recovered their expected installed bounds and kept their display state. The fixture's front support meets the front backing over an 80 × 40 mm footprint. A 20 × 20 mm opening leaves **2,800 mm²** of nominal mating area. Fusion intersected the two finite, oppositely oriented planar face sheets, respecting their trimmed edges and openings. The positive area control measured 2 mm². Two disjoint faces on the same plane had zero common area. Curved bearing surfaces, gaps bridged by fasteners, elastic compression and preloaded contact need their own methods.

The known material-overlap control measured 1 mm³. A second pair had zero overlap across a positive gap. The candidate support intersected its installed predecessor by **4,000 mm³**, above the 0.01 mm³ reporting threshold. Removing the named predecessor in a separately reopened successor recovered the same four backings and eliminated that conflict. The cover remains 10 mm from the plate. A positive volume at or below the reporting threshold is listed separately. [Measured source observations](../examples/backing-fit/observed.json) · [Temporary-body volume controls](fusion-volume-study.md)

## Use a project assembly

1. Prepare a project-owned plan from the installed physical register. Supply exact occurrence/body identities, expected bounds, backing interfaces and a positive minimum nominal bearing area per interface. Where a trimmed footprint has a known analytic upper bound, include its maximum as well. The location tolerance is an explicit registration tolerance. Pick an interference reporting threshold below the known positive control for this checker. An optional `expectedDisplay` pins the intended visibility. The public example expects four hidden backing occurrences and a visible cover. [Example plan](../examples/backing-fit/expected.json)
2. Pin the exact candidate archive digest separately from observed geometry. Include the old support when it is still installed. When the design replaces it, identify the exact removed and replacement physical IDs and pin the separately saved successor. Model a new configuration explicitly if other assembly components change. The checker uses one support and tests it against each other installed solid in the stated assembly. An unexpected body, missing backing, omitted pair or failed native operation leaves coverage incomplete.
3. On a reopened copy, pass the design, support identity and a set of backing identity tuples to `geometry.inspect`. It includes the root and nested BRep occurrences, places copies in the assembly frame, tests collision, measures minimum distance and intersects planar faces for the named bearing interfaces. Keep observed archive digest and `reopened` with each result. Check registration before interpreting the area or an interference. A false Boolean is unresolved. Each pair retains its measured volume, distance and area when available.
4. Record the applicable rule edition and dimension witnesses in `scopeNotes.dimensions`, identify installed attachment and fasteners in `scopeNotes.attachment`, and cite the separate impact/load-path evidence in `scopeNotes.impact`. These notes accompany the geometry result. Qualification for inspection, fastener retention and impact loads requires its own evidence.
