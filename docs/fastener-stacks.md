# Check a seated screw stack

Use the exact placed STEP and the independently commissioned operating plan to check a screw before ordering stock or approving the joint. Identify the under-head bearing surface, the gripped layers, the tapped host or nut, both thread specifications and the allowed engagement and bottom clearance. On a blind hole, distinguish the clamp plane, start and end of the cylindrical pilot, last usable full thread and drill-point apex.

In `operatingIntent.fastenerStacks`, set `stepSha256` to the selected exchange digest. Put every reviewed installed solid in either `stacks` (one entry for each screw) or `nonScrewSolids` (explicit solid IDs). For an article outside a scoped issue, an optional `outsideScope` entry takes `solid` and `basis`. An installed body listed there leaves the review open. Repeated instances have separate entries. A washer or nut in `nonScrewSolids` can still be the seat or host of a screw.

Each stack names `screw`, `host` and `seat` by exact placed solid ID, plus the installed `screwArticle` and `hostArticle` from the BOM. Select `kind` as `blind` or `through`, register the center of the under-head plane in `underHeadCenterMm` and give the signed world vector `axisIntoHost`. Pin the dimension record with `drawing: {"file": "...", "sha256": "..."}`. It must name those same two articles and pin its original dimensional sources in a nonempty `sources` list. Qualified thread geometry needs matching `screwThread` and `hostThread` designations and a source-backed `threadFitBasis`.

| Drawing field | Measurement in mm, inclusive minimum and maximum |
| --- | --- |
| `underHeadLengthMm`, `gripMm` | Seat to screw tip, and seat to host mouth |
| `maleThreadStartFromSeatMm`, `maleTipRunoutMm` | Start of full external threads and unusable length at tip |
| `femaleLeadMm`, `lastFullThreadDepthMm` | Beginning and end of usable female threads measured from the mouth |
| `boreRadiusMm`, `cylindricalDepthMm` | Radius of the measured coaxial internal wall and its depth from the mouth |
| `entranceChamferDepthMm` | Drawing range from the planar host clamp face to the start of the full cylindrical pilot, required for a chamfered mouth |
| `drillPointDepthMm` | Blind-hole mouth to actual apex or flat bottom |

Register a scalar `minSeatAreaMm2` and `minEngagementMm`. A blind mount also requires `minBottomClearanceMm` measured against the end of the full-diameter bore. A through mount uses `minThroughProjectionMm` past the host exit. Use fabrication and purchased-part tolerances. For a straight coaxial entrance chamfer, the checker traces a complete conical face from its circular rim on the clamp plane to its rim on the pilot. A partial taper, recessed shoulder or broken entrance rim leaves the mouth unresolved. Measure all host depths from the clamp plane. The female full-thread start must clear the longest permitted chamfer. The report gives the pilot start from the head seat and the measured cylinder wall length separately. A confirmed shared-material witness beyond the drill apex fails the installed screw even when thread data are missing. A positive axial gap alone leaves engagement and strength open. Verify specially relieved tips, countersunk seats, inserts, stepped mouths and fully modeled helical bores independently when this straight, planar-seat method leaves geometry open.

### Inspect a pilot divided into faces

A purchased bore can arrive as two semicylindrical faces. Use the same commissioned screw axis, physical clamp plane and original placed host. The checker follows shared circular edges from the clamp plane across the complete cylindrical surface. Adjacent angular sectors must cover a full turn once over the same axial interval. It also checks each trimmed wall for an interior interruption and checks the join before continuing into another axial band. A side window can remove load-bearing wall while leaving both end circles intact.

For a through-tapped case, select `through` and measure to the actual exit shared by the pilot and the far face. A negative `tipBeyondExitMm` places the tip inside the measured case wall. A blind selection needs an actual closed bottom. For a flat floor the connected planar patches must cover the bore disk with the pilot rim as their only outside boundary. An offset vent keeps the blind termination open. Angular sectors ending at different axial stations can also leave the trace unresolved. Retain measured wall length and request drawing-qualified usable thread, tolerances and duty when these remain open. Complex wall trims or unmatched seams require separate inspection.

List `grippedLayers` on the stack in actual order. Name each `solid` between the head and host, its axial range `exitFromSeatMm`, positive `minBearingAreaMm2` against the following layer and the local `bearingRadiusMm` centered on the screw axis. Set `headBearingRadiusMm` on the drawing to bound the separate under-head contact. The last layer must bear on the measured host mouth. Use an empty list and name the host as the seat for direct contact. A gap anywhere in the stack leaves the compression path incomplete.

Record `externalProfile` and `internalProfile` from the screw and host drawings. Each supplies its `form`, `hand` (`right` or `left`), `pitchMm`, and inclusive ranges for `minorDiameterMm`, `pitchDiameterMm` and `majorDiameterMm`. Set `representation` to the diameter actually drawn in the CAD (`minor`, `pitch` or `major`). The evaluator checks the physical diameter relationship, matching hand and pitch, and uninterrupted cylindrical surface coverage over each declared threaded span. A short land with the correct radius cannot qualify a waisted or incorrect shank. Supply separate qualified profile measurements for geometry outside this supported convention.

To examine a registered stack outside a complete release, save the contents of `fastenerStacks` as `fasteners.json` and run the installed script:

```sh
python /path/to/plugin/scripts/fastener_stack.py project project/cad/issued.step project/review/fasteners.json
```

Read the actual seat area, full-bore depth, worst-case engagement and applicable tip margin. When a tip crosses a blind floor, the checker attempts a finite shared-material witness beyond that floor. The output retains its center, radius and minimum common volume. A single zero from a solid intersection cannot override that observation. Reopen the exact issue after a length or grip change. The geometry review leaves preload, thread stripping, tightening access, load capacity and fatigue to their respective engineering checks.
