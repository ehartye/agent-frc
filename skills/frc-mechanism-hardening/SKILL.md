---
name: frc-mechanism-hardening
description: "Challenge an installed mechanism's repeatability, sustainable scoring rate, robot-elevation load paths and service recovery before making readiness claims."
---

# Does the installed mechanism keep working?

Hardening finds where a mechanism stops working, on the detailed design, before the team builds it. Use it on the mechanisms that decide the match role and on everything that lifts the robot. It ends with a governing margin, the first requirement that fails and the design change that follows. It is step 4 of the readiness review done in depth for one mechanism.

**Start here:** state what the mechanism must do, the saved design it is checked on and the event that earns credit. Write the trial set and the pass criteria before running anything. Then do the three stages in order.

Start each stage from the passing and failing values that preliminary design found by trial. They say which inputs matter and where the edge was in the blockout.

## 1. Bench model: where does it stop working alone?

- List the ways the mechanism can fail.
- Vary input position, friction, backlash, voltage and timing inside documented bounds, one at a time.
- Find the value of each where useful function stops.

## 2. Installed model: does it still work in the robot?

- Add the neighbouring structure, connectors, sensor view, loaded pose, drivetrain motion and other loads running at the same time.
- Check every assembly that lifts the robot. Locate the centre of gravity and the contacts in the installed frame. Check moments about both horizontal axes.
- Tell a pose that is free to rotate from a settled pose checked separately. For a pair of vertical supports, the line between them can stay a free rotation axis.
- Sweep load and stiffness. Challenge the numerical resolution when either changes the decision.
- For the scoring rate, fix the trial set before evaluation. Tie the time window to observed match clock edges. Verify the robot, place, piece and criterion behind every credited event. Keep missed starts and held-out trials in the count.

[Load-path and full-window rate studies](../../docs/mechanism-hardening.md)

## 3. Fault and return: what happens when something goes wrong?

- For a powered lift, compare three duties on normal and adverse starts: loaded travel, peak force through a real protection action, and holding with power off for the whole interval. [Three-duty comparison](../../docs/actuator-duty-review.md)
- Inject an interruption or a missing support where it applies.
- Time isolation, part access and replacement. Check that datums and sensor references return to tolerance. Repeat the original acceptance run after reassembly.
- For fatigue and wear, record cycles, stress range, material and the limiting rated life, or mark service life unknown.

## Record the result

Record the governing margin, the first violated requirement, the design change it causes and the rerun on the original and on a held-out condition. Report simulated, rated and measured evidence separately. Keep failed and unknown attempts. A design that is not yet built can end with an explicit failure or unknown and one specific refinement.

## Defaults: do these without being asked

1. Write the trial set and pass criteria before the first run.
2. Change one input at a time.
3. Stop a sweep at the first failure on each side.
4. Turn every physical unknown into a bench test with pass and fail numbers in the detailed design's work list.
5. Return a mechanism that keeps failing to whole-robot design, and check in first.

## Special cases

| When | Do | Detail |
| --- | --- | --- |
| A bracket relies on a bearing face | Check its measured compression-only support against the forces and moments acting together. Extra shear or hold-down needs an installed attachment with a qualified direction and allowable. | [Compression-only seat](../../docs/operating-intent.md#test-a-compression-only-seat) |
| A clamp, hook or bumper adds opposed reactions | Review the coupled free body from one real sample of the Fusion file. Check all three forces and moments, one-way contact and the correctly rated interface. Separate measured reactions, assumed redistribution and required restraints. | [Coupled support](../../docs/coupled-support.md) |
| Two lifts run in parallel | Trace each failed holding path. Locate the proposed cross-connection relative to every belt, nut, holder and shared mount. Replay each side lost, both lost and the governing loose or uneven case. Check racking, common descent and individual travel on one clock. | [Lift path faults](../../docs/lift-path-faults.md) |
| The robot drives while loaded | Check the real carried pieces and robot footprint on the match clock with every robot on the field. Record the first conflict with another robot and which later observations stay reachable. Check installed motion, the next holder and scoring each with their own evidence. | [Loaded route](../../docs/loaded-route.md) |
| A rotary mechanism | Calculate signed gravity and stop work from the real moving group and payload at each pose. Carry the governing direction into the power-off holding duty. | [Rotary gravity and stop work](../../docs/actuator-duty-review.md#signed-rotary-gravity-and-stop-work) |
| A joint rests on its stop | Record the stop as seated with any preload. Do not add a gap. Check its recorded peak, sustained windows, rebound and settling. | [Seated preloaded stop](../../docs/actuator-duty-review.md#check-a-seated-preloaded-stop-and-its-recorded-duty) |
