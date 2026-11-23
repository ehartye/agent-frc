"""The preliminary layout check built on the design library, frc-design-kernel.

The library builds the solids from a design source and measures them. This package judges: which motions are
checked and against what allowance, what a measurement means, whether the displaced control was rejected, what
floats, whether the mass and voltage budgets hold, and what the review page shows.

A design has two inputs, kept apart on purpose:

  the design source   the library's file: solids, groups, fixtures, mounts, contacts, poses and motions
  the judgement file  the plugin's file: stages and their purpose, the cycle, the control, allowances and their
                      basis, attachment labels, budgets, premises, the narrative list and the presentation text

No module here builds a shape, measures a distance or tessellates a solid, and none imports the library's internals. Each module stays under 600 lines and each function under
120; test/kernel-layout-size.test.mjs fails otherwise.
"""
