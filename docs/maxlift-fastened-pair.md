# Opposed MAXLift station with explicit fastener proxies

This is a simulation geometry milestone, not a manufacturing acceptance gate. The source-pinned station now includes an opposing bearing block and six correctly identified REV-29-2943 half-inch button-head screws. The older REV-29-2922 one-inch socket-head hub screw is not silently reused.

## Reproduce

With the existing Python/OCP runtime and the four hash-pinned STEP files from `case-studies/maxlift-fastened-pair-evidence.json` in the ignored `examples/java-2026-sim/build/maxlift-mating-sources` directory:

- `python -B scripts/maxlift-fastened-pair.py --cad-dir examples/java-2026-sim/build/maxlift-mating-sources --output examples/java-2026-sim/build/fresh-fastened-pair.json` (output must not exist)
- `npm run test:maxlift-pair` performs a fresh native replay and checks the tracked report, dependency closure, source mutation rejection and failure controls.

No native vendor assets are distributed in the repository. Inputs must match the pinned revisions; no installation or source update is performed by the replay.

## Geometry and controls

The second block is rotated 180 degrees about Z then translated 63.49 mm in X. Eight mid-width points on actual cylindrical roller faces each retain a full 60 mm longitudinal track on the native tube. The opposed block obstructs the previously demonstrated positive-X escape; this is rigid interference, not a calculated restoring force. Longitudinally separated supports, stops and the wheel backing-web connection are still absent.

Each first-side screw is rotated minus 90 degrees about X then translated to (0, -14.5923, Z), with Z = -12.7, 0, 12.7 mm. Its head seats at Y = -9.525 mm, tip at Y = -22.225 mm. The complete second-side screw pose is mirrored with the block. The stack is 3.175 mm block clearance wall, 5.08 mm cap proxy wall, then 4.445 mm tip protrusion into the cavity. Native block/tube/rail interference is zero at the nominal poses. Screw/cap proxy overlap is positive because the models contain a major-diameter screw and simplified tap-drill bore, not mating helical threads. A 0.1 mm overseat control intentionally intersects the block.

## Available simulation assumption

A plant may explicitly use ideal rigid joints for the block/cap/crossbar connections and exclude the simplified thread overlap from contact response under that assumption. The idealization is available now; calibrated hardware does not need to be invented to proceed. It does not imply that screws have been physically tightened or prove engagement, torque, preload, strength, tolerances or retention. Roller track evidence is not full-patch rolling-contact validation. Keep these ideal joints labeled in any consuming model and retain power-loss/contact failure controls. No world placement, real sensor, historical legality or scoring evidence is created here.

Primary references: [manufacturer screw drawing](https://www.revrobotics.com/content/docs/10-32-Button-Head-Cap-Screws-DR.pdf), [official guide steps 39-43](https://docs.revrobotics.com/frc-kickoff-concepts/2025/build-guide), and exact CAD URLs/hashes in the evidence file.
