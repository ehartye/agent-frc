"""Judge a preliminary layout from its design source, its judgement file and the design library's records.

The library builds and measures, and keeps each answer as a record; this judges. A draft check has the library
measure the jobs whose records are not current and carries the rest. --judge-only measures nothing: it judges the
committed records and refuses any that is stale. Neither writes a file of its own.
"""
import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

from kernel_layout.files import project_path, require


def say(line):
    print(line, file=sys.stderr, flush=True)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("judgement", help="The project-relative judgement file; it names the design source and the records folder")
    parser.add_argument("--judge-only", action="store_true", help="Measure nothing: judge the committed records, refusing any that is stale or missing")
    parser.add_argument("--require-checked", action="store_true", help="Exit 1 unless the verdict is layout-checked")
    parser.add_argument("--json", action="store_true", help="Print the verdict as JSON on stdout")
    parser.add_argument("--workers", type=int, metavar="N", help="Worker processes the library shares the measuring between (default: half the cores)")
    parser.add_argument("--quiet", action="store_true", help="Omit the progress lines on stderr")
    return parser.parse_args()


def ran(args, verdict):
    """In words: what this run did."""
    jobs = verdict["records"]["jobs"]
    if args.judge_only:
        return f"judged {len(jobs)} record(s)"
    done = sum(1 for row in jobs if row["action"] == "measured")
    return f"measured {done} and carried {len(jobs) - done} of {len(jobs)} record(s), then judged them"


def main():
    args = arguments()
    started = perf_counter()
    try:
        from kernel_layout.scope import time_lines
        from kernel_layout.verdict import judge
        root = args.project.resolve()
        file = project_path(root, args.judgement)
        require(args.workers is None or args.workers >= 1, "Give --workers as a whole number of 1 or more")
        verdict = judge(root, file, judge_only=args.judge_only, workers=args.workers, progress=None if args.quiet else say)
        first = verdict["firstUnmet"]
        if args.json:
            sys.stdout.write(json.dumps(verdict, indent=1, allow_nan=False) + "\n")
        else:
            print("verdict: " + verdict["status"])
            print("firstUnmet: " + (first["text"] if first else "none"))
        if not args.quiet:
            seconds = verdict["seconds"]
            for line in time_lines(perf_counter() - started, ran(args, verdict), after=f", status {seconds['status']:.1f} s of it" if args.judge_only else ""):
                say(line)
        return int(args.require_checked and verdict["status"] != "layout-checked")
    except (KeyError, IndexError, ValueError, TypeError, OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
