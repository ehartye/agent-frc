"""Check the selected architecture's positive occurrence roster against a cold native issue."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys


def text(value):
    return isinstance(value, str) and bool(value.strip())


def slots(roster):
    if not isinstance(roster, dict) or roster.get("schema") != "agent-frc/article-functions@1":
        raise ValueError("Supply the selected architecture's article-functions@1 roster")
    if not all(text(roster.get(key)) for key in ("authorityId", "configuration", "architecture")):
        raise ValueError("Identify the design authority, configuration and selected architecture")
    functions = roster.get("functions")
    if not isinstance(functions, dict) or not functions or not all(text(k) and text(v) for k, v in functions.items()):
        raise ValueError("Describe the current required duty or interface under each function ID")
    planned = roster.get("occurrences")
    if not isinstance(planned, list) or not planned:
        raise ValueError("Plan at least one physical occurrence in the selected scope")
    by_path = {}
    for row in planned:
        if not isinstance(row, dict) or not all(text(row.get(key)) for key in ("path", "article", "revision", "configuration", "function")):
            raise ValueError("Each planned installation needs its full path, exact article, revision, configuration and function")
        path = row["path"]
        if path in by_path or row["function"] not in functions:
            raise ValueError("Repeated planned location or unknown current function at " + path)
        by_path[path] = row
    return by_path


def compare(roster, installed, authority_id, configuration):
    planned = slots(roster)
    if (roster["authorityId"], roster["configuration"]) != (authority_id, configuration):
        raise ValueError("The function roster belongs to a different authority or configuration")
    findings = []
    for path in sorted(planned.keys() | installed.keys()):
        if path not in planned:
            findings.append((path, "Installed occurrence has no commissioned function at this site."))
        elif path not in installed:
            findings.append((path, "Missing occurrence for commissioned function " + planned[path]["function"]))
        else:
            for field in ("article", "revision", "configuration"):
                expected = planned[path][field]
                actual = installed[path].get(field)
                if actual != expected:
                    findings.append((path, f"Commissioned {field} {expected!r}, found {actual!r} for {planned[path]['function']}."))
    return findings


def main():
    parser = argparse.ArgumentParser(description="Validate the pre-CAD target roster and print its SHA-256 for independent commissioning.")
    parser.add_argument("roster", type=Path)
    args = parser.parse_args()
    data = args.roster.read_bytes()
    roster = json.loads(data)
    planned = slots(roster)
    print(json.dumps({"architecture": roster["architecture"], "plannedOccurrences": len(planned),
                      "sha256": sha256(data).hexdigest()}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(str(error))
