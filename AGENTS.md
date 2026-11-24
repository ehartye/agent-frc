# agent-frc project

## Student CAD and project documentation

Use the plugin's default CAD component palette for new robot designs. A robot repository can override individual roles or add named roles in `cad/component-palette.json`. Apply the resolved palette consistently to editable Fusion appearances, public CAD views and README stills. Preserve supplier finishes and use the project's documented alliance colors on bumper covers.

Use four-module swerve as the default for a new robot drivetrain unless the project specifies another architecture. Guide the student through exact manufacturer options and a custom shop-built option before selecting hardware.

Use Autodesk Fusion as the standard for student CAD authoring and handoff. Prefer the manufacturer's model of each purchased part in its exact revision and configuration. Preserve its source, file identity, license and installed transform. Document the specific engineering justification for external shape authoring, how the selected result returns to Fusion and what remains editable. Label every approximation and its limits.

Put a picture at the top of a README when there is a good one. Nothing enforces or checks it. For a robot project, show the selected assembly that the interactive showcase presents. Identify the design, pose, revision and scope so students can distinguish a current robot, historical assembly or subsystem fixture. Replace it when the design it shows changes.

Start new robot frame and bumper designs with two rear plan-view chamfers. Preserve explicit project outlines. Size each mitered backing, padding and cover segment from the actual frame, retain the vertical bumper section and verify the applicable edition and cutoff in the owning project. [Frame profile convention](docs/frame-profile.md)

## Use the installed tools to investigate robot defects

When a design study or independent reviewer finds a defect outside the plugin, record the detection method in the FRC wiki. Implement or identify the equivalent first-party skill and callable check. Use an executable comparison for a calculable property and a source-bound native Fusion inspection when expert judgment is required. Preserve a controlled failing case, then run the released plugin from a clean installed copy on the actual successor. Link the candidate inputs, released revision, regression and resulting receipt in the project. Keep open findings visible in private engineering records until the issued evidence satisfies the criterion.

Every published design holds a status: in-progress, effective, superseded or withdrawn. A detailed showcase model becomes effective only through a reviewed pull request that carries a passing mechanical-readiness review. An in-progress detailed design publishes beside it on automated prerequisites: an effective preliminary link, a passing layout check on the registered Fusion export and a mission animation. A preliminary design release requires a layout-checked physics receipt and a playable mission-task case instead. It stays secondary and identified as preliminary design, in progress or effective, and the latest detailed design remains front and center. On failure retain the current release. Bring a repeatedly failing mechanism or role back to whole-robot design when a fair alternative could better meet the same requirements.

## Maintain the public workflow guide

Update the GitHub Pages guide in the same change whenever a workflow, skill, student objective, artifact contract or user-facing behavior changes. Check the guide against the installed skill inventory, build it, exercise the changed interaction and verify the published result after merge. Write browser-check captures to a scratch directory outside the checkout, and remove any `.playwright-mcp/` folder the check leaves before finishing.

## Keep the plugin season-neutral

The plugin works for any season because it holds no season's logic: the game lives in the project that uses it. Linking a project that proves the plugin is not season logic, so the README links the proof-of-concept projects.

Include only references that help someone make, implement or verify a decision during active design. Research, retrospective comparisons, team identities and team-specific designs belong in the FRC research wiki. Extract transferable methods without naming, linking, tracing or reproducing a team or its design. Original teaching fixtures must be clearly synthetic. Keep executable season assets with their owning project.

Keep season-specific language, game rules, dimensions, scoring tables, target names, field layouts, example missions and robot case evidence in the owning season project, outside this repository and its installable package. Apply this boundary to code, defaults, tests, fixtures, skills, documentation and Pages. Use invented, season-neutral fixtures for portable tests. Retain a generalized engineering insight here only when external evidence demonstrates its effectiveness across all three reference seasons identified in the FRC research wiki. Keep that evidence and any game-specific qualifications in the external projects.

For a fresh kickoff, read the supplied game's release materials, identify the edition and evidence cutoff, and decompose the rules into a versioned, project-owned artifact outside the plugin. Record field boundaries and obstructions, alliance starts, pieces and supply, actions, scoring, match periods, restrictions, units, authority references, assumptions and unresolved facts. Have the generic plugin, pre-sim and narrative workflow interpret that artifact. Do not infer behavior by season number or fill missing facts from a historical game.

Keep the public repository independent from any optional local vault. Never include private vault data, absolute user paths, credentials, team-private content or third-party assets without item-level permission. No robot operations or deployment tools. Do not install or publish beyond the repository operation expressly requested. Preserve source/version/freshness boundaries.

## Test by need and risk

Follow [Test by need and risk](docs/testing-methodology.md). It decides what runs for every change in this repository and in the projects that use it.

- `.testing/risk.yml` gives the tier of each area. Read it before adding or changing a test.
- While editing, run `npm run validate` and `npm run test:changed`, which runs only the tests that cover the files you changed. Run everything (`npm test`) only before a release tag or when asked. [Commands and lanes](docs/project-ci.md#how-the-plugin-repository-tests-itself)
- A change to a page, a title, a name, a status or a document never triggers a model evaluation.
- The stage gate is the full layout check and the readiness report on the committed design, and it refuses unless readiness meets every criterion. The agent runs it, once, when the design is marked effective. A push only publishes. Floating parts fail the layout check.
- Name the failure a new test catches and keep a control that proves it can fail. One owner per invariant.
- No code works out what changed in a design in order to decide what to test again, or whether a result stands: no digest, fingerprint, list of what a result used, staleness state, reuse of an earlier result or list of touched files. While iterating, the caller names the one thing to judge, and checks run cheapest first. A design is judged in full, from nothing, before it is marked effective. Code that still detects changes is being removed: do not extend it, repair it or add more. A figure that decides no testing is not covered. [No change detection](docs/testing-methodology.md#no-change-detection)
- Iteration speed comes first. Anything that would make a designer wait longer while iterating is raised with its measured time before it is added.
- A chaotic interaction is judged by a success rate with k and N fixed in advance; a planar pass inside the engines' agreement needs a 3D confirmation. [Judge a physics trial](docs/testing-methodology.md#judge-a-physics-trial)
- When a run is heading past its time guideline (about 1 minute while editing, 5 before merging, 15 at a gate, 10 for a planar trial campaign, 30 for a 3D one), stop and check in with the owner.
- The plugin is a tool of the coding agent, not a dependency of a project. Project code never runs plugin code: no file a project holds or copies from `templates/` may name the plugin's repository, a commit, a path or a variable of it. A project's CI is its own files, written from `templates/project-ci/`.
