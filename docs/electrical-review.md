# Electrical evidence review: ratings, terminals and fault logs

Reviewed 2026-11-15. This is an original paper-review exercise, not an installation, charging or energization procedure. Use the selected season's official manual and updates separately.

## Four evidence gates

1. **Identity:** record the exact battery suffix, board model, terminal style/revision, connector housing/contact part numbers, conductor construction, controller and firmware. An attractive family-level specification is not confirmation for the actual part.
2. **Applicability:** cite the exact manufacturer section and distinguish electrical ratings, terminal acceptance, installation requirements and season rules. Mark an inaccessible or contradictory item unresolved; never fill it from a neighboring product.
3. **Observability:** identify the measurement source, timestamp, units and missing channels before interpreting a fault. Preserve existing logs; this exercise requires no new robot operation.
4. **Authority:** separate a desk-review finding from a qualified physical inspection. A passing worksheet does not authorize assembly, charging or testing.

## Source-backed distinctions

| Evidence | Finding and scope |
|---|---|
| REV PDH specifications | Input acceptance differs for bare stranded wire and ferrules. The table lists 18–4 AWG for the former and 18–6 AWG for the latter. CAN/low-current tables distinguish latching and push-button connectors; identify the installed revision. These ranges do not establish the required circuit conductor size. |
| WPILib brownout documentation | The general stage description must be read with the model-specific section: roboRIO 1 has a fixed 6.3 V threshold; roboRIO 2 defaults to 6.75 V and permits software configuration. Record the actual configuration; do not apply these figures to Systemcore. PDP/PDH telemetry differs from PDP2/AMPD, which lack built-in current measurement. Missing telemetry is not zero current. |
| Anderson assembly sheet, REV 19 | The document calls for qualified installation, no assembly onto live conductors, stranded copper for crimp contacts and manufacturer-recommended tooling. Match the specific contact and equipment instructions. |
| Anderson crimp specification, REV 2 | Electrical resistance, retention, barrel geometry and blade distortion are separate acceptance dimensions. Maximum barrel dimensions are not target crimp settings. Cable stress can undermine an otherwise acceptable crimp. This guide supplies no numeric acceptance recipe. |
| Anderson SB50 datasheet | Housing keying, exact contacts, conductor size and rating test conditions matter. A headline current rating or housing family name cannot approve the whole battery circuit. |

The REV wiring guide requires disconnection before changing connections. Disconnected batteries still have energized terminals; WPILib cautions against cable carrying and repairing damaged batteries. Keep damaged or suspect equipment out of this educational exercise and refer handling to the school's qualified safety process.

The AMPD overview was reread. Its linked specifications endpoint could not be retrieved in this review; input torque and separate conductor/ferrule acceptance remain unresolved. A global wire maximum or output strip marking cannot supply those missing details. Current MK revision applicability and legacy Power-Sonic NB conflicts also remain open.

## Paper scenarios and answer key

Use the companion worksheet to record source, scope, proposed conclusion and unresolved evidence.

- **Ferrule assumption:** someone treats the PDH's bare-stranded input range as ferrule approval. Reject that inference and locate the separate ferrule row; this still does not approve a circuit or the actual preparation.
- **Flat current graph:** a robot uses AMPD but its dashboard shows zero distribution current. First establish the graph's producer and validity. Do not conclude the load is absent or physically safe.
- **Brownout label:** a note says every roboRIO browns out at 6.3 V. Correct its model scope and require the actual configuration. Do not lower a threshold as a substitute for diagnosing power loss.
- **Hypothetical resistive path:** at 80 A through an assumed 0.010 ohm total series resistance, V=IR gives 0.8 V drop and P=I²R gives 64 W loss. Doubling current gives 1.6 V and 256 W. These are lumped constant-resistance calculations, not battery predictions, a test procedure or allowable limits. They cannot locate the resistance or establish temperature.

Deliver a review table separating source facts, calculations, hypotheses, unresolved conflicts and required qualified verification. No energized probing, load testing, connector assembly or battery operation was performed.

[Paper worksheet](../worksheets/electrical-review.csv).

## Sources

- [REV PDH specifications](https://docs.revrobotics.com/ion-control/pdh/specs) — REV-11-1850; living documentation.
- [REV PDH wiring](https://docs.revrobotics.com/ion-control/pdh/gs/wiring) — REV-11-1850; living documentation.
- [Robot Battery Basics](https://docs.wpilib.org/en/stable/docs/hardware/hardware-basics/robot-battery.html) — stable alias.
- [roboRIO brownouts and current draw](https://docs.wpilib.org/en/stable/docs/software/roborio-info/roborio-brownouts.html) — roboRIO 1/2, not a Systemcore specification.
- [AndyMark AMPD installation overview](https://docs.andymark.com/frc-electronics/power-distribution/ampd-andymark-power-distribution-am-5754) — am-5754; living page, date unspecified.
- [Anderson SB connector assembly sheet](https://p1.aprimocdn.net/idealindustries/844e8917-e9ae-4321-a8d3-b3f00073abcc/ap-web_product-assets_default_instructions_1S1030A_Original%20file.pdf) — 1S1030A REV 19; two pages.
- [Anderson SB50 crimp specification](https://p1.aprimocdn.net/idealindustries/355cb8ff-28fc-4230-92cd-b3f00073ac76/ap-web_product-assets_default_instructions_1S6603-delete_Original%20file.pdf) — 1S6603 REV 2; ECN 2023-0043; two pages.
- [Anderson SB50 datasheet](https://p1.aprimocdn.net/idealindustries/d7c0a682-e691-4b60-8e76-b3f000737d74/ap-web_product-assets_default_data-sheets_ds-sb50_Original%20file.pdf) — Seven-page official linked datasheet; revision date not established.

All sources are links only. No manufacturer document, diagram or table is redistributed. Access/review date: 2026-11-15; next review: 2026-12-15.
