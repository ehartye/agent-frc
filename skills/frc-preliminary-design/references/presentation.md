# Present a preliminary design

The review page gives a reviewer an interactive whole-robot blockout and a decision they can inspect. The plugin's [stock review page](review-layout-template.md) already does everything on this page when the plan supplies the data. Use this page to decide what to supply and what to look at before sharing.

The stock page is a consistent starting place. The project supplies data under `presentation` in the plan, not markup. A project may change its copy of the page when it has a reason. [The scene schema](../../../templates/preliminary-review/scene.schema.json) defines the data.

## Contents

- [One design, one page, one animation list](#one-design-one-page-one-animation-list)
- [What the reviewer can do](#what-the-reviewer-can-do)
- [Choose a representative solid](#choose-a-representative-solid)
- [Opening view](#opening-view)
- [Inventory and budgets](#inventory-and-budgets)
- [Evidence behind the picture](#evidence-behind-the-picture)
- [Look before you share](#look-before-you-share)
- [Share on a local network](#share-on-a-local-network)

## One design, one page, one animation list

- The review page lists what a reviewer plays in one selector: one animation per mission phase, then each recorded trial as a replay. All play in the same model view with the same controls.
- Animations show the mission. The check results show the evidence. A case is one checked segment of a path, so it is a row of the check results, grouped by phase, and never an entry of the selector. [Name phases and read the check results](../../../docs/preliminary-design.md#animations-show-the-mission-the-check-list-shows-the-evidence)
- Add no second page, tab or player for a trial, a field interaction or a new path. [Replay set format](review-layout-template.md#play-a-recorded-trial-in-the-animation-list)
- Add no status banner. The page's chip and the version picker already show the name, version, draft and status.
- A replay is playback. The check neither runs nor credits it, so label what the trial recorded and what is display only.

## What the reviewer can do

The page shows the strategic narrative's objectives with the disposition of each. For every placed ID it shows two project-written explanations: **Purpose** says what the solid does, and **Why it is included** names the need or tradeoff that earns it space. A service gauge, for example, can stand for a socket and justify its volume by the removal sequence. Missing explanations stay visible.

- **Move around.** Orbit through a full revolution and underneath, pan, zoom and reset to a fitted view. The camera stays where the reviewer puts it during playback.
- **See solids.** Depth-tested closed volumes, with cavities, holes, moving members and the finite game piece preserved. Labels toggle apart from geometry.
- **See the field.** The floor sits at the registered ground height, with units and a scale cue. Field parts and game pieces come from the project's official models or dimensions, at scale, in the robot's datum. A partial or stand-in fixture says so.
- **Play motion.** Play, pause and scrub each mission phase, the park and service motions and the displaced control. The page names the pose or fraction, the groups moving together and the piece's own path. A collision is selectable by pair and case.
- **Select and group.** Pick a surface or search by name. Category (what a solid is), subsystem (which function it serves) and motion group (what it moves with) stay separate. A shared component counts once in the whole-robot total.

Hidden components still count in the check and the budgets.

## Choose a representative solid

Use whatever shape captures the fit decision. A cylinder preserves a wheel radius, a sphere preserves ball contact, a torus preserves a central opening. Combine primitives or use boolean cuts to form fork gaps, hollow rails and offset housings.

Keep a mounting datum and a motion axis. Compare extrema, occupancy, useful voids and volume with a measured article or drawing. Record the deviation and the clearance it could consume. An equal-volume box can still block a passage or conceal a collision.

Use one solid per functional volume. Leave out fasteners, bearings, shafts, lines and brackets unless one is the risk being examined. Reserve wiring and dressing space with one conservative solid or a stated gap. Real hardware belongs to detailed design.

## Opening view

Open on the selected design with the finite piece in its intended seat and every drawn support present. Verify the pose before sharing it.

Nothing floats. Every physical solid touches, or is mounted to, something that traces to the frame. A support that is not drawn yet is labelled under `attachment.unmounted` in the plan with its reason. The page draws it hatched and lists it under **Attachment: nothing floats**, so a reviewer can tell an undrawn support from a missing design. Read the `[attachment]` section after each check.

If a coarse box appears to penetrate a piece, compare it with the shaped part in the same pose, keep the original control and check the whole path again. Do not move the piece to improve a picture.

Record how each moving load reaches the frame in `presentation.loadPaths`: the mount, the member it hangs from and the actuator that drives it, in a sentence. Name each connection that is still conceptual.

## Inventory and budgets

For every component the page shows its category colour, role, source or estimate basis, material, quantity, volume and estimated mass or range. Colours come from the project's [component palette](../../../docs/cad-color-convention.md). Bumper covers take the alliance colour from `presentation.alliance`, and field fixtures take the field colour.

- Mark placeholders and missing allocations.
- A clearance gauge adds no robot weight. Appearance alone cannot establish material or density.
- If one mass estimate covers several solids and a selection splits it, the page reports the shared range apart until it is apportioned.
- Under `presentation.required`, list the few roles this architecture cannot work without, each with its placed IDs. The page shows a role with no solid as Missing.

**Weight.** Lead with the inspection limit, the low and high estimate and the signed headroom. Keep running additions separate.

**Power.** Lead with the selected duty, battery condition, minimum bus voltage, required voltage and margin. Show loads in battery-side amperes. Components on one bus share its voltage: sum coincident currents and apply the pack model. Never spread a combined load by volume, count a missing load as zero or add nominal device voltages. [Shared electrical loads](../../../docs/shared-power-review.md)

A pack sag budget alone does not qualify a breaker, conductor or thermal rating.

The [scene data table](review-layout-template.md#scene-data-and-who-supplies-it) says which `presentation` field feeds each part of the page. A missing project field renders as "Not supplied in this review".

## Evidence behind the picture

The check builds the scene and the receipt together, so the page shows the checked numbers without any binding step from you. What you supply is honest labelling:

1. Label imposed payload motion as prescribed. A collision-free carried path shows clearance only. [Retention and what moved the piece](trials.md#test-retention-when-a-piece-is-lifted-or-tipped)
2. Give each clearance its method and tolerance. Sampled poses show clearance only at those samples.
3. Name each intended contact, with its allowance, apart from verified clearance and from unresolved contact.
4. Keep the displaced control playable, and list inhibited, adverse and uncovered cases under `presentation.caseKinds` and `presentation.uncoveredCases`.

A blocked or incomplete design still gets a review page. Show the first unmet requirement.

## Look before you share

After every publish, open the published page yourself. This short form takes about two minutes:

1. The model loads and sits on the floor. Nothing floats and no field part is coloured as robot.
2. The title shows the design's name, version, draft and status.
3. Each entry in the animation list plays its whole phase, and each replay plays. The check results list every case under its phase.
4. One picked solid shows its purpose and rationale.
5. The weight and voltage figures match the receipt.

Run the [full handoff check](review-layout-template.md#handoff-check) once, before proposing the design as effective.

## Share on a local network

Serve only the review and its local assets, with `python cad/preliminary-design/serve.py --bind LAN_ADDRESS --port 8000`. Give the reviewer the URL, the design's name and version, and how to stop the server. Open the URL on the host, then on a second device when one is available. Private CAD and unrelated files stay outside the served folder.
