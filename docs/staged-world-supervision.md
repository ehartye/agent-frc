# Staged supervision in the continuous world model

## Executed scope

The new `StagedCatcherController` is opt-in, leaving the earlier controller and receipts unchanged. DISARMED permits no closure. Arming requires initially clear arrival/tail beams and no prior tail pulse. It establishes beam history only. WAIT_ARRIVAL counts the required season pulses across the whole approach; arrival still needs fresh bounded clearance permission before any closure. CLOSING and HOLD require independent pad evidence. Missing arm, blocked initial beams, disabled operation and overdue updates fault rather than granting implicit permission.

The world rig carries one piece and rotor state from x=-250 mm through the original intake to the catcher datum at x=400 mm. It does not reset motion at arming or completion. Its 54 trajectories include nine nominal season/feed-speed combinations, previous beam/gate/release/disabled/no-feed controls, 18 missing/stale pose, unilateral pad, lost load, unarmed and conservative-global-bound controls, three stuck-high pad cases and three missed-update cases. Ten Java tests execute the trajectories and original contact-model golden vectors.

Nine nominal trajectories meet the existing provisional dwell/displacement criterion and local release criterion under the toy model. This is not calibrated capture or complete robot validation.

## Independent virtual pad observations

A separate pad position advances 12 mm over 20 ms when commanded. The first 10 mm is free travel; remaining travel is assumed compression. Independent left/right compression supplies contact bits and a hypothetical 1 N/mm law supplies a 1-3 N load-valid window. These values are experimental assumptions, not hardware specifications. The tangential capped damping is active only when the simulated pad state supports it, rather than merely because gate feedback or PWM is high. Normal-load energy, lateral body dynamics and actuator force dynamics are not modeled.

## Refining the motion bound without changing the plant

The original global lower-acceleration bound of 104,000 mm/s² rejected all three stationary HOLD paths. Those rejections remain as fault-12 controls. The nominal paths instead use a conditional bound derived from the unchanged passive tangential model, supplied by its exact virtual state, not by a real estimator.

Let E be piece kinetic plus front/rear spring energy in joules. Mass is the existing hypothetical 0.5 kg. With no upstream contact/input and passive contact integration, speed is at most sqrt(4E). The front spring force is at most sqrt(400E), including its force-limited continuation, and front damping is at most 20 sqrt(4E). Side damping adds at most 2 N; the rear force cannot worsen the negative acceleration. Thus a lower-acceleration magnitude bound is min(104000, 2000(60 sqrt(E)+2)) mm/s². Every 2 ms supervised plant step asserts upstream isolation and this lower-acceleration inequality. An independent Python test samples the corresponding passive step bound.

If the scheduled positive 0.2 Ns test impulse falls within the next controller interval, E is conservatively enlarged to 0.25(sqrt(4E)+0.4)². This known positive impulse cannot worsen the position lower bound directly, but its added energy can increase later negative force. This argument does not cover unknown disturbances, unmodeled input work, real compliance or actuator energy transfer. Error bars in the observation remain hypothetical; energy is an oracle input from the simulation.

## Adversarial findings, not concealed successes

Stuck-high pad evidence can falsely authorize HOLD in all three seasons even when physical pad travel remains zero. Subsequent clearance supervision faults these particular trajectories, and none is reported as completed capture. This does not diagnose the false pad signal or prove a general stuck-high safety guarantee.

Three intentionally omitted controller updates leave the prior gate command active. Piece motion continues during the silence (about 0.27-0.30 mm in these examples). On return, the controller detects the missed 20 ms deadline and faults, while retaining the previously requested closure. Fault is an acceptance stop, not a mechanical stop. An independent watchdog, safe output strategy, real sensor diagnostics, actual actuator behavior and calibrated bounds are still required.

Gate completion remains a guarded 20 ms discrete event in the world rig. The separate native swept-geometry proof is not a force-coupled actuator simulation, and it has not been silently substituted for one. Fixed axis-aligned pose, externally supplied feeder momentum, assumed mass/friction/forces and local-only release limits remain in force.
