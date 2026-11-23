# Trials and replays

A trial is a physics run that decides whether an interaction works: a piece is acquired, held, passed, delivered, or the robot is lifted and stays up. Write it as data in the design source; the design library runs it, planar by default and in 3D with `"engine": "mujoco"`. The layout check screens each interaction, reads the trial record and binds it to its case. The readiness report holds it against the effective bar. [Interactions, trials and adjustments](../../../docs/preliminary-design.md#interactions-trials-and-adjustments)

## Contents

- [Choose the trials](#choose-the-trials)
- [Screen before you write a trial](#screen-before-you-write-a-trial)
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

Set a time budget of about ten minutes for the campaign. Let the budget set the number of runs: `try --estimate` prints the cost before anything runs. When the plan would pass it, cut the plan before starting, or check in.

## Screen before you write a trial

Declare each interaction in the design source and say in the judgement file what it decides. The layout check gives its verdict before any trial runs:

| Verdict | Write |
| --- | --- |
| `planar is enough` | A planar trial |
| `needs 3D` | A 3D trial on the settled layout. Run a planar one first only when it is cheap and could change the layout |
| `configurable` | A planar trial of the best guess, and an adjustment the robot is built with that covers the assumed range |

Read the reasons before overriding a verdict. An override needs a reason a reviewer can check, such as a guide that is not drawn yet.

Give every physical input its source: measured (and where) or assumed with a range. A best guess with a range is a complete input. Real measurement is never the bar for leaving design: build in an adjustment, a slot, a spring or a setpoint, and let the coverage campaign show a passing setting at each end of the range. Put the measurement on the builder's bench-test list.

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

The library's campaign does the method for every trial: the nominal run, the control, each assumed range at its ends, a run at half the step and, for each adjustment the trial names, the settings that pass at each end of each range. Its record gives one result word. The effective bar accepts:

| Result | Meets the bar |
| --- | --- |
| `passed` | Yes |
| `covered by adjustment` | Yes, when each mechanical adjustment it names is measured at both ends with nothing closer than the allowance there |
| `not covered`, `failed`, `control not rejected`, `not converged`, `incomplete` | No. Read the findings: they name the input and the two values between which the outcome changed |
| Any word with a qualifier, such as `passed, on a hulled surface` | No. The outcome may rest on a surface that is not there: model the touched solid so the 3D engine runs its true shape |

The record must be current: `python -m frc_design_kernel status design.json records` says which records are stale and why. A `needs 3D` verdict needs a 3D record. A `configurable` verdict needs the trial to name an adjustment.

Look at the sensitivity order before going to a fuller engine. The input at the top is the one an adjustment should reach first; a wider slot or a setpoint range is usually cheaper than a 3D trial.

## Bind the trial to its case

A piece in a case is moved by one of four things. Declare which in the case's entry under `stages` in the judgement file.

| The piece | Declare | Trial needed |
| --- | --- | --- |
| Follows a mechanism rigidly | `carriedWith` | No |
| Is moved by rollers, a lip or another contact | [`transportedBy`](../../../docs/preliminary-design.md#move-a-payload-by-contact-transport) | Yes |
| Has left every mechanism | [`freePath`](../../../docs/preliminary-design.md#a-free-payload-path) | Yes |
| Rests on or rolls along a field fixture | [`supportedBy`](../../../docs/preliminary-design.md#a-payload-a-field-fixture-supports) | Yes |

Name the library trial with `"trial": NAME` and copy its `fit` operation into the design source as the payload's move in that motion, so the animation is the trial's own path. When one trial runs through several stages, give each stage a `"window": [fromS, toS]` between two of the fit's kept points (`fit.atS`). [One trial, several stages](../../../docs/preliminary-design.md#one-trial-several-stages) List the case under the `cases` of the interaction the trial answers. A case that only follows its carrier is a prescribed path.

## Play the recording as a replay

Convert the recorded run to a replay set in the project and name it under `presentation.replays` in the judgement file. The replay becomes one more entry in the review page's animation list, after the mission animations. [Replay set format](review-layout-template.md#play-a-recorded-trial-in-the-animation-list)

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
