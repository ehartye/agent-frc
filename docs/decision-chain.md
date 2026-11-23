# Parallel decision chains (v1)

The executable API in `scripts/decision-chain.mjs` maintains append-only artifact revisions and reports stale dependencies. It does not choose a team strategy, approve hardware, run simulation, or certify source accuracy. All records remain hypotheses. Actual human decisions require a separate authenticated review workflow; this API rejects nonempty decision records rather than accepting a model-authored reviewer name as approval.

## Identity and branching

A study has a season, a `shared` root, named branches with one explicit parent, artifact history and an empty decision collection. Artifact IDs are globally unique within a study; a logical artifact keeps its ID, kind and branch across revisions. Each revision carries `previous`, exact input `{id, revision, sha256}` pins, season, content, hypothesis status and its own SHA-256. The digest detects accidental alteration, not trusted authorship or a cryptographic signature. Object keys are canonicalized; array order is significant.

`createStudy`, `forkBranch`, `appendArtifact`, `pin`, `validateStudy` and `impactReport` are exported. They return new values without mutating the caller's study. Persist a returned study only after validating it and checking the stored revision has not changed; file locking/atomic storage is the caller's responsibility. `expectedRevision` guards stale appends within the supplied snapshot, not concurrent disk writers.

Shared Game Analysis and Resource Baseline revisions feed any number of strategy branches. A strategy branch can fork further into competing design directions, each retaining ancestry to the same strategy/contract. Sibling branches cannot silently borrow each other's evidence. Reusing a design requires an explicit new artifact in the destination branch with separately reviewed content, not a hidden merge.

Required input kinds form this chain:

Game Analysis + Season/Team Resource Baseline → Strategy Brief → Capability Contract → Architecture/Trade Study → Subsystem Specification → Evidence.

A record may pin additional upstream records. Input references must already exist, preventing cycles/forward references. Updating a shared baseline invalidates all dependent branches transitively. Updating one hypothesis invalidates only its descendants. Earlier records remain visible. A newer artifact revision does not automatically repair dependent records; explicitly rebase their pins and rerun affected tests. “Not stale” means revision-consistent only, not tested, feasible, safe, approved or legal.

## Content contracts for domain adapters

The v1 executable validates graph/version integrity. These domain fields are the required design for future adapters, not yet exhaustively machine-validated:

- **Game Analysis:** season; event name/date/stage or explicit unknown; manual/update revision; source URL, retrieval date, digest and section/page locator per fact; distinguish official fact, interpretation and open question. Do not attach a PDF digest to later HTML text. Historical snapshots cannot silently become current event rules.
- **Resource Baseline:** season-specific team status; physical inventory with exact part/revision, quantity, condition, availability and evidence; kit expectations/eligibility/opt-outs separately; vouchers/credits separately; procurement, cost, schedule, fabrication capability and unknowns. Missing inventory is unknown, never zero or presumed ownership. No secrets or voucher codes. An opt-out changes expected receipts, not existing owned stock.
- **Strategy:** hypothesis ID, game and resource pins, explicit assumed targets, measurable objectives and constraints, alternatives, feasibility classification (available/acquire/substitute/unknown), uncertainty and unresolved priorities. Recommendations are not decisions.
- **Capability:** stable capability IDs, basis refs that distinguish rule facts from assumptions, measurable acceptance bounds and units, resource demand, failure behavior and verification methods. No inferred official pose rule from an inventory restriction.
- **Architecture and subsystem:** independent design IDs/revisions; parent capability coverage, interfaces and units, budgets, geometry/load assumptions, trade criteria and unresolved issues. CAD and software are separate evidence types with their own gates.
- **Evidence:** subject pins; evidence type and execution status; input/artifact checksums, tool/runtime/model versions, command/configuration, measured outputs and limits; explicit not-run, failed or completed status. Preserve failed runs. Re-pinning an old result does not rerun it or establish validity.

## Fair simulation integration boundary

A comparison manifest must pin independent revisions for the ruleset, robot concept, strategy policy, scenario, simulator/model and each run. Record branch/artifact pins, paired seed streams by exogenous process, identical observation access, constraints, predeclared metrics, sample count/stopping rules and failure accounting. Keep fixed-common-policy comparisons distinct from equal-budget separately tuned-policy comparisons. Preserve every candidate and scenario result, uncertainty and sensitivity, not just a single weighted rank. Different event/rules revisions must not be ranked as one fair cohort.

Model uncertainty must be reported separately from random trial variation. Current one-pocket teaching plants do not justify match-score forecasts, scoring accuracy, contact physics or physical safety. The chain stores this evidence and propagates revision changes; it does not supply that experiment harness or automatically select a winner.

## Inspect a saved graph

Run `npm run validate` and `npm run test:changed`. To inspect a saved graph: `npm run chain -- study.json`. JSON parsing/graph failures exit nonzero. The CLI is read-only. Tests exercise independent strategy and design branches, shared and branch-local invalidation, explicit rebasing, changed hashes, revision conflicts, invalid handoffs, season contamination and forged decisions.

## Machine-readable field and game semantics

`validateFieldModel` in `scripts/field-semantics.mjs` validates `frc-field-semantics/v1`. Put this under Game Analysis `content.fieldModel` to make the same exact revision available to strategy and simulator consumers. The graph invokes this validator when the field model is present; legacy analyses can omit it, but omission is not a completed field analysis.

The model contains season, version-pinned sources, frames, locations, zones and obstacles. Each entity has a stable ID, rule/update semantic source references, explicit phases/conditions/possession/replenishment (null means unknown), geometry and `reachability: not-assessed`. Locations declare scoring or retrieval purpose. Geometry is either unknown with a reason and no coordinates, or sourced with metric frame, dimensionality, shape, coordinates, uncertainty (null means unknown), and official CAD/drawing source references. Frames explicitly identify origin and axes. Every source includes kind, season, URL, revision, retrieval date, locator and body SHA-256. Source labels are asserted provenance, not independently authenticated by the validator.

Unknown is not a centered default, zero-sized region or traversable area. Consumers must block geometry-dependent scoring, retrieval or collision claims until required geometry and semantics are resolved. Empty locations/zones/obstacles do not establish complete field coverage. Reachability, robot clearance and legal action feasibility require the selected robot/strategy plus game conditions; they are not properties inferred from a CAD point. A field revision participates in the same exact-pin invalidation as any Game Analysis revision.

### FieldPackage, Scenario and RobotAffordanceMap boundaries

The field model is the authoritative **FieldPackage payload**, versioned by its containing Game Analysis artifact and digest. It describes published geometry and rule semantics, not a particular robot or initial game-piece arrangement. A strategy consumes that same exact package pin as the simulator. A Scenario separately pins it and supplies dynamic piece locations/counts, replenishment sources, match phase, other-agent states and random-process configuration. A RobotAffordanceMap separately pins it plus the robot concept, recording robot-specific reach/clearance, approach and release envelopes, accessibility assumptions and uncertainty. Neither dynamic scenario state nor affordances may overwrite authoritative field geometry.

For each scoring location, semantic adapters must distinguish the permitted **release region**, physical **entry region**, and rules-defined **assessment condition**. A null region is unresolved, not equal to either of the other two. For retrieval, separate the physical acquisition region from available inventory, possession constraints, replenishment schedule/conditions and source capacity. A Scenario transition must conserve pieces except for explicit rule/model-defined source and sink events; successful scores, retrievals and replenishments must not create duplicate pieces. Declare zone and obstacle coverage incomplete until verified. These behavioral checks belong in the simulator/semantic adapter and are not yet implemented by the graph validator.

Suggested adapter interfaces (all references include artifact ID, revision and SHA-256):

- `Scenario`: fieldPackageRef, initialState, exogenousProcessRefs, sourceSinkRules, assumptions, unresolvedInputs.
- `RobotAffordanceMap`: fieldPackageRef, robotConceptRef, capabilityContractRef, entityAffordances, validationEvidenceRefs, unresolvedInputs.
- `ExperimentManifest`: fieldPackageRef, scenarioRef, robotConceptRef, strategyPolicyRef, simulatorRef, seedSchedule, observationContract, tuningBudget, metrics, stoppingRule.
- `RunEvidence`: experimentManifestRef, branchRef, runtimeVersions, outputDigests, executionStatus, failures, uncertainty, limitations.

A future adapter must reject mixed package hashes within a comparison cohort and unresolved quantities needed for a metric. Current v1 intentionally supplies the dependency/version foundation and field data validation, not a misleading executable match simulator.

## Preliminary robot envelopes

The graph supports a parallel `robot-envelope` artifact kind. Each envelope must pin Game Analysis, Resource Baseline and its Strategy Brief. Keep several candidate envelopes (kit-derived, compact, payload-oriented) as independent branch hypotheses. Capability/architecture/spec records should additionally pin the envelope they consume so later changes invalidate their assumptions. The v1 graph checks these upstream links, not physical feasibility or all payload fields.

The envelope content contract separates:

- **Hard legality bounds:** rule ID and exact source/event revision for starting footprint/perimeter, height, extension, mass and other applicable limits. Include each measurement convention and included/excluded components. Unresolved applicability stays unresolved, not a borrowed cross-season limit.
- **Candidate targets:** footprint dimensions and coordinate convention, frame/bumpers/package dimensions, mass and extension/height allocations, intended payload volume and service/access margin. Every target is assumed, derived or measured, with input provenance and units; never silently use a legal maximum as the chosen target.
- **Actual hardware basis:** exact kit/component revision and dimensions, confirmed ownership/availability evidence and required clearances. Expected kit receipt, voucher value and unknown inventory do not establish physical stock or a mechanically compatible chassis.
- **Field-driven checks:** pin relevant playable boundary, scoring/retrieval approach region, corridors/obstacles and required clearance. Record robot orientation, swept envelope, tolerance, bumper convention, motion state and assumptions. Unknown field geometry produces an unresolved check, not feasible reachability.
- **Budgets and alternatives:** mass, height, extension, packaging, electrical/power and development allocations, reserves and unresolved integrations. Compare competing candidates on identical field/source snapshots and explicit objectives; preserve tradeoffs without selecting one.
- **Status:** distinguish hypothetical target, analytically checked condition, simulation evidence and measured hardware result. No overall feasible/final/manufacture-ready designation follows merely from a valid graph or smaller rectangle.

Early dimensions may be calculated only from verified applicable rule bounds, verified actual hardware dimensions and verified field geometry, with assumptions and uncertainty exposed. No real envelope dimensions were invented in this implementation. Tests prove resource revisions invalidate multiple envelope candidates. A future geometry adapter must establish collision/approach and mechanism reach against the shared FieldPackage before claiming any target is workable.

During delivery review, reconcile the installed build list, unresolved purchases and combined inspection margin with the [assembly accounting check](assembly-accounting.md).
