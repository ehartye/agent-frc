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
