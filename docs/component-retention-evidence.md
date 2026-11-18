# Exact actuator and retention evidence

No component was purchased, installed or declared competition-legal. Five vendor documents are byte-pinned in `retention-component-evidence.json`; originals remain in ignored build evidence. The integration screen preserves exact revisions and rejects shortcuts rather than treating catalog facts as hardware validation.

## Direct gate drive fails the timing screen

Actuonix P16-200-22-12-P and P16-200-64-12-P offer 200 mm travel, catalog no-load speeds of 46/18 mm/s and backdrive forces of 75/200 N. The 200 mm size has a 247 mm closed pin distance. Rev B lists 4 N maximum side load, 0.8 mm repeatability with the P/LAC combination and 20% duty cycle. Power-off position holding is conditional on axial load staying below the backdrive force. [P16 datasheet](https://www.actuonix.com/assets/images/datasheets/ActuonixP16Datasheet.pdf), [22:1 part](https://www.actuonix.com/p16-200-22-12-p), [64:1 part](https://www.actuonix.com/p16-200-64-12-p).

Existing native gate travels are 70.8/134.3/170 mm for NOTE/CORAL/FUEL. Even the faster candidate needs at least approximately 1.54/2.92/3.70 seconds at no load, versus the controller's 0.25-second deadline and the plant's assumed 20 ms motion. Its 12 mm pad stroke needs at least 0.261 seconds. All six direct-drive season/actuator combinations fail this optimistic timing screen. No-load speed supplies a lower time bound, not guaranteed completion. Longer software timeouts would not establish capture with an open gate.

The gate moves vertically but receives longitudinal piece forces. A guide must carry the transverse load; actuator axial backdrive force cannot be credited against transverse impacts. Native component assembly was not promoted after this timing rejection.

## A spring pin is not automatically engaged on power loss

JW Winco GN 817-6-6-M12X1.5-G is a concrete retention candidate: nominal 6 mm pin/stroke, M12x1.5 body, M5 operating stud and approximately 6.5-19 N spring force. Type G supports connection to an operating mechanism. Spring force is not bending/shear capacity; the load-rating guidance depends on material and unsupported distance. [Standard sheet](https://live-catalog.jwwinco.com/pdf/winco/us/817.pdf?dispositiontype=attachment), [load-rating guidance](https://live-catalog.jwwinco.com/pdf/winco/us/rastbolzen_festigkeit.pdf?dispositiontype=attachment).

Counterexample: a rigid P16-to-pin release linkage can hold the pin retracted after power loss. The listed pin spring force is below either actuator's backdrive threshold. Spring return is therefore not established. This is a conditional mechanism inference, not tested jam behavior.

The next bounded architecture is guided retention with separate unloaded release and a coupling that cannot trap the pin retracted. Bushings, support spacing, engagement sensing, impact loads and the disengaging coupling remain unresolved. The 200 mm P16 is a comparator, not a selected release actuator.

## Sensor and electrical integration boundaries

FUTEK LSB200 FSH00103 is the exact 22.2 N, 2 mV/V, M3x0.5 variant in FI1041-G. Standard calibration is tension; compression calibration must be established. Listed nonlinearity, hysteresis and nonrepeatability terms sum to 0.0555 N, not a full installed error budget. [FSH00103 drawing](https://media.futek.com/content/futek/files/pdf/productdrawings/fsh00103.pdf).

At 5 V excitation the bridge produces 10 mV full scale. A direct roboRIO 0-5 V, 12-bit input yields approximately 2.71 N per ideal ADC count, insufficient for the earlier 0.2 N virtual band. Amplification is required. [roboRIO analog inputs](https://docs.wpilib.org/en/stable/docs/hardware/sensors/analog-inputs-hardware.html).

The inspected IAA100 drawing identifies FSH04461, not legacy FSH03863 or the catalog's later FSH04939. Its supply is 12-30 V, output bipolar +/-5 or +/-10 V, and grounds internally connected. Default output is not a direct roboRIO interface. Protected unipolar conversion, brownout-capable power, revision reconciliation and calibration remain open. It does not establish galvanic independence. [IAA100 drawing](https://media.futek.com/content/futek/files/pdf/productdrawings/iaa100.pdf).

REV-31-1462 is an endpoint candidate, not precision travel feedback: active-low, three Hall elements connected in parallel, typical hysteresis 5 mm. These are not three independent channels or evidence for a 0.2 mm travel band. [REV description](https://docs.revrobotics.com/ion-control/ionsensors/magnetic-limit-switch), [specifications](https://docs.revrobotics.com/rev-crossover-products/sensors/magnetic-limit-switch/specs).

Possible load path: pad -> strain-gauge cell -> guided carrier. The guide must isolate shear/moment without bypassing sensed normal load. Potentiometer, magnetic endpoint and strain bridge use different principles, but common mechanics, power, wiring, grounds and software remain shared failure causes. Actual fit, compression calibration, error bounds, competition legality and engineering acceptance remain blocked.
