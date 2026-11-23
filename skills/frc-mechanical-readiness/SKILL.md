---
name: frc-mechanical-readiness
description: "Review a detailed robot or subsystem design before it is built or marked effective. Check part identity, interference and attachment through motion, shop capability, loads and service, then record the verdict."
---

# Mechanical-readiness review

The review answers one question: can a team build this design from the Fusion file and have it work? It reads the saved, reopened Fusion file and its export, never the live session. It ends with a saved verdict. A detailed design becomes `effective` only on a verdict of `pass`.

**Start here:** do the five steps in order on the design that detailed design hands over. A subsystem is reviewed as a subsystem, with its outside interfaces named.

| Word | Meaning here |
| --- | --- |
| Reopened | Read from the saved Fusion file after closing it |
| Export | The STEP written from that Fusion file |
| Parts list | Every part the design needs, with its site and job, written before the review |
| Fit | An overlap or gap two named parts are meant to have, with a limit |
| Duty | One load or motion case a part must survive, with a limit and a measurement |
| Study | The project file that lists the inputs, parts, fits and duties for one review |
| Verdict | `pass`, `open` or `fail` |

## Before you start

- Name the scope: whole robot or one subsystem, and the poses it moves through.
- Find the registered Fusion file and export it. [Find the current Fusion design](../../docs/fusion-authority.md)
- Collect the parts list, the work list, the bench-test record and any known defects from detailed design.
- Write down the required travel and handoffs before looking at results.

## When to run the review

The review is a stage-gate check. Run it when the design is proposed as effective, on the committed Fusion export, and again only after a change to geometry, a part, a joint or a load. A change to a page, a title, a name, a status word or a document never needs the review or the layout check again. When a run is heading past about 15 minutes, stop and tell the user what is slow. [Test by need and risk](../../docs/testing-methodology.md)

## The review, in order

### 1. Identity: is every part the part it claims to be?

- Reopen the Fusion file. Compare its parts with the export and with the parts list. Report missing, extra and substituted parts.
- A purchased part matches the manufacturer's part number, option and model.
- A shop-made part has an editable Fusion design, a drawing and a stock grade.
- Each identical fastener has a count and an installed position.

[Parts list](../../docs/article-functions.md) · [Start with the installed assembly](../../docs/mechanical-readiness.md#start-with-the-actual-installed-assembly)

### 2. Interference and attachment: does it fit and stay together?

- Measure the whole placed assembly. Inspect every separate group and every pair that shares material.
- Trace every part to the frame through a named joint or fastener.
- For each press fit, thread or moving clearance, name both parts, the feature that holds them, the limit and how it is inspected. Any other overlap fails.
- Check the whole travel, or prove a bound between poses. Include a control that must collide.

[Review the geometry and duties](../../docs/mechanical-readiness.md#review-the-geometry-and-duties)

### 3. Shop and service: can it be made, assembled and taken apart?

- Rebuild the hardest part and joint with the shop's real tools: datums, tool radius, approach, tolerance stack, fastener grip, weld access and material.
- Check each screw stack: seat, thread engagement and bottom clearance.
- Replay assembly, inspection and removal inside the installed robot. Cover the battery, the motors and the parts that wear.

[Shop capability](../../docs/fabrication-capabilities.md) · [Fabrication chain](../../docs/fabrication-chain.md) · [Fastener stacks](../../docs/fastener-stacks.md)

### 4. Loads: does each load reach the frame?

- Trace each governing load through the real supports. Draw the boundary of each case.
- Test the adverse direction, full extension, uneven loading, a jam, power loss and expected impact where they apply.
- Compare stress and stiffness with sourced limits. Record unknown fatigue life, material properties and physical tests as unknown.
- For anything that lifts the robot or sets the scoring rate, use `frc-mechanism-hardening`.

[Mechanism hardening](../../docs/mechanism-hardening.md) · [Coupled support](../../docs/coupled-support.md)

### 5. Verdict: run the checker and record the result

Write the study, measure the export, name the measured file as `geometry` in the study, then review it.

```sh
python PLUGIN/scripts/mechanical_readiness.py measure . STUDY.json --output cad/detailed-design/geometry.json
python PLUGIN/scripts/mechanical_readiness.py review . STUDY.json --rescan --require-publication --output cad/detailed-design/readiness-result.json
```

`--output` refuses to overwrite a file, so remove the earlier result first. The result lists each finding with its parts and reason. It reports one verdict under two names, `showcaseEligibility` and `buildReadiness`: `fail` when a finding fails, `open` when any finding is open, otherwise `pass`. `engineeringGeometry` is the same verdict for geometry findings alone. [Study fields and the checker](../../docs/mechanical-readiness.md#run-the-checker)

- Run `node PLUGIN/scripts/bench-tests.mjs check . --design ID`. Each `before-build` test needs a passing result and each `on-robot` test an owner and a plan. Marking the design effective is refused otherwise.
- On `pass` with the bench tests resolved, check in, then mark the design effective with the commands in `frc-detailed-design` step 7.
- On `open` or `fail`, record the failing pair or duty and the next test that would settle it. The design stays `in-progress` and the current effective design stays published.

## Defaults: do these without being asked

1. Review the reopened file and its export. Never review the live session.
2. Check that the duty list covers the installed design before trusting a pass.
3. Keep a failing control with every check that could pass by accident.
4. Record each result as calculated, simulated, read from Fusion or physically tested.
5. Record an unknown as unknown. Do not fill it with an estimate.
6. Leave the previous effective design published while any finding is open.
7. Attach the findings to the pull request that changes the status.

## Check in with the user before

1. Starting a scan you expect to run past two hours. That figure is a guideline a project may replace.
2. Narrowing the scope to pass.
3. Retagging a `before-build` bench test as `on-robot`.
4. Marking the design effective.
5. Returning to whole-robot design. Do this when clashes, unreachable attachments or an unattainable scoring role survive local fixes: compare the mechanism with a different architecture under the same requirements using `frc-preliminary-design`.

## When you see this, try this

| You see | First thing to try |
| --- | --- |
| A duty has no evidence | Decide which it is: nobody was asked, it needs a physical test, it does not apply, or another duty covers it. Write the exemption with its reason, or the bench test with pass and fail numbers. |
| A part connects to nothing | Find its joint or fastener in Fusion. If none is drawn, send it back to detailed design. |
| An overlap that looks intended | Register the pair as a fit with a limit from the drawing. Confirm the overlap is where the fit is. |
| A volume or shape comparison disagrees | Measure both at matched accuracy before blaming the part. |
| A scan stalls on one pair | Bound the pair by direction, or keep finished results and resume. |
| An outside study found a defect the plugin missed | Reproduce it with the installed plugin, keep the failing control, rerun the design. |

More situations, one row each: [special cases](references/special-cases.md).

## Links

| Topic | Read |
| --- | --- |
| Full method, study fields and commands | [Qualify the model students will build](../../docs/mechanical-readiness.md) |
| Statuses and what makes a design effective | [Effective designs](../../docs/design-publication.md#effective-designs) |
| Finding and exporting the Fusion file | [Fusion authority](../../docs/fusion-authority.md) |
| Detection methods for known defects | [Mechanical methods](../../docs/mechanical-methods.md) |
| Required travel, transfers and linked motion | [Operating criteria](../../docs/operating-intent.md) |
