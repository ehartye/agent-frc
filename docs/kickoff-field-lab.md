# Start a season at the field

When students start with the game reveal, their first design activity is to move a plain robot box around a scale field. Give them the controls before asking for a match story. A student who already has a saved investigation can instead use the [continuation procedure](strategy-first-continuation.md).

## Read the rules into a model first

Build a portable release-day rules model before the student pre-sim. Review the inventory and its starting distribution, phases, scoring values, control restrictions, field frame, starts, sources and target locations. The 2025 model derives mirrored route hypotheses from illustrative start slots, piece locations and compatible goals. Open questions stay visible. Use the model as the next command's input.

```sh
npm run kickoff -- --season 2025 --model-output rules.json
npm run kickoff -- --profile rules.json --output field.html
```

## Explore a scoring opportunity

Allocate a share of the distinct pieces at the pickup location and a second group arriving at a specified time. Select the scoring target and phase. Estimate travel and other unavailable time. Compare the goal with the available supply, open slots and the candidate's complete cycle time. Each window treats a piece as scoring once at its selected target. Recycled pieces, competing allocations and overlapping windows need separate accounting before aggregating match points.

For example, if 25 pieces can arrive and score during 5 usable seconds, the average requirement is 5 pieces/s. A serial 0.25-second cycle tops out at 20 pieces. A 0.20-second cycle reaches 25 in the idealized window. A late supply wave can demand a faster burst. These illustrative values are independent of the bundled 2025 game. Use complete acquire/feed/score cycle timing or identify the bottleneck being screened. The ideal bound assumes every completed cycle scores.

The page marks candidate pickup and scoring approaches automatically. It routes centerlines around the modeled landmarks and samples nearby peer paths within one trial box span. Color marks and named start slots expose conflict locations. Two or more other slots near the same sample flag high potential overlap. Peer routes are alternatives and traffic timing is unknown. The other alliance is mirrored for this profile. Omitted obstacles, robot swept clearance and supply queues require separate study.

Save the route, exposure, load direction and its evidence, retained function and first test with the opportunity. A crossing can motivate a protected or retractable intake. A numerical force or structural rating needs a supported load case. Use the resulting opportunity IDs alongside field observations when drafting the role and technical requirements.

## Open the lab

From the plugin root, generate a standalone page and open it in a browser. Give the output a new filename for each edition. The page runs offline and can be shared with students.

```sh
npm run kickoff -- --season 2025 --output field.html
```

The bundled [2025 profile](../case-studies/2025/kickoff-field.json) models the rectangular field extents and two reefs using the release-day V0 manual. The field, target elevations and rectangular starting-size checks have section references in the page. A 30-inch cube is a trial shape. Students can try an oversized box and see the signed consequence. The target rings show elevation. They do not model branch alignment, game-piece contact or scoring.

For a new game, pin the release-day manual first. Prepare a project-owned JSON profile following the example, then run the command below. Use the season's own sourced field extents, identified landmarks, field frame and relevant starting limits. The page uses inches, a rectangular field boundary and regular-prism landmarks. Set an unknown limit to `null`, use empty arrays for unmodeled landmarks or elevations, and name omitted geometry. Use the rectangular perimeter check only when the selected rules support that interpretation. Preserve other rule types or dimensions as open questions. Keep later updates, competition evidence and prior designs out of a release-day exercise.

```sh
npm run kickoff -- --profile release-day.json --output field.html
```

## From the field to a design decision

1. Ask students to move, rotate and resize the box. Let them compare a real choice, such as approaching a target with the long side or short side leading. Capture what each student sees. Each observation records the box dimensions, pose and starting-size checks at that moment.
2. Use their observations to draft two possible match stories. Which task could the team repeat, what would its partners handle, and what could it do if the approach failed? Record the proposed role, cycle and alternative in the lab. Where the geometry leaves a question open, name the experiment that could answer it.
3. Download the Markdown narrative into the student project before closing the page. The draft includes the manual edition, observations, provisional capability and first experiment. Blank responses stay open. A partial draft lets the next discussion start from what the students actually saw.
4. Use the [strategic narrative skill](../skills/frc-strategic-narrative/SKILL.md) to refine the draft. Record the team's choice and its supporting observation IDs. Trace the chosen narrative and capability into the [capability contract](../templates/capability-contract.md) with a measurable acceptance check before choosing a mechanism, control approach or fabrication method. When a trial changes the story, revise that link and revisit the affected requirements.

Later, use the [design blockout](design-artifact.md) to compare mechanisms against those requirements. A geometry observation may justify investigating a role. Establishing repeatability or match performance takes a separate experiment.
