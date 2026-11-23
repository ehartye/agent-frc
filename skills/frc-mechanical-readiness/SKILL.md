---
name: frc-mechanical-readiness
description: "Review a selected robot or subsystem before shop release or showcase promotion. Check exact Fusion and supplier identities, retained assembly paths, interference through motion, fabrication capability, loads and service evidence."
---

# Review the selected robot for fabrication and publication

Review the fabrication package and current native Fusion assembly from detailed design. Record a build-ready outcome only when all applicable checks pass. A blocking animation establishes only the gross paths and allowances covered by that study. [Engineering detail and exit criteria for the three phases](../../docs/design-phase-detail.md)

For an axial bearing adjustment, [check the complete stack](../../docs/axial-bearing-stack.md). Trace both race load paths, measure the full retained shaft stroke, and test a displaced bearing against the hub, spacer and outside supports.

For a removable motor or bearing with a circular pilot, [check its radial locating play](../../docs/seated-pilot.md) and the remaining shaft-alignment allowance across the interfaces disturbed during service.

For repeated parked checks on a few named parts, [verify and reuse their placed STEP geometry](../../docs/mechanical-methods.md#recheck-named-pairs-from-a-large-parked-step). Keep the complete issue as the input to whole-assembly review.

Use the [agent placement guard](../../docs/checked-placement.md) when moving or installing components. Then repeat the complete cold census and the operating sweep on the issued assembly. [Keep independent pose receipts](../../docs/fusion-authority.md#keep-independent-pose-observations-when-one-trial-stops) so a failed motion trial leaves parked measurements available for diagnosis.

Compare every physical occurrence in the cold successor with the [pre-CAD target roster](../../docs/article-functions.md). Reconcile added, missing and substituted parts, then qualify actual retention and clearance across the complete assembly.

Check saved installation features against independently frozen world datums, including fixed hardware. Trace each loaded mount through its qualified structural members to the chassis. For service, [prove the removal order](../../docs/mechanical-methods.md#prove-the-removal-order) from the assembled inventory, retaining the complete moving group and all prior removals at each step. Identify cosmetic covers and inspect the direction each actual joint can carry. Commission the physical donor, recipient, finite article and supported acceptance interval for every loaded duty. Verify measured separation through a free release, including a held or reversed drive as a control. Review registered numerical disagreements between mating solids using independent interior witnesses and complementary regions. [Operating criteria](../../docs/operating-intent.md)

Start with the exact archive and pose the student would receive. Name the scope, planned operations and candidate revision. Freeze the required operating travel, handoffs and known defects from the commissioning plan. On cold reopen, compare them with the recorded rooted Fusion joint inventory, including fixed and hidden assemblies. A usable engineering model can stay in the project while any required check remains open.

1. Cold-reopen the Fusion archive. Reconcile occurrence hierarchy, installed transforms, native body bounds and exact placed STEP solids against the expected build. Bind a purchased article to the official part, configuration, model bytes and item-level rights. Bind a shop-made article to its editable native design, drawing, stock grade and revision. Identify the repeat count and installed position of each identical fastener. For a volume discrepancy, [retest the supplier and installed bodies at matched accuracy](../../docs/fusion-volume-study.md#compare-a-supplier-import-with-an-installed-solid). If shape comparisons disagree, [check their shared interior and retain the raw measurements](../../docs/mechanical-methods.md#resolve-a-contradictory-source-shape-measurement).
2. Measure the complete placed assembly. Inspect every separate group and every pair with common material. Follow an explicitly retained connection to the chassis from every part. For an intentional press fit, threaded engagement or moving clearance, identify both bodies, the retaining feature, permissible gap/intersection, tolerance and inspection. Resolve any invalid intersection against the same two native bodies at the reviewed pose. For [disagreeing repeated interfaces](../../docs/mechanical-methods.md#compare-repeated-installed-interfaces), inspect each original pair and compare its native result in the same installed pose. Retest the whole travel or prove a conservative bound between poses.
3. Ask the shop to reconstruct the hardest joint using its actual tools. Check datums, tool radius, approach/withdrawal, tolerance accumulation, fastener grip, joint restraint, weld access and material/temper where applicable. Replay assembly, inspection and removal within the installed robot. [Shop capability](../../docs/fabrication-capabilities.md) · [Fabrication chain](../../docs/fabrication-chain.md) Commission each installed [blind or through screw stack](../../docs/fastener-stacks.md), its bearing seat, full thread engagement and actual bottom clearance. Trace split pilot faces across the complete wall, including intermediate openings and the shared exit of a through-tapped case. On a chamfered blind bore, locate the clamp face, cylindrical pilot and drill tip separately. Check whether a fastened stack can pull through its structural mount. Move the whole stack in the [retention and service test](../../docs/mechanical-methods.md#can-the-fastened-assembly-pull-through-its-mount) and verify the stop and its load capacity.
4. Trace each governing load through the real supports. Test the adverse direction, extension, asymmetric loading, jam or power loss where applicable, expected impact, repeated duty and service state. Compare stress and stiffness to source-qualified limits. Preserve unknown fatigue life, material properties and physical test status. Draw the external boundary for each case. For a free chassis, check the available contact reaction and compare the response against independent mass and motion evidence. Repeat with a false fixed restraint. [Mechanism hardening](../../docs/mechanism-hardening.md) · [Coupled support](../../docs/coupled-support.md)
5. Run the [mechanical-readiness review](../../docs/mechanical-readiness.md) on the candidate. Check independently that the duty roster covers the installed design. A detailed design becomes the `effective` showcase model only with a passing review, including shop and structural duties, and verified rights for every published derivative. Save the review result and commit it with the status change in one reviewed pull request; the publication check fails an effective design whose review does not pass. An [in-progress detailed design](../../docs/design-publication.md#publish-a-detailed-design) can publish beside it on automated prerequisites: an effective preliminary link, a passing layout check on the registered Fusion export and a mission animation. Those prerequisites never make a design effective. A [preliminary design release](../../docs/design-publication.md#publish-a-preliminary-design-release) needs only its layout-checked physics receipt and a mission-task case, and remains secondary to the detailed model. Preserve the previously released model if the candidate has a failed or open check. Record the exact failing pair or duty and the next discriminating test in the project.

For every defect found by an external study, reproduce its detection using the installed plugin, retain the failing control and rerun the actual candidate. [Method coverage and project issue register](../../docs/mechanical-methods.md)

If repeated clashes, inaccessible attachments or an unattainable scoring role survive local fixes, revisit the premise with `frc-preliminary-design`. Compare the inherited mechanism with a different architecture under the same role, space, supply, timing and evidence before choosing the next iteration.

Use the [Fusion authority and revision handoff](../../docs/fusion-authority.md) to establish the one current saved native design, the STEP exported from that design and the identity of the engineering evidence. When resuming in another checkout or before replacing a published view, verify the selected register and lineage with `fusion_authority.py`. For a mechanical review, use `fusion_issue_inventory.capture` in Fusion for missing commissioned poses. [Resume a registered master](../../docs/fusion-authority.md#resume-a-registered-master)

For a mechanism that transfers a game piece, [sweep the actual released object through the installed frame](../../docs/loaded-transfer.md), including its arrival and a jam/reset case. Compare the current vendor purchase BOM to the model’s as-drawn revision for every supplied assembly.

For a commissioned [numerically ambiguous interface](../../docs/operating-intent.md#resolve-a-zero-common-on-a-known-ambiguous-pair), check independent bounds on the pair and register any known forbidden material witness.

Follow the underlying observations for each qualified joint through to their governing case and numerical acceptance limit. The design is shown in [one viewer, its design review](../../docs/design-publication.md#one-viewer-for-one-design).

Verify mounted hardware at alternate native poses and match each installed constituent's physical material and density to its drawing or supplier requirement. Compare unchanged bodies to their previous native issue. Record motion limits and source-backed material substitutions before issuing a replacement. [Installed hardware and stock](../../docs/mechanical-methods.md)

For mechanically linked drives, command only the independent native axes and read back the followers. Compare signed travel, installed phase, obstruction and recovery against the commissioned operating interval. [Review coupled operating motion](../../docs/operating-intent.md)

For a loaded duty, check the entire rotating article and the simultaneous forces and moments on each body through the required interval. Compare the actual nested supplier solids against their commissioned mounting sites. [Finite motion, support and placement](../../docs/operating-intent.md)

When a delivery depends on a sensor or simulated support decision, [commission its original observation clock](../../docs/loaded-transfer.md#verify-an-admission-decision-on-its-own-clock) and retain the exact article accepted or denied at every required tick.

For a loaded transfer, require its independently registered trajectory law and all synchronized measurements. Reconcile one-sided article momentum across every custody transition and any independently observed impact. Check the full dwell and retain a matched within-boundary and crossed-boundary case. [Commission measured motion](../../docs/loaded-transfer.md#register-the-executed-trajectory)

Before making a design effective, run the [publication check](../../docs/design-publication.md#effective-designs) locally. Attach the review's findings to the pull request and keep the current effective design published while any required qualification is open.

For a deferred native readback, [stage its exact plugin and project dependencies](../../docs/native-job.md) before dispatch. Keep the same source issue through export, each cold inspection and release.

For a numbered design, commission the whole-robot or subsystem publication scope and review the selected current native issue. The earlier design stays effective until the pull request that makes the new one effective merges. [Design status](../../docs/design-publication.md#design-status)

For stalled oblique solid pairs, [measure a finite directional clearance bound](../../docs/mechanical-readiness.md#separate-two-oblique-solids-before-a-costly-intersection) on the exact installed articles and keep checks of contact, load and motion in their original scope.

For a keyed drive, commission both loaded flanks, radial support, axial restraint and the signed torque. Reproduce the seated and withdrawn cases before selecting the installed key. [Test torque through a straight key](../../docs/operating-intent.md#check-torque-through-a-straight-key)

For a modeled thread in a smooth pilot, check the location of the common material in both cold Fusion and the placed STEP. [Commission the physical pair and its permitted region](../../docs/spatial-fits.md).

For machined stock whose profiles stay constant between machining depths, [compare the material in every section](../../docs/stock-sections.md). Check a displaced control and retain conflicting native observations.

If a valid placed solid even gives invalid self-subtractions, [compare the full placed BReps of that registered occurrence in the two exports](../../docs/mechanical-methods.md#compare-two-placed-representations-of-the-same-solid). Retain the raw Boolean results and a displaced control.

For a purchased flexible drive represented by a smooth band, [compare the finite belt envelope and sampled metal](../../docs/belt-envelope.md). Preserve pulley overlap and every nonmating contact, and qualify tooth engagement, tracking and load separately.

After changing structural stock, [recover stress from its actual cut section](../../docs/section-bending.md). Check both extreme fibers and the signed governing load. Repeat a proposed section on the cold installed derivative.

When a named supplier comparison stalls, [retain and resume the individual source measurements](../../docs/mechanical-methods.md#keep-completed-source-comparisons-when-a-solid-takes-too-long). Use the full fresh readiness scan for promotion.
