---
name: frc-conceptual-design
description: "Conceptual design of the match role: write the concept of operations, describe each candidate robot as a concept bot (body, swerve drive, input and output ports, labelled ranges), check it with concept:check and rehearse it in the Field Lab. Use when asked to start conceptual design, write a ConOps, sketch candidate robots before CAD, author or check a concept bot, propose a robot mass range, choose intake or scoring faces, compare a placer with a shooter, a turret or hood range or firing while moving, rehearse a concept on the field, or prepare the handoff to role selection and preliminary design."
---

# Conceptual design of the match role

Conceptual design chooses what the robot does in a match and roughly what shape it takes to do it, before any CAD. Write the concept of operations (ConOps). Describe each candidate robot as a **concept bot**: one JSON file with its body, swerve drive, input and output ports and a labelled range for every number. Rehearse the candidates on the field and hand the chosen one to role selection. [Concept-bot format and behaviour](../../docs/concept-bots.md) · [Exit criteria for the three phases](../../docs/design-phase-detail.md)

For a new game, first extract the [project rules model](../../docs/project-rules-model.md) and build the [Field Lab](../../docs/kickoff-field-lab.md). For an existing design, recover the selected cycle and candidate through [design continuation](../../docs/strategy-first-continuation.md).

## Settle the role before the robot

- **Role first.** State the alliance role, the scored event, the reserve time and the fallback. Walk one identifiable piece through approach, capture, retention, transfer, placement and reset, with the robot's position, time and energy at each step. Mark the operations that can overlap and the shared resources that prevent it.
- **Compare allocations, not suppliers.** Sketch competing ways to divide the functions before choosing purchased mechanisms. Start from a simple baseline. Try removing a transfer, reversing a path, using passive geometry or running functions in parallel. State what each candidate deliberately gives up. Each candidate becomes its own concept bot.
- **Partner-dependent roles.** When a role relies on a partner, [compare the complete alliance service chain](../../docs/alliance-completion.md) on the match clock and change partner availability before selecting an architecture. Revisit a selected role with the [saved role and refinement comparison](../../docs/whole-robot-comparison.md#test-a-refinement-against-the-selected-role).

## Steps

1. **Author a concept bot for each candidate.** Start from an invented example in `examples/concept-bots/` and replace every number. Give the body, the drive, each input face and each output, and the storage per piece type.
   - Label every value `required`, `assumed` or `observed` and state its basis.
   - For the drive, start from the default swerve bounds in [Default swerve bounds](../../docs/concept-bots.md#default-swerve-bounds), labelled `assumed`. Replace them once the team picks a module, ratio and current limit.
   - **Propose the mass range.** If the profile has `robotLimits.massLb`, propose 75–95% of that inspection limit. Explain that it assumes a robot built close to the limit with about 5% held back, and that it says nothing yet about this concept's mechanisms. Ask the student for evidence that narrows or shifts it: known component or kit masses, module and battery counts, or a comparable earlier build. Write the refined range with its basis and relabel it `observed` or `assumed`. Without a limit or an estimate, leave mass unresolved.
   - Done when the file validates and no value has an empty basis.
2. **Check it.** Run `npm run concept:check -- concept.json --profile rules-model.json` in the plugin checkout, or `node <plugin-root>/scripts/concept-check.mjs concept.json --profile rules-model.json` from the project. Read each limit as `within`, `exceeds` or `unresolved`, the mass share of the limit, and each ranged output's stand-off band per target. Treat `exceeds` as a design finding, not an error. Treat a target with "no entry region" as a gap in the rules model and add the `entry` with its `factId`. Done when every `unresolved` is either resolved or recorded as an open question.
3. **Rehearse it.** Build the lab with `--concept` for each file and choose the concept on a robot card. Play the same scoring opportunity with each candidate and the same partners and opponents. Compare when pieces are acquired, the turns, the waits, the aim and slew time and the expected points. Then rehearse it with a slower acquisition, a missed shot or a narrower band. Read every notice in the narrative download, such as an ignored step rate, an unknown piece radius or no arc from a pose. Done when the narrative is saved with the concept ID and digest.
4. **Hand off.** Give role selection the concept file, the faces each piece enters and leaves by, the acquisition and release poses, the aim (turret and elevation ranges and the stand-off band used), the timing and the open assumptions. Also give the conditions that would change the role. Once a role is chosen, `frc-preliminary-design` owns the whole-robot layout. Component placement, mounting, motion and service belong there.

In the handoff, the **field prism** is the concept bot's body: frame, bumpers, stowed and maximum height and reach. The **interaction faces** are its declared input and output ports.

## Rehearse whole matches

Use [complete match rehearsals](../../docs/match-series.md) to test likely per-period behaviours for both alliances with finite piece stock, occupied robot footprints and explicit target activity. Compare the independent matches at 10× and carry observed queues and unresolved scoring conditions into the project strategy. Concept robots and robots without a concept can share one match. A robot without a concept keeps a fixed heading, a constant speed and the front intake. [Match rehearsal](../../docs/field-rehearsal.md)

In each scoring opportunity, state where the supply is, which pieces are already aboard and when loaded travel can begin. Use the loaded-batch screen for a single later transfer and preserve the assumption in the student narrative.

Use the project's [frame profile](../../docs/frame-profile.md) for the concept's outline to compare rear-corner clearance at actual headings. A concept robot that rotates occupies its circumscribed circle for that tick. Confirm close corridor estimates in the occupied rehearsal or in CAD.

Every number in a concept bot is a premise. A candidate that wins only on assumed numbers shows which of them to measure first.
