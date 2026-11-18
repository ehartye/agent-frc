# Can the sensor see the state the controller needs?

A supported release applies to the declared support geometry at the observed pose. For withdrawal, register every surface that can still touch the piece, including compliant grips at their travel limits. Check when a sensor can witness clearance of that assembly and propagate observation, processing, scheduling and actuator delays to the actual motion onset.

For a field detector, register the empty path and the uncertainty in both optical endpoints. Distinguish occlusion of every permitted path from a single center-ray hit. Preserve the piece identity and the order of passage and detection. Count one continuous occupancy once. Compare powered and stopped mechanisms with the same incoming release. Keep a valid detector observation when earlier travel is infeasible. [Review the route to the event](field-route-evidence.md)

Mount each candidate optical path in the carriage frame and move one identified piece through it. Inspect which port can see the seated piece and how far the piece still overlaps the exit support when the last port clears. A software input that changes at the expected time can still give the controller the wrong signal to withdraw.

Try the invented fixture in a fresh output directory:

```sh
node examples/sensor-study/make-example.mjs artifacts/optics-trial
npm run sensor:review -- artifacts/optics-trial/request.json
```

Both ports see the seated sample. Both read clear at early exit with 55 mm of the projected piece still behind the end plane. At the last sample the trailing surface has passed the plane by 20 mm. The readings and comparison witness in this example are synthetic.

## Supply a project study

- **Layout.** Use metres and name one clock and carriage frame. Define the piece as a union of positive-volume boxes (half sizes), spheres or finite axial tubes (half length, outer radius and inner bore radius). Specify the actual material, including holes. An origin, signed cardinal axis (or unitDirection vector) and finite range define each ideal sensor segment. Include opaque carriage structures as solids in the obstruction inventory. A through-beam can be blocked anywhere on its segment. A reflective ray requires the piece to be its first visible surface.
- **Motion.** Supply approach, seated, early-exit and cleared poses on a strictly increasing clock. Translate the material solids in the carriage frame. If the piece rotates, supply its unit quaternion in w,x,y,z order at each pose. Specify each expected occupied/clear pattern in the layout. Specify each observed boolean, acquisition time, attempt and piece identity in the trace. Missing or stale readings keep the review open. The seated pattern must contain an occupied port and differ from the other sampled states. Model moving occluders or a sensing cone externally if the fixed obstruction inventory and a finite segment cannot represent them.
- **Exit.** Declare the support end plane, exit direction and minimum whole-piece separation. For a positive release result also supply an independent clearance measurement or geometry observation at the cleared pose. Identify the source, method, piece, attempt, frame, units, clock and sample time. Pin the layout, trace and witness files by SHA-256 as in the example. Each trace names its layout digest, and the witness names both digests. Review the actual independent source and its registration before using a declaration.
- **Read the result.** For each sample compare geometric visibility, the intended signal, agreement with the observations and the signed trailing-material clearance. A negative value means material remains behind the plane. The release result applies only to the recorded poses and specified exit direction. Calibration still requires a specific device and measured coverage, lighting, surface response, range, noise and failure behavior. The report does not command equipment.

For a finite support with a curved or diagonal exit, put every support solid (or a conservative enclosure of it) in `support.material`. Supply a unit `separatingDirection` from support toward piece in the independent witness. The checker projects every piece and support solid onto that axis at the cleared pose. A positive gap lower-bounds their distance. A missing or inconclusive axis leaves the finite-support result open.

The [editable layout](../examples/sensor-study/layout.json) and [fixture generator](../examples/sensor-study/make-example.mjs) provide the complete field names. Record the CAD revision, sensor mount, observation sources and the limits of your projected geometry with the project files.
