"""Ask the library to build and measure. This is the only module that calls its measuring functions.

Nothing here measures: each function hands the library a question with the judgement's numbers (an allowance, a
touching gap, a depth) and returns the library's plain rows. judge.py decides what they mean.
"""
from .inputs import library, start_pose

# How far a display triangle may stand off the true surface. It affects the picture only: nothing is measured on a mesh.
MESH_DEFLECTION_MM = 0.08


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

    def pressed(self, case, rule):
        """How deep a contact solid presses into a ball or round-section ring along a case, against the allowed depth."""
        from frc_design_kernel.measure import compression
        return compression.indentation(self.assembly, case["id"], rule["payload"], rule["contact"], rule["maxDepthMm"],
                                       sorted(case["removed"]), case["depth"])

    def withdrawn(self, case):
        """At the end of a service case, how far the moved solids are from everything that stayed."""
        from frc_design_kernel.measure import approach
        return approach.withdrawn(self.assembly, case["id"], sorted(case["removed"]))

    def displaced(self, case, spec):
        """The control: the clearance of the one commissioned pair with the named solid shifted by the offset.

        The library shifts the solid for this one question, so no variant source is written. Every other solid is
        left out of the scene: the control asks only whether the check rejects this pair."""
        from frc_design_kernel.measure import clearance
        others = sorted(set(self.assembly.solids) - {spec["displaced"], spec["moving"]})
        return clearance.along(self.assembly, case["id"], case["minGapMm"], absent=others, depth=case["depth"], include_still=True,
                               displace={spec["displaced"]: spec["offsetMm"]})

    def screen(self, name):
        """The library's screen facts for one declared interaction: plain facts, judged in interactions.py."""
        from frc_design_kernel.measure import screen
        return screen.facts(self.assembly, name)

    def status(self, folder):
        """Which of the library's records in a folder are current for this design source, and what changed in the others."""
        from frc_design_kernel import status
        return status.status(self.inputs.source, folder)

    def mesh(self, name):
        """The display mesh of a solid as drawn: vertices and outward triangles, in millimetres."""
        return self.assembly.mesh(name, MESH_DEFLECTION_MM)

    def attachment(self, case, gap, floor_z, ignore, base=None):
        """What touches what at the start of a case: connected sets, solids not connected to the base, fixtures off the floor."""
        from frc_design_kernel.measure import attachment
        return attachment.at_pose(self.assembly, start_pose(self.inputs.data, case["id"]), gap=gap, floor_z=floor_z, ignore=ignore,
                                  base=base, contacts=self.contacts(case["id"]), absent=sorted(case["removed"]))


class Placements:
    """Where every group is along a motion, as the library places it: 12 numbers, three rows of rotation and shift."""

    def __init__(self, inputs):
        from frc_design_kernel.motion import matrix
        self.design, self.kernel, self.matrix = inputs.design, library(), matrix

    def at(self, motion, t):
        return self.kernel.placements(self.design, motion=motion, t=t)

    def apart(self, left, right, tolerance_mm=1e-4):
        """The groups that do not start the right motion where the left one ended."""
        end, start = self.at(left, 1.0), self.at(right, 0.0)
        return sorted(group for group in end if self.matrix.gap(end[group], start[group]) > tolerance_mm)
