# Detailed design: special cases

Read a row only when its situation matches the work in front of you. The ordered workflow is in the [detailed design skill](../SKILL.md). Each row came from one real defect. Add a new lesson here as one row. Do not add it to the workflow.

## Contents

- [Symptoms: likely causes](#symptoms-likely-causes)
- [Purchased parts and stand-ins](#purchased-parts-and-stand-ins)
- [Mass, materials and actuators](#mass-materials-and-actuators)
- [Editing the Fusion file](#editing-the-fusion-file)
- [Measuring in Fusion](#measuring-in-fusion)
- [Motion, game pieces and sensors](#motion-game-pieces-and-sensors)
- [Fits](#fits)
- [Long checks and hand-written comparisons](#long-checks-and-hand-written-comparisons)
- [Resuming and tidying](#resuming-and-tidying)

## Symptoms: likely causes

The skill's "When you see this, try this" table gives the first thing to try. This table gives the likely causes, most likely first. The second table holds ten rarer symptoms in full.

| You see | Likely causes |
| --- | --- |
| The Fusion export fails the layout check | 1. A `part` entry names a solid the export lacks, or a name changed. 2. The export frame differs from the layout datum. 3. A new part sits in a swept path. 4. A fit is not declared. 5. A real clash that the blockout hid. |
| Bolted parts fail a case only because they touch | 1. The case keeps a clearance above zero from the blockout, where no two solids touched. 2. A fastener or bearing overlaps its hole and needs a declared fit. |
| A detailed part crosses a reserved volume or path | 1. The part is larger than its block. 2. The block was drawn at one pose and the part sweeps. 3. A fastener head, motor tail or connector sticks out. 4. The reservation was too tight. |
| The mass reserve is used up | 1. Fasteners and brackets were never in the estimate. 2. A material is wrong or left at the default. 3. A purchased assembly is counted at CAD mass and again at catalogue mass. 4. Real growth. |
| The voltage reserve is used up | 1. A different motor or ratio than the estimate assumed. 2. More moving mass. 3. Two loads now overlap in time. 4. Current limits are not set. |
| A supplier model and the installed body disagree | 1. Wrong option or revision of the part. 2. Units or scale on import. 3. A feature was cut in the assembly. 4. Volume read at different accuracy. |
| An interference that is an intended fit | 1. A press fit, thread or bearing seat modelled with overlap. 2. A soft part squeezed by design. 3. A belt or chain drawn as a band over teeth. |
| A check is too slow | 1. Every pair of a large export is intersected. 2. A fine tolerance on every case. 3. Fasteners swept as separate solids. 4. Too many or too few worker processes. |
| A bench test has no owner | 1. No part in the detailed design corresponds to it. 2. It is a field or software measurement. 3. A design change removed the risk. |
| The published model and the Fusion file disagree | 1. The export is older than the last save. 2. The site was built from another branch. 3. The picture was made from another file. |
| A joint reaches its angle but the part is in the wrong place | 1. The joint origin is not on the handoff datum. 2. The wrong component is grounded. 3. A nested component cancels the transform. |
| A scripted placement is refused before contact checks | 1. A joint or ground pulled the part back on recompute. 2. The wrong occurrence path. |
| The same clash survives local fixes | 1. The mechanism does not fit its reservation. 2. The architecture is wrong for the role. |
| The project's Fusion register names another design | 1. `iterations/active.json` still points at an earlier architecture. 2. The register was never updated after the preliminary design changed. |
| Work must move to another computer | 1. The Fusion file is not committed. 2. A cloud design is ahead of the committed file. 3. A path was recorded as absolute. |

| You see | First thing to try | Check in when |
| --- | --- | --- |
| A supplier model and the installed body disagree | Compare part number and option, then bounding box, then volume at matched accuracy. | The supplier's current part differs from the one modelled |
| The published model and the Fusion file disagree | Export again from the saved file, generate the solids, rerun the check and stage again. | The published design is effective |
| A joint reaches its angle but the part is misplaced | Measure one named point at two joint values against the handoff. | The handoff datum is wrong |
| A scripted placement is refused | Read `reason` in its result. [Read a refused placement](../../../docs/checked-placement.md#read-a-refused-placement) | Two attempts fail the same way |
| A part must cross a `Limit` body | Confirm the limit's value and its source in the project before changing anything. | The limit comes from a rule you have not verified in the project |
| An interference is an intended fit | Register the pair with its kind and a limit from the drawing. Confirm the overlap is where the fit is. | The overlap is larger than the fit explains |
| A bench test has no owner | Map it to a part, a fixture or a software check. If the design removed the risk, close the risk with `closedBy` in the next preliminary version and seed the record again. | It needs a field element or a measurement the shop cannot make |
| The same clash survives local fixes | Stop after the third fix. Write what failed each time. | Always |
| Work must move to another computer | Save, export, commit the Fusion file, export and check inputs together, and push. | The cloud copy and the committed file differ |
| The voltage reserve is used up | Recompute the governing case with the new mass and ratio. Try a current limit or a staggered start before new hardware. | The weak-battery case still fails |

## Purchased parts and stand-ins

| When | Do | Detail |
| --- | --- | --- |
| A shape is impractical to author in Fusion, such as a large scripted family of candidates | Write down why Fusion cannot do it, what the outside tool enables and how the result returns to the student assembly. Keep the generator and its inputs. Import the chosen solid into Fusion. | [Fusion authority](../../../docs/fusion-authority.md) |
| No exact manufacturer model can be found | Record the failed lookup or the mismatch. Mark the replacement as a stand-in, cite the dimensions it is built from and list the design decisions it leaves open. | [Hardware catalog](../../../docs/hardware-catalog.md) |
| A nested assembly reuses a body or source mapping | Capture the real ancestry, child overrides and the whole expected inventory, hidden bodies included. Never match by display name alone. | [Occurrence identity](../../../docs/native-identity.md) |
| A proxy stands in for a part in a contact check | Declare both shapes and check the installed transform separately. Outer-envelope overlap and an unregistered supplier orientation stay unknown. Keep the observed volumes and failed poses. Do not drop unsupported contact from a physics model to obtain clearance. | [Native CAD lessons](../../../docs/native-cad-feedback.md) |

## Mass, materials and actuators

| When | Do | Detail |
| --- | --- | --- |
| Choosing parts or combining design changes | Reconcile installed instances, supplied parts and inspection mass. When a later change replaces a part, select the change that installs it first and record each change's own signed mass. Trace the limit to the project's rule or budget before relying on a margin. | [Assembly accounting](../../../docs/assembly-accounting.md) |
| Claiming a fabrication-ready assembly | Reconcile the full material inventory of the reopened file with the bill of materials. Separate stock grades, complete purchased parts and display or fixture bodies. Rebuild a critical fastened interface from the drawing and loose parts first. | [Material and mass](../../../docs/engineering-material-mass.md) |
| Sizing an actuator from a simulation | Compare the real parts that move with each joint. Check the signed axis, moving mass, centre and rotary inertia at the selected configuration. Keep unknown internals of purchased parts visible. | [Articulated mass](../../../docs/articulated-mass.md) |
| Carrying a simulated contact result into design | Check the collision shape the solver used against the real part and its mounted poses. | [Collider comparison](../../../docs/collider-comparison.md) |

## Editing the Fusion file

| When | Do | Detail |
| --- | --- | --- |
| A script creates, inserts or moves a part | Run the checked placement against the last good file before adopting the new pose. Keep rejected proposals and the pair that refused them. | [Checked placement](../../../docs/checked-placement.md) |
| The part sits under a rotated or translated parent | Apply the nested root-frame example. Measure the intended material again after attaching and reopening. | [Move a nested child](../../../docs/checked-placement.md#move-a-nested-child-in-the-root-frame) |
| A scripted placement stops before its contact checks | Compare the requested and observed world matrices of the occurrence after recompute. | [Read a refused placement](../../../docs/checked-placement.md#read-a-refused-placement) |
| Replacing or removing a part | Check exact occurrences and bodies, empty parent components, the inventory after edit, recompute and reopen, and the features that must persist. A delete return value or an equal body count is not enough. Recheck assembly interfaces apart from the game-piece path. Keep every new or larger interference. | [Persisting a change](../../../docs/native-revision.md) |
| A saved assembly replaces a temporary CAD document | Verify the destination, the assembly and the moving geometry before repeating a clearance query. Save the binding and pose inputs in the project. | [Study replay](../../../docs/native-study-replay.md) |
| An agent drives a local Fusion session | Use the guarded disposable recipe: one matching document plus a job marker, expected geometry, recorded intent, no replay after an uncertain result, feature health, and separate reopen checks of the Fusion file and the export. One tested bracket does not prove a full robot or crash recovery. | [Guarded recipe](../../../examples/fusion-guarded/README.md) |

## Measuring in Fusion

| When | Do | Detail |
| --- | --- | --- |
| Claiming a clearance or a valid mount | Check static supports apart from moving and game-piece sweeps. Keep baseline contacts and failing intermediate poses. Require a stated bound, a control that must fail and visible progress for an expensive check. | [Native CAD lessons](../../../docs/native-cad-feedback.md) |
| Relying on a Fusion mass or Boolean result | Compare direct and temporary volume readings on a known solid. Check one overlapping control and one separate control. Inspect the face set. For a machining change, limit the cut to its participants and reopen the cut body and each neighbour the tool crossed. | [Two-plate experiment](../../../docs/fusion-volume-study.md) |
| Using generated primitives for clearance | Verify real world bounds and position, and the analytic volume, with translated, on-axis and near-axis controls. A correct volume does not prove a correct position. A matching placement does not prove clearance. | [Fusion handoff checks](../../../docs/native-fusion-handoff.md) |
| A frame or bumper support hides behind a cover | Recover the whole installed backing behind the cover and keep the display states. Measure the real mating area. Reopen a replacement separately. | [Hidden backing](../../../docs/hidden-backing-fit.md) |
| Reporting a joint pose | Choose the observation stage that matches the claim. Verify the real coordinate, the moving members and the stationary structure. | [Choose when to observe a joint](../../../docs/mesh-correspondence.md#choose-when-to-observe-a-joint) |

## Motion, game pieces and sensors

| When | Do | Detail |
| --- | --- | --- |
| A loader, hopper or circulating carrier | Sweep the loaded gate and the pieces beside it. Record what the next stage accepts. Trace the return path on one clock. Check the next piece after reset. Compare the spacing achieved with the rate required. | [Storage to service](../../../docs/storage-to-service.md) |
| A sensor advances the mechanism | Check the mounted optical path. Compare the seated and early-exit readings with the real material. Require a separate clearance observation before withdrawal. | [Sensor observability](../../../docs/sensor-observability.md) |
| A camera judges whether a piece is seated | Trace the same camera rays with the piece removed, at pickup and during travel. Find the rays that still see a calibrated surface as the mechanism moves. Use those rays to tell a seated piece from an empty or shifted one. | [Camera reference](../../../docs/camera-reference.md) |
| Setting a working range or a tolerance | Use the operating-space worksheet beside the existing narrative. Mark each limit as physical or as a study limit. Mark affected results stale after a change. Leave the consequential choice with the student. | [Operating space](../../../docs/operating-space.md) |

## Fits

| When | Do | Detail |
| --- | --- | --- |
| A modelled external thread sits in a smooth tap pilot | Register the allowed ring of shared material. Check both shapes are what they claim. Keep the raw shared volume. | [Thread fit](../../../docs/spatial-fits.md) |

## Long checks and hand-written comparisons

| When | Do | Detail |
| --- | --- | --- |
| A Fusion job will run for a long time | Stage the plugin scripts and project inputs it needs in one job folder first. Run the access check in Fusion before the job. Reopen and inspect through that folder. Remove it when the job has finished and the earlier documents are open again. | [Long Fusion jobs](../../../docs/native-job.md) |
| Checking a result file against an expected list | `npm run native:witness -- RESULT.json EXPECTED.json` compares two files. It does not run CAD. Write the expected states, pairs and tolerances before the run. Rotating geometry with no registered phase, a failed Boolean and an incomplete result stay unknown. | [Native CAD lessons](../../../docs/native-cad-feedback.md) |
| Comparing an expected and an observed inventory or joint list | `native:export` and `native:articulation` each compare two JSON files, expected first. A match does not open CAD, prove a reopen or qualify a robot. Say whether each input was synthetic, read from Fusion or reported by a person. | [Comparison contracts](../../../docs/native-viewer-contracts.md) |
| A plugin tool fails or gives a wrong answer | Report it at once with the input that shows the fault. Do not save it for cleanup. | [Reproduce a defect](../../../docs/mechanical-methods.md) |

## Resuming and tidying

| When | Do | Detail |
| --- | --- | --- |
| Resuming a design someone else started | Follow the continuation procedure before proposing the next edit or experiment. | [Design continuation](../../../docs/strategy-first-continuation.md) |
| Choosing a working Fusion draft or handing one back | Give the draft a recognisable name. Verify the save reached the right place. Report the active tab. List exact document identities. Keep unknown or unsaved work. Settle long operations before closing inspection copies or retrying. | [Project tidying](../../../docs/project-tidying.md) |
| The whole robot is offered as a public Fusion download | Reopen the downloadable file and record its own components, features and joints. | [Public Fusion handoff](../../../docs/public-fusion-handoff.md) |
| A fact comes from a source outside the project | Open the official source before a factual decision. Keep source findings, recommendations and unknowns apart. | [Grounding](../../../docs/grounding.md) |
