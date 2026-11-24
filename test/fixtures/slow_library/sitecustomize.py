"""Loaded by every Python process of a test run that puts this folder on PYTHONPATH: it makes the design library slow, or one
of its worker processes stuck, so a test can look at a run from another process while it is inside one long motion.

JUDGE_TEST_PAIR_S    seconds added to each pair of solids a clearance measures
JUDGE_TEST_STUCK     a file: the first worker process to measure a pair makes it and then never finishes
"""
import multiprocessing
import os
import time

PAIR_S, STUCK = float(os.environ.get("JUDGE_TEST_PAIR_S", 0)), os.environ.get("JUDGE_TEST_STUCK")


def slowed(real):
    def measure_pair(*args, **kwargs):
        if STUCK and multiprocessing.parent_process() is not None:
            try:
                os.close(os.open(STUCK, os.O_CREAT | os.O_EXCL))
            except FileExistsError:
                pass
            else:
                time.sleep(3600)
        time.sleep(PAIR_S)
        return real(*args, **kwargs)
    return measure_pair


if PAIR_S or STUCK:
    from frc_design_kernel.measure import clearance
    clearance.measure_pair = slowed(clearance.measure_pair)
