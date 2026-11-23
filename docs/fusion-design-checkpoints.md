# Check the design while it is still cheap to change

Check after placing a mechanism, changing stock or adding a purchased assembly, while the change is still easy to isolate. Repeat on the saved revision used for a handoff. Start with one project goal, its configuration and its limiting case. For example, a heavier carriage may consume the mass reserve and miss a loaded stop when another mechanism starts.

## Check the placement before detailing it

1. Record the active design, configuration, pose and the occurrences affected. Recompute. Inspect timeline health on the active features and references the change depends on. A completed recompute can leave a feature in error. Resolve errors or mark dependent observations stale, keeping the previous result with its own revision.
2. Measure the **intended seat** in assembly coordinates. Name the mating faces, measure their gap against the drawing, check orientation and bearing area where required, and compare a material landmark against the fixed support datum. Two parts separated by air can have zero common volume. Run the [checked placement](checked-placement.md) with the intended contact and clearance rules. Repeat the critical measurements on the reopened archive before relying on a saved installation. Evaluate strength under the specified load and electrical performance on the duty clock separately.

## Read mass and center of mass in Fusion

Select the root in the Browser and open **Properties → Physical**. Record mass, units, configuration, material assignments and calculation accuracy. Select a changed subsystem to locate an unexpected increase. Use **Inspect → Center of Mass** on the same selection for an associative marker that follows geometry changes. Record its coordinates relative to a named robot datum in the parked pose and in any loaded pose that controls the decision.

Reconcile the CAD result by physical instance. Replace the modeled mass of a purchased assembly with its measured or supplier-qualified mass **once**, for the exact included items. Include unfinished hardware, wiring and payload appropriate to that configuration. Give estimated masses a range and keep unbounded omissions visible. A catalog mass with no supported internal mass distribution can correct the total while leaving the assembly center of mass uncertain. Bound that contribution from known positions or keep loaded CG open. [Material and mass reconciliation](engineering-material-mass.md)

For a predicted mass range and upper limit, remaining margin ranges from `limit − heaviest estimate` to `limit − lightest estimate`. Compare its lower end with the reserve the team chose for remaining work. Record the item that drives the estimate and the next measurement or design change.

## Check the voltage during the action

Take the current schedule from the actual strategy clock. Sum simultaneous **battery-side** currents at each time, including drive, steering and mechanisms. Use a credible loaded mass, pack state of charge and resistance. For a simple source, pack terminal voltage is `Vopen − Rpack × total current` in its operating range. Apply shared wiring loss at shared current, branch loss at branch current, and the regulator behavior where applicable. Compare the predicted or measured **device inlet** with the device's project threshold at the same time. A bus-only trace can answer a bus-voltage question. A device-level decision needs evidence down to that inlet. [Shared electrical supply](shared-power-review.md)

## Try two synthetic decisions

Run the two independent examples from a plugin checkout.

```sh
npm run assembly:check -- examples/assembly-accounting/mapping.json
npm run power:review -- examples/power/comparison.json
```

| Check | Result | Design decision |
| --- | --- | --- |
| Add the shield and retainer to the tabletop assembly with a 4.00 kg limit | Estimated 3.85–4.05 kg, leaving −0.05 to +0.15 kg | Hold the mass decision. Narrow the 3.60–3.80 kg baseline by weighing it when available, or reduce the upper estimate by at least 0.05 kg plus the chosen reserve. |
| Start a fan during carriage travel, with a 9 V inlet floor | At 0–0.5 s, 6 A carriage plus 10 A fan gives 8.3 V at the carriage. Delaying the fan gives 9.8 V and the modeled carriage reaches its stop. | Select the delayed fan for the next integrated trial. Verify the fan can still finish its own duty by its deadline. |

In the design record, save the revision or archive digest, changed part, pose and payload, goal and reserve, limiting case and time, value, margin and next decision. **Act** when a measured or modeled case violates its limit. A modeled violation can justify changing the prebuild design immediately. Preserve the model assumptions and the physical verification still due. **Watch** a margin inside the project reserve or an estimate that straddles a limit. Mark a decision **unknown** where inventory, material distribution, contact, operating threshold or current coverage is missing. Keep the evidence for any known violation alongside other unknowns.

Rerun when stock, payload, material or pose changes mass or CG, and when gearing, wiring, current limits, pack or schedule changes the electrical case. For a driving goal, replay the [loaded route and stop against its deadline](whole-robot-comparison.md#apply-the-loaded-speed-ceiling-to-the-same-route) and the rescheduled mechanism on the same clock. Keep modeled margins identified until scale, geometry or synchronized electrical and motion measurements confirm them. Teams can run these checks at a save boundary today. An automatic Fusion after-save report would require a separate integration.
