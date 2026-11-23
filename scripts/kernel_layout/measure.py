"""Ask the library to build and measure. This is the only module that calls its measuring functions.

Nothing here measures: each function hands the library a question with the judgement's numbers (an allowance, a
touching gap, a depth) and returns the library's plain rows. judge.py decides what they mean.
"""
from dataclasses import replace

from .inputs import library, start_pose


class Measured:
    """One built design and the questions the check asks of it."""

    def __init__(self, inputs):
        self.inputs, self.kernel = inputs, library()
        self._assembly = None

    @property
    def assembly(self):
        if self._assembly is None:
            self._assembly = self.kernel.build(self.inputs.design)
        return self._assembly

    def stamp(self):
        """The library's version and commit. Information for the reader; nothing compares it."""
        return self.kernel.generator()

    def contacts(self, motion):
        """The pairs the design source declares as meant to touch during a motion."""
        from frc_design_kernel.measure.summary import contacts_for
        return contacts_for(self.inputs.data, motion)

    def job(self, case):
        return dict(motion=case["id"], minGapMm=case["minGapMm"], depth=case["depth"], includeStill=True,
                    contacts=self.contacts(case["id"]), absent=sorted(case["removed"]))

    def clearances(self, cases, workers):
        """The library's clearance result for each case, in order, shared between worker processes."""
        from frc_design_kernel.measure import run
        return run.clearances(self.inputs.source, [self.job(case) for case in cases], workers)

    def reached(self, case, rule):
        """Whether the pair of a required contact comes within its gap in its window of the stroke."""
        from frc_design_kernel.measure import approach
        return approach.reach(self.assembly, case["id"], rule["pair"], rule["maxGapMm"], tuple(rule.get("window", (0.0, 1.0))),
                              sorted(case["removed"]), case["depth"])

    def withdrawn(self, case):
        """At the end of a service case, how far the moved solids are from everything that stayed."""
        from frc_design_kernel.measure import approach
        return approach.withdrawn(self.assembly, case["id"], sorted(case["removed"]))

    def displaced(self, case, spec):
        """The control: the clearance of the one commissioned pair with the named solid shifted by the offset.

        The solid is shifted in a copy of the built design, so no variant source is written. Every other solid is
        left out of the scene: the control asks only whether the check rejects this pair."""
        from frc_design_kernel.kernel.transform import moved
        from frc_design_kernel.measure import clearance
        from frc_design_kernel.motion import matrix
        solids = dict(self.assembly.solids)
        solid = solids[spec["displaced"]]
        solids[spec["displaced"]] = replace(solid, shape=moved(solid.shape, matrix.translation(spec["offsetMm"])))
        others = sorted(set(solids) - {spec["displaced"], spec["moving"]})
        return clearance.along(replace(self.assembly, solids=solids), case["id"], case["minGapMm"], absent=others, depth=case["depth"],
                               include_still=True)

    def attachment(self, case, gap, floor_z, ignore, base=None):
        """What touches what at the start of a case: connected sets, solids not connected to the base, fixtures off the floor."""
        from frc_design_kernel.measure import attachment
        return attachment.at_pose(self.assembly, start_pose(self.inputs.data, case["id"]), gap=gap, floor_z=floor_z, ignore=ignore,
                                  base=base, contacts=self.contacts(case["id"]), absent=sorted(case["removed"]))


class Placements:
    """Where every group is along a motion, as the library places it: 12 numbers, three rows of rotation and shift."""

    def __init__(self, inputs):
        from frc_design_kernel.builder import placement
        from frc_design_kernel.motion import matrix
        self.data, self.placement, self.matrix = inputs.data, placement, matrix

    def at(self, motion, t):
        return self.placement.at_motion(self.data, motion, t)

    def apart(self, left, right, tolerance_mm=1e-4):
        """The groups that do not start the right motion where the left one ended."""
        end, start = self.at(left, 1.0), self.at(right, 0.0)
        return sorted(group for group in end if self.matrix.gap(end[group], start[group]) > tolerance_mm)
