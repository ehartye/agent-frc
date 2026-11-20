---
name: frc-mechanical-readiness
description: "Review a selected robot or subsystem before shop release or showcase promotion. Check exact Fusion and supplier identities, retained assembly paths, interference through motion, fabrication capability, loads and service evidence."
---

# Review the selected robot for fabrication and publication

Start with the exact archive and pose the student would receive. Name the scope, planned operations and candidate revision. Identify every installed article and which mechanisms can move. A usable engineering model can stay in the project while any required check remains open.

1. Cold-reopen the Fusion archive. Reconcile occurrence hierarchy, installed transforms, native body bounds and exact placed STEP solids against the expected build. Bind a purchased article to the official part, configuration, model bytes and item-level rights. Bind a shop-made article to its editable native design, drawing, stock grade and revision. Identify the repeat count and installed position of each identical fastener.
2. Measure the complete placed assembly. Inspect every separate group and every pair with common material. Follow an explicitly retained connection to the chassis from every part. For an intentional press fit, threaded engagement or moving clearance, identify both bodies, the retaining feature, permissible gap/intersection, tolerance and inspection. Retest the whole travel or prove a conservative bound between poses.
3. Ask the shop to reconstruct the hardest joint using its actual tools. Check datums, tool radius, approach/withdrawal, tolerance accumulation, fastener grip, joint restraint, weld access and material/temper where applicable. Replay assembly, inspection and removal within the installed robot. [Shop capability](../../docs/fabrication-capabilities.md) · [Fabrication chain](../../docs/fabrication-chain.md)
4. Trace each governing load through the real supports. Test the adverse direction, extension, asymmetric loading, jam or power loss where applicable, expected impact, repeated duty and service state. Compare stress and stiffness to source-qualified limits. Preserve unknown fatigue life, material properties and physical test status. Challenge support assumptions and reproduce the numerical result. [Mechanism hardening](../../docs/mechanism-hardening.md) · [Coupled support](../../docs/coupled-support.md)
5. Run the [mechanical-readiness review](../../docs/mechanical-readiness.md) on the candidate. Check independently that the duty roster covers the installed design. A new showcase model needs a passing review, including shop and structural duties, and verified rights for every published derivative. Preserve the previously released model if the candidate has a failed or open check. Record the exact failing pair or duty and the next discriminating test in the project.

For every defect found by an external study, reproduce its detection using the installed plugin, retain the failing control and rerun the actual candidate. [Method coverage and project issue register](../../docs/mechanical-methods.md)

If repeated clashes, inaccessible attachments or an unattainable scoring role survive local fixes, revisit the premise with `frc-whole-robot-design`. Compare the inherited mechanism with a different architecture under the same role, space, supply, timing and evidence before choosing the next iteration.

Use the [Fusion authority and revision handoff](../../docs/fusion-authority.md) to establish the one current saved native design, the STEP exported from that design and the identity of the engineering evidence. Recheck the register when resuming in another checkout or before replacing a published view.
