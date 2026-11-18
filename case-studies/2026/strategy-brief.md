# 2026 REBUILT: Game-to-Robot Strategy Brief

Review state: **proposal-for-review**. User-selected strategy: **none**. Reviewed 2026-11-16.

Provisional recommendation: **Small buffered shooter**. Transparent teaching-scope heuristic: bounded scope favors the narrower task; expanded scope evaluates broader capability. This is not measured optimization.

## Source and event boundary

[Official manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf); TU22; 166 pages. [HTML sections rechecked](https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm) on 2026-11-16. HTML selected sections rechecked; PDF fingerprint belongs to earlier retrieval. Source bodies are not redistributed.
PDF SHA-256: 5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139. Event snapshot: Published TU22 snapshot; current event applicability requires review.
Applicable event: UNRESOLVED: school, event name/date/stage and applicable update set. Do not transfer archive rules to an earlier event without checking updates.

## Rules and opportunities

FUEL contributes points while the HUB is active; TOWER tasks offer another scoring path. Availability depends on match phase and AUTO outcome. Reference: 6.4.1 and 6.5.1-6.5.3.
- **26-TIME — rule synthesis:** AUTO lasts 20 seconds; TELEOP includes transition, alternating alliance shifts and end game. (6.4, p44).
- **26-HUB — rule synthesis:** Inactive-HUB FUEL earns no points; availability alternates based on AUTO/FMS outcome. (6.4.1, pp44–45).

## Distinct strategy alternatives

| Alternative | Tradeoff | Required capabilities |
| --- | --- | --- |
| Small buffered shooter | Simpler indexing and bounded inventory; more collection cycles. | Small buffer, predictable indexing and explicit scoring-window state |
| Large hopper throughput | More storage and burst capacity; jam, packaging and power costs. | Burst storage/feed, recovery under load and jam/power characterization |
| Tower-oriented role plus modest scoring | Additional scoring role; climb load path and integration effort. | Separate climb load path, retention and integration budget plus modest scoring |

All alternatives remain proposals. The school has not selected one.

## Decision criteria

- Hard constraints and safety first: fail any applicable rule or unresolved hazardous load path and do not advance hardware.
- Compare expected successful contribution, cycle time, consistency, alliance fit and development effort using measurements; weights await school priorities.
- Prefer bounded scope only provisionally when team resources, alliance role and prototype evidence are unknown. No fabricated weighted score.

## Explicit assumptions

- **A-GATE:** Active HUB state plus alignment valid. proposed conservative release policy; not an official pose/alignment rule or inventory rule.
- **A-SCOPE:** bounded. unverified teaching assumption.
- **A-WINDOW:** 10 s. unverified usable service interval; not the full official phase duration.
- **A-PIECES:** 6 pieces. unverified task target; not a possession-rule limit.
- **A-ROLE:** A small buffer can deliver the desired pieces inside the usable active scoring window.. unverified strategic assumption.

## Capability map and verification

### 2026-CAP-TIME: Mode coordinator

**rule-derived policy; basis 26-TIME.** Cancel autonomous demand at 20 s; physical stopping distance remains unmeasured.
Acceptance: Desktop test crosses deadline; all modeled voltage/release requests cancel.
Evidence: SeasonCaseTest.autoDeadlineRespectsSeason; FMS/robot adapter absent

### 2026-CAP-GATE: Release coordinator

**strategic inference; basis A-GATE.** Active HUB state plus alignment valid; loss of validity prevents release.
Acceptance: Inject invalid/unknown state while ready and assert no feed.
Evidence: SeasonCaseTest.gateLossStopsFeed; gate is injected, not a validated field sensor

### 2026-CAP-ROLE: Scoring/targeting

**assumption-derived requirement; basis A-SCOPE, A-ROLE.** Keep external ACTIVE/INACTIVE/UNKNOWN state; hold feed on unknown/inactive state as a conservative strategy.
Acceptance: Measure task success over repeated representative trials and confirm field geometry, loads and guard conditions.
Evidence: OPEN: teaching plant does not validate this capability

### 2026-CAP-RATE: Buffer/feed/power

**assumption-derived requirement; basis A-WINDOW, A-PIECES.** Average service rate at least 0.600 pieces/s over the assumed usable interval; at most 1.667 s per piece on average.
Acceptance: Demonstrate 6 successful deliveries in 10 s with acquisition, transit, alignment and recovery included where applicable.
Evidence: OPEN: arithmetic requirement, no measured throughput or match-score forecast

### 2026-CAP-SAFE: Power/mechanical safety

**engineering requirement; basis A-SCOPE.** Resolve electrical protection, physical retention, guarding, load paths and inspection requirements before hardware.
Acceptance: Document component-specific ratings, rule review, load/energy analysis and supervised physical checks.
Evidence: OPEN: no hardware or manufacturing approval

## What changes when an assumption changes

If the usable window falls from 10 s to 5 s while six pieces remain desired, required average feed rises from 0.6 to 1.2 pieces/s. Reassess buffer, recovery, power and jam requirements; do not merely double motor voltage.
For the entered interval, reducing usable time to 5 s requires 1.200 pieces/s. This changes feed/recovery or whole-cycle requirements; it does not demonstrate feasibility.

## Next artifact and review gate

**Capability and Verification Contract v1**: capability ID and source/assumption IDs; owner and interfaces with units; acceptance criterion and test method; design envelope and power/mass allocations; failure response and safety review; evidence status and open decision.
Bounded feed/recovery fixture with measured cycle timing; do not infer launch success from flywheel speed.
Reviewer records a strategy decision and resolves event/resource assumptions before subsystem requirements are frozen. Draft code/CAD may explore alternatives without implying approval.

## Existing evidence and open gates

[Case manifest](case.json); [Java laboratory](../../examples/java-2026-sim/CASES.md). CAD state: Native guarded sideplates created; 6.35 to 7 mm thickness edit, F3D/STEP reopen and numerical geometry/history checks passed 2026-11-16. Separate experiment; not a complete assembly..
- No fuel flight, bounce, scoring sensor or full-field model
- No FMS parser, phase-clock synchronization or scoring-window arrival-time verification
- No complete legality review or physical system verification.
- Java 17/WPILib 2026.2.1 is the teaching baseline for every season, not historical deployment.
- Direct plant feedback; no vendor sensor adapter or calibrated contact/flight physics.

Generated from original authored profiles and case metadata. No copied manuals, field assets or private vault content.
