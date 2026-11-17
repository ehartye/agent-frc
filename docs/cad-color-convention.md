# Standing CAD viewing-color convention

Use a consistent functional-role color convention whenever creating or revising a robot CAD view, blockout or inspection image. Start with [the portable default palette](../references/cad-color-convention.json), or preserve a documented project convention that already serves the same purpose. Do not randomly recolor parts between views. Apply through native appearance/view controls where supported; this reference is not an automatic Fusion recoloring tool.

| Role | Default color | Non-color cue |
|---|---|---|
| Structure | Slate blue #496A81 | S label / structural component group |
| Moving mechanism | Teal #007F78 | M label / named group and motion arrow |
| Game piece | Gold #E6B450 | G label / piece outline |
| Electrical and control | Violet #8263A9 | E label / named electrical group |
| Reserved space or keep-out | Orange #D55E00 | K label / dashed or hatched envelope |
| Reference or unassigned | Gray #8A9199 | R label / reference group |

## Apply and explain

Attach a visible legend to overview captures and make the legend/mapping available with the native design. It must name roles and non-color cues, state that colors are viewing aids, and identify the convention revision and any overrides. Give each component a semantic role in the mapping; do not infer physical material, motion or ownership from a color alone. For multi-role parts, choose the primary viewing role and record secondary roles in labels/metadata. Distinguish adjacent moving groups with names, edge outlines or exploded views rather than creating an unbounded rainbow.

Keep supplier parts' existing appearance/finish semantics by default. If they obscure an assembly review, use a reversible view/occurrence overlay or labeled bounding outline, preserve the original mapping, and identify supplier-original versus overridden appearance in the legend. Do not edit physical material assignment, mass, density or simulation contact properties to achieve a color. Appearance must not modify geometry, joints, visibility or export inventory. Check save/reopen persistence and take a before/after inventory/readback when applying native changes.

## Accessibility and evidence

Never encode meaning in hue alone. Use labels, role prefixes, groups and outlines/hatching that remain useful in grayscale or common color-vision differences. The palette includes contrasting label text colors for opaque swatches; actual lighting, transparency and background can reduce legibility, so inspect both light/dark backgrounds and a grayscale capture. No claim that all 3D shaded colors are universally distinguishable is made. If the CAD viewer lacks hatching, use a labeled outline and explanatory legend instead.

Keep evidence status separate from functional role: write UNKNOWN, NOT CHECKED, REJECTED or SUPPORTED WITHIN SCOPE with a linked check/revision. Do not recolor an entire robot green as a safety/legality badge, or use red/green alone for pass/fail. Keep-out orange indicates a design-space reservation, not a certified hazard boundary. Translucency can help inspect envelopes but must not hide interferences or exclude bodies from exports; record any intentionally hidden references.

## Project override and recheck

A student/team may override colors for an established convention, accessibility needs or a specific comparison. Save the role-ID-to-appearance mapping, reason, revision and legend with the project, and use it consistently. Ask only when the choice is consequential; routine readable defaults do not need a separate design decision. Recheck semantic coverage, supplier preservation, label readability, native persistence and unchanged physical properties after updates. Keep the convention portable across Fusion, blockouts and rendered evidence, without implying an exchange format preserves native appearances.

Tests validate the default role IDs, unique colors, explicit non-color cues, hex values and opaque swatch label contrast. They do not certify native application, actual rendered contrast, material assignments or physical correctness. The current robot's requirement for a native Fusion file remains separate from this viewing convention.
