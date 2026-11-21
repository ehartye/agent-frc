# Reproduce a discovered mechanical defect

## Keep completed source comparisons when a solid takes too long

During design, one intricate constituent can occupy a solid kernel long after its neighbours have returned useful results. Register each source and installed STEP, exact solid label and drawing-derived transform. The transform maps source millimetres into the installed STEP frame. Repeated definitions use the full occurrence-qualified labels returned by `showcase_contacts.load_solids`. For an extracted file, keep the independent registration to its parent issue, physical landmarks and world placement. The command measures only the supplied files.

In this synthetic plan a spacer's source origin moves 12 mm along the installed X axis. Replace the example hashes with the SHA-256 of the actual files. Add one entry per independently commissioned constituent. An as-drawn or deliberately displaced control can have its own entry and transform.

```json
{
  "schema": "agent-frc/component-batch@1",
  "configuration": "parked gearbox",
  "articles": [{
    "id": "inboard spacer",
    "source": {"file": "input/spacer.step", "sha256": "<source SHA-256>", "solid": "Spacer"},
    "installed": {"file": "issue/parked.step", "sha256": "<installed SHA-256>", "solid": "Spacer [1.2.1]"},
    "worldTransform": [1,0,0,12, 0,1,0,0, 0,0,1,0, 0,0,0,1]
  }]
}
```

```sh
python scripts/component_batch.py project project/plan.json run-01 --seconds 90
python scripts/component_batch.py project project/plan.json run-02 --seconds 180 --resume run-01
```

Choose a per-article wall-time budget that includes a fresh read of both STEP files, hashing them and running the normal directed comparisons. The runner processes one article at a time. A timed-out worker is terminated and reaped before the next starts. Each finished receipt is written under its checksum. Resume into a **new** directory from a trusted, quiescent run, including a run interrupted before its summary. The runner checks the source bytes, plan, installed Python helpers, Python version and OCP binding. It retains completed results, including numerical disagreements, and retries unfinished articles. Preserve the original directories. A fresh run without `--resume` remeasures every article.

If the supervising process was forcibly stopped, check that its geometry worker has also exited before starting another run. This batch supports the ordinary directed comparison. Run commissioned interior probes or planar-section checks through their existing readiness study.

Read both the execution summary and the raw absent/extra material volumes. A timeout or worker error leaves that article unfinished. A completed observation can be numerically open or show a genuine displacement. An exit code of zero means that all registered measurements returned without a numerical-open finding. Compare those measurements with the article's registered engineering limits. Independently verify any conflicting source or installed volume. Whole-model readiness still regenerates the full scan and all commissioned source comparisons.

The team owns the robot geometry, rules, availability, load cases and acceptance thresholds. The installed plugin owns the comparison methods. When a design study exposes a new failure, record what actually detected it, preserve the failing input and run the same detector on the proposed revision. Keep the prior issue and the corrected candidate distinct. A measurement from a project-only script can motivate a plugin method; reproduce the decision through an installed command or a registered native inspection before claiming closure.

## Select the detector

| What the student needs to establish | Installed method and failing control |
| --- | --- |
| Supplier or made part is the expected shape at every installed pose | `mechanical_readiness.py measure` measures bidirectional missing/extra material against the exact registered neutral source at a proper rigid transform. Exercise a same-bounds missing bore, a handed part and a repeated occurrence. |
| Separate geometric contact from support, interference and restraint | `mechanical_readiness.py review` enumerates all solid groups and checks the complete pair census, fit-specific common volume and declared retained paths to the chassis. Preserve a disconnected group and a penetrating “connected” pair. |
| Parts move through free space, including tools and the real piece | `mechanical_motion.py` compares moving complete BReps against installed solids, other moving groups, staged tooling and field parts. Interpolate relative translation and rotation; bound unsampled travel. Verify early, middle and late interference, and repeat with changed tolerances. |
| The intended piece actually reaches the capture point | Add `requiredContacts` to the same geometry study. A clear route with a positive lower bound to the nearest legal piece fails the contact goal. Use the field-route and sensor checks to connect the physical reach to the same piece and the later accepted event. |
| Bearings, brackets or seats still contact their support at tolerance extremes | Add `seats` and repeat the actual installed pose under controlled offsets or missing supports. Check common material and shared planar face area. Reuse native [hidden backing](hidden-backing-fit.md) for scoped Fusion feature evidence. |
| Sensor can see the required thing in the actual posture | Run `mechanical_motion.py` with `visibility` for calibrated finite-corner projection and optical obstruction at the declared pose. Follow it with `sensor-observability.mjs` and `field-route-evidence.mjs` for support clearance, latency and feasible arrival. Record wrong ID, dark/missing packet, blocking hardware and occlusion. |
| Real stock, hardware, service tools and shop process support fabrication | Run `assembly-accounting.mjs`, `fabrication-capabilities.mjs` and the mechanical tool/seat sweep. Compare nominal and adverse length, shoulder, cutter radius, access, grip and service order with controlled drawing and material evidence. [Material reconciliation](engineering-material-mass.md) |
| Strength, stiffness, impact and fatigue across the actual duty | Use source-bound numerical limits in `mechanical_readiness.py review`. For a uniform solid rectangular cantilever carrying a transverse end force, `member_duty.py` recomputes bending stress, tip deflection and cumulative fatigue damage. For supports and elevation, `hardening.mjs coupled` and `elevation` recompute forces, moments and rating comparisons. For a specialized continuum or fatigue model, preserve the actual solver, installed boundary conditions, material/grade, stress spectrum, design life, mesh/time convergence and perturbed/held-out cases. A signed report alone cannot supply an unknown allowable. |
| Lift holds, handles a jam and survives loss of a support | `hardening.mjs duties` evaluates powered operation, obstruction and a complete post-cut interval. `hardening.mjs paths` tests a component cut, the consequence of differential motion and common descent. Preserve a blocked path or a nominally level falling load. |
| Achievable role and repeated complete robot cycles justify an architecture | `hardening.mjs throughput`, `mission-cohort.mjs` and the whole-robot design skill compare the same actor, finite supply, partner context and frozen time window. Preserve the alternate architecture and counts for acquisition, delivery, recovery and reset. |

The [machine-readable catalog](../references/mechanical-methods.json) identifies installed entries, expected arguments and synthetic regression files. An expert native observation or specialized solver remains qualified by its source, assumptions, coverage and operating scope. A source-specific failure that the existing methods cannot observe stays open while the first-party method is added.

## Exercise an intermediate collision

```sh
python examples/mechanical-readiness/make-exercise.py NEW_PRIVATE_PROJECT
python scripts/mechanical_motion.py NEW_PRIVATE_PROJECT motion.json
```

The first withdrawal crosses the bracket halfway through the stroke; the second has a certified gap. Both endpoint positions of the failed stroke are clear. The separate `issue.json` deliberately lacks a qualified Fusion issue and strength/DFM evidence. Use it to practice interpreting an open model.

A `mechanical-motion@1` study supplies a pinned complete `step` and named `cases`. Each case has a `basis`, `minGapMm`, and a `moves` object keyed by exact placed solid name. A translation has `kind: "translation"` and a total XYZ `travelMm`. A rotation has `kind: "rotation"`, `originMm`, `axis` and `travelDeg`. Operations apply in order in the common frame. Endpoints use normalized times 0 and 1. `initialPose` can place tooling or set a tolerance control before the stroke. Register every moving solid; keep the complete native inventory as the source. A fixture has a distinct `id`, pinned `file`, source `solid` and `basis`. Keep operating geometry complete. For service, run the extraction case first with `stage: "service"` and an `extract` list matching its moving solids. Each extracted solid must move from its installed pose to clear the remaining assembly’s enclosing box, with a bounded clear stroke. A later service case uses `removed` to reproduce the complete state left by one earlier extraction. Deeper `maxDepth` tightens ambiguous intervals. An independently qualified intentional interface needs the exact pair, case, source digest and reviewed result. A failed pair elsewhere still fails the run.

### Prove the removal order

Start with the complete installed STEP. For each extraction, keep the fasteners, shaft, spacers, tools and supports that are still present. Each body in `removed` keeps the ID of the case that physically extracted it. The following example removes a pin together with its captive sleeve.

| Case | Bodies already removed at the start | Moving group to extract |
| --- | --- | --- |
| `release-clip` | `{}` | `["clip"]` |
| `withdraw-pin` | `{"clip":"release-clip"}` | `["pin","sleeve"]` |
| `lift-panel` | `{"clip":"release-clip","pin":"withdraw-pin","sleeve":"withdraw-pin"}` | `["panel"]` |

Use the actual placed body names. A new case with an empty removal map starts a separate trial from the installed assembly. To combine two previously tested operations, run the second from the first operation’s resulting state. A circular dependency has no first physical extraction. Keep the jammed order as an adverse control. Inspect each required case’s `status` and `extracted` list and run the candidate study with `--require-pass`.

This method checks a sequence of complete rigid extractions. If a part must stay partially withdrawn, change grasp, or return to a different installed pose, supply separate continuous motion and support evidence for that transition. Check tool insertion, support after each release, and loaded retention for the actual mechanism.

A `requiredContacts` row gives its `id`, actual piece/body `pair`, `window` on the normalized stroke, permissible `maxGapMm` and `criterion`. A contact witness establishes reach at that pose. Full capture and scoring require retention and a subsequent eligible disposition. A `seats` row gives `pair`, evaluation time `t` and `minAreaMm2`. Positive material intersection fails the seat check.

For sampled visibility provide `id`, a physical `camera` and `target`, `cameraId`, `t`, nominal-frame `eyeMm`, `forwardPointMm`, `upPointMm` and `targetCornersMm`. A pinned `calibration` gives the camera `id`, `imageSizePx` and rectified pinhole `intrinsics` (fx, fy, cx, cy). A pinned `frame` records `cameraId`, `poseFraction`, target, calibration digest, detector method, received flag, detectedId, measured brightness and frame age in seconds. Compare to the goal’s `expectedId`, `minBrightness` and `maxAgeS`. A clear ray without a recorded packet stays open. Repeat across actual poses, including reduced illumination and the missing-frame condition.

## Can the fastened assembly pull through its mount?

Start with the installed load case and its signed extraction direction. Identify the structural member that must stay fixed and the parts that can leave together. A screw, nut and sleeve can stay bolted together while all three pass through a clearance hole.

1. Pin the assembly STEP generated from the selected Fusion issue. In the installed pose, measure the bearing face that opposes the load on the fixed member. Record its direction, shared area and any initial interference. Check both the nut-to-sleeve and the sleeve-to-frame interfaces.
2. In a `mechanical-motion@1` case, give every member of the moving stack the same translation in `moves`. Keep the structural member and other installed obstacles in the scene. Set `minGapMm` from the case and record the signed direction, displacement and units. Compare the retained design with the same assembly after removing or reducing its retaining feature. Repeat at the limiting tolerances.
3. Read the named pair and witness in the result. First check the seat at rest. In a separate displacement test, a pull that enters the retaining face identifies a geometric stop. A bounded clear path over a short pull rules out a stop over that interval. Use the full service stroke and the `extract` result to establish complete removal. An unintended collision elsewhere still fails the assembly review. Contact inside the moving group leaves retention by the frame unresolved.
4. Follow the reaction from the stop into the structural member. Check bearing area, material, edge distances, fastener and member capacities, load distribution and duty. For service, register which parts leave together, preceding extractions and the supported removal direction. Repeat with an overlooked sleeve or keeper left in place.

### Compare repeated installed interfaces

Run `mechanical_readiness.py measure` on the selected assembly STEP. For repeated instances of the same two STEP solid definitions with identical relative orientation and placement, the physical intersection should be invariant as the assembly moves around the robot. The census compares the existing pair measurements. For a discrepancy above its numerical comparison resolution (relative `1e-6`, absolute `1e-8 mm³`), it repeats one intersection in the first member's coordinate frame and records the raw measurements under `repeatedInterfaceDisagreements`. Each instance keeps its own fit limits and original positive overlap.

The census checks the BRep topology of each computed intersection, including an empty result. An invalid result leaves the pair open even if the kernel returned a plausible volume. A positive common volume must also fit inside each operand within numerical resolution. Look up the pair and raw observation in `unresolvedIntersections`, then inspect the same native bodies and pose. Other measured pairs and independently confirmed native collisions retain their findings.

Open the named paths in the native census. Check both kernels, inspect the exact mating faces and compare an independent material witness where needed. A repeated-interface discrepancy stays open even if the recalculated reference gives a valid solid. Independently modeled parts, opposite handedness and changed mounting positions require their own measurements. The comparison resolution governs disagreement detection only. The commissioned fit limit still governs each measured interference.

### Resolve a contradictory source-shape measurement

A correctly located plate with a missing bore has a measurable material difference. A Boolean kernel can also return the full volume in both directions for two solids that share material. The source-shape scan checks the topology of each input and each measured Boolean result, including completed cuts, before accepting their volumes. It also checks the volume balance. When it appears that none of the material is shared despite overlapping bounds, it measures the direct intersection and probes for disjoint balls strictly inside both solids. A proved contradiction leaves that article's identity open; independent measurements for other solids continue.

For a known thin or irregular region, add `componentInteriorPointsMm` to the readiness study. Map the exact placed solid ID to a list of XYZ probe points in the installed frame. Preserve the raw directed differences, direct common volume and certified lower bound in the measurement receipt. A finite set of probes can establish shared material. To resolve identity, reconstruct the drawing at its commissioned pose, partition the solid into disjoint regions, compare each region, and rerun the original case and a deliberately displaced control. Keep the original issue open until the trusted review qualifies the comparison.

### Compare two placed representations of the same solid

When even subtracting a solid from itself gives an invalid result, check whether the previous export and the new export carry exactly the same occupied solid. Register each STEP, its supporting configuration or lineage record and the particular occurrence. Confirm independently that both exports already use the same parked coordinate frame. A shared part name or local definition can occur at several locations.

Run `python PLUGIN/scripts/placed_solid_identity.py PROJECT PLAN.json`. This synthetic plan compares one plate in two saved assemblies. Use the actual STEP occurrence indices reported by the complete inventory.

```json
{
  "schema": "agent-frc/placed-solid-identity@1",
  "frame": "Fixture base datum, millimetres",
  "beforeToAfter": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  "before": {
    "configuration": "Parked fixture, first issue",
    "step": {"file": "cad/first.step", "sha256": "FIRST_STEP_DIGEST"},
    "registration": {"file": "cad/first-lineage.json", "sha256": "FIRST_REGISTER_DIGEST"},
    "solid": "Locator plate", "instance": "1.2.1"
  },
  "after": {
    "configuration": "Parked fixture, successor",
    "step": {"file": "cad/successor.step", "sha256": "SUCCESSOR_STEP_DIGEST"},
    "registration": {"file": "cad/successor-lineage.json", "sha256": "SUCCESSOR_REGISTER_DIGEST"},
    "solid": "Locator plate", "instance": "1.3.1"
  }
}
```

The optional registration identifies one project receipt row. Its `step.sha256`, `selected` and `STEPidentity` fields must bind the digest, solid name and complete resolved identity (definition, instance index and occurrence path) together. A receipt with several rows can specify one JSON pointer in `rowAt`. Keep both occurrence registrations for a paired issue replay. A mismatched receipt rejects the comparison. Omit the registration to inspect the supplied STEP files alone. Confirm the native coordinate system and configuration independently in either case.

The reader imports each complete STEP, resolves the registered leaf in world coordinates and checks that its geometric faces enclose a valid solid with positive signed volume. It compares the full binary BRep streams in one kernel, including orientation and location. The receipt preserves both hashes, resolved paths and the separate directed Boolean measurements. `representedSolidEquality: "proved"` establishes equal represented geometry for those two selected leaves. Different encodings can describe equivalent geometry, so differing bytes leave this exact test open. Repeat the plan against a deliberately displaced export and retain the measured differences. For paired issue replay use `placed-solid-identity`, criterion `/representedSolidEquality` equal to `proved`, and candidate STEP binding `/after/step/sha256`.

The native inspection, supplier identity, installed fit, neighboring bodies and motion each retain their own findings. The reviewer checks that both registration records actually establish the frame, configuration and article claimed in the plan.

## Replay an external finding

```sh
python scripts/mechanical_methods.py PROJECT issue-register.json --require-pass
```

An `agent-frc/mechanical-issues@1` register identifies the pinned `archive`, `step` and each finding by `id`, `finding` and catalog `method`. Give it a `negative` case and a `candidate` case. Each case supplies the method’s named `inputs` as pinned project files. The candidate’s `geometryBindings` identify an actual input file, a JSON Pointer in that file and `kind` (archive or step). A shared `criterion` has a result `pointer` and an expected `equals`, or numeric min/max. Keep the same scoped result pointer for the preserved failure and candidate. Record the failing result on the preserved control and passing result on the actual candidate. List the finding IDs in `externalIssues` and pin the register and its receipt in `issueRegister` and `issueResult` in the readiness study. Freeze the installed plugin version when publishing.

Use this same question on systemic failures. If the shop cannot reach the essential joint, a support governs across every plausible material, or the robot cannot collect its assigned pieces before the window closes, compare a different mechanism or whole robot against the same role. [Whole-robot design](../skills/frc-whole-robot-design/SKILL.md)



## Size a member for its registered load spectrum

Run `python scripts/member_duty.py PROJECT member.json`. The `agent-frc/member-duty@1` input binds the STEP, installed body, measured `dimensions`, controlled `material` and measured or conservatively bounded `load`. Dimensions and loads identify the same body and STEP digest. Specify width, bending depth and span in mm, the section as `solid-rectangle`, the installed bending axis and grade. The material source supplies MPa modulus, bending allowable and the qualified fully reversed S–N curve as decreasing stress/increasing life pairs. Identify its condition and surface treatment. Supply the stress factor and basis, deflection limit and allowable damage. The load file identifies the `fixed-free-end-force` support and bending axis, plus every case’s signed minimum and maximum newtons, lifetime cycles and source. Declare whether the life spectrum is complete.

The solver computes section moment of inertia, bending stress and elastic tip deflection, then interpolates the supported S–N curve logarithmically and sums cycle damage. An incomplete life spectrum, unqualified mean stress or extrapolated fatigue life stays open. Evaluate bearing/joint restraint, shear, buckling, actual impact peak force and other support conditions using appropriate evidence. This member result alone cannot qualify a full assembly.

## Keep installed hardware and physical stock tied to the source

Cold reopen the selected Fusion design. Capture the actual joint occurrences, degrees of freedom, saved coordinates and enabled limits with `fusion_joint_authority.capture(app, project, lineage_file, new_output, station_key)`. Pin the signed result as `jointAuthority`. Each engineering connection is rigid by default. An articulating connection names its `jointGroup` and both actual joint member occurrences. Check that assembly hardware remains fixed in its parent's coordinate frame across the complete commanded poses. The release review compares both translation and angular change. A bare directory tree is insufficient to establish a fastening path. A cold native body without three usable noncollinear vertices can establish placement from matching trimmed surface parameters in the local and occurrence frames. The resulting witness describes the represented transform. A symmetric smooth part may lack a physically meaningful clocking feature.

Compare every source joint and its measured travel with the [selected commissioning duty](operating-intent.md).

Use `python scripts/assembly_kinematics.py PROJECT mounts.json` to diagnose a named mount from original census files. The `agent-frc/rigid-mounts@1` study pins `saved` and the list of alternate `poses`. Each mount supplies an `id`, `host` and `member` expressed as native occurrence/body-name pairs. Examine the actual millimeters and degrees for each pair. An otherwise clear moving assembly can leave a bolt behind.

Resolve the exact specified materials in the installed Fusion library before building. When a grade is absent, define and document the source-backed custom physical material and its properties. Save editable work at a private checkpoint while unresolved material requirements remain open.

Capture physical stock independently of appearance with `fusion_body_materials.capture(app, project, lineage_file, new_output, station_key)`. Pin the resulting complete register as `materialCensus`. Each fabricated article links a `materialSpecification` with its exact `drawing` pin. The specification's `bodyMaterials` maps original solid names to `grade`, `basis`, `fusionMaterial`, accepted `materialIds` and `densityKgM3`. A purchased article places its same constituent mapping in the source-bound selected-purchase BOM. The reviewer joins by structural occurrence and original solid, then reuses the installed stock checker with actual cold mass, volume, material name and library identity. A color or a correct aggregate SKU cannot qualify a core, liner or insert. Preserve voids, service reservations and display geometry as separate design representations outside the installed physical solids and structural mass. Reconcile exclusions and supplier mass separately. [Native material and mass accounting](engineering-material-mass.md)

For a successor, pin a `materialHistory` study referencing both native inventories and the declared volume matching uncertainty. Run `python scripts/fusion_body_materials.py PROJECT history.json` using `agent-frc/material-reissue@1` with `previous`, `current` and `volumeToleranceMm3`. Comparable named constituents that changed library ID stay open. A `substitutions` entry pins a reviewed change with both archive digests, justification, reviewer, current stock specification and exact occurrences and before/after IDs. New or reshaped parts still require the complete present stock comparison.

A complete pair census records coverage even when one kernel returns no result. Inspect `unresolvedPairs` and the named pair's independent `interferenceMm3` and `temporaryCommonMm3`. An unresolved kernel keeps release open. A measured clash from either method remains a failure. For a signed complete census, call `fusion_retry_station.retry(app, project, lineage_file, previous_file, new_output, pairs, key, station_folder)` on the same pose. It verifies the old native signature and resolved source, remeasures only the named unresolved indices and issues a new receipt. Keep the former observation for comparison. A different source, pose, Fusion runtime or placed inventory needs a fresh census.

To locate work around a proposed replacement, run `python scripts/native_pair_scope.py PROJECT selection.json`. Pin the complete native `census`, give the exact `members` as occurrence-path/body-name pairs, and set `thresholdMm3`. The report lists measurements inside, crossing and outside the selected subassembly, including unresolved kernel results on either side. A local change still requires a fresh complete assembly check on the successor.
