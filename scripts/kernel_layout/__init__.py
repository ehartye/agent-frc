"""The preliminary layout judgement built on the design library, frc-design-kernel.

A design is held as three kinds of data, each fact in one place:

  the design source      the library's files: solids and their weight, groups, mounts, contacts, motors placed as
                         solids, drives and their joints, the battery, poses and motions (motor commands, or a cause)
  the judgement file     the plugin's file: the rules stated once with their exceptions, the purposes, the bindings,
                         one cycle, the control, missions and risks, and pointers to the season's requirements, the
                         narrative and the accepted premises
  the library's records  RECORDS/measurements/<job id>.json, trials.json and adjustments.json: the only stored results

The library builds and measures; this package judges its records on demand and writes nothing. inputs reads every
input first; jobs says what to measure; measure asks the library; judge, limits, stages, attachment, premises and
interactions decide what the records mean; verdict puts the verdict together.

No module here builds a shape, measures a distance or tessellates a solid, and none imports the library's internals.
Each module stays under 600 lines and each function under 120; test/kernel-layout-size.test.mjs fails otherwise.
"""
