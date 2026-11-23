# Locate an intentional thread fit

An external thread can overlap the smooth tap pilot in a manufacturer's simplified CAD model. Two questions matter. Is this the modeled interface specified by the drawing? Does all its represented common material lie between the pilot and major radii, within the tapped length? A screw that extends past the blind end can have a plausible total overlap and still occupy solid stock.

Use this optional check on a named, stationary pair of solids in the saved configuration. It supports a modeled single-start external thread and a smooth cylindrical pilot. If both parts have modeled threads, commission their actual flank geometry, seating and phase. A nominal smooth male shaft also needs a different representation-specific study. Keep the usual [fastener stack](fastener-stacks.md), material, torque, preload and retention reviews in the commissioning plan.

## Register the drawing and region

Use assembly-world millimetres. The example below describes an invented teaching part. Register both full native occurrence paths and body names, male first. Choose the region from the drawing before measuring the installed common. Set classification slack from the source geometry tolerance. Use an independently calculated positive overlap interval and a point just inside the modeled male crest. The thread check follows twelve material samples through two turns and checks for void half a pitch away at each azimuth. A crest on a rounded boundary is inconclusive.

```json
{
  "bodies": [["Screw:1", "Body"], ["Tapped block:1", "Body"]],
  "host": ["Tapped block:1", "Body"],
  "basis": "Original teaching drawing, smooth pilot and independently integrated male ridge",
  "representation": "external-thread/smooth-pilot",
  "expectedCommonMm3": [3.55, 3.57],
  "region": {
    "startMm": [0, 0, 0], "endMm": [0, 0, 4],
    "pilotRadiusMm": 2, "majorRadiusMm": 2.5, "classificationSlackMm": 0.001
  },
  "threadForm": {"hand": "right", "pitchMm": 1, "crestPointMm": [2.15, 0, 1]},
  "forbiddenProbes": [{"centerMm": [0, 0, 4.65], "radiusMm": 0.1}]
}
```

For a known bottoming failure, register a ball beyond the allowed region at the known fault site. A strictly interior ball shared by both real solids proves forbidden material. The result retains that failure even when a Boolean operation gives an inconsistent volume.

## Collect and review the same pair

1. Create three project-relative file pins (`file`, `sha256`) named `threadDrawing`, `maleGeometry` and `independentOverlap`. The independent prediction JSON has schema `agent-frc/spatial-fit-prediction@1`, the selected `archiveSha256`, the exact `commission` above, `drawingSha256`, `maleGeometrySha256` and a `calculation` pin to the underlying independent calculation. That calculation should identify the drawing, setup, expected volume range and uncertainty. Bind the exact purchased male source to its installed occurrence.
2. For a scripted placement, add the commission as `spatialFit` on the existing pair-specific `kind: fit` interface and its independently pinned `agent-frc/placement-fit@1` evidence. Put the three pins in that evidence's `sources`. The predecessor archive, pair, basis and positive quantity limits must match. A veto preserves the accepted source. [Checked placement procedure](checked-placement.md)
3. For release, add a case to the operating profile's `spatialFits` list. Each case has a unique `id`, the final `archiveSha256`, `stepSha256`, `configuration`, `pose: "saved"`, the two placed STEP labels in `solids`, the `commission` and the source pins in `evidence`. Register the ordinary intended fit on that exact pair with the same maximum. Reissue the prediction against the saved archive.
4. Pass the same commission list on the saved pose as `spatialFits` to `fusion_issue_station.measure_pose` and its declared inspection pose. Set `spatialProgramSha256` to the SHA-256 of the staged `scripts/spatial_fit.py`. Complete the normal native census. The qualified readiness review remeasures the same placed STEP pair and compares it to both native methods. [Native source and release workflow](mechanical-readiness.md)

Inspect total, outside-cylinder, inside-core and permitted material in mm³ for each method. A resolved positive outside the region fails. Missing evidence, invalid topology, disagreement between methods or an unrecognized representation leaves the check open. Passing establishes the location of the represented material for these two bodies at this one pose. Strength, delivered thread class, freedom to assemble and other installed pairs have their own acceptance criteria.

If a native Boolean retains material lumps but reports zero volume, inspect the lump count and raw volume in the method error. Recheck the same placed solids. An independent forbidden interior witness can still establish interference.

For a new qualification, start a fresh checkpoint when the native collector changes. Save the previous checkpoint with its original issue. The previous collector could measure zero on a nonempty result. The current reviewer keeps historical clashes visible and requires fresh measurements to qualify the new issue.
