# Virtual diagnostics and fault-output hypotheses

## New evidence, old counterexamples preserved

`case-studies/diagnostic-world-supervisor.json` binds 15 fresh HAL tests, 66 continuous trajectories and 13 runtime-class hashes. Nine nominal season/feed combinations retain the provisional capture/local-release result. The earlier staged controller, world receipt and false-HOLD/persistent-command cases are unchanged.

The new `PadConsistencyMonitor` first requires a retracted, unloaded baseline, then checks fresh sequence-numbered analog travel and force observations against the separate contact/load bits. Assumed ambiguity bands are 0.2 mm and 0.2 N. These are toy diagnostic thresholds, not measured sensor accuracy. The monitor rejects missing/nonfinite/stale/replayed data and explicit contradictions. Diagnostics gate controller enable, so rejection produces the existing latched acceptance fault, not a guaranteed physical stop.

In three stuck-high-bit cases, independent analog readback rejects the false claim before HOLD. In three coordinated-fault cases, analog travel/force and digital bits all lie consistently after a valid initial baseline. All three still falsely authorize HOLD, then later geometry supervision faults these particular trajectories. Redundant-looking software channels are not demonstrated sensor independence or a general fault-tolerance guarantee.

## Independently ticked virtual command lease

`VirtualCommandLease` receives sequence-numbered healthy command frames. A separate 2 ms simulation tick zeros its logical outputs when no fresh healthy frame has arrived for 40 ms, or when a replay/unhealthy frame is received. Expiry latches; a later frame does not silently restart it. No physical watchdog, independent clock, wiring or safety controller has been installed or selected.

Six integrated missing-update trajectories apply this lease while the 20 ms catcher controller is silent. The raw PWM command still requests closure. The separately gated output becomes zero before the controller returns. Two explicitly different hypotheses map zero to mechanics:

- A mechanically latched gate remains closed while pad travel retracts.
- An unloaded spring-open gate begins the existing modeled 20 ms opening stroke while pads retract. Loaded opening remains blocked by the rear-spring guard.

The tests observe different final physical gate states despite identical zero logical output. They do not identify either mapping as appropriate or safe hardware. Controller faults still retain the raw requested closure; the new lease is an independently scheduled virtual output layer, not a claim that changing a boolean stops a robot.

## Post-fault mechanical comparison

`post-fault-output-hypotheses.json` continues six previously executed fault states for one second under three output hypotheses and two timesteps (36 runs). It starts at the recorded fault state, not at an invented earlier watchdog trip. The same passive scalar plant is retained.

Legacy retention and zero-output with a latched gate stay within the illustrative 50 mm window for these seeds, but that is not capture or safe stopping. Zero-output with an unloaded spring-open gate exits the window in six runs, reaching about 185 mm maximum offset. Opening a loaded rear spring is explicitly blocked, so stored spring energy is not deleted to manufacture a result. These are conditional counterexamples to equating zero output with safety, not actuator specifications.

Still missing: physically independent sensing, calibrated measurement/error/load bounds, real power-loss behavior, force-coupled gate/pad motion, diagnostics for correlated faults, a chosen watchdog/output architecture and a validated mechanical safe state. No procurement, robot operation or deployment occurred.
