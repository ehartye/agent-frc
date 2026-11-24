# Season meta lab

At kickoff, put the source-edition rules model in the robot project. Draw starts, supplies, legal paths, scoring zones, restricted areas and terminal slots. Count how many pieces can reach each zone by each period. Estimate the upper bound on points and the minimum useful accepted pieces per second. Give the team a choice of roles before showing mechanism sketches.

## Match the comparisons

For each proposed role, write its opening, main and closing actions, partner it enables, opposition it depends on, resource it consumes, build burden, fallback and disconfirming observation. Include a simple independent role. Pick a second context where access, partner choice, piece supply or terminal occupancy changes. For competition incentives, show qualification objectives and elimination margin separately using the project’s actual rules. The CLI computes match points and margin. Ranking incentives require a separate project evaluator.

Run the supplied field engine on a profile and role matrix. The [invented study](../examples/design-methods/alliance.json) uses the [training field](../examples/kickoff/training-field.json).

```sh
npm run strategy:compare -- examples/kickoff/training-field.json examples/design-methods/alliance.json --html strategy-lab.html
node scripts/strategy-lab.mjs examples/kickoff/training-field.json examples/design-methods/alliance.json --replay pad crossing role-replay.json
npm run kickoff -- --profile role-replay.json --output role-lab.html
```

In strategy-lab.html select a focal role and a partner setup. Compare the ordinary and terminal points, wait and accepted rate by period, then replay that combination on the field. The separate role-lab.html exports one selected combination as a normal published match for sharing. Both roles in one context face the same peers, field setup, inventory and clock. The first role is the baseline. Each context names a published match, a one-based focal roster slot and the reason for the setup. Optional peers occupy named side/slot positions. A role changes only the phases in its `plans`. An omitted `endgame` inherits the focal robot’s plan, an explicit null clears it, and an object supplies its replacement.

Inspect ordinary and terminal credit separately. Compare each robot’s acquired pieces, accepted outcomes, travel distance, waiting, possession and terminal result. A blocked teammate can lose an opportunity while the focal robot’s independent score improves. The baseline-relative alliance change counts that interaction once. The worst margin tests the weakest supplied context. Maximum regret measures the largest gap to another available role in the same context. A tipping point is the mixture of two supplied contexts where their expected margins cross. In the teaching field the delivery role ties the opponent in an open lane and loses by six points in shared traffic. The pad role loses by four and five points respectively. Its expected margin is better when shared traffic occurs more than four matches in five. Estimate context frequency from project evidence before adopting that role.

Freeze a held-out setup before selecting or editing the role. Replay it from the same rules edition. Save both input hashes, profiles, peers and scored witnesses, then write the fallback, confidence limits and next test into the [strategic narrative](game-to-robot-strategy.md). A tied score with different blocked time can still change which robot should yield a corridor. The field model’s credited action supplies a conditional opportunity estimate until the installed mechanism demonstrates that criterion and rate.

## Play a concept bot in a role

A role may set the focal robot's [concept bot](concept-bots.md) with `concept`. The focal robot in each of that role's cells then drives that concept. A role without `concept` leaves the focal robot as the profile defines it. There are two forms:

| Form | Meaning |
| --- | --- |
| `{"file": "...", "sha256": "..."}` | A concept file, resolved from the study file's folder, with the SHA-256 of its bytes. The comparison validates the document and embeds it in a copy of the profile. A stale digest stops the run and names the file |
| `{"id": "..."}` | A concept already embedded in the profile's `rehearsal.concepts`, for example by kickoff `--concept`. An ID that is not embedded stops the run |

A bare string such as `"concept": "placer"` is refused. Two roles may pin the same file. Two different files with the same concept ID are refused. A study without concept roles plays exactly as before. `compareRoles` accepts 2 to 12 roles; its `maxRoles` option raises the cap, which a [concept study](concept-study.md) uses for its swept variants. To rank several concepts and sweep their assumptions, write a concept study rather than comparing them by hand.

## Hand the selected opportunity to the robot designers

Choose the focal role, partner setup, design period and station in the field lab. **Save selected role for design** downloads a small selection file containing the original profile and study digests. Keep the source files available at the paths in that selection, relative to your project root. For the generated lab, paths are relative to the build working directory if it contains both inputs, otherwise their common parent. A pair on different drives can still be studied by authoring project-relative references under one project root.

Run `node scripts/role-handoff.mjs SELECTION.json PROJECT_ROOT`. It replays the field, lists the focal robot’s observed piece IDs and event times, and divides completed outcomes by the entire selected window. A retrieval station generates an acquisition requirement. A scoring station generates its own credited outcome criterion. A blocked opportunity with no observed events leaves the positive target open. Use a student-selected subwindow by setting `windowS` to start and end seconds on the period’s 0.05 s clock. The start is included and the cutoff excluded. Keep a separate project requirement when the team chooses a higher target than this replay demonstrated. [Compare a refinement against this selection](whole-robot-comparison.md#test-a-refinement-against-the-selected-role).
