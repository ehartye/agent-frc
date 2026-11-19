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

The plugin provides the six functional roles above. A new robot project can use all six without a configuration file. To change one color or add a role for a distinct component group, commit `cad/component-palette.json` to the robot repository. Each value is a six-digit sRGB hex color. Keep role IDs stable across CAD revisions.

```json
{
  "schema": "agent-frc/component-palette@1",
  "colors": {
    "structure": "#657789",
    "bumper-blue": "#285BA3"
  }
}
```

Run `python <plugin>/scripts/component_palette.py <robot-project>` to print the effective palette. The example replaces the structure swatch, adds a named bumper cover and inherits the other five roles. Use the same resolved RGB values for Fusion viewing appearances, the public orbit model and the README render. Keep the project palette alongside the part-to-role map, including an explicit role for each bumper cover and the selected alliance. Check the legend when an override changes the contrast of a label.

### Publish a colored assembly

In the project’s `cad-showcase.json`, set `appearances` to the relative path of the selected assembly’s part-to-role map. For an `agent-frc/assembly-appearances@1` map, set `sourceSha256` to the hash of the public STEP file. List every solid in STEP traversal order under `solids`. Each row needs a unique `id` and a resolved `role`. Include `boundsMm` as `[xmin, ymin, zmin, xmax, ymax, zmax]` from the registered assembly to check that assignments follow the correct solids, including identical parts mounted in different positions.

Run `export-showcase-cad.py`, then `cad-readmes.py --update` with the project root. The colored receipt binds the part map, effective palette and colored mesh ranges. The highlights builder reads that receipt when producing the hosted site. After changing a palette or a part assignment, regenerate the still and viewer together. Run the installed tools directly or keep the Python helpers, palette reference and viewer template from the same plugin version together in vendored project tooling.

A student/team may override colors for an established convention, accessibility needs or a specific comparison. Save the role-ID-to-appearance mapping, reason, revision and legend with the project, and use it consistently. Ask only when the choice is consequential; routine readable defaults do not need a separate design decision. Recheck semantic coverage, supplier preservation, label readability, native persistence and unchanged physical properties after updates. Keep the convention portable across Fusion, blockouts and rendered evidence, without implying an exchange format preserves native appearances.

Tests validate the default role IDs, unique colors, explicit non-color cues, hex values and opaque swatch label contrast. They do not certify native application, actual rendered contrast, material assignments or physical correctness. The current robot's requirement for a native Fusion file remains separate from this viewing convention.

If correct appearance readback disagrees with the viewport, follow [native appearance and scene diagnostics](native-fusion-handoff.md#appearance-and-scene-diagnostics-readback-is-not-a-render). Do not accept a stale screenshot or change physical materials to force a visual result.
