# From game rules to a robot strategy decision

The next artifact is a **Game-to-Robot Strategy Brief**, before subsystem choices are frozen. The plugin generates one for [2024](../case-studies/2024/strategy-brief.md), [2025](../case-studies/2025/strategy-brief.md) and [2026](../case-studies/2026/strategy-brief.md). They are review proposals, not decisions Eric or a school has already made.

For a fresh kickoff, begin with the [student field lab](kickoff-field-lab.md) and use its saved observations to draft the first match story. Keep the release-day evidence cutoff when evaluating that draft. The historical teaching briefs below use their own later snapshots.

## Agent-led sequence

1. Select season and pin manual/update revision, source fingerprint and intended event stage. Inspect the case's rule trace and the official selected sections. If the intended event is unknown, write it as unresolved and proceed with a clearly bounded educational proposal.
2. Generate the brief with `npm run strategy -- --season 2026`. It produces rule facts, three strategy alternatives, decision criteria, explicit assumptions, a capability map, sensitivity and the next review gate. All default numbers are declared teaching assumptions; they are not a team's measured resources or official game requirements.
3. Present the alternatives and the few choices that materially affect requirements: intended role, team capacity, usable scoring/cycle interval, desired contribution and alliance dependencies. Use the draft to make the review concrete. Record a user decision only when actually given; the generator deliberately leaves it unset.
4. Test an assumption change before recommending a freeze. For example, copy the [assumptions template](../templates/strategy-assumptions.json), change the window or development scope, then run `npm run strategy -- --season 2026 --input assumptions.json --output new-review-folder`. The output directory must not exist; earlier reviews are preserved. A changed input adjusts the proposed role/capability requirements without rewriting rule facts or changing existing case geometry/code.
5. After the reviewer decides, derive the **Capability and Verification Contract** using the [template](../templates/capability-contract.md). Assign trace IDs, owners, interface units, failure behavior, measured acceptance tests, budgets and open evidence gates. Choose the riskiest assumption for the first experiment. Do not jump from a game score table directly to a motor or CAD assembly.
6. Implement one bounded subsystem with a corresponding Java test and a guarded disposable CAD experiment where appropriate. Reconcile observed measurements into the contract; revise strategy when the evidence contradicts its assumptions. Keep compliance, geometry, controls, physical mechanism, strategy and safety verification separate.

## Method limits

The current generator uses a transparent bounded/expanded teaching-scope heuristic. It does not calculate an optimal match strategy, assign invented weighted scores, ingest scouting data, know school budgets, or choose for the user. Numeric throughput is a requirement derived from assumed pieces and usable time, not a simulated match score. Bounded scope does not mean all safety requirements are satisfied. Wider scope must pass the same gates and can be rejected after testing.

The generator tests source-year separation, trace completeness, invalid inputs, unset decisions and assumption-to-capability changes for all three seasons. These deterministic tests assess artifact behavior, not language-model effectiveness or robot performance.

## Versioned parallel hypotheses

See [Parallel decision chains](decision-chain.md) for the append-only branch/revision API, transitive change-impact checks and simulation comparison handoff. Recommendations and legacy teaching-case selections never become team approval.
