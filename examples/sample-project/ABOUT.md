# Sample robot project

An invented project that shows what a robot project holds and how its own CI works. Every name, number and part in it is made up. It follows no game and no team.

| Folder | Holds |
| --- | --- |
| `cad/preliminary-design/requirements.json` | The season's requirements, shared by every release: the weight limits and the lowest bus voltage |
| `cad/preliminary-design/releases/1.0/design.json` | The design source: every solid with its weight, the motors, the battery and each motion as the motor commands that make it |
| `cad/preliminary-design/releases/1.0/judgement.json` | The judgement file: the rules stated once, the cycle, the control and pointers to the requirements, the narrative and the accepted premises |
| `cad/preliminary-design/releases/1.0/records/` | What was measured: one file for each measurement. Nothing else stores a result |
| `cad/preliminary-design/releases/1.0/page.json` | The words of the review page. They change no result |
| `docs/` | The published site: a home page, the design index and the page of each design, with a copy of the design source, the judgement file, the page file and the records it was judged on |
| `scripts/ci/` | The project's two CI checks, each one file that needs only Node |
| `.github/workflows/ci.yml` | The project's workflow: scan, site check and, on the default branch, publish `docs/` |

## Run the checks

```sh
node scripts/ci/scan.mjs .
node scripts/ci/site-check.mjs docs
```

The scan fails on a personal machine path or a credential in a tracked file. The site check fails when the design index and the folders disagree, when a named file is missing or when a relative link in a page leads nowhere.

Everything here belongs to the project. The checks and the workflow name no outside tool, so they keep working whatever else changes.
