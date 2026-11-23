# Start a season at the field

Start with the team’s release packet. Create an external, project-owned model before students enter the field lab. An existing project can resume from its saved investigation. [Project rules model](project-rules-model.md) · [Continuation procedure](strategy-first-continuation.md)

## Read the rules into a model

Record the source edition, game-piece inventory and distribution, scoring values, control restrictions, active periods, field frame, starting positions, supply locations and scoring targets. Use a manual URL or a project-relative source file such as `sources/release.pdf`. Local source locators appear as text. Label source dimensions, derived coordinates, trial assumptions and unknowns. Keep later competition evidence outside a release-day exercise. Save the profile and generated model in the team project.

From the team project, use the installed plugin’s script with the paths to the project’s files. Replace `<plugin>` with its actual location. Use a new output filename for each revision.

```sh
node "<plugin>/scripts/kickoff.mjs" --profile release-day.json --model-output rules.json
node "<plugin>/scripts/kickoff.mjs" --profile rules.json --output field.html
```

Open `field.html` in a browser. It runs offline. The model can omit unsupported geometry, optional scoring data and timed rehearsal. Leave unknown dimensions as open questions. The rectangle-and-prism preview supports early spatial comparisons. Apply a rectangular starting perimeter only when the source rules and the proposed shape support that screen. The team can also inspect the public lab with a fictional model. [Training lab](https://ehartye.github.io/agent-frc/field-lab.html)

To rehearse candidate robots, describe each one as a concept bot and check it against the model first. Then add a `--concept` option for each file. Each robot card can then drive a concept, which rotates, accelerates and acquires and scores only through its declared faces. A robot without a concept keeps the fixed-heading prism. [Concept bots](concept-bots.md)

```sh
node "<plugin>/scripts/concept-check.mjs" turret.json --profile rules.json
node "<plugin>/scripts/kickoff.mjs" --profile rules.json --concept turret.json --concept placer.json --output field.html
```

## Explore a scoring opportunity

Allocate the pieces available to one robot at the selected supply location, including any later delivery. Deduct setup, travel and service time. Check open scoring slots. Compare three delivery plans.

- **One-piece shuttle.** Each score requires a loaded trip to the scoring location. Every additional piece requires an empty return. Three scores require five transit legs. The model uses the same path and speed for the return.
- **Supply staged at the goal.** Make one initial transit, then service pieces at the scoring location. Identify who supplies those pieces and when the robot can use them.

- **One batch loaded at A.** Give the time when additional pieces could actually be aboard, including pickup and retention. Enter onboard capacity independently from open target slots. Compare leaving with the opening load against waiting for that batch. Each choice pays one subsequent loaded trip and setup at B. The service cycle covers scoring at B. The return and later acquisitions belong to another window. A stock allocation or a piece reaching the source does not establish readiness to leave.

For example, 25 pieces over five usable seconds require five pieces per second. A serial loader completing a piece every 0.25 seconds can deliver at most 20 in that window. A 0.20-second candidate reaches 25 under ideal conditions. Late arrivals, repeated transit and occupied scoring positions can change the requirement.

For a loaded mechanism, identify the accessible IDs, first handoff latency and repeat interval before entering a service cycle. Save the limiting interface and any unserved pieces in the supply and timing assumptions. [Compare three feed paths on one clock](storage-to-service.md).

One opportunity represents distinct pieces, one robot and one window. Before combining opportunities, reconcile shared supply, recycled pieces, occupied positions and overlapping times.

## Infer traffic and test physical space

The model draws candidate routes from project-defined starts and supplies to compatible scoring targets. Each route can specify sources by period with `sourceByPhase` and optional `preloadPhases`. Opponent routes use the explicit alliance reflection in the field map or rehearsal profile. A sampled overlap identifies a possible conflict. Exposure depends on which routes robots take and when they arrive.

Students can resize the trial box, move its pose and change its heading. An optional `trial` object supplies frame `length`, `width`, `height`, and optional `x`, `y`, `heading`. Otherwise the lab uses the external rehearsal dimensions. A model with neither opens with a visual scale cube sized to one twelfth of the shorter field side. The static route check screens the occupied frame and bumpers against the profile’s collision geometry. A blocked or unresolved route leaves the arithmetic conditional. Where the profile supplies behavior programs, use the timed field rehearsal to compare queues and delays under different assignments. [Match rehearsal](field-rehearsal.md)

Save the route, affected mechanism, contact direction, supporting evidence and the function that must survive. A shared travel corridor can justify a protected intake. Estimating an impact force needs a separate load case with relative motion, effective mass, compliance and contact geometry. Compare waiting for a partner with choosing another route before assigning a faster loader requirement.

## From the field to a design decision

1. Ask students to move, rotate and resize the box. Let them compare a real choice, such as approaching a target with the long side or short side leading. Once a candidate takes shape, write it as a concept bot and compare its faces, stand-off band and aim in the rehearsal. Capture what each student sees. Each observation records the box dimensions, pose and starting-size checks at that moment.
2. Use their observations to draft two possible match stories. Which task could the team repeat, what would its partners handle, and what could it do if the approach failed? Record the proposed role, cycle and alternative in the lab. Where the geometry leaves a question open, name the experiment that could answer it.
3. Download the Markdown narrative into the student project before closing the page. The draft includes the manual edition, observations, provisional capability and first experiment. Blank responses stay open. A partial draft lets the next discussion start from what the students actually saw.
4. Use the [strategic narrative skill](../skills/frc-strategic-narrative/SKILL.md) to refine the draft. Record the team's choice and its supporting observation IDs. Trace the chosen narrative and capability into the [capability contract](../templates/capability-contract.md) with a measurable acceptance check before choosing a mechanism, control approach or fabrication method. When a trial changes the story, revise that link and revisit the affected requirements.

Later, use the [design blockout](design-artifact.md) to compare mechanisms against those requirements. A geometry observation may justify investigating a role. Establishing repeatability or match performance takes a separate experiment.
