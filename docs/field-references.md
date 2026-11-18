# Restricted nominal field references

The 2026 field package now contains `fieldModel.referenceGeometry`: eight drawing-derived nominal HUB/DEPOT points and eight nominal BUMP crossing-reference lines, separated by welded and AndyMark frames. These are original authored factual references with official source revision/hash pins. No official PDF, STEP body, extracted drawing image or private path is bundled.

## What these records mean

- HUB points are nominal top-opening centers, not robot goal poses, usable apertures, launch solutions or proof of scoring.
- DEPOT points are nominal interior reservoir centroids, not guaranteed piece positions, inventory distributions or pickup goals.
- BUMP lines are nominal ground-projected crossing references, **not measured physical ramp centerlines or drivable paths**. The approximately 1.7935 mm lateral disagreement was observed only in the separately inspected older welded STEP. No AndyMark CAD comparison was performed. It is retained in the limitations, not silently corrected.
- Frames preserve each field variant's explicit origin, axes and millimetre units. No automatic alliance mirroring or welded/AndyMark substitution occurs.
- Scalar trench clearances remain separate dimension evidence. They do not define a world-space corridor.
- The welded CAD matrix remains a candidate for inspection only. Component origins are not certified front-face centers; the STEP export predates drawing corrections. No AndyMark transform is inferred.

The restricted catalog does not fill ordinary world frames, scoring/retrieval geometry, zones or obstacle arrays. The source model still does not contain complete interaction regions, collision geometry, approach corridors or verified robot reachability.

## Consumer gates

`getFieldReference(fieldPackage, request)` from `scripts/field-references.mjs` requires exactly:

- `featureId`
- `fieldVariant`: welded or andymark
- `expectedFrameId`
- `intendedUse`: visualization or preliminary-strategy-reference
- `expectedPackageSha256`: the exact canonical package hash

The response carries the role, frame, source pin, confidence, null uncertainty, prohibited uses and audit limitations with the coordinates. It does not return a bare robot pose. Returned objects are copies, so modifying a view cannot mutate the package.

Uses such as collision, path planning/execution, approach/goal poses, drivetrain feasibility, pickup availability and scoring success fail closed. These restrictions are hardcoded, not delegated to a caller-editable `allowedUses` array. Schema validation rejects promoted confidence/status/reachability, broadened use lists, altered source pins, wrong units and mixed variant/frame associations.

`inspectCadCandidate` requires `intendedUse: inspection-only`, an explicit variant and exact package hash. It returns `executionAllowed: false`. There is no transform application API. Changing a candidate to certified or asking for an AndyMark candidate fails.

The shared `validateFieldModel` invokes the strict catalog validator. While this reference-only v1 catalog is present, populating executable world-frame/location/zone/obstacle geometry is rejected. Adding operational geometry needs a separately reviewed schema/consumer integration, not relabeling these references. Thus current envelope and comparison consumers cannot silently promote a reference into executable geometry even if its source hash is recomputed.

## Freshness and evidence limits

The catalog is part of the exact field-package hash and Game Analysis payload. Changes propagate to dependent strategy/envelope/experiment evidence through existing revision pins. Preserve older graph revisions; explicitly ingest a newer source revision before treating evidence as current.

The updated checked-in envelopes and experiment receipts are regenerated examples using the new package hash. They remain hypothetical. The comparison harness still uses semantic IDs only and does not consume reference coordinates. The nominal fuel assessor remains independently supplied-event reasoning, not a geometry or flight model.

Validation establishes structure, allowed-use boundaries and source consistency. It does not authenticate official bytes, certify a CAD transform, prove field acceptance, reconstruct every physical surface, or establish safe robot travel. External code can bypass a library; these guarantees apply to the provided consumers, not arbitrary future implementations.
