# Authentic bare-wheel load through desktop WPILib IO

This separate opt-in slice replaces the earlier deliberately nonphysical sideplate **as a rotating-load demonstration**, not as a complete or approved robot mechanism. The original sideplate runner and its evidence remain unchanged. One real manufacturer's nominal rotating component CAD drives the compiled controller/Encoder/PWM loop. No source CAD is redistributed, no team ownership is asserted, and no hardware operation is authorized.

## Source and geometric contract

[AndyMark Performance Wheels](https://andymark.com/products/performance-wheels) supplies am-3608, a bare aluminum wheel intended to rotate around its hex bore. The exact [official STEP](https://documents.andymark.com/e5323f8dff336e35b6abcfa970df5be5230fce20badb60c2701b83e9b8bc587d/am-3608%204IN%20Extrusion%20Performance%20Wheel%20500%20hex.STEP) is397617bytes, SHA256 `e5323f8dff336e35b6abcfa970df5be5230fce20badb60c2701b83e9b8bc587d`, SolidWorks2021 AP203 export2022-01-19T20:23:27. Keep it a private explicitly supplied input: public download is not redistribution permission.

The [drawing](https://documents.andymark.com/a9d3f91100df6aec4bf88dbd7a6e2289dbaa9d4eeace484a590026001cee1eac/am-3608%204IN%20Extrusion%20Performance%20Wheel%20500%20hex.PDF), Rev4 January19,2022, specifies6061-T6 aluminum and inch dimensions. Its hex-bore range is .501-.506in; the CAD represents .500in across flats. Thread detail is also simplified. This mismatch is retained, not corrected or called manufacturing validation. Bare outside diameter is3.700in; nominal4in product naming is not this bare CAD diameter.

Read-only OCP integration requires the exact file hash, exactly one solid, bounds[-46.99,-46.99,0] to[46.99,46.99,31.75]mm, and independently reviewed volume59886.1232054525mm3. The reviewed inch conversion and drawing dimensions establish the OCP millimetre interpretation; no blind unit inference from filename is used. Six hex-bore planes establish the shaft axis: origin[0,0,0]mm, direction[0,0,1]. Because the entire file is pinned, these reviewed semantics cannot silently follow a different STEP.

The tensor is centroidal with axes parallel file XYZ. Shaft inertia is Izz + volume*(cx^2+cy^2), then multiplied by explicitly assumed uniform density*1e-15. Axial centroid offset cz contributes zero for this axis. Mass is volume*density*1e-9. At assumed2700kg/m3, mass is about0.161693kg and shaft inertia0.000199744kg m2. Numeric selection/cross-check tolerances are not manufacturing uncertainty. Material identity is source-backed; numeric density and homogeneous distribution remain unvalidated assumptions.

Tread, shaft, hubs, fasteners, motor rotor and transmission are excluded. This is component-only inertia, not a completed assembly or a guaranteed conservative total performance prediction. Adding components changes dynamics, losses and balance; no shooter, intake or scoring performance is inferred.

## Executable path and checks

`python scripts/run-wheel-io.py --step OFFICIAL_STEP --density ASSUMED_KG_PER_M3 --output NEW_DIRECTORY --java-home EXISTING_JDK17 --gradle-home EXISTING_OFFLINE_CACHE`

The command runs three native extraction/conversion tests, extracts fresh properties, recompiles pinned WPILib2026.2.1 Java offline, and requires three CandidateIo tests plus one WheelIo test without skips/failures. Tests check wrong source rejection, finite density, exact geometry, density scaling, independent parallel-axis arithmetic including axial offset, geometric inertia bound, consumed property/native hash, controller class hash, actual sensor readback, disable demand, tracking and an independent doubled-inertia dynamic perturbation.600ticks of nominal response are retained. Missing tools/native input fail, not skip. Ordinary Node or Java tests alone do not execute this opt-in task.

The runner retains XML/dependency snapshots and source/output hashes. Source changes during execution fail. These are local execution records, not tamper-proof attestation or hardware validation. Exact model source, native geometry and property bytes are bound; separate baseline/changed production-code builds remain unimplemented.

## Electrical model and required-domain limits

[REV NEO V1.1 documentation](https://docs.revrobotics.com/brushless/neo/v1.1), checked2026-11-16, lists12V,5676rpm,1.8A free current,105A stall current and2.6Nm stall torque. The test verifies these match pinned WPILib2026.2.1 `DCMotor.getNEO(1)`. These nominal constants are not calibration or current-limit firmware. The load is ideally coupled1:1; shaft, coupling compatibility and support design are not modeled or approved.

The existing PWM software interface represents an ideal demand path, not SPARK MAX BLDC commutation/CAN firmware. The independent2048pulse external DIO encoder convention is hypothetical, not the NEO's42count internal Hall sensor. No direct battery wiring is proposed. Supply is fixed12V with no shared battery/sag coupling. The controller remains guarded against real-hardware execution.

All five required domains remain blocked: partial ideal rotational physics and voltage; absent coupled heat, calibrated friction/contact, and chassis weight-distribution/tipping. No physical calibration, current-limit fidelity, balance, stress, shaft support, safe operating speed or manufacturing acceptance is established. The existing fail-closed physics gate is unchanged; this runner is not registered as an acceptance adapter. Next work needs authentic assembly/material assignments, separately built code-change cases, shared power coupling, calibrated losses and independent physical validation under a separately authorized safety plan.
