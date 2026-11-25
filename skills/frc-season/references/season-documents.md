# Ask a season's rules folder, and write one from the documents

A project may hold a season's rules as data: one dated folder of nine JSON files in the format of the design library, `frc-design-kernel`. Ask the folder before you open a manual. Nothing of a season is in this plugin.

## Ask the folder

Run these in the Python environment that has the library. If `rules` is not a command, update the library. [Check the design library](../../../docs/setup-health.md#check-the-design-library)

```sh
python -m frc_design_kernel rules find R92 --rules FOLDER              # a rule code, an ID, or words
python -m frc_design_kernel rules get limits.reach.far --rules FOLDER  # one value, its source and what it means
python -m frc_design_kernel rules check --rules FOLDER                 # every fault, and places to look for a value written twice
python -m frc_design_kernel rules means limits.reach.far               # what a name of the format means; no name prints the whole format
```

`FOLDER` is a dated folder, or the folder that holds the dated ones. `get` takes `--alliance`, `--spot`, `--unit` and `--json`, and a flag for each kind of variant, such as a kind of field or event. A variant that is not named is the first one.

- A rule's answer is its record. If `find` does not give it, say so and open the document. Do not fill it from memory.
- `assumed` beside a value and `unknown` in its record are part of the answer. Say them.
- Code reads the same folder with `load_rules` from `frc_design_kernel.rules.rules`. Do not copy a number into code.

## Write a folder

The format is in the library. Run `rules means` and read what you need; there is no second description. Run `rules check` after each change, and finish with no faults. Keep the folder in the project that plays the season.

- **Read every change notice, not only the last edition.** The last edition may print a number that only the last event used. For each value that a notice changes, write what each kind of event used (`by`), and what it was before (`was`).
- **Look at the page when it has a table, a figure or struck-out words.** Text taken out of a file scrambles tables and loses the strike-through.
- **Say what is measured,** from where to where (`of`). If the source does not say, write that in `unknown`.
- **Never fill a gap from memory.** Use `unknown`, or `assumed` with its reason.
- **If two values are equal because one is the other,** write a formula. A target at a tag's place names the tag.
- **If two sources disagree,** do not settle it by yourself. Write the question down for whoever owns the project's rules, with both sources and what each says.
