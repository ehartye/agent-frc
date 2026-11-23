---
name: frc-conceptual-design
description: "Use for conceptual design: write the concept of operations, rehearse match scenarios with a robot-sized prism and compare role, route and timing tradeoffs."
---

# Conceptual design of the match role

During conceptual design, use field rehearsal for match-scenario trade studies. Hand off the concept of operations (ConOps), field prism, chosen cycle, interaction faces, measured or assumed times and the conditions that would change the role. [Engineering detail and exit criteria for the three phases](../../docs/design-phase-detail.md)

For a new game, extract the [project rules model](../../docs/project-rules-model.md) and build the [interactive field lab](../../docs/kickoff-field-lab.md). For an existing design, recover the selected cycle and current candidate through [design continuation](../../docs/strategy-first-continuation.md).

1. Place a robot-sized prism on the scale field. Vary its footprint, heading, turns and route. Record the field edition, coordinate frame and assumptions.
2. Try a front, side or underbody pickup zone as a field-scale hypothesis. Record which robot face approaches the source, its field pose, the release pose and the return to ready. In the directional Field Lab the pickup line is on the front edge. Mark other face assumptions as planning estimates whenever the selected trial cannot represent them. [Field rehearsal](../../docs/field-rehearsal.md)
3. Vary assumed acquisition, shot and reset times. Compare the same route and opponent behavior with a slower action or missed pickup. Count finite pieces and the time left for the next cycle.
4. Hand the selected cycle, interaction faces, poses, timing and open assumptions to role selection. Once a role is chosen, `frc-preliminary-design` owns the whole-robot layout. Component placement, mounting, motion and service belong there.

Before handing off, settle these at field scale:

- **Role first.** State the alliance role, the scored event, the reserve time and the fallback. Walk one identifiable piece through approach, capture, retention, transfer, placement and reset, with the robot's position, time and energy at each step. Mark the operations that can overlap and the shared resources that prevent it.
- **Compare allocations, not suppliers.** Sketch competing ways to divide the functions before choosing purchased mechanisms. Start from a simple baseline. Try removing a transfer, reversing a path, using passive geometry or running functions in parallel. State what each candidate deliberately gives up.
- **Partner-dependent roles.** When a role relies on a partner, [compare the complete alliance service chain](../../docs/alliance-completion.md) on the match clock and change partner availability before selecting an architecture. Revisit a selected role with the [saved role and refinement comparison](../../docs/whole-robot-comparison.md#test-a-refinement-against-the-selected-role).

Use [complete match rehearsals](../../docs/match-series.md) to test likely per-period behaviors for both alliances with finite piece stock, occupied robot footprints and explicit target activity. Compare the independent matches at 10× and carry observed queues and unresolved scoring conditions into the project strategy.

In each scoring opportunity state where the supply is, which pieces are already aboard and when loaded travel can begin. Use the loaded-batch screen for a single later transfer and preserve the assumption in the student narrative.

Use the project’s [frame profile](../../docs/frame-profile.md) to compare rear-corner clearance at actual headings. The occupied Field Lab rehearsal uses the offset polygon. Confirm close corridor estimates in that rehearsal or in CAD.
