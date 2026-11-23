"""Check a preliminary layout from its design source and its judgement file. The design library builds and measures; this judges."""
import argparse
import json
from pathlib import Path
import sys
from time import perf_counter

from atomic_file import write_atomic
from mechanical_readiness import digest, project_path, require


def say(line):
    print(line, file=sys.stderr, flush=True)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("judgement", help="The project-relative judgement file; it names the design source")
    parser.add_argument("--write-view", action="store_true", help="Create the review page beside the judgement file if it is missing, and write or replace its scene")
    parser.add_argument("--require-checked", action="store_true", help="Exit 1 unless the receipt reads layout-checked")
    parser.add_argument("--physics-only", action="store_true", help="Check every case, the displaced control and the budgets without the review view; the receipt is not one to publish")
    parser.add_argument("--view-only", action="store_true", help="Rebuild the review page and scene from an earlier receipt without measuring a case again; refused when a measuring input changed")
    parser.add_argument("--from-receipt", metavar="FILE", help="With --view-only, the project-relative receipt to reuse (default: --output, or receipt.json beside the judgement file)")
    parser.add_argument("--cases", metavar="A,B", help="Measure only these stages; the receipt is partial and is not one to publish")
    parser.add_argument("--output", metavar="FILE", help="Write the receipt to the project-relative FILE through a temporary file and a rename instead of stdout")
    parser.add_argument("--workers", "--jobs", type=int, metavar="N", dest="workers", help="Worker processes that share the cases (default: half the cores)")
    parser.add_argument("--quiet", action="store_true", help="Omit the progress lines on stderr")
    return parser.parse_args()


def ran(args, result):
    """In words: what this run did and what it left out."""
    cases, control = len(result.get("cases") or []), result.get("control") or {}
    if args.view_only:
        return "view rebuilt from the receipt", "the cases and the displaced control (reused from the receipt)"
    did = f"layout check of {cases} case(s)" + (", the displaced control" if control and control.get("status") != "skipped" else "") + ", attachment and budgets"
    if result.get("partial"):
        return did, str(len(result["skippedCases"])) + " other case(s), the displaced control and the review view"
    return (did, "the review view (--physics-only)") if args.physics_only else (did + " and the review view", "")


def main():
    args = arguments()
    started = perf_counter()
    try:
        from kernel_layout.review import review
        from kernel_layout.scope import time_lines
        root = args.project.resolve()
        require(not (args.physics_only and args.write_view), "Choose --physics-only or --write-view")
        require(not (args.view_only and (args.physics_only or args.cases)), "--view-only rebuilds the view; it cannot be combined with --physics-only or --cases")
        require(args.view_only or not args.from_receipt, "--from-receipt applies only with --view-only")
        file = project_path(root, args.judgement)
        output = (root / args.output).resolve() if args.output else None
        require(output is None or not Path(args.output).is_absolute() and output.is_relative_to(root) and output.parent.is_dir() and not output.is_dir(),
                "Save the receipt to a project-relative file in an existing folder")
        progress = None if args.quiet else say
        if progress:
            say(f"[inputs] judgement {file.relative_to(root).as_posix()} sha256={digest(file)}")
        held = None
        if args.view_only:
            held = project_path(root, args.from_receipt) if args.from_receipt else output or file.with_name("receipt.json")
        result = review(root, file, write_view=args.write_view, physics_only=args.physics_only, view_only=held,
                        only=[name.strip() for name in args.cases.split(",") if name.strip()] if args.cases else None,
                        workers=args.workers, progress=progress)
        receipt = json.dumps(result, indent=2, allow_nan=False) + "\n"
        if output:
            write_atomic(output, receipt.encode("utf-8"))
        else:
            sys.stdout.write(receipt)
        if progress:
            unmet = result["decision"]["firstUnmet"]
            say("[result] " + result["status"] + ("" if not unmet else ": " + unmet["text"]))
            for line in time_lines(perf_counter() - started, *ran(args, result)):
                say(line)
        return int(args.require_checked and (result.get("partial", False) or result["status"] != "layout-checked"))
    except (KeyError, IndexError, ValueError, TypeError, OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
