# Segmented timestep, feed and stopping sensitivity

This extends the controller-coupled hypothetical entry model, without changing the
controller or claiming calibration. Four native JUnit tests execute 42 scenarios:
27 feed/timestep combinations, three no-resistance controls, nine hypothetical
post-completion resistance cases and three approach-resistance cases.

The 20 ms controller tick is fixed. Plant steps are10,5 and2.5 ms; initial feeder
speeds are0.1,0.2 and0.4 m/s. The same assumed masses, aggregate normal load,
friction and scalar drive from the entry experiment remain. Every run integrates
up to the controller's terminal state and, on logical completion, exactly50 more
controller ticks (one second). Integer event-tick counting avoids floating-point
end-time comparisons extending that observation window by another20 ms.

## Observed limits

- All27 no-resistance feed/timestep combinations complete the logical beam
  sequence. That does **not** mean acquisition/capture is physically successful.
- At0.2 m/s approach and5 ms plant step, NOTE/CORAL/FUEL still move at
  1.254/1.266/1.150 m/s at completion and coast another1.254/1.266/1.150 m in the
  following second without resistance. PWM is verified zero after completion.
- FUEL at0.2 m/s has event-time results1.22,1.24,1.22 s across10,5,2.5 ms steps.
  Its coarse-step event speed1.20 m/s differs from1.15 m/s at the two smaller
  steps. This is sensitivity and contact/event quantization, not convergence.
- A hypothetical0.1 N approach resistance stops FUEL before contact, and the
  controller times out. The feeder boundary condition is not robust even to
  that assumed resistance. NOTE/CORAL still complete in this specific model.

## Hypothetical stopping screen, not a brake design

A capped external resistance impulse is applied directly to the piece after
logical completion. It dissipates energy and cannot reverse velocity. There is
no actuator, mount, normal preload, brake material, engagement delay or actual
retention mechanism behind it. Its work is tracked separately in the energy
ledger. This is an external-work sensitivity, not motor braking or regeneration.

The illustrative screen is final speed below0.01 m/s and travel at most50 mm
**after the controller completion event**, observed one second later. The owner
has not specified this as a requirement. It omits the distance from physical beam
crossing to the sampled controller event, and is not a capture qualification.

At0.2 m/s feeder speed, hypothetical10 N resistance stops within36.3/37.0/30.3 mm
for NOTE/CORAL/FUEL;0.5 N leaves them moving and exceeds the window. But the10 N
case fails for0.1 m/s NOTE/CORAL approach, with61.6/73.1 mm travel. Slower approach
allows longer roller spin-up; a nominal-case stop screen would hide this failure.
FUEL's slow-approach10 N result remains30.3 mm in this discretization.

The summary includes `m*v_event^2/(2*d)` with assumed m=0.5 kg and d=50 mm as an
ideal constant-force work-energy bound. The largest sampled value is about15.485 N.
This is **not** a selected brake force: it omits sensing/engagement delay, continued
contact input, compliance and real hardware. Semi-implicit integration can
underestimate stopping distance by a step-dependent amount; the observed10 N
screen results must not be treated as tolerance margins.

## Reproduction and evidence

`python -B scripts/run-segmented-stop.py --output <new-directory>
--java-home <existing-jdk> --gradle-home <existing-cache>` executes offline native
tests and binds a unique run identity to runtime class hashes, unchanged source
and geometry pins, XML and log, then atomically publishes its evidence directory.
The geometry-provider class is runtime-hashed as well as the controller and new
sensitivity class. `case-studies/segmented-stop-sensitivity.json` is its compact
receipt. `summarize-segmented-stop.py` derives the numeric summary and converts
unavailable event values into JSON null, rather than nonstandard numeric NaN.
Three Python tests verify pins, inventory, negative outcomes and regeneration.

Next engineering work: establish an actual capture/stopping criterion, model the
selected physical feeder/drive/catcher topology and its engagement delay, and
obtain real inertia, load, friction and resistance evidence. Further offline
experiments can compare options, but these force values do not authorize hardware
selection, procurement, deployment or physical acceptance.
