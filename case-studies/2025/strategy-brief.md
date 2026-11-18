# 2025 REEFSCAPE: Game-to-Robot Strategy Brief

Review state: **proposal-for-review**. User-selected strategy: **none**. Reviewed 2026-11-16.

Provisional recommendation: **Low-level CORAL placement**. Transparent teaching-scope heuristic: bounded scope favors the narrower task; expanded scope evaluates broader capability. This is not measured optimization.

## Source and event boundary

[Official manual](https://firstfrc.blob.core.windows.net/frc2025/Manual/2025GameManual.pdf); 164-page retrieved PDF; section 6 V13, section 7 V11. [HTML sections rechecked](https://firstfrc.blob.core.windows.net/frc2025/Manual/HTML/2025GameManual.htm) on 2026-11-16. HTML selected sections rechecked; PDF fingerprint belongs to earlier retrieval. Source bodies are not redistributed.
PDF SHA-256: dc6aa9ddbeba25c679c58bae746bde14dba2af79a61a65d8c5f575ca6cdfd523. Event snapshot: Published archive snapshot; event-specific applicability must be resolved.
Applicable event: UNRESOLVED: school, event name/date/stage and applicable update set. Do not transfer archive rules to an earlier event without checking updates.

## Rules and opportunities

CORAL levels, ALGAE PROCESSOR/NET scoring and CAGE objectives create different reach and handling demands. Reference: 6.5.1-6.5.4.
- **25-TIME — rule synthesis:** AUTO lasts 15 seconds. (6.4, pp46–47).
- **25-ZONE — rule synthesis:** Launching CORAL requires BUMPERS partly in the alliance REEF ZONE. (G412, p67).

## Distinct strategy alternatives

| Alternative | Tradeoff | Required capabilities |
| --- | --- | --- |
| Low-level CORAL placement | Reduced lift travel; limited scoring flexibility. | Low-level placement and positive retention; accept reduced level coverage |
| Multi-level elevator/wrist | Broader placement reach; higher mass, stability and collision-control burden. | Multi-level reach, center-of-gravity study and collision-safe lift/wrist sequencing |
| ALGAE-focused processor/net | Different end-effector and release demands; alliance role must be evaluated. | ALGAE capture and characterized processor/net release; alliance task fit |

All alternatives remain proposals. The school has not selected one.

## Decision criteria

- Hard constraints and safety first: fail any applicable rule or unresolved hazardous load path and do not advance hardware.
- Compare expected successful contribution, cycle time, consistency, alliance fit and development effort using measurements; weights await school priorities.
- Prefer bounded scope only provisionally when team resources, alliance role and prototype evidence are unknown. No fabricated weighted score.

## Explicit assumptions

- **A-GATE:** Reviewed zone and alignment valid. proposed conservative release policy; not an official pose/alignment rule or inventory rule.
- **A-SCOPE:** bounded. unverified teaching assumption.
- **A-WINDOW:** 60 s. unverified usable service interval; not the full official phase duration.
- **A-PIECES:** 4 pieces. unverified task target; not a possession-rule limit.
- **A-ROLE:** A limited-reach CORAL role contributes enough without requiring every level.. unverified strategic assumption.

## Capability map and verification

### 2025-CAP-TIME: Mode coordinator

**rule-derived policy; basis 25-TIME.** Cancel autonomous demand at 15 s; physical stopping distance remains unmeasured.
Acceptance: Desktop test crosses deadline; all modeled voltage/release requests cancel.
Evidence: SeasonCaseTest.autoDeadlineRespectsSeason; FMS/robot adapter absent

### 2025-CAP-GATE: Release coordinator

**strategic inference; basis A-GATE.** Reviewed zone and alignment valid; loss of validity prevents release.
Acceptance: Inject invalid/unknown state while ready and assert no feed.
Evidence: SeasonCaseTest.misalignmentBlocksRelease; gate is injected, not a validated field sensor

### 2025-CAP-ROLE: Placement/retention

**assumption-derived requirement; basis A-SCOPE, A-ROLE.** Place at a reviewed low-level target with retention and alignment gating; resolve actual field reach before sizing.
Acceptance: Measure task success over repeated representative trials and confirm field geometry, loads and guard conditions.
Evidence: OPEN: teaching plant does not validate this capability

### 2025-CAP-RATE: Acquisition/drive/scoring cycle

**assumption-derived requirement; basis A-WINDOW, A-PIECES.** Average service rate at least 0.067 pieces/s over the assumed usable interval; at most 15.000 s per piece on average.
Acceptance: Demonstrate 4 successful deliveries in 60 s with acquisition, transit, alignment and recovery included where applicable.
Evidence: OPEN: arithmetic requirement, no measured throughput or match-score forecast

### 2025-CAP-SAFE: Power/mechanical safety

**engineering requirement; basis A-SCOPE.** Resolve electrical protection, physical retention, guarding, load paths and inspection requirements before hardware.
Acceptance: Document component-specific ratings, rule review, load/energy analysis and supervised physical checks.
Evidence: OPEN: no hardware or manufacturing approval

## What changes when an assumption changes

If alliance coverage requires upper levels, derive actual field-relative reach and chassis stability first; add homing, travel limits, lift/wrist collision sequencing and gravity restraint. A 0.3 m teaching target is not field reach.
For the entered interval, reducing usable time to 30 s requires 0.133 pieces/s. This changes feed/recovery or whole-cycle requirements; it does not demonstrate feasibility.

## Next artifact and review gate

**Capability and Verification Contract v1**: capability ID and source/assumption IDs; owner and interfaces with units; acceptance criterion and test method; design envelope and power/mass allocations; failure response and safety review; evidence status and open decision.
Retention and gentle-release fixture plus lift travel/force study; do not infer field reach from the educational elevator.
Reviewer records a strategy decision and resolves event/resource assumptions before subsystem requirements are frozen. Draft code/CAD may explore alternatives without implying approval.

## Existing evidence and open gates

[Case manifest](case.json); [Java laboratory](../../examples/java-2026-sim/CASES.md). CAD state: Script and DXF only for this case; native case execution unperformed. Fusion access restored separately..
- No coral contact, reef collision or structural/stability analysis
- Zero voltage does not hold a gravity-loaded carriage; mechanical retention is unverified
- No complete legality review or physical system verification.
- Java 17/WPILib 2026.2.1 is the teaching baseline for every season, not historical deployment.
- Direct plant feedback; no vendor sensor adapter or calibrated contact/flight physics.

Generated from original authored profiles and case metadata. No copied manuals, field assets or private vault content.
