# Segmented season prototype status

These studies replace unsupported round-sleeve shaft interfaces with explicit profiled research candidates. They do not declare calibrated simulation-ready robots. All work is offline; no robot deployment or hardware operations.

| Season | Native geometry evidence | Contact evidence | Still missing |
| --- | --- | --- | --- |
|2024 NOTE|Pinned four-inch MAXSpline wheel/hub/shaft representative unit|Flat-torus finite-wheel gap bracket|Complete bank/support assembly, force law, material and load evidence|
|2025 CORAL|Pinned direct-hex wheel, clocked shaft and spacer representative unit|Restricted fixed-X tube upper-exterior finite-wheel gap|Complete bank/support assembly, bore/end-face/angular model, material and loads|
|2026 FUEL|42-instance bank pair classification via38 native local-frame operations plus explicit equivalences; separate local housing study|Exact ideal sphere/finite-cylinder geometric gaps|Combined fastened housing/drive, thread engagement/end float, material, loads and dynamic calibration|

Start with `shaft-sleeve-audit.md` and `profiled-wheel-candidates.md`. Those are original research hypotheses, not a procurement-approved BOM. Later native evidence is in `native-wheel-stack.md`, `native-accessory-stack.md`, `native-support-stack.md`, `season-units-and-housing.md` and `combined-bank-native.md`. The earlier30mm FUEL pitch and stock spacer/button-head combinations must not be promoted after the later native interference findings.

The contact redesign is documented in `segmented-season-contact.md`. The raw-stock machining route and unfilled tolerance/load gates are in `custom-spacer-research.md`. Force, friction and material calibration remain unset; prior continuous-sleeve validation cannot fill those gates.

Native scripts require existing OCP and network access to exact public manufacturer STEP URLs. They hash-check temporary assets and retain numeric evidence only. Python tests that read receipts explicitly do not count as fresh native replays. Ordinary `npm test` covers the integrated interface/candidate contracts; it does not execute native CAD, physical dynamics or season compliance validation.

Next defensible work: complete constrained fastening/drive geometry and source reconciliation, then define an explicitly uncalibrated dynamic sensitivity experiment or supply calibration evidence before any physical performance claim. No fabrication, strength, capture, scoring or engineering acceptance is established by zero nominal common volumes.

## Prescribed geometry/IO milestone

`segmented-contact-replay.md` now records a runnable three-season, six-trace prescribed-motion experiment through the existing WPILib simulated IO controller. It preserves uncertain NOTE proximity and unsupported CORAL end crossings rather than inventing contact. This adds time-varying geometry/control integration evidence, not force-coupled dynamics or calibration. Beam completion in the nominal no-confirmed-contact control explicitly prevents interpreting replay completion as physical transport.

## Assumption-bounded tangential force experiment

See [segmented-force-sensitivity.md](segmented-force-sensitivity.md). All three
season envelopes now gate a two-coordinate force-coupled sensitivity model with
external aggregate normal load. Motion is caused by its ideal drive and contact
impulses, not prescribed positions. This does not close normal mechanics,
calibration, actual motor topology, controller integration or mechanical
acceptance. The separately validated prescribed WPILib IO replay remains distinct.
