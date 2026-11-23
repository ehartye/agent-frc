# Mechanical-readiness review: special cases

Read a row only when its situation matches the robot under review. The five-step review is in the [mechanical-readiness skill](../SKILL.md). Each row came from one real defect. Add a new lesson here as one row. Do not add it to the five steps.

## Contents

- [Parts and their identity](#parts-and-their-identity)
- [Fits and seats](#fits-and-seats)
- [Motion and linked drives](#motion-and-linked-drives)
- [Game-piece transfer](#game-piece-transfer)
- [Loads and stock](#loads-and-stock)
- [Slow or disagreeing measurements](#slow-or-disagreeing-measurements)

## Parts and their identity

| When | Do | Detail |
| --- | --- | --- |
| A supplied assembly is installed | Compare the current vendor purchase list with the option and revision the model was drawn from. | [Qualify the model](../../../docs/mechanical-readiness.md#start-with-the-actual-installed-assembly) |
| Hardware is mounted and the mechanism has other poses | Verify the mounted hardware at each other pose. Match each installed part's material and density to its drawing or supplier requirement. Compare unchanged bodies with the previous export. Record motion limits and any sourced material substitution. | [Installed hardware and stock](../../../docs/mechanical-methods.md#keep-installed-hardware-and-physical-stock-tied-to-the-source) |
| A supplier model and the installed body differ in volume | Measure both again at matched accuracy. | [Compare a supplier import](../../../docs/fusion-volume-study.md#compare-a-supplier-import-with-an-installed-solid) |
| Two shape comparisons of one part disagree | Check the interior they share and keep the raw measurements. | [Contradictory source shape](../../../docs/mechanical-methods.md#resolve-a-contradictory-source-shape-measurement) |
| A named supplier comparison stalls | Keep the completed measurements and resume the unfinished one. Use the full fresh scan for the final review. | [Keep completed comparisons](../../../docs/mechanical-methods.md#keep-completed-source-comparisons-when-a-solid-takes-too-long) |
| A part was moved or installed by a script | Use the placement guard for the move. Then repeat the whole body census and the motion sweep on the reopened file. | [Checked placement](../../../docs/checked-placement.md) |

## Fits and seats

| When | Do | Detail |
| --- | --- | --- |
| A bearing is adjusted along its shaft | Trace the load path of both races. Measure the full retained shaft stroke. Test a displaced bearing against the hub, the spacer and the outside supports. | [Axial bearing stack](../../../docs/axial-bearing-stack.md) |
| A removable motor or bearing locates on a circular pilot | Check its radial play. Check the shaft alignment left over across every interface that service disturbs. | [Seated pilot](../../../docs/seated-pilot.md) |
| A keyed drive | Check both loaded flanks, the radial support, the axial restraint and the signed torque. Reproduce the seated and the withdrawn case before choosing the key. | [Torque through a straight key](../../../docs/operating-intent.md#check-torque-through-a-straight-key) |
| A modelled thread sits in a smooth pilot | Check where the shared material is, in the reopened Fusion file and in the export. Register the pair and its permitted region. | [Thread fit](../../../docs/spatial-fits.md) |
| A purchased belt is drawn as a smooth band | Compare the belt envelope with sampled metal. Keep the pulley overlap and every contact that is not a mating one. Check tooth engagement, tracking and load separately. | [Belt envelope](../../../docs/belt-envelope.md) |
| A split pilot or a chamfered blind bore | Trace split pilot faces across the whole wall, including openings and the shared exit of a through-tapped case. On a chamfered blind bore, locate the clamp face, the cylindrical pilot and the drill tip separately. | [Fastener stacks](../../../docs/fastener-stacks.md) |
| A fastened stack might pull through its mount | Move the whole stack in the retention and service test. Verify the stop and its load capacity. | [Pull-through test](../../../docs/mechanical-methods.md#can-the-fastened-assembly-pull-through-its-mount) |
| Two mating solids give a zero or disputed shared volume | Check independent bounds on the pair. Register any material known to be forbidden. Use separate interior sample points and the regions on each side. | [Ambiguous pair](../../../docs/operating-intent.md#resolve-a-zero-common-on-a-known-ambiguous-pair) |
| The same interface repeats and the copies disagree | Inspect each original pair and compare its Fusion result in the same installed pose. | [Repeated interfaces](../../../docs/mechanical-methods.md#compare-repeated-installed-interfaces) |

## Motion and linked drives

| When | Do | Detail |
| --- | --- | --- |
| Drives are mechanically linked | Command only the independent axes and read back the followers. Compare signed travel, installed phase, obstruction and recovery with the required range. | [Coupled motion](../../../docs/operating-intent.md) |
| One motion trial stops | Keep a separate result file for each pose, so the parked measurements survive a failed movement. | [Independent pose observations](../../../docs/fusion-authority.md#keep-independent-pose-observations-when-one-trial-stops) |
| A Fusion readback is deferred to a long job | Stage the plugin scripts and project inputs it needs first. Keep the same export through each reopened inspection. | [Long Fusion jobs](../../../docs/native-job.md) |
| A few named parts are rechecked while parked | Verify and reuse their placed geometry from the export. The whole export stays the input to the full review. | [Recheck named pairs](../../../docs/mechanical-methods.md#recheck-named-pairs-from-a-large-parked-step) |
| A service removal | Prove the removal order from the assembled inventory. Keep the whole moving group and every earlier removal at each step. | [Prove the removal order](../../../docs/mechanical-methods.md#prove-the-removal-order) |

## Game-piece transfer

| When | Do | Detail |
| --- | --- | --- |
| A mechanism hands a game piece on | Sweep the real released piece through the installed frame. Include its arrival and a jam and reset case. Check the measured gap through a free release, with a held or reversed drive as a control. | [Loaded transfer](../../../docs/loaded-transfer.md) |
| A delivery depends on a sensor or a simulated support decision | Record the decision on its own clock. Keep the exact piece accepted or refused at every required tick. | [Admission decision](../../../docs/loaded-transfer.md#verify-an-admission-decision-on-its-own-clock) |
| A loaded transfer is claimed from a trajectory | Require the registered trajectory law and all measurements on one clock. Reconcile the piece's momentum across every change of holder and any observed impact. Check the full dwell. Keep one case inside the boundary and one that crosses it. | [Executed trajectory](../../../docs/loaded-transfer.md#register-the-executed-trajectory) |
| A loaded duty has a rotating part | Check the whole rotating part and the forces and moments on each body through the required range. Compare nested supplier solids with their planned mounting sites. | [Finite motion and support](../../../docs/operating-intent.md) |

## Loads and stock

| When | Do | Detail |
| --- | --- | --- |
| Structural stock changed | Recover stress from the real cut section. Check both extreme fibres and the signed governing load. Repeat on the reopened file. | [Section bending](../../../docs/section-bending.md) |
| Machined stock keeps one profile between machining depths | Compare the material in every section. Check a displaced control. Keep any Fusion readings that conflict. | [Stock sections](../../../docs/stock-sections.md) |
| The chassis is free to move under a load | Check the contact reaction available. Compare the response with separate mass and motion evidence. Repeat with a false fixed restraint as a control. | [Coupled support](../../../docs/coupled-support.md) |
| A joint is checked by result only | Follow the measurements behind it to their governing case and their numeric limit. Inspect the direction each real joint can carry, and identify cosmetic covers. | [Operating criteria](../../../docs/operating-intent.md) |

## Slow or disagreeing measurements

| When | Do | Detail |
| --- | --- | --- |
| Two long diagonal solids stall an intersection | Measure a directional clearance bound on the real installed parts. Keep contact, load and motion checks in their own scope. | [Separate two oblique solids](../../../docs/mechanical-readiness.md#separate-two-oblique-solids-before-a-costly-intersection) |
| A valid placed solid gives an invalid self-subtraction | Compare the full placed shapes of that occurrence in the two exports. Keep the raw Boolean results and a displaced control. | [Two placed representations](../../../docs/mechanical-methods.md#compare-two-placed-representations-of-the-same-solid) |
| An intersection is invalid | Resolve it against the same two Fusion bodies at the reviewed pose. | [Qualify the model](../../../docs/mechanical-readiness.md#review-the-geometry-and-duties) |
| A study or outside reviewer found a defect the plugin missed | Reproduce the detection with the installed plugin. Keep the failing control. Rerun the real design. | [Reproduce a defect](../../../docs/mechanical-methods.md) |
