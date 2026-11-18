# Configured chassis evidence ledger

This is a source-pinned component/placement/mass **coverage ledger**, not an assembled chassis model. The square and long AM14U6 records are proposed configurations, not team-owned hardware. The inspected January 10, 2026 guide provides a selected eight-row subset: wheels, center hex hubs, two gearbox assemblies, three frame-member types, churro stock and the selected belt set. Square uses four am-2571 belts; long uses four am-2266. Alternative supplied belt sets are not all counted as installed.

The official guide bytes were independently rehashed and its relevant table/prose inspected. Only original factual summaries and source metadata are included. PDF, STEP and other source assets are not redistributed. Guide source identity and part identity/revision are different: the guide revision is pinned while individual part revisions remain unknown.

## Facts, proposals and missing evidence

Each component separately records identity, quantity basis, variant applicability, mass basis/scope/uncertainty and placement basis/frame/transform/uncertainty. Source-listed quantities do not prove actual stock or an installed assembly. Every mass and placement in these examples is null. Frames are empty, not assumed world origins. A declared placement is a part-frame transform, not automatically that part's center of mass. Non-null transforms require explicit millimetre frames and proper rigid rotations; no placement is inferred from the outer robot envelope.

Known guide assemblies contain internals that are not separately enumerated. Explicit omissions include remaining drive hardware, motors, battery/electronics, bumpers, upper mechanisms and cutting/assembly configuration. Unknown additional items remain true. Coverage reports row counts, not mass completeness or a misleading percentage. Stock/churro lengths and final cuts require configuration-specific evidence; a kit BOM is not an as-built BOM.

The advertised nominal 31 lb mass is **not a numeric input**. Its weighed configuration and included scope are unresolved, and it is not a complete robot mass. No source nominal is substituted for the hypothetical 45 kg/5 kg m2 drivetrain assumptions. Neither motor, wheel material nor durometer establishes contact or friction coefficients.

## Deliberately no aggregation

V1 always leaves total mass, CoM, inertia and friction null, even when a caller supplies every declared row. It does not calculate a misleading partial subtotal or certify declared measurements. Component mass values can be manufacturer-nominal, measured or assumed only with matching source categories; unknown values remain null, never zero. Future physical aggregation must additionally resolve full installed BOM coverage, duplicate/nested assembly accounting, material/density assignments, mounting transforms versus component CoM frames, local inertia tensors, uncertainty and qualified review. Filling a catalog is not that evidence.

## Graph use and revision impact

`linkChassisLedger(study,{envelopeId,ledger,prefix})` requires the exact current hypothetical envelope/component pair and matching source guide/variant. It creates or reuses shared exact source records, a branch-local configured ledger and a nonaggregating summary. It does not overwrite prior candidate assumptions or claim their source history was re-reviewed. A changed shared chassis source marks its dependent ledgers/summaries stale; a branch-local BOM change invalidates that branch's summary. New source facts must be explicitly ingested as graph revisions. There is no automatic filesystem or vendor-page watcher.

`currentChassisSummary(study,id)` returns the complete pinned record only when dependencies are current. Direct-append records cannot forge aggregate values, ownership, assembly status, missing source bindings or another candidate variant. Revisions must be independently reviewed before being used downstream.

The current simulator remains independently hypothetical and uncalibrated. This ledger is not registered as an acceptance adapter and does not provide physical chassis parameters. No manufacturing, machine use, robot deployment, team design selection or engineering acceptance follows.
