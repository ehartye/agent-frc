# Detailed design: scope guidelines

These are guidelines for the [detailed design skill](../SKILL.md). The figures are starting points, not measured values, and a project may replace them. Check in with the user before going past one.

- Publish a draft after each subsystem. Allow about 30 minutes for the layout check on a detailed export.
- Answer clearances to about 1 mm, with the drawing tolerance stated. Tighter than 0.2 mm is a declared fit.
- Model fasteners once for each distinct joint and pattern them.
- A `--physics-only` run on the stages you changed, named with `--cases`, is enough while fixing. A published draft runs every preliminary motion case.
- Do deeper qualification only on a named mechanism, for a named question.

The layout check's `[scope]` line compares the solid count with the preliminary blockout guideline. A detailed export passes that figure, which is expected.
