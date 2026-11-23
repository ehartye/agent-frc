# Freeze the articles the robot needs

Before opening an earlier assembly, choose the current architecture and write a project-owned target roster. Name each required physical installation site, the exact article, revision and configuration, and the present duty or interface it serves. For a fastener, name the joint it retains. Give repeated parts their own rooted occurrence paths. Expand purchased subassemblies from the selected supplier configuration into the physical occurrences the native review will reconcile. A purchased article with several solids in one occurrence needs one roster row. The existing source-shape comparison still verifies every solid.

This original teaching example commissions two parts for a locating fixture.

```json
{
  "schema": "agent-frc/article-functions@1",
  "authorityId": "inspection-fixture",
  "configuration": "bench",
  "architecture": "Pocket gauge",
  "functions": {
    "locate": "Locate the removable gauge on the bench datum",
    "inspect": "Present the inspection surface at the selected height"
  },
  "occurrences": [
    {"path":"Base:1","article":"base","revision":"A","configuration":"machined","function":"locate"},
    {"path":"Gauge:1","article":"gauge","revision":"B","configuration":"short","function":"inspect"}
  ]
}
```

Run `python scripts/article_functions.py path/to/article-functions.json` from the installed plugin. Save the printed SHA-256 with the design decision in project history. Put the project-relative `file` and that `sha256` under `operatingIntent.articleFunctions` in the commissioning plan. The digest identifies the agreed bytes. Keep the dated design decision and reviewer approval as evidence of when the roster was frozen. If a needed interface or part changes, review the change and issue a new roster before accepting that candidate.

Start the new assembly from the selected parts. Cold-reopen its saved Fusion configuration and run the ordinary [mechanical readiness review](mechanical-readiness.md). Read `articleFunctions` for the planned and observed counts and inspect the named findings for uncommissioned, missing or substituted occurrences. A well-mounted obsolete part still fails. Repeat the installed source, mounting, structural retention, interference and motion checks on the complete successor, including pairs retained from an earlier assembly. Keep the previous failing geometry as a regression control. A roster match establishes which articles belong in the design. Actual load paths, strength and clearance each need their own evidence.
