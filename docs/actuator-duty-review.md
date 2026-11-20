# Can the lift move, survive an obstruction and hold after power loss?

A loaded carriage can reach its target before its drive turns off, then slide slowly out of tolerance. A successful lift also leaves the output force at a hard stop unknown. Test each duty on the same candidate revision, with a defined loaded start and disturbance.

## Run the teaching carriage

```sh
node examples/design-methods/make-actuator-duty-fixture.mjs artifacts/duty-fixture
npm run mechanism:review -- duties artifacts/duty-fixture/study.json
```

The original tabletop simulation compares a drive with passive guide friction against a force switch and separate spring latch. Inspect the delayed case. Both reach the powered travel target. The force switch takes 0.40 s to disable the drive. The compressed spring peaks at 100 N against the assumed 90 N working limit. The latch keeps the carriage within its four-second holding envelope. The drive-only guide descends below its minimum stroke during those four seconds.

## Set project criteria before the run

Use the generator’s emitted JSON as a working input example. Store the complete plan outside the plugin and record its SHA-256 before evaluation. Register each architecture, revision, output branch, protection and holding mechanism, disturbance, loaded start, typed operating settings and load factor. Pin the plan, each execution and the applicable working envelopes by project-relative path, SHA-256 and JSON pointer. Trace the underlying solver or instrument export and preserve its source revision, calibration, recording resolution and adapter in the project. Each architecture and case needs its own identifiable executions. A pinned inventory can document that an installed alternative has neither a powered actuator nor a holding duty.

| Duty | What to record | Student decision |
| --- | --- | --- |
| Powered travel | Actual supply-on and cutoff edges, loaded simultaneous stroke and clearance, elapsed time from startup | Did it reach its required operating pose by the deadline? |
| Powered obstruction | Named restrained branch, installed stop position, signed force extrema, measured trigger, protection output transition and a response tail | Did the complete path stay within its approved signed working forces for this duration, including overshoot? |
| Power-loss holding | Actual supply removal, holding element engagement, retained load and minimum stroke and clearance through the entire specified interval | When did the load first leave tolerance? Is the unpowered installed holding path rated for that load and duration? |

A motion receipt supplies point witnesses and contiguous intervals with extrema at every native simulation step or within justified measurement bandwidth. Summarize all original samples when a long run exceeds the journal’s size limits. Leave gaps visible. Minima and maxima from different samples cannot establish a simultaneous powered pose. An observed excursion after cutoff still fails if the final pose recovers. A successful hold trajectory and the holder’s working capacity have separate results.

Record the blocked branch independently from normal motion. A controller or mechanical release needs a measured trigger and actual native change of drive power or transmission response. For an axial threshold, freeze the allowable trip range in `tripRangeN` and record the force interval at the trigger. The fixture displays peak excess above the measured threshold and trigger-to-action delay. Evaluate both ends of the proposed tolerance under adverse conditions. An ideal switch, current command or speed clamp leaves actual action open.

An intrinsic bound can use an independent qualification of the blocked input-shaft torque and a signed worst-case branch conversion. Include transmission ratio, efficiency, screw lead where applicable, friction and unequal force sharing. Document dynamic amplification or an additional peak allowance, registered start, covered obstruction positions, case settings and duration. A calculated upper bound above the allowable leaves capacity unresolved. A measured load that exceeds the allowable fails. Basic static and dynamic catalog ratings do not establish a working load for an installed assembly.

Teaching assumptions apply only to the synthetic exercise. A physical result requires source-bound physical executions and applicable service evidence for powered and unpowered configurations. Record the first unresolved duty and test the corresponding alternative before advancing the design.

For parallel lift stations, [trace each failed holding path](lift-path-faults.md). Locate the proposed interconnection relative to every belt, nut, holder and shared mount. Replay each side lost, both lost and the governing loose or asymmetric case. Check racking, common descent and individual travel on one post-cut clock.
