---
name: frc-strategic-narrative
description: "Guide a student from match goals to explicit strategic narratives and provisional requirements before robot mechanisms are selected."
---

# Strategic Narrative


## Advice and process guidance

**Entry:** a student has a game, robot idea, or an existing CAD model but no clear reason for its architecture. Accept partial knowledge. Never force a lengthy questionnaire before showing a useful first hypothesis.

1. Ask one grounded question: 'What would you want this robot to do repeatedly during a match, and what would your partners handle?' If unknown, offer two or three concrete match stories with distinct alliance roles.
2. Turn the answer into a cycle: start state -> acquire -> retain/index -> travel -> align -> score or transfer -> recover. Say which parts are assumptions. Include failure recovery, not only the happy path.
3. Contrast alternatives using student-understandable costs: time to build, chances of a jam, time spent lining up, exposed parts, dependence on a partner. Do not equate the most mechanisms with the best robot.
4. Recommend one provisional exploration and explain why. Ask for a strategic choice only when alternatives materially change the user's purpose; choose routine provisional dimensions yourself.
5. Save narrative IDs, assumptions and observable requirements to the project artifact. Explain the difference between 'we want to do this' and 'we have demonstrated this.'
6. Exit into pre-vis with a named cycle and a small number of requirements. Do not jump to detailed CAD or pretend the narrative predicts match wins.

Example: 'A close Speaker cycle could be our first experiment: collect a nearby NOTE, retain it, return to one repeatable shot, then recover if pickup fails. An Amp-focused robot may be a better partner if placement is much more reliable than shooting. Let's block out both paths before choosing the mechanism.'


## Documents maintained

Maintain the project narrative document and editable artifact: stable narrative IDs, alternatives, cycle states, assumptions, requirement IDs, decision rationale, failure recovery, and evidence links. Preserve owner decisions verbatim where material. Offer a recommendation, but never record a strategy as accepted merely because the assistant proposed it. Exploration may proceed provisionally with that status explicit.

## Conversation and ownership

Work on one consequential decision at a time. Explain options and your recommendation, then allow the student to choose or revise their goals. Do not turn a sequence of leading questions into automatic acceptance. Preserve reversible alternatives.


- Explain unfamiliar terms at the point they matter; use pictures/volumes before dense formulas.
- Keep the student in charge of goals, but do routine drafting and revision work rather than requesting every number.
- Make a useful first artifact quickly, then iterate through small understandable choices.
- Separate intention, source fact, assumption, geometric screen and demonstrated behavior in both conversation and saved artifact.
- Carry corrections forward. A failed geometry or changed role invalidates dependent checks, not the student's progress.
- Never convert a favorable visualization into unsupported safety, scoring, reliability or rules approval.


## Runnable artifact workflow

Read [the design artifact contract](../../docs/design-artifact.md). For the supported 2024 Speaker blockout profile:

```sh
npm run design -- new design.json
npm run design -- validate design.json
npm run design -- opening design.json candidate.json on
npm run design -- export candidate.json cad-handoff
```

Keep a prior revision before editing. Use the shared validator and revision function; do not retain check results after changing their inputs. CAD handoff contains editable source, generated OpenSCAD envelope, dimensions/frames, rule-screen limitations and unresolved work. No native CAD execution or fabrication qualification is implied. Other seasons/profiles require their own sourced geometry implementation, not changing the season number.

## All disciplines participate

Invite programmers, mechanical designers and fabricators into the same narrative discussion. Ask one consequential question at a time, not three parallel questionnaires. Sketch states, sensor evidence, actions, guards and failure recovery in `disciplinePlans.programming`; retain editable pseudocode as an early contract, never label it production control code. In `disciplinePlans.fabrication`, record material/process/tool-capability hypotheses and open questions; an unrestricted-shop exploration is not proof a school owns the equipment or that students are authorized to operate it.

For every mechanism change, ask what changes in sensor visibility, controller state/timeout, manufacturing process, assembly/service access and rehearsal time. Link findings to requirement IDs; keep unsolved questions visible. The artifact and canonical project/wiki documents belong to the project. Do not overwrite owner decisions, auto-accept a strategy, impose external sidecars, install software, operate hardware or publish without the applicable authorization.

## Shaped perimeter alternatives

Continuous does not mean completely square or perpendicular. Invite a shaped or angled frame/continuous-bumper alternative when it serves the acquisition strategy. Record a raised intake-side bumper as design intent, not a legal conclusion. Review the actual season's taut-string frame perimeter, bumper vertical zone, full coverage, backing, end supports and non-articulation rules. For 2024, a chassis bay alone does not qualify an intake path: R410 backing gaps and end supports still need evidence. The v1 rectangular artifact retains a provisional 50.8 mm front strip; this does not qualify its material or attachments. Its rectangular profile cannot represent angled frames. Preserve that alternative in narrative decisions and a separate geometry study instead of silently flattening it into a square box or claiming a supported export.

## Architecture overlap and concurrent actions

Do not force complete separation of concerns. Compare intentional redundancy (such as overhead and drive-over acquisition), separate modular paths, and a multifunctional intake that shoots by reversing the same mechanism. These are candidate architectures, not selected solutions. Ask what the strategy gains and what it pays in mass, packaging, build complexity, controllability, shared failure modes and recovery. For a reversible intake/shooter, compare capture and launch operating points, orientation/release geometry, retention, sensing, reversal/jams, changeover time and power/thermal demands. A shared actuator can simplify packaging while becoming a common failure point; redundancy can improve recovery while consuming space and resources. Neither is automatically better.

Design and program for useful concurrency rather than assuming every cycle must stop, aim, then shoot. Explore shooting while driving toward reload or adjusting aim while performing a permitted defensive role. Invite programmers to sketch independent drive, acquisition, aiming and release activities with guards and explicit shared-resource ownership. Mechanical designers identify moving release geometry, swept volumes and load paths; fabricators identify mounting stiffness, tolerances and service access. Compare cycle time against accuracy, motion compensation, sensor latency, control stability, power/current limits and conflicting actuator demands. Preserve a stop-and-shoot or defer-release fallback when its guards cannot be established. These sketches do not demonstrate safe, legal or accurate behavior.

The current v1 route budget is deliberately serialized and cannot execute concurrent actions or predict moving-shot accuracy. Record proposed parallel activity and guard/conflict questions in editable pseudocode and narrative decisions; label any claimed timing savings unverified. Do not subtract overlapping durations from the serial budget or present an animated route as a validated concurrent controller. A future scheduler model needs duration/dependency/resource semantics and tests before it can support that claim.

## Observable underperformance and optional degraded strategies

Ask which subsystem symptoms an operator needs to notice early, which evidence distinguishes real underperformance from bad/stale sensors, and what useful remaining capability the strategy might preserve. Show commanded versus measured behavior, data freshness, fault reason, available mode, active mode and release-inhibited status. An operator-requested degraded mode is a candidate design choice, not a requirement or a safety guarantee.

For example, explore whether persistently low shooter RPM could support a tested shorter-range profile with appropriately matched wheel speeds. Do not assume matching speeds preserves launch spin, trajectory or accuracy, or command another wheel to chase a failing measurement. Define the achievable operating envelope first. Mechanical design contributes release geometry/load limits, programming contributes detection and state guards, fabrication contributes repeatable alignment/service checks, and drivers help make status and activation understandable.

Record explicit activation and cancellation, inhibit conditions, bounded behavior, recovery/exit criteria and operator feedback. Keep diagnostic thresholds, dwell times and distinct enter/exit thresholds (hysteresis) as unverified parameters until evidence establishes them. Inhibit release for stale or implausible sensor data, thermal/current limits, loss of the validated range/geometry envelope or unresolved resource conflicts; an operator toggle must not bypass those guards. Decide deliberately whether recovery needs acknowledgment rather than silently switching modes during a shot.

Plan fault-injection tests for low RPM, lagging/stale/disagreeing sensors, threshold chatter, activation outside the envelope, faults during mode changes, cancellation, recovery and concurrent drive/aim demands. Test status clarity and logs as well as commanded behavior. In v1, save this as states/sensors/actions/failures and editable pseudocode plus linked test questions; neither the blockout renderer nor its serial timing budget executes a fault controller or validates degraded accuracy or safety.

## Game-piece variation and adjustable contact mechanisms

Treat the game piece as a measured population, not one perfect nominal object. Ask how dimensions, shape, mass where relevant, stiffness, surface friction and compression response vary with manufacturing, use and damage. Foam, vinyl and plastic can age differently; do not substitute an assumed material behavior for observations of the actual season's piece. Separate published nominal dimensions, measured sample ranges, measurement uncertainty and unresolved hypotheses. Never invent a tolerance range and label it measured.

Explore adjustable roller spacing, compression, guide clearance, alignment and control settings where they serve the strategy. Designers specify what is adjustable and the permitted envelope; fabricators consider access, repeatability, locking, wear and service time; programmers consider detection and recovery when contact behavior changes. More adjustability has costs in stiffness, mass, complexity and setup error, so preserve fixed and adjustable candidates until evidence supports a choice.

Plan tests across new, worn and representative deformed pieces: measure condition and setup, repeat acquisition/retention/release, track jams, slip, damage and consistency, then repeat after wear. Use measured ranges and explicit uncertainty to explore sensitivity, not a single optimistic value. Keep calibration records and retest after material, geometry or setting changes. The v1 NOTE torus is a nominal visual reference only; it models neither compliance, friction, wear nor contact tolerance. Save parameter ranges and test plans in requirements and fabrication questions until a validated contact model supports them. A configurable setting is not proof of a robust mechanism.

## Learn from prior robots without copying them

Use attributed prior-team CAD and documentation to learn about component selection, materials, tolerances, manufacturing processes, load paths and serviceability. Distinguish directly observed features from inferences and unknowns; retain the source and its version or date. Then derive an original student design from this team's strategy, constraints and evidence. Do not replicate another team's robot or mechanism design, trace its geometry, or treat public access as permission to redistribute its files. Even a permissive license does not override the owner's direction not to copy team designs. An independently chosen standard component is distinct from copying a team's assembly; check its own documentation and licensing. Carry source-bounded lessons into the project knowledge base without importing restricted assets or private context into public repositories.

## Reliability, pit work and condition-monitoring hypotheses

Start with a component or CAD volume ID and its intended load path. Ask where impacts, cantilevers, joints, bearings, belts, wire strain or service access could create failure. Record a candidate failure mode, consequence, evidence versus inference, inspection trigger, observable operator alert, proposed verification test, repair procedure reference and maintenance-history entry. Do not call a visual weak point a proven failure or a clean inspection proof of structural adequacy. Prioritize consequential failures with the student; do not invent fatigue life or safe loads.

Make a practical pit plan: identified inspection locations, responsible role, required tools/spares, isolation and stored-energy precautions, acceptance/escalation criteria and documented post-repair checks. Record date/event, symptom, component revision, observation, action, replacement/settings and retest outcome. Use damage, unusual impact, looseness, changed performance or monitoring anomalies to trigger investigation; retain planned checks appropriate to the actual design. A repair or alert should update the artifact and operator briefing, not disappear into chat.

Do not prescribe fresh threadlocker every match or disturb an intact joint merely to reapply it. Follow the actual joint specification and product TDS/SDS for compatibility, preparation, application, cure, reassembly and service. Product choice and cure conditions matter; more adhesive is not automatically better. [Henkel application guidance](https://next.henkel-adhesives.com/au/en/articles/common-mistakes-using-threadlockers.html).

For a vibration/harmonics study, justify accelerometer axes, mounting, bandwidth, range/noise, sampling/filtering and RPM reference before interpreting spectra. Compare repeatable operating states to a recorded known-condition baseline. Saturation, aliasing and processing artifacts can resemble changes in machinery. [Analog Devices vibration-monitoring introduction](https://www.analog.com/en/resources/analog-dialogue/articles/intro-to-mems-vibration-monitoring.html).

Our design inference: a changed signature is a reason to inspect, not a diagnosis of a loose bolt, crack or bearing fault. A generic robot IMU may be unsuitable. Set thresholds only from suitable data and validation, and distinguish speed/load changes from possible deterioration. Plan tests for sensor faults, mount changes, false alarms, missed faults and repeatability; do not deliberately damage or run an unsafe mechanism. The v1 blockout performs no vibration, modal, fatigue or structural analysis. Use existing requirement IDs, fabrication questions and planning states to retain this work; detailed inspection logs belong in linked project documents.
