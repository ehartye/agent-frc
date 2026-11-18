# Season hardware-rule catalog

A hardware catalog answers which rule constraints must be checked, not what a team owns or whether an assembled robot is legal. `hardware-catalog` is a versioned shared decision-chain input, separate from `resource-baseline` physical inventory. It does not supply manufacturer torque/current/speed/thermal curves or grant engineering acceptance.

Each catalog has one season, source URL/revision/body hash, exact-byte review provenance, selected rule IDs/locators and conditions. Coverage is explicitly partial and event applicability unresolved. Rules vary by snapshot and season: never substitute a later named device, generic motor class, radio exception or controller pairing into an earlier season.

`selectHardwareRules(catalog, {season, entryIds, expectedCatalogSha256})` requires the exact catalog hash. Missing entries return `unknownEntryIds`, not a prohibited-device judgment. Results always leave physical inventory, manufacturer performance, configuration legality and controller compatibility null. A permission for a motor class does not prove every controller can drive it, every wiring configuration is legal, or the team has the parts.

`buildHypotheticalCandidates(inputs, {hardwareCatalog})` can pin the catalog into each new component-assumption, strategy and envelope branch. Revising the catalog marks these dependent artifacts stale. Existing branches without that dependency are not silently repinned or claimed reviewed. Selecting rule IDs does not execute a rules engine; conditions and configuration must still be assessed.

## Engineering checks beyond the catalog

- Motor choice: precise part/revision, controller pairing and firmware, voltage, breaker/wire limits, gearing, current/torque/speed curves and thermal evidence. Do not treat a branch breaker rating as a stall-current limit.
- Power: exact permitted distribution/control components, battery rating, required breaker/connectors/conductors, branch wiring and auxiliary exceptions. Full installation review remains outstanding.
- Propulsion: classify drive, steering, shifting and incidental thrust against the selected season's definitions; do not count every installed motor identically.
- Vision: a camera/coprocessor can provide estimates, but coordinate transforms, exposure/capture timestamps, clock synchronization, covariance/confidence, ambiguity/rejection thresholds and stale/no-target behavior require an explicit subsystem contract. Legal vision sensing does not make every device, laser, illuminator or wireless installation permissible.
- Networking: pin radio revision, region, port topology and event configuration. Budget communications and telemetry; onboard image processing is a proposed engineering approach, not a rule or implemented behavior. Define bandwidth, latency, disconnect behavior and actuator enable ownership.

This catalog is only a source-bound rule subset. Its JSON validator verifies consistency, not official authenticity, completeness, inspection approval, physical safety, simulator calibration or deployment authorization. No robot operations are provided.

## Exact-device evidence work remains separate

`templates/hardware-device-evidence.json` is an **unpopulated planning template**, not a validated component record or accepted graph artifact. Identity/part revision, seasonal legality, inventory linkage, geometry/mounting/shaft/connectors, electrical operating conditions, performance curves, numerical model, calibration and source redistribution rights have independent fields. Every readiness field starts unknown/unassessed. Filling one does not establish the others. No complete manufacturer component library is claimed in this change.
