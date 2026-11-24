# Rank concept bots in a concept study

A concept study puts several hand-authored [concept bots](concept-bots.md) into one alliance study as roles. `concept:study` plays every candidate in the same published match contexts, together with variants that each change one assumed number. It ranks the candidates by expected-point margin beside their cost signals and a Pareto flag. It warns when a swept assumption would change the leader, and it reports where each candidate stops being competitive. The student then selects a concept with `concept:select` and records why. That command writes the selection and the one-sided premise records that preliminary design's layout check reads.

The ranking is a recommendation from the modelled field. It is not a decision. The tools never select a concept, never promote one and never combine the measures into one score. The student selects, and the selection keeps the student's reason.

Study → rank → select → hand off:

1. Write the study: candidates, contexts and sweeps.
2. `concept:study` plays and ranks them and writes the results file and page.
3. The student reads the ranking, fragility and ranges, then runs `concept:select` with a basis.
4. `frc-preliminary-design` starts from the selection and lists its premises.

The plugin ships an invented [example study](../examples/concept-study/study.json) on its own invented [field](../examples/concept-study/field.json), and three example concepts: a [front-intake placer](../examples/concept-bots/front-intake-placer.json), a [turret shooter](../examples/concept-bots/turret-shooter.json) and a [fixed shooter](../examples/concept-bots/fixed-shooter.json). Every number in them is a placeholder.

## Write the study

A concept study is an `agent-frc/alliance-study@1` file, the format of the [matched alliance study](season-meta-lab.md), with three additions:

| Field | Contents |
| --- | --- |
| `id` | The study ID. The selection and every premise record carry it as `scenarioId`. Without it the study file name is used |
| `profile` | The rules profile as `{file, sha256}` |
| `roles[].concept` | Each candidate's concept bot as `{file, sha256}` |
| `conceptSweeps` | Optional: `{defaults, axes}`, described below |

Both kinds of pin resolve from the study's folder. A pin whose SHA-256 no longer matches its file stops the run and names the file. Each role still carries its `basis`, `plans` and optional `endgame`, and each context names a published match, a focal slot and a basis, as in any alliance study. A concept study needs 2 to 8 base roles.

Choose contexts that change what the focal robot faces: an open lane, an opponent crossing the route, or a partner sharing the supply. Put enough loose pieces on the field that the candidates still have work in the last period. A loose piece is a physical body that robots push and that leaves play when scored; a `returns` rule instead moves a scored piece back without travel, so prefer physical stock for a comparison. With `"waitCycles": "yield"` in the rules model, the rehearsal resolves robots that hold each other, as described in [match series](match-series.md#find-and-resolve-robot-wait-cycles).

## Sweep the assumptions

A variant changes one quantity of one candidate. Every other quantity stays at its base value. A variant is played as its own role, with ID `<role>@<pointer>=<value>` and the same plans and endgame as its base. Its concept ID is `<concept id>.<path>.<value>`, for example `turret-shooter.drive.topSpeedInS.90`. The base value of each sweep is played by the base role itself.

These quantities can be swept. Each is a JSON Pointer to a quantity's `value`. Ranges such as `{min, max}` are never swept.

| Pointer | Quantity |
| --- | --- |
| `/drive/topSpeedInS/value`, `/drive/accelInS2/value`, `/drive/rotationDegS/value` | Drive speed, acceleration and rotation |
| `/inputs/<i>/secondsPerPiece/value` | An input's time per piece |
| `/storage/capacity/<type>/value` | The capacity for one piece type |
| `/storage/transferS/value` | The transfer time |
| `/outputs/<i>/secondsPerPiece/value` | An output's time per piece |
| `/outputs/<i>/successFraction/value` | An output's success fraction |
| `/outputs/<i>/ranged/firesWhileMoving/successFraction/value` | The success fraction while moving, when the output fires while moving |

**Default sweeps.** With `defaults: true`, the default, every sweepable quantity labelled `assumed` is swept over its base value × 0.5, 0.75, 1, 1.25 and 1.5. Each value is clipped to the quantity's [validity range](concept-bots.md#validity-ranges). Capacities are rounded to whole pieces, and duplicate values are removed, so a capacity of 1 sweeps only 1 and 2. A success fraction of 0.8 sweeps 0.4, 0.6, 0.8 and 1. Values are rounded to 12 significant digits. Quantities labelled `required` or `observed` are not swept by default. With `defaults: false`, only explicit axes are swept.

**Explicit axes.** `axes` maps a role ID to a list of `{pointer, values}`:

```json
"conceptSweeps": {
  "defaults": true,
  "axes": {"turret-shooter": [{"pointer": "/drive/topSpeedInS/value", "values": [120, 150, 180, 210, 240]}]}
}
```

An explicit axis replaces the default sweep for its pointer. It takes 2 to 9 distinct values, and they must include the base value. It may sweep a quantity of any label. Its values are not clipped or rounded. Each variant is validated again as a concept bot. A variant the validator rejects, such as a success fraction of 1.2 or a capacity of 2.5, is listed with its error and is not played.

## Run the study

From the team project, run the installed plugin's script. In the plugin checkout, `npm run concept:study --` runs the same script.

```sh
node "<plugin-root>/scripts/concept-tournament.mjs" study.json --out results.json [--html page.html] [--allow-long] [--max-matches N] [--full]
```

The runner creates the folders for `--out` and `--html` before it plays any match, so a path it cannot write stops the run at once with exit 2. It prints the planned number of matches: base roles plus variants, times contexts. It refuses to start when that number exceeds `--max-matches`, 2000 by default. It times the first 3 matches and stops if the projected run exceeds 5 minutes, the merge-time guideline in [Test by need and risk](testing-methodology.md). It prints the projection, and `--allow-long` lets the run continue. The invented example plays 297 matches with loose pieces in about 100 s.

The runner also screens each candidate against the profile's robot limits, as [`concept:check`](concept-bots.md#check-a-concept) does. It prints a warning for each limit a candidate exceeds and shows it in the ranking. An exceedance does not change the ranking or the Pareto flags: fix the concept or the limit before selecting that candidate.

| Exit | Meaning |
| --- | --- |
| 0 | The results file was written, and the page when `--html` was given |
| 2 | Invalid input: a missing or stale pin, a study with fewer than 2 or more than 8 base roles, an invalid explicit axis or a usage error |
| 3 | The run budget stopped it: too many planned matches, or a projection over 5 minutes without `--allow-long` |

The results file, `agent-frc/concept-results@1`, holds:
- the study, profile and concept pins;
- the contexts and the planned match count;
- the ranking with each candidate's mass range and limit screen, fragility, competitive ranges, axes, variants and the variants not played;
- the scope statement;
- the embedded `alliance-comparison@1` result. By default, `detail: "summary"`, each cell keeps its margin, scores, regret, baseline changes and each robot's per-period tallies. `--full` also keeps every event, period and roster.

## Read the ranking

Margins are in **expected points**. A credited release scores the target's points × the port's `successFraction`, or × its moving fraction while moving. Margin is alliance points minus opponent points in one context.

The ranking covers the base candidates only. It orders them by mean margin across the contexts, then by worst margin, then by ID. `leaderDecidedBy` says which of the three put the leader first. Each row also gives the margin in every context and the maximum regret: the largest gap to the best base candidate in the same context.

Each candidate carries eight cost signals, read from its document with the profile's defaults applied:

| Signal | Meaning |
| --- | --- |
| `massLbMax` | The upper end of its mass range, including the 75–95% default |
| `inputPorts`, `outputPorts` | How many ports of each kind |
| `ranged` | Whether any output is ranged |
| `turret`, `adjustableElevation`, `firesWhileMoving` | Whether any ranged output has a turret, an elevation range or fires while moving |
| `assumedShare` | The share of its labelled numbers that are labelled `assumed` |

The feature count is input ports + output ports + turret + adjustable elevation + fires while moving. A candidate is **Pareto** when no other candidate has an equal or higher mean margin with an equal or lower `massLbMax` and feature count, and is strictly better in one of them. A candidate without a mass range is not compared and shows no Pareto flag. A heavier candidate with more features and the same mean margin is therefore not Pareto.

The scope statement says what the result covers: the prescribed field behaviour and scoring criteria for the supplied contexts. No opponent probability is inferred, and "Expected points use declared success fractions; no physical reliability is inferred."

## Fragility

The ranking is **fragile** when one variant of a quantity labelled `assumed`, standing in for its base candidate, would by mean margin put a different candidate first. That covers a leader's assumption swept down and another candidate's assumption swept up. The results list each such variant with the candidate it would put first. The page then shows the leader as fragile and names the assumptions it depends on. Measure those first.

## Competitive range and break-even

For each candidate and each swept quantity:
- the **runner-up** is the best other base candidate by mean margin;
- the candidate is **competitive** at a value when its mean margin there is at least the runner-up's;
- the **competitive range** is the run of swept values around the base value where it stays competitive;
- the **break-even** on each side is the first swept value where it is no longer competitive, or `null` when the sweep ends first.

A candidate that is not competitive at its base value has no range. Its `overtakes` gives the nearest swept value on each side where it would match or overtake the runner-up, or `null`.

Every range holds the other quantities at their base values, and each result says so. The study does not test two assumptions moving together.

## The results page

`--html` writes a static page that works offline. It shows:
- the ranking table with the cost signals, feature count and Pareto flag;
- a fragility banner when the ranking is fragile;
- the margin in each context;
- one curve per swept quantity: the mean margin at each value, the base value, the runner-up's mean as a dashed line, the competitive range shaded and each break-even marked;
- any variants not played, and the scope.

## Select a concept

```sh
node "<plugin-root>/scripts/concept-select.mjs" results.json --candidate turret-shooter --basis "Why the team chose it" --out kickoff/selection [--interface robot=chassis]...
```

Run it from the project root. The results file and the output folder must be inside the project, and every recorded path is relative to the project root. `--basis` is required: the student's reason, in the student's words. The command exits 0 when it writes the records and 2 on bad input, including a missing basis.

**`concept-selection.json`** (`agent-frc/concept-selection@1`) holds:
- pins to the results file and the selected concept;
- the selected ID, the basis and the study ID as `scenarioId`;
- whether the selection was first, Pareto and fragile, with the leader, `leaderDecidedBy` and the flips;
- `ratePremises`: `written`, `none — not competitive at base` or `none — no break-even within the sweeps`, and for a candidate behind the leader, `overtakes`: where each sweep would match or overtake it;
- the ranking snapshot, the scope and the list of premise files.

**`premises/<id>.json`** holds the accepted premises, in the shape `scripts/kernel_layout/premises.py` reads. Each ID is `<study id>.<concept id>.<path>`, such as `concept-study-example.turret-shooter.drive.accelInS2`, so selections from different studies cannot collide. Each record holds `id`, `scenario`, `scenarioId`, `basis`, `phase: "conceptual-design"`, `unit`, `interfaces`, `source` (the selection file) and `criterion: {range: [lo, hi]}`.

- **One premise per swept quantity with a break-even.** It is written for each swept quantity of the selected candidate that is competitive at base and has a break-even on at least one side.
- **One-sided bounds.** On a side with a break-even, the bound is the last competitive value. On the other side, the bound is the quantity's validity limit. For example, a top speed that is no longer competitive at 90 in/s, is competitive from 120 in/s, and has no break-even above, gets `[120, 500]`.
- **The basis** states the range, the break-even on each side or that the sweep ended first, the runner-up and its mean margin, and that other quantities were held at base.
- **No premise** is written for a quantity with no break-even on either side. A candidate behind the leader is not competitive at its base values, so it gets no rate premise at all. The command then prints a warning naming where it would overtake, and only its mass premise bounds preliminary design.
- **Mass.** A mass premise is always written, with range `[0, massLb.max]`. Its basis gives the mass range and its label, says whether it is the 75–95%-of-limit profile default, and says that the drive and rate assumptions were made for a robot at most that heavy. A candidate with no mass range, and no mass limit in the profile, stops the command.
- **Interfaces.** Each premise names the robot group it constrains: `drive` for the drive, the port `id` for an input or output, `storage` for storage, and `robot` for mass. `--interface PART=GROUP` renames one to match the preliminary design's group names; renaming an interface no premise uses is an error. Rename `robot` to the group that carries the robot's mass budget, for example `--interface robot=chassis`, rather than adding a group called `robot`. The mass premise is in pounds, so give its current observation in `lb` even when the design's budgets are in kilograms.

## Hand off to preliminary design

`frc-preliminary-design` reads `concept-selection.json` in its first step. It names its blockout groups after the premise interfaces, or regenerates the records with `--interface`. It lists each premise file in `judgement.json` `premises[]` as `{"accepted": {"file": "kickoff/selection/premises/<id>.json"}}`. Nobody edits a premise record by hand. To change one, select again or rerun the study. Selecting again into the same folder replaces the selection and removes the premise files the earlier selection wrote that this one no longer does.

Until a premise has a current observation, the layout check reports it as `unknown` and lists the missing observation. When an observation falls outside the accepted range, the check reports `reopen`. Then change the design, or go back to conceptual design and select again. [Premises in the layout check](preliminary-design.md)

## What the study leaves out

- One quantity at a time. No interaction between swept quantities, no full-factorial grid and no generated feature combinations. Candidates are whole, hand-authored concepts.
- A deterministic rehearsal. Variation comes from the contexts and the swept assumptions. There are no random seeds and no win probability.
- No weighted single score, and no automatic selection or promotion.
- Swerve only, and every limit of the rehearsal itself. [What the model leaves out](concept-bots.md#what-the-model-leaves-out)
