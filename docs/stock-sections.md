# Compare machined stock by section

Use this check when a machined plate or tube appears to match its drawing but solid differences give inconsistent volumes. A slot cut in the wrong position can remove exactly the planned volume. Comparing the common material and both directed differences distinguishes those cases.

Select the extrusion direction in the installed coordinate frame. All boundary faces must be planar and parallel or perpendicular to that direction, or cylindrical with an axis parallel to it. A plate can have blind pockets, stepped lands and parallel round bores. An inclined plane spanning multiple depths, angled bore, helical flank or conical countersink makes this method ineligible for that direction.

## Compare two placed solids

Export the planned part and the cold successor from their registered sources. Record both digests, exact STEP body labels, the drawing-defined rigid placement and a volume resolution justified by the design review. In the synthetic plan below, the drawing and issued part share coordinates. The transform maps the before STEP solid into the after STEP coordinate frame in millimetres. Preserve a second plan with a known displacement large enough to exceed the registered resolution.

```json
{
  "schema": "agent-frc/stock-sections@1",
  "before": {"file": "cad/drawn-stock.step", "sha256": "DRAWING_EXPORT_DIGEST"},
  "after": {"file": "cad/cold-issue.step", "sha256": "COLD_EXPORT_DIGEST"},
  "comparisons": [{
    "beforeSolid": "Inspection plate",
    "afterSolid": "Left inspection plate",
    "worldTransform": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    "axisWorld": [0,0,1],
    "resolutionMm3": 0.1
  }]
}
```

Run `python PLUGIN/scripts/stock_sections.py PROJECT PLAN.json`. Each row retains the original 3D evidence. Its `stockSections` field reports the midpoint and cross-sectional areas between every successive vertex elevation of either solid. In each interval the material footprint is constant for the supported face types. The method checks that each directed cut and the shared area reconstruct its operand, then checks the integrated areas against both original solid volumes.

Read `absentMm3` as material in the drawing missing from the installed solid and `extraMm3` as material added. Read the associated ranges before comparing to the design resolution. An interval too thin to section reliably contributes its entire enclosing footprint to the uncertainty. The section edges also contribute an allowance based on their length and model tolerance. These are numerical estimates for the represented BReps. A material change exceeding the resolution fails. A close comparison or a disagreement between methods stays open.

For a planned revision, compare the parent with the successor to measure what changed. Compare the successor separately with the intended revised drawing to check whether those changes occurred where planned. A matching section alone certifies neither the physical machining process nor another stock body.

## Require the check for an issue

For an occurrence already registered in the component source roster, put its exact installed solid label and direction in the readiness study, for example `"componentSectionAxesWorld": {"Left inspection plate": [0,0,1]}`. Freeze this study with the commissioning scope. The normal qualified readiness scan repeats the comparison at its registered transform and uses the article's `shapeResolutionMm3`. Contradictory 3D or native observations remain in the review. [Source and installed geometry](mechanical-methods.md)
