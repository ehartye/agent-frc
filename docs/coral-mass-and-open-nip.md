# CORAL mass boundaries and receiving-nip geometry

## Source-bounded mass sensitivity

The official [2025 REEFSCAPE manual, section 5.7.1](https://firstfrc.blob.core.windows.net/frc2025/Manual/HTML/2025GameManual.htm) gives the KOP/event CORAL range as 1.1–1.8 lb and warns of source-dependent variation. Exact unit conversion yields 0.498951607–0.816466266 kg. A fresh downloaded manual snapshot matches the previously pinned SHA-256; its hash and byte count are recorded in `coral-mass-evidence.json`.

The manual does not supply friction, nip normal force, guide orientation or calibrated dynamics. A separate 108-case startup study holds those distinctions:

- Both source mass endpoints.
- Independent hypothetical friction coefficients 0.05, 0.2 and 0.8; 15 N normal force per roller.
- Guide elevation 0, 15 and 30 degrees, not arbitrary tube yaw/roll.
- Spin-up 0, 0.5 and 2 seconds, with 9/12 V supplies.
- Two timestep sizes, 100/50 microseconds, checked for matching outcome and bounded differences.

Results: 90 exits and 18 rollbacks, not 108 successes. At friction 0.05 and 15-degree elevation, the lighter endpoint exits while the heavier endpoint rolls back in all six supply/spin-up combinations. At 30 degrees with that friction assumption, both masses roll back. These are model-dependent sensitivity findings, not measured material properties or actual mechanism performance. The earlier integrated catcher remains a generic 0.5 kg body; no mass is changed mid-transfer.

## Open/retracted nip architecture screen

A fresh native study uses the source-pinned torus, hollow tube and sphere shapes against original 400 mm-span continuous-cylinder roller envelopes. It explores the held center at X=0.4 m and center handoff at X=0.3496 m, pitches 0/10/20 degrees and symmetric per-side retraction 0/10/40/60 mm. This is 72 poses and 144 native piece/roller checks, not a full assembly.

The geometry refines the earlier extent warning:
- At the held center and nominal zero pitch, closed NOTE and CORAL nip envelopes intersect the piece.
- The held FUEL sphere instead has about 9.81 mm clearance. A body reaching the entrance plane did not itself prove a sphere/roller collision.
- At center handoff, all three nominal closed envelopes have the prescribed 1 mm interference. That is only an assumed compression geometry, not an accepted normal load.

An independent vertical-support bound covers absolute pitch up to 20 degrees about the selected transverse axis, total translation error norm up to 2 mm, and 2 mm required clearance. Minimum per-side retractions are approximately 57.12 mm NOTE, 53.13 mm CORAL and 5 mm FUEL. A 60 mm each-side geometry candidate clears this narrowly stated envelope. It is not an actuator or timing choice. Yaw/roll, component housings, guides, end effects outside this fixture, sensing delay, closure motion and load calibration are missing.

A practical next step is to design and source the opening/closing linkage, check its actual swept path, and retain contact disabled until body pose and closure validity are established. Do not treat the static 60 mm candidate as achievable within the prior controller deadline. All installed target registrations and scores remain unknown.
