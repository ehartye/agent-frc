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

## Signed rotary gravity and stop work

Before selecting a catch or fixing its mounts, run the synthetic weighted flap. The input pins one project-owned mass and pose record by its SHA-256.

```sh
npm run mechanism:review -- rotary examples/design-methods/rotary-holding-study.json
```

Use the input as a template. Register each pivot origin in metres, a right-hand unit axis, gravity in m/s², the shared world frame and a signed travel interval in radians relative to the recorded pose. Name which other joints stay held and which payload the moving group actually carries. Give every moving member a mass in kg, its world center of mass at the start and the basis of both values. Record stationary hardware separately and list missing moving stock in `omissions`. Keep source CAD, selected occurrences, configurations, mass substitutions and measured or modeled pose records with the project. A pinned ledger identifies the input. Verify its completeness against the installed mechanism before using the total for a design decision.

The fixture uses 2 kg at 0.5 m in an assumed 10 m/s² field. Its initial holding moment is +10 N·m and reaches −10 N·m when the flap turns over. The fixed frame contributes zero. A catch rated in only one direction cannot hold the modeled flap across this interval. The evaluator finds the extrema between endpoints analytically with the other joints held. A collection of discrete poses covers those configurations and the individual rigid sweeps registered at each.

For a proposed 0.10 rad downward release and another 0.02 rad of compression, gravity releases 0.998 J before contact and 1.197 J through compression. Dividing the latter by 0.02 rad gives a mean resisting torque of 59.86 N·m if the flap starts and ends at rest and the catch absorbs all that work. Move the catch farther away and rerun the same case. A mean is reported only when gravity drives the joint throughout the supplied travel. Record the implied direction opposite travel when sizing the restraint.

For a moving disable, preserve the actual signed incoming speed, inertia, delay, coupled motion and energy dissipated by each element. Sweep the occupied mechanism over the resulting signed travel against the installed obstacles. Verify peak stop loads, load path, hardware rating, retention and observed powerless clearance with the duty review. Those decisions remain open after a gravity calculation alone.
