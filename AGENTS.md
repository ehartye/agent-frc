# agent-frc project

## Student CAD and project documentation

Use the plugin's default CAD component palette for new robot designs. A robot repository can override individual roles or add named roles in `cad/component-palette.json`. Apply the resolved palette consistently to editable Fusion appearances, public CAD views and README stills. Preserve supplier finishes and use the project's documented alliance colors on bumper covers.

Use four-module swerve as the default for a new robot drivetrain unless the project specifies another architecture. Guide the student through exact manufacturer options and a custom shop-built option before selecting hardware.

Use Autodesk Fusion as the standard for student CAD authoring and handoff. Prefer the manufacturer's model of each purchased part in its exact revision and configuration. Preserve its source, file identity, license and installed transform. Document the specific engineering justification for external shape authoring, how the selected result returns to Fusion and what remains editable. Label every approximation and its limits.

Maintain a CAD-rendered still immediately below the title of each project-owned README. Bind it to the selected assembly and the same geometry used by the interactive showcase. Identify the pose, revision and scope so students can distinguish a current robot, historical assembly or subsystem fixture. Regenerate and verify both views when the selected CAD changes.

Start new robot frame and bumper designs with two rear plan-view chamfers. Preserve explicit project outlines. Size each mitered backing, padding and cover segment from the actual frame, retain the vertical bumper section and verify the applicable edition and cutoff in the owning project. [Frame profile convention](docs/frame-profile.md)

## Use the installed tools to investigate robot defects

When a design study or independent reviewer finds a defect outside the plugin, record the detection method in the FRC wiki. Implement or identify the equivalent first-party skill and callable check. Use an executable comparison for a calculable property and a source-bound native Fusion inspection when expert judgment is required. Preserve a controlled failing case, then run the released plugin from a clean installed copy on the actual successor. Link the candidate inputs, released revision, regression and resulting receipt in the project. Keep open findings visible in private engineering records until the issued evidence satisfies the criterion.

A future detailed showcase model requires the full mechanical-readiness gate. A work-in-progress preliminary release requires a layout-checked physics receipt and a playable mission-task case instead. It stays secondary and labelled, and the latest detailed design remains front and center. Protect each deployed detailed model, still, selector and download, and each issued preliminary release. On failure retain the current release. Bring a repeatedly failing mechanism or role back to whole-robot design when a fair alternative could better meet the same requirements.

## Maintain the public workflow guide

Update the GitHub Pages guide in the same change whenever a workflow, skill, student objective, artifact contract or user-facing behavior changes. Check the guide against the installed skill inventory, build it, exercise the changed interaction and verify the published result after merge.

## Keep the plugin season-neutral

Include only references that help someone make, implement or verify a decision during active design. Research, retrospective comparisons, team identities and team-specific designs belong in the FRC research wiki. Extract transferable methods without naming, linking, tracing or reproducing a team or its design. Original teaching fixtures must be clearly synthetic. Keep executable season assets with their owning project.

Keep season-specific language, game rules, dimensions, scoring tables, target names, field layouts, example missions and robot case evidence in the owning season project, outside this repository and its installable package. Apply this boundary to code, defaults, tests, fixtures, skills, documentation and Pages. Use invented, season-neutral fixtures for portable tests. Retain a generalized engineering insight here only when external evidence demonstrates its effectiveness across all three reference seasons identified in the FRC research wiki. Keep that evidence and any game-specific qualifications in the external projects.

For a fresh kickoff, read the supplied game's release materials, identify the edition and evidence cutoff, and decompose the rules into a versioned, project-owned artifact outside the plugin. Record field boundaries and obstructions, alliance starts, pieces and supply, actions, scoring, match periods, restrictions, units, authority references, assumptions and unresolved facts. Have the generic plugin, pre-sim and narrative workflow interpret that artifact. Do not infer behavior by season number or fill missing facts from a historical game.

Keep the public repository independent from any optional local vault. Never include private vault data, absolute user paths, credentials, team-private content or third-party assets without item-level permission. No robot operations or deployment tools. Do not install or publish beyond the repository operation expressly requested. Preserve source/version/freshness boundaries. Run npm test and npm run validate after relevant changes.
