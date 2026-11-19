---
name: frc-robot-highlights
description: "Create or refresh a student robot showcase with explorable CAD models, mechanism animations, maintained README stills and source-linked design evidence."
---

# Robot evidence highlights

## Let students explore the model

Lead the showcase with an orbitable, zoomable view of the selected robot assembly. Include reset, touch and keyboard controls, a CAD still, the assembly revision and pose, and a link to the student Fusion source or its authorized project location. Identify simplified purchased parts and incomplete subsystems in the caption. A subsystem-only export should identify the subsystem in the title. Inspect the reopened assembly against the [native export and articulation contracts](../../docs/native-viewer-contracts.md) before claiming the model matches a particular configuration.

Use the same assembly for the still at the top of each project README. Link the image to the explorable model and identify whether it shows a current candidate, historical revision or fixture. For a shareable Fusion STEP export, set `source`, `title` and `scope` in the project's `cad-showcase.json`. Run `python <plugin>/scripts/export-showcase-cad.py <project>` with OCP and VTK, followed by `python <plugin>/scripts/cad-readmes.py <project> --update`. Run the second command without `--update` in CI. For the highlights builder add a `cad` object with `receipt` (the project-relative export receipt), `title`, `scope` and `shareable: true` to a project-root manifest. The receipt binds the source STEP, tessellated mesh and rendered PNG.

## Show how the mechanism moves

For each mechanism central to the match role, show a student one complete operating cycle. For example, show the intake stowed, acquiring, transferring a piece and returning to stow. Name the moving part, state and relevant joint angle or extension. Pick a camera angle where both the moving part and its fixed reference are visible. Use a cutaway or isolated subsystem view when the frame hides the motion.

Prefer a student-controlled animation with play, pause, scrub and named poses. A recorded Fusion joint drive or simulation clip with native video controls also works. Export from the same assembly revision and supply the motion source, units, joint limits, clock or playback multiplier and any omitted motion. Label a commanded CAD sequence as such. For a trace-driven replay, bind observed poses to timestamps and identify the first failure or contact. A camera orbit illustrates shape; show relative motion between components for the mechanism demonstration.

Put a recorded animation in the manifest's `media` array with its local video, optional poster, accessible description, caption and source ID. Start paused. Verify that a student can rotate the assembly independently, pause the mechanism mid-cycle, inspect an endpoint and reset the view using keyboard and pointer controls. If a mechanism lacks motion evidence, name the missing joint or run in the showcase and leave its animation pending.

Start with the project’s existing public page, selected robot revision and intended match role. Find the strongest recorded result that would help a student decide what to keep or change. Open the original run or engineering record. Check the candidate, clock, units, outcome criterion and first failure. A tally from a development run belongs alongside the conditions that produced it. A different drivetrain or mechanism needs a new run to inherit that tally.

Author a project-owned manifest using the [working example](../../examples/highlights/project.json). Put the robot’s role and revision at the top. Give each result a claim, evidence basis (`modeled`, `measured`, `design` or `open`), conditions, limit, and source ID. Include the most consequential failed or untested condition. In the build sheet, connect each subsystem configuration to its drawing, settings or bill. Use a separate campaign for a frozen evaluation roster. Enter its criterion, required passes, and full counts including failed and unresolved attempts. Keep development starts out of that denominator.

For each source, supply a label and the source revision. Prefer an immutable public HTTPS link to the exact record. For a redistributable local artifact under the manifest directory, supply its relative file path, SHA-256 and `shareable: true`. Inspect rights and private details before making that declaration. The builder copies those exact bytes into the page’s evidence directory. It checks local content and leaves external links for the author to open and verify.

Use the optional `media` array for recorded views. Each entry has `asset` (a local image or video source ID), `description` (accessible alternative), `caption`, and `source` (the run or drawing it illustrates). A video may specify a local image source ID as `poster`. Explain the viewpoint and playback speed when a film compresses match time. Identify renders, slow motion and sensor events individually. Use text and evidence links when the project has no distributable media.

Run the [offline page builder](../../scripts/robot-highlights.mjs) from the installed plugin with the project manifest and the desired site directory:

```sh
node <plugin>/scripts/robot-highlights.mjs <project>/highlights.json <project>/docs/robot
```

Open the generated `index.html` on desktop and at a narrow viewport, follow the source links and play each film. Use a fresh output directory for a clean publication artifact. Regeneration replaces the generated page while preserving an independently authored index. Link the finished page from the project’s existing navigation. Publish through the project’s chosen host when authorized. On later revisions, revisit every changed configuration, claim and media caption and regenerate from the updated evidence.
## Publish on the project's GitHub Pages site

When the team wants a public site, keep `highlights.json`, its CAD receipt and its approved source files in the project repository. For a repository with an existing Pages site, build the showcase into a subdirectory of its existing publication artifact and link it from the site's navigation. GitHub Pages serves one site per repository.

For a dedicated showcase site, copy the [Pages workflow](../../templates/robot-showcase-pages.yml) into the project as `.github/workflows/robot-showcase.yml`. Select **GitHub Actions** under **Settings → Pages → Build and deployment**. The workflow checks pull requests and publishes from the default branch. Its pinned builder verifies the project manifest and uploads only the newly generated site. Keep external references public and pin them to the revision the claim describes.

After the first successful deployment, open the URL reported by the deploy job. Verify the full-screen model, still image and film playback on the hosted page. Add the live URL to the project README. Refresh evidence in the project and merge to the default branch to update the site. Local and offline builds use the same manifest.
