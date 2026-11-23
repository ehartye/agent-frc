# Audit the design source and its escape hatches

A project holds its design as data: a design source that the design library, `frc-design-kernel`, turns into named solids, measurements and trial records. The escape hatches are custom shapes, custom force laws and custom criteria. They are necessary, and they are where a design drifts back toward a hand-written builder. The design auditor reports that drift. It is the agent's tool: the project never runs it.

```sh
node PLUGIN/scripts/design-audit.mjs . [--skip FOLDER]... [--no-run] [--python COMMAND] [--json]
node PLUGIN/scripts/design-audit.mjs PROJECT-A PROJECT-B PROJECT-C
```

Run it before you publish a draft and before you propose marking a design effective. It is advice: it always exits 0 and blocks nothing. Each finding goes to the owner as a check-in, with what you propose. Fix it, or declare it with a reason.

## What it reports

Each finding names the file, the line where it can and a form. Information, such as the share of custom solids, is listed apart and is not a finding.

| Group | Forms | What it looks for |
| --- | --- | --- |
| Going around the door | `kernel-outside-custom`, `writes-model`, `writes-library-record`, `own-record`, `library-internals`, `plugin-code` | Project code outside `custom/` that imports the CAD kernel; code that writes a STEP file, a library record or its own trial or measurement record; imports of the library's internals, or of plugin code |
| Outputs that do not regenerate | `stale-output`, `hand-edited-output` | A manifest, STEP, measurement or trial record made from an earlier source, custom file or part; one whose content disagrees with its own stamp |
| A hatch doing too much | `custom-several-solids`, `custom-places-itself`, `custom-reads-or-writes`, `custom-imports`, `custom-hidden-numbers`, `custom-not-registered`, `custom-no-reason`, `custom-unused`, `custom-trial-method`, `custom-trial-state`, `custom-criterion-always`, `custom-guide-force`, `custom-stands-in` | A custom shape that makes a compound or fuses solids, moves what it built, reads files or the clock, or imports past its contract; numbers kept in custom code; custom trial code that tells the control or the half-step run apart, keeps state, steers the piece, always passes or stands in for a contact, drive or load; a registration with no reason or limits, or that nothing uses |
| Generated scenes and engine settings | `edited-scene`, `engine-scene-file`, `engine-setting-in-trial` | A review scene that differs from the one the layout check recorded; a MuJoCo scene kept as a file; engine settings typed into a trial |
| Drift back toward a builder | `custom-share`, `custom-size`, `restated-dimension`, `custom-listed-shape` | More custom solids or custom code than the guidelines; a trial number that restates a parameter; a custom shape that only makes boxes, cylinders or spheres |
| Judgement data | `override-no-reason`, `input-no-source`, `trial-no-control`, `trial-no-brackets` | A screen override (`interactions.NAME.override` in the judgement file) with no reason (overrides with reasons are listed); a physical input with no stated source; a trial with no control, or with no brackets and nothing with an assumed range |
| Across projects | listed, not findings | Custom code that looks alike in more than one project: a candidate to add to the library |

A project with no design source has no door to go around yet. The audit says so, and lists code that does the library's work as information. Running or importing plugin code is a finding in every project.

## Outputs, and when the library is run

The audit compares fingerprints without the library: the source, custom files and parts each record names, and the STEP header and solid names against the manifest. Where Python can import the library, it also rebuilds each design into a temporary folder, compares the manifest and STEP with the committed ones, and asks `python -m frc_design_kernel status` about each folder of records. It writes nothing in the project. `--no-run`, or a library it cannot import, is stated in a `Not run:` line.

## Guidelines

The guidelines are in `scripts/design-audit/guidelines.json`: custom shapes at most 15% of the robot solids, two custom shapes, two custom force laws or criteria, 40 lines of code per custom file and 120 in all. They are guidelines, not limits. Past one, check in with the owner.

## Exceptions and skipped folders

Skip a folder with `--skip FOLDER`, or list it in `.design-audit.json` at the project root. Declare a known exception there with its reason, and optionally the one form it covers:

```json
{"skip": ["archive/"], "exceptions": [{"path": "cad/assembly/", "form": "kernel-outside-custom", "reason": "Detailed design checks of the Fusion export; not the blockout."}]}
```

Every run lists each exception with its reason and the findings it covers. An exception without a reason covers nothing.

## What it does not look at

It reads structure, not intent. A wrong custom force law that looks like a force law passes every structural check. That is why custom code may never replace the control, the brackets or the half-step repeat. The other traces of the plugin in a project are the [CI audit's](project-ci.md#audit-the-project-for-use-of-the-plugin). The last lines of every run say what was read, what was skipped and what was not run.
