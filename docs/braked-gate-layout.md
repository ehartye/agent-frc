# Braked gate: sourced pitch layout and new dynamic boundaries

## Component candidates and layout

The SWYFT SR-PULLEY-HTD5mm-20T-HEX-01 is the 20-tooth, 5 mm HTD pitch, 1/2-inch hex candidate for a 9 mm belt. Its pitch radius is derived as 100/(2*pi) = 15.9155 mm, not the earlier hypothetical 15 mm. No vendor pulley CAD, tooth form or flange clearance is qualified here. [Primary pulley listing](https://www.swyftrobotics.com/motion/htd-5mm-pulleys).

The Thrifty Bot 800-5M-09 variant is TTB-0156, confirmed from the primary product variant data rather than the default TTB-0131 shown on the family page. It has 160 teeth and 800 mm pitch length. Equal 20-tooth pulleys imply a nominal 350 mm center distance. With an original provisional 40 mm clamp and 20 mm exclusions at both straight-run ends, usable travel is 270 mm. The NOTE/CORAL/FUEL strokes leave 199.2/135.7/100 mm of scalar travel margin. Belt stretch, tensioner travel, tooth engagement, clamp fastening and strength are not included. [Belt family](https://www.thethriftybot.com/products/single-sided-9mm-wide-htd-timing-belts), [variant data](https://www.thethriftybot.com/products/single-sided-9mm-wide-htd-timing-belts.js).

REV-21-2618 MAXLift End-mount Bearing Block is a concrete guide candidate. Its 2025-01-07 drawing and native STEP are byte-pinned. Fresh OCP import found 70 solids and a bounding extent of approximately 40.761 x 32.804 x 89.808 mm in vendor coordinates. This is assembly metadata, not an installed bearing/tube contact result. Tube selection, paired-block orientation and spacing, gate attachment and reaction/moment capacity still need resolution. The drawing's dimension callouts are not silently replaced by imported overall extents. [Guide listing](https://www.revrobotics.com/MAXLift-Bearing-Blocks/), [drawing](https://www.revrobotics.com/content/docs/REV-21-2618-DR.pdf), [STEP](https://revrobotics.com/content/cad/REV-21-2618.STEP).

This defines a pitch-path concept, not a complete native component assembly. Pulley shaft support and retention, belt clamps, frame mounting, guarding and the guide load path remain missing. Current component availability does not establish historical season availability.

## Drive limits preserved, not averaged away

All 72 drive-envelope cases were recomputed with the sourced pulley pitch radius. Outcomes remain 0/24 passing the 20 ms screen, 22/24 at 250 ms and 24/24 at 400 ms. The two 250 ms FUEL supply-sag/inertia failures remain, and the older 15 mm-radius report is unchanged. The existing 250 ms controller deadline is unchanged. These are ideal motor-envelope checks, not evidence that any commanded profile is trackable.

## Fresh time-resolved native paths

Eighteen fresh OCP sweeps use triangular velocity over 250/400 ms, separately for each season and stationary/forward 200 mm/s/rearward 400 mm/s pieces. Twelve stationary/forward cases satisfy reconstructed 2 mm inter-sample separation bounds. Six rearward cases produce native collision witnesses. The Lipschitz speed bound uses the peak gate speed, not average velocity. Original gate and piece solids are used; neither the vendor guide nor pulley is claimed to be in this swept assembly.

## Dynamic brake acceptance remains missing

A hypothetical loss of transmission restraint at peak gate speed illustrates why a stationary brake claim is insufficient. With free gravitational motion for 40 ms, the FUEL gate would travel approximately 62.25 mm before any subsequent arrest. This is deliberately not a measured delay or worst-case bound. It exposes the need to measure brake engagement, output travel, compliance and impact with the selected drivetrain. Motor, belt and guide failure are additional modes, not covered by the cartridge alone.

Rotor inertia, guide friction, efficiency and supply behavior remain provisional. Brake unlocking under load, dynamic stopping and real gate/guide behavior are still external evidence gates. No physical safety, capture, installed fit or whole-robot legality is accepted.
