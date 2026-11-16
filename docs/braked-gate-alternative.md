# Alternative: motor-driven guided gate with mechanical anti-backdrive cartridge

The next candidate worth developing is a positively driven closed-loop toothed-belt gate, not a free-falling gate tethered to a slow P16. A NEO 550 (REV-21-1651), compatible SPARK MAX (REV-11-2158), NEO 550 adapter REV-21-2117, MAXPlanetary 9:1 cartridge REV-21-2129 and brake REV-21-2131 are an exploratory chain. Pulley, belt, guide, tensioner, motor mount and shaft retention are not yet selected or assembled. There is no procurement decision.

## Why investigate it

Both opening and closing are commanded movements through the belt; a separate slack-prepay cycle and raised gravity-release catch are no longer inherent. The cartridge is a mechanical anti-backdrive device, distinct from electronic motor brake mode. REV recommends placing it before reduction. Its published working torque is 16.95 Nm at the cartridge; that is not a belt, gate or stopping-energy rating. The vendor warns against high-inertia applications. Dynamic arrest and lost-power travel require measurements, not an inference from stationary holding. [REV product](https://www.revrobotics.com/rev-21-2131/), [system guide](https://docs.revrobotics.com/ion-build/motion/maxplanetary-system), [assembly](https://docs.revrobotics.com/ion-build/build-guides/maxplanetary-gearbox-assembly/neo-550-and-550-sized-motors).

The NEO 550 data sheet reports 12 V, 11000 rpm free speed, 0.97 Nm stall torque, 100 A stall and 1.4 A free current. These anchor an ideal linear motor approximation, not calibrated gate dynamics. Its data sheet text names a REV-21-2158 controller, whereas the season rules list SPARK MAX as REV-11-2158; the candidate uses the rules-listed controller identifier. [Motor data sheet](https://www.revrobotics.com/content/docs/REV-21-1651-DS.pdf).

## Bounded screening result

Seventy-two scenarios use triangular velocity profiles over the three existing gate strokes. Explicit hypothetical inputs are a 15 mm pitch radius, 0.7 transmission efficiency, 5 N guide friction, 20 A current cap, gate mass 0.2/0.5 kg, supply 9/12 V and motor-equivalent rotating inertia 0/0.00001 kg m². Neither inertia endpoint is a measured bound. Peak speed, acceleration and torque are checked against a simple current-limited voltage-scaled motor envelope. Gravity is included as the worst lifting demand; this does not model brake release friction or arrest dynamics.

All 24 attempted 20 ms profiles fail. At 250 ms, 22 of 24 pass this ideal drive-only screen; two FUEL cases fail at 9 V when rotating inertia is included. At 400 ms, all 24 pass, but 400 ms exceeds the current controller deadline. That deadline has not been relaxed. For 0.5 kg FUEL at 250 ms, peak motor speed is about 7792 rpm; modeled demand rises from 0.0365 to 0.1018 Nm when the assumed inertia is added. The 9 V envelope supplies only about 0.0404 Nm. This counterexample prevents treating unloaded-speed arithmetic as acceptance.

No gate-sweep certificate transfers to this new profile. Next: select an actual belt/pulley/guide stack, obtain rotational inertia and transmission losses, construct native swept geometry, and couple drive/brake states into the world simulation. Timing at supply sag, current limiting, jam, belt failure and power interruption must be separate negative controls.

## Season boundaries

Each independently retrieved season manual lists NEO 550 under R501, SPARK MAX under R504, and a single motor per controller under R505. This is a component-allowance screen only. Wiring, fusing, power distribution, disable behavior, robot size and inspection remain unresolved. The currently available brake is not established as historically available in 2024 or 2025; these are season-shaped retrofit simulations, not historically reproducible competition BOMs. [2024 manual](https://firstfrc.blob.core.windows.net/frc2024/Manual/HTML/2024GameManual.htm), [2025 manual](https://firstfrc.blob.core.windows.net/frc2025/Manual/HTML/2025GameManual.htm), [2026 manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm).

Seven byte-pinned source files are retained in ignored build storage, with hashes in the evidence ledger. Full robot compliance, hardware safety and engineering acceptance remain blocked.
