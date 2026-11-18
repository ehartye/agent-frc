# Start a season at the field

When students start with the game reveal, their first design activity is to move a plain robot box around a scale field. Give them the controls before asking for a match story. A student who already has a saved investigation can instead use the [continuation procedure](strategy-first-continuation.md).

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
