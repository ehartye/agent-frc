# Check shaft location after removing a circular pilot

A flange can retain its full seating area while the shaft moves sideways inside the pilot clearance. Commission the service operation first. Record whether the motor stays on the carrier or whether both locating interfaces can be loosened. Trace the permitted radial movement at every disturbed interface to the two shaft axes at the coupling.

Run the mount datum screen on a pinned, millimeter, placed STEP. The host and member each need the exact solid name and the complete definition, instance and occurrence path from the placed inventory. Use the drawing to select the bore and the outside locating land. Register an origin on the common nominal axis, its unit direction, an interval along it where both full circular lands overlap, and the axial station and outward normal sign of the host seat. Include an engineering minimum bearing area. The checker verifies the two cylindrical surfaces around the full circumference and measures the contact between the specified opposing planes. An open slot, a relief in the working land or a seat gap requires investigation.

```sh
python scripts/mount_datums.py PROJECT studies/seated-pilot.json
```

Name the exact service operation and both axes in `serviceOperation`, `shaftAxis` and `targetAxis`. The study uses schema `agent-frc/seated-pilot@1`. Supply `step` as a project-relative file and SHA-256, and `host` and `member` as records with `solid` and `identity`. The following synthetic commission shows the remaining geometry fields. The plane station and engaged band are signed distances from the origin along the axis.

```json
{
  "originMm": [0,0,0], "axis": [0,0,1],
  "boreRadiusMm": 5, "pilotRadiusMm": 4.8, "engagedBandMm": [1.2,3.8],
  "seatPlaneMm": 4, "hostNormalSign": 1, "minimumSeatMm2": 100,
  "displacementDirectionWorld": [0.6,0.8,0],
  "clearDisplacementMm": 0.15, "blockedDisplacementMm": -0.24
}
```

The digitized pair has 0.20 mm of radial play in any transverse direction while these rigid axes stay parallel and the lands stay axially engaged. Other attached parts can reduce the available movement. The two signed perturbations test a seated free pose and a known obstruction. The result records both orders of the solid intersection and the opposed area at each pose.

To compare the parallel shaft error with a project limit, pin a separate `budget` file. First run the nominal study and record its `commissionSha256` in that file. This binds the named parts, service operation, axes, lands, seat and controls. Include the source `basis` and `kind` of `conditional` or `qualified`. Give the largest finished bore radius, smallest finished pilot radius and upper radial errors for shaft to pilot, target axis to bore and the rest of the disturbed datum chain. Use `largestFinishedBoreRadiusMm`, `smallestFinishedPilotRadiusMm`, `shaftToPilotRadialMm`, `targetToBoreRadialMm`, `otherParallelErrorMm` and `allowableParallelOffsetMm`. Account for position, runout and setup at the actual coupling plane. Supply zero only with a justified datum relationship. Significant tilt, loss of seating, distortion under load and retention require their own checks.

For example, 5.015 mm minus 4.790 mm yields 0.225 mm worst-case radial play. Adding bounded errors of 0.010, 0.015 and 0.005 mm gives 0.255 mm. A synthetic 0.300 mm limit leaves 0.045 mm. A 0.220 mm limit leaves the decision open until a tighter bound or an actual permissible violating assembly resolves it. Missing shop or supplier evidence leaves the measured nominal fit visible with open qualification. Compare the whole assembly at an attainable adverse pose before accepting its alignment after service.
