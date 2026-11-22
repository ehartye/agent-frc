---
name: frc-robot-highlights
description: "Create or refresh a student robot showcase with explorable CAD models, mechanism animations, maintained README stills and source-linked design evidence."
---

# Robot evidence highlights

Before promoting a new whole robot or subsystem model, use `frc-mechanical-readiness` on the exact Fusion configuration and every distributed derivative. Require a negative-control and candidate receipt from an installed first-party method for externally discovered defects. Require a passing, scoped and signed mechanical review before a design becomes `effective` and replaces the live model, its README image or the native download. On an open or failed candidate, preserve the deployed revision and continue private engineering work. [Model promotion and evidence](../../docs/mechanical-readiness.md)

Every published design holds a status: `in-progress`, `effective`, `superseded` or `withdrawn`. An [in-progress detailed design](../../docs/private-model-release.md#publish-detailed-designs-by-status) can deploy without that review once it links an effective preliminary release, its registered Fusion export passes the layout check and a mission animation plays. Show it beside the effective design, labelled with its status. It takes the primary view only when no effective detailed design exists. While no detailed design is effective, the primary entry points are not signature-protected; the season's PR review covers them. To pull a published design with no replacement, declare the withdrawal in the approved policy. Its files move to the archive listing, labelled withdrawn. When a design's preliminary release is superseded, re-link it.

A preliminary design release, in progress or effective, can also deploy beside the live model without that review. Each [preliminary release](../../docs/private-model-release.md#publish-preliminary-design-releases) needs a layout-checked receipt and a playable mission-task case for a represented narrative objective. Link it as a secondary page that identifies itself as preliminary design. It never replaces the primary view, README still or model selector, which keep showing the latest effective detailed design.


## Let students explore the model

Resolve the project’s [component palette](../../docs/cad-color-convention.md) before exporting a colored assembly. Use the same stable part roles for Fusion, the README still and the orbit view. Check the bumper cover, adjacent moving parts and supplier finishes in all three.

Lead the showcase with an orbitable, zoomable view of the selected robot assembly. Include reset, touch and keyboard controls, a CAD still, the assembly revision and pose, and a link to the student Fusion source or its authorized project location. Identify simplified purchased parts and incomplete subsystems in the caption. A subsystem-only export should identify the subsystem in the title. Inspect the reopened assembly against the [native export and articulation contracts](../../docs/native-viewer-contracts.md) before claiming the model matches a particular configuration.

Use the same assembly for the still at the top of each project README. Link the image to the explorable model and identify whether it shows a current candidate, historical revision or fixture. For a shareable Fusion STEP export, set `source`, `title` and `scope` in the project's `cad-showcase.json`. Run `python <plugin>/scripts/export-showcase-cad.py <project>` with OCP and VTK, followed by `python <plugin>/scripts/cad-readmes.py <project> --update`. Run the second command without `--update` in CI. For the highlights builder add a `cad` object with `receipt` (the project-relative export receipt), `title`, `scope` and `shareable: true` to a project-root manifest. The receipt binds the source STEP, tessellated mesh and rendered PNG.

Before issuing a still, [verify the saved viewport or registered render](../../docs/cad-capture-review.md). Reopen and activate the selected assembly, restore only the intended display state and compare the resulting pixels with an independent view. Check the whole outline, visible mechanism, cover finish and readable markings promised in this pose. Keep failed captures and distinguish a verified renderer from a native viewport.

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

For a project-specific visual identity, set `stylesheet` on the highlights manifest with a project-relative CSS `file`, its `sha256` and `shareable: true`. The builder publishes the same stylesheet with the page and its full-screen CAD viewer. Scope selectors to `.robot-showcase`, `.cad-viewer` or `.cad-viewer.embedded`. Use self-contained CSS so offline and published views agree. Keep controls and the full-screen view accessible on a phone and with a keyboard.

To use a two-color studio backdrop, add `"backdrop": {"center":"#536980","edge":"#192C44"}` to the project’s `cad-showcase.json`. Regenerate the CAD still and viewer before building the page. The colors affect the space around the model and leave all component appearances intact.

When the team wants a public site, keep `highlights.json`, its CAD receipt and its approved source files in the project repository. For a repository with an existing Pages site, build the showcase into a subdirectory of its existing publication artifact and link it from the site's navigation. GitHub Pages serves one site per repository.

For either branch-served or generated Pages, use the [project CI and local release instructions](../../docs/project-ci.md). Run the signed source and final-site gate on the directory students will see, including every post-build copy. A registered preliminary review tree and an in-progress detailed design pass the same gate through their receipt-bound classes. The local release receipt identifies its exact bytes.

After the first successful deployment, open the URL reported by the deploy job. Verify the full-screen model, still image and film playback on the hosted page. Add the live URL to the project README. Refresh evidence in the project and merge to the default branch to update the site. Local and offline builds use the same manifest.


Use the [publication checks](../../docs/showcase-evidence.md) for a kickoff-only analysis page, a project workflow index, a published model inventory and observed pickup or release markers on the film clock. Keep chances and conditional point estimates distinct from an independently reached target. For a cut between studies, show the checked chapter boundary and compare the event type, time and qualification to independent observations. For a named animation, seek the event in its own clip.

Publish the project’s generated student field lab with the `fieldLab` entry and link it directly from the README. Verify the stable `field-lab.html` in the deployed site.

For a publicly downloadable whole robot, bind the student archive to its own reopened component, feature and joint evidence. [Verify the public Fusion handoff](../../docs/public-fusion-handoff.md).

Use the [Fusion authority and revision handoff](../../docs/fusion-authority.md) to establish the one current saved native design, the STEP exported from that design and the identity of the engineering evidence. When resuming in another checkout or before replacing a published view, verify the selected register and lineage with `fusion_authority.py`. For a mechanical review, use `fusion_issue_inventory.capture` in Fusion for missing commissioned poses. [Resume a registered master](../../docs/fusion-authority.md#resume-a-registered-master)

Before replacing a CAD view, reproduce the actual still and reconcile every playable physical clip with the qualified native motion and full swept geometry. Verify the signed assets in the final site directory after the last custom copy, for both branch Pages and workflow deployments. [Published geometry and motion](../../docs/mesh-correspondence.md)

Register an authorized animated GLB with `cad.playableGlb` to include the actual reviewed clip file alongside the orbit viewer. Exercise the real issued model in the final student view.

After a [numbered restart](../../docs/private-model-release.md#keep-a-retired-robot-online-during-a-numbered-restart), verify a replacement against the protected active design selection. Keep serving the exact previously approved bytes until the new whole robot qualifies.
