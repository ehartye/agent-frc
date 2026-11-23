# Trials and replays

A trial is a physics run that decides whether an interaction works: a piece is acquired, held, passed, delivered, or the robot is lifted and stays up. The project owns its trial runner and its field model. The plugin reads the trial record, binds it to a case and plays the recording. It does not run a trial.

## Contents

- [Choose the trials](#choose-the-trials)
- [Size a trial to the question](#size-a-trial-to-the-question)
- [Build the field area at scale](#build-the-field-area-at-scale)
- [Record enough to explain a miss](#record-enough-to-explain-a-miss)
- [What the effective bar asks of each trial](#what-the-effective-bar-asks-of-each-trial)
- [Bind the trial to its case](#bind-the-trial-to-its-case)
- [Play the recording as a replay](#play-the-recording-as-a-replay)
- [When margin and mission outcome disagree](#when-margin-and-mission-outcome-disagree)
- [Test retention when a piece is lifted or tipped](#test-retention-when-a-piece-is-lifted-or-tipped)
- [Find what moved the piece](#find-what-moved-the-piece)

## Choose the trials

List the premises that could change the architecture, a mechanism or an interface. Give each a likelihood and a consequence, and rank them.

Before a trial runs, write down the decision it could change and the result that would change it. Skip a trial when no result would change the design.

A question about the field or its instruments, or one the user has already decided, becomes a bench test with pass and fail numbers. Leave it on the bench list.

Set a time budget of about ten minutes for the campaign. Let the budget set the number of runs. When the plan would pass it, cut the plan before starting, or check in.

## Size a trial to the question

| Question | Smallest sound test |
| --- | --- |
| Does the nominal interaction work? | One run at the operating point, repeated at a finer timestep |
| Does the model reject a broken design? | One control with the feature removed or the input far out of range |
| Where is the edge? | Step one input outward from the operating point until the first failure on each side, then stop |
| Is the margin real under variation? | A few starts chosen to span the variation, not every recorded start at every value |
| How often does it succeed? | Only when a rate is the requirement; choose the sample size from the rate and confidence needed and stop early once the rate cannot be met |

Change one input at a time from the operating point. A full grid of every input against every start costs the product of their counts and rarely changes the decision.

**Stop when the decision is made.** A bracket is complete at its first failing value. A rate requirement is failed at the first result that puts it out of reach. Do not keep sampling a settled result to tighten an interval nobody will act on.

## Build the field area at scale

Use the project's official field and game-piece models at its rules cutoff. Use a dimensioned stand-in only when the project has no model, and label it.

Put the floor, approach, contact surfaces, nearby obstructions and target in the same datum as the robot. Record the source, units and transform. Name each simplification and the outcome it could change.

Commands may prescribe actuator inputs. The response that decides the mission is integrated: the free piece, or the supported robot. For a delivery, continue the same released piece through field contact to the scoring observation. For a lift, carry the load transfer and the disabled hold through to the assessment time.

## Record enough to explain a miss

Run each trial until the outcome is settled, so a late success is not read as a failure. Keep the state that would explain a miss: the piece's position, attitude, velocity and spin where it meets the target.

Watching three misses to their end settles more than repeating the population. Classify each one: late, bounced out, never arrived.

State the result as found. When some starts fail, report the count and what the failures share. Carry the open finding forward with its bench test.

## What the effective bar asks of each trial

Each mission-critical interaction needs a trial record with a `qualification`:

```json
"qualification": {
  "result": "pass",
  "control": {"condition": "Roller unpowered", "rejected": true},
  "brackets": [{"input": "roller speed", "unit": "rev/s", "passing": 20, "failing": 8}],
  "timestep": {"coarseS": 0.002, "fineS": 0.001, "sameOutcome": true}
}
```

| Part | Smallest form that satisfies it |
| --- | --- |
| Result | One passing run at the operating point |
| Control | One run with the feature disabled or an input far out of range, which the trial rejects |
| Brackets | For each input that could change the decision, one passing value and the first failing value |
| Timestep | The nominal run once more at half the step, with the same outcome |

That is four or five runs for an interaction with one uncertain input. The timestep repeat is one run, not a study. Check geometric sensitivity only where it can change the decision.

## Bind the trial to its case

A piece in a case is moved by one of four things. Declare which in the case's entry under `stages` in the plan.

| The piece | Declare | Trial needed |
| --- | --- | --- |
| Follows a mechanism rigidly | `carriedWith` | No |
| Is moved by rollers, a lip or another contact | [`transportedBy`](../../../docs/preliminary-design.md#move-a-payload-by-contact-transport) | Yes |
| Has left every mechanism | [`freePath`](../../../docs/preliminary-design.md#a-free-payload-path) | Yes |
| Rests on or rolls along a field fixture | [`supportedBy`](../../../docs/preliminary-design.md#a-payload-a-field-fixture-supports) | Yes |

The trial record repeats the case ID, the payload group and the payload's exact moves, so the check can tell that the trial established this path. A case that only follows its carrier is a prescribed path and does not count as trial-driven.

## Play the recording as a replay

Convert the recorded run to a replay set in the project and name it under `presentation.replays` in the plan. The replay becomes one more entry in the review page's animation list, after the mission animations. [Replay set format](review-layout-template.md#play-a-recorded-trial-in-the-animation-list)

- Use the run's own timestamps.
- List what the trial recorded under `recorded` and what was prescribed or interpolated under `display`.
- Add an event at each deciding moment.
- Put field parts and loose pieces that only the replay shows under `fieldBodies`.

Do not build a separate page or player for a trial. One design has one list of motions in one view.

## When margin and mission outcome disagree

A margin is a stand-in for the outcome that scores. When a setpoint with the better margin gives the worse count or rate, the mission outcome decides.

Recommend the setpoint with the better mission outcome. State what margin it costs. List that margin as a bench test with pass and fail numbers. Check in when the better-scoring setpoint breaks a clearance or a game rule.

## Test retention when a piece is lifted or tipped

A collision-free carried path shows clearance. It does not show that the piece stays in.

1. At each change of support, project gravity into the holder's frame.
2. Identify the contacts that can push back.
3. Sweep the whole piece toward each possible exit.
4. Repeat with grip or power removed, at the worst loaded angle.

Record a restraint, a measured friction and preload, or an open retention risk. Dynamic capture, slip and release need a free-piece trial or a bench load test.

## Find what moved the piece

Use this when a successful transfer might justify removing a part, or when a contact has to earn its place.

First record what the model commands and what it solves. A free piece can reach its seat while a drive holds an imposed surface speed. That trial shows transport at the stated speed. Whether the drive can sustain that speed under load is a separate question, for a bench measurement or a model that feeds the contact reaction back into the motor.

Repeat the same approach from the same start, changing only the proposed cause. For a removable guide, compare it installed and removed. For a drive, state whether its surface is locked, coasting or powered. Keep the other contacts, the timing and the end criterion the same.

Trace first contact, then the support or powered contact that follows, and whether the piece stays at its destination for the required time. First touch alone does not show which member completed the transfer.

Repeat the comparison at one plausible adverse value of the uncertain input. Report the passing and failing values with units. When the behaviour is intermittent, keep the individual outcomes and do not extrapolate one operating limit.
