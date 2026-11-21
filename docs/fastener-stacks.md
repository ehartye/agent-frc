# Check a seated screw stack

Use the exact placed STEP and the independently commissioned operating plan to check a screw before ordering stock or approving the joint. Identify the under-head bearing surface, the gripped layers, the tapped host or nut, both thread specifications and the allowed engagement and bottom clearance. On a blind hole the depth at full bore diameter, last full thread and drill-point apex are three different measurements.

In `operatingIntent.fastenerStacks`, set `stepSha256` to the selected exchange digest. Put every reviewed installed solid in either `stacks` (one entry for each screw) or `nonScrewSolids` (explicit solid IDs). For an article outside a scoped issue, an optional `outsideScope` entry takes `solid` and `basis`. An installed body listed there leaves the review open. Repeated instances have separate entries. A washer or nut in `nonScrewSolids` can still be the seat or host of a screw.

Each stack names `screw`, `host` and `seat` by exact placed solid ID, plus the installed `screwArticle` and `hostArticle` from the BOM. Select `kind` as `blind` or `through`, register the center of the under-head plane in `underHeadCenterMm` and give the signed world vector `axisIntoHost`. Pin the dimension record with `drawing: {"file": "...", "sha256": "..."}`. It must name those same two articles and pin its original dimensional sources in a nonempty `sources` list. Qualified thread geometry needs matching `screwThread` and `hostThread` designations and a source-backed `threadFitBasis`.

| Drawing field | Measurement in mm, inclusive minimum and maximum |
| --- | --- |
| `underHeadLengthMm`, `gripMm` | Seat to screw tip, and seat to host mouth |
| `maleThreadStartFromSeatMm`, `maleTipRunoutMm` | Start of full external threads and unusable length at tip |
| `femaleLeadMm`, `lastFullThreadDepthMm` | Beginning and end of usable female threads measured from the mouth |
| `boreRadiusMm`, `cylindricalDepthMm` | Radius of the measured coaxial internal wall and its depth from the mouth |
| `drillPointDepthMm` | Blind-hole mouth to actual apex or flat bottom |

Register a scalar `minSeatAreaMm2` and `minEngagementMm`. A blind mount also requires `minBottomClearanceMm` measured against the end of the full-diameter bore. A through mount uses `minThroughProjectionMm` past the host exit. Use fabrication and purchased-part tolerances. Verify specially relieved tips, countersunk seats, inserts, stepped mouths and fully modeled helical bores independently when this straight, planar-seat method leaves geometry open.

Record `externalProfile` and `internalProfile` from the screw and host drawings. Each supplies its `form`, `hand` (`right` or `left`), `pitchMm`, and inclusive ranges for `minorDiameterMm`, `pitchDiameterMm` and `majorDiameterMm`. Set `representation` to the diameter actually drawn in the CAD (`minor`, `pitch` or `major`). The evaluator checks the physical diameter relationship, matching hand and pitch, and uninterrupted cylindrical surface coverage over each declared threaded span. A short land with the correct radius cannot qualify a waisted or incorrect shank. Supply separate qualified profile measurements for geometry outside this supported convention.

To examine a registered stack outside a complete release, save the contents of `fastenerStacks` as `fasteners.json` and run the installed script:

```sh
python /path/to/plugin/scripts/fastener_stack.py project project/cad/issued.step project/review/fasteners.json
```

Read the actual seat area, full-bore depth, worst-case engagement and applicable tip margin. When a tip crosses a blind floor, the checker attempts a finite shared-material witness beyond that floor. The output retains its center, radius and minimum common volume. A single zero from a solid intersection cannot override that observation. Reopen the exact issue after a length or grip change. The geometry review leaves preload, thread stripping, tightening access, load capacity and fatigue to their respective engineering checks.
