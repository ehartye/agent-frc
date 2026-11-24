"""Ask the library to measure, to say which records are current and to state facts. The only module that calls its measuring.

Nothing here measures: each function hands the library a list of jobs or a question and returns its plain answer.
record() is the one entry point that measures: it writes each job's file under RECORDS/measurements/ as the job
finishes and carries every job whose file is current. check() and status() measure nothing.
"""
from .inputs import library


def record(source, jobs, folder, workers=None, report=None):
    """Measure or carry each job and keep its record. Returns the library's entries, in job order."""
    library()
    from frc_design_kernel.measure import records
    return records.record(str(source), jobs, str(folder), workers=workers, carry=True, report=report)


def check(source, jobs, folder):
    """For each job, whether its record is current, stale (and why) or missing. Measures nothing."""
    library()
    from frc_design_kernel.measure import records
    return records.check(str(source), jobs, str(folder))


def read(folder, name):
    """The stored record of one job, by its id."""
    library()
    from frc_design_kernel.measure import records
    return records.read_record(records.path_of(folder, name))


def status(source, folder):
    """Every record in a folder against the design source now: job records and each trial in trials.json, current or stale."""
    library()
    from frc_design_kernel import status as states
    return states.status(str(source), str(folder))


class Screened:
    """The library's screen facts for each declared interaction: plain facts, judged in interactions.py. Built once, when first asked."""

    def __init__(self, inputs):
        self.inputs, self._assembly = inputs, None

    def __call__(self, name):
        if self._assembly is None:
            self._assembly = library().build(self.inputs.design)
        from frc_design_kernel.measure import screen
        return screen.facts(self._assembly, name)
