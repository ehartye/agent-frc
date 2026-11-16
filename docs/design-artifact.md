# Editable design artifacts: strategy -> blockout -> rehearsal -> CAD

This workflow maintains a project-owned JSON artifact rather than treating a screenshot, a browser session or an assistant recommendation as the design. Two dedicated conversational skills guide students through strategy and previsualization, including early programming and fabrication thinking.

## Supported scope

Version `agent-frc/design-artifact@1` currently supports one parameterized 2024 Speaker blockout profile, not arbitrary CAD or other seasons. Its nominal dimensions derive from the linked manual/drawing references; registration remains a design assumption. The generic body/tool blocks are spatial reserves, not selected mechanisms. Use earlier season workflows for other years; do not relabel this profile as another game.

## Artifact contract

- `id`, positive integer `revision`, and preceding `parentRevision` identify the candidate. Preserve previous files to retain history; a revision number alone is not storage.
- Units are metres. World Z is up. Robot +X is forward; heading rotates it about world Z. Target transform applies to the canonical blue-facing opening (high edge has negative X). It is not an extra conversion from the drawing frame.
- `strategy` preserves alternatives, provisional choices, requirement IDs and decisions. `selected-for-cad` is not owner acceptance or selection for build.
- `design.parameters` are the authoritative dimensions. Derived volumes are never redundantly stored in the editable input. `requirementLinks` link stable volume IDs to requirements.
- One reversible chassis-opening operation targets only frame plate and body envelope. It keeps the bumper intact. A NOTE-sized gap must not be silently cut into a 2024 bumper: R401/R403 require further rule-compliant architecture. Chassis indentation does not redefine the taut-string frame perimeter.
- `rehearsal` records ordered poses/actions, assumed speeds/waits and generic opponent parameters. The first pose is a starting state; actions occur on arrival at later poses. Timing is kinematic, not motor/contact simulation. Footprint overlap is exposure, not damage or reliable collision prediction.
- `disciplinePlans` holds editable states/sensors/actions/failures and pseudocode, plus materials, processes, tool capabilities and fabrication questions. These are early cross-discipline contracts, not hardware authority or production code.
- `sources`, `constraints` and `provenance` distinguish source facts and unresolved assumptions. A source hash is optional only when no retained source capture is available; it is not proof of current rules.
- `checks` must name the current revision. `reviseDesign` clears checks after changes. Generated handoff is a derivative: re-export after editing.

## Commands

```sh
npm run design -- new design.json
npm run design -- validate design.json
npm run design -- opening design.json opening-candidate.json on
npm run design -- export opening-candidate.json new-cad-handoff
```

Commands refuse to overwrite files/directories. The output contains `design.json`, `geometry.json`, `checks.json`, `blockout.scad` and `HANDOFF.md`. JSON is the canonical editable source; OpenSCAD is a generated spatial-envelope derivative. No native OpenSCAD build, STEP topology, fabrication, stress or collision safety claim follows from text generation. The export has no external assets or private machine references.

The browser-compatible `scripts/design-artifact.mjs` provides `createDesign`, `validateDesign` (`validateArtifact` alias), `canonicalStringify`, `reviseDesign` (`editArtifact` alias), `deriveGeometry`, `worldPoint`, `spatialChecks`, `rehearsalBudget` and `exportCad`. `reviseDesign(a, draft => ...)` clones before editing, increments revision, sets the parent and invalidates checks. Validation rejects unknown fields, duplicate IDs, unresolved internal references, wrong units/seasons and nonfinite/out-of-domain dimensions. It validates document consistency, not physical truth.

## Iteration example

A student chooses to explore floor acquisition. Record that role and requirement, reserve a chassis bay, and compare it to an over-bumper mechanism. Rehearse pickup/turn/shot poses and expose the assumed waits. A programmer drafts detection and recovery states; a fabricator identifies a material/process capability question. If the game piece cannot travel through the reserved space without violating bumper coverage, revise the architecture or narrative, not the rule. Save the rejected candidate and reason, then hand the selected revision to CAD with its open questions.

## Verification boundaries

Tests cover deterministic save/load, reversible operations, frame transforms, validation/adversarial inputs, rule-screen labels, timing sums, CLI roundtrip and overwrite refusal. The browser owns its own import/export integration tests. Host installation and release/catalog activation are separate verification steps. Rules and nominal geometry never imply complete robot legality or build readiness.

### Front support and shaped alternatives

The reversible bay ends 50.8 mm short of the front frame edge. This provisional strip preserves space for bumper support, but is not an attachment or structural qualification. R410 backing gaps and end supports remain an unknown check. Continuous bumpers need not imply a square/perpendicular frame: angled or raised-intake alternatives belong in narrative decisions and a separate geometry study. This version has only an axis-aligned rectangular profile and must not claim to encode those alternatives.

OpenSCAD output explicitly scales metre inputs by 1000 to millimetres for CAD import. It contains robot envelopes and a reference NOTE only; target/field geometry is retained in geometry.json with poses in design.json. HANDOFF.md includes the canonical artifact SHA-256 so the handoff can be matched to its input.

## Implementation feedback and enhancement backlog

- A renderer-owned scene was not an editable engineering artifact. The shared pure contract now drives browser and CLI geometry; test copies for drift rather than reimplementing formulas.
- Multiple representations of dimensions can silently diverge. Parameters are authoritative and exports are derivatives. General arbitrary volumes and angled frame profiles need a future versioned contract, not undocumented fields.
- A chassis subtraction originally implied too much about acquisition and bumper legality. The default retains bumpers and a provisional support strip; geometric subtraction is never rule or structural evidence.
- Unitless CAD imports can turn a metre robot into a millimetre object. The exporter now makes the conversion explicit and tests it. Native CAD execution remains a separate evidence gate.
- Cross-discipline plans were missing from early design artifacts. Editable pseudocode and fabrication questions now travel with the saved design rather than arriving after detailed CAD.
- Terminal text encoding can corrupt visual arrows. Keep portable command/document separators ASCII and validate actual file bytes rather than trusting terminal display.
- Exploratory scripting became a dependency-free CLI with roundtrip, malformed-input, reversible-operation and overwrite-refusal tests. Browser download/import fidelity and learner effectiveness must be verified separately.

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
