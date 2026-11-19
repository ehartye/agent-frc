# Publish what students can inspect

A kickoff project can publish a rules analysis, strategic narrative and untested scoring opportunities immediately. Set `stage` to `analysis` in the highlights manifest. Keep the revision, sources and results. The build sheet and the model are optional at this stage. Existing design manifests retain their build sheet.

## Show a time on the recording

Use a local, shareable MP4 or WebM and the normal [highlights builder](../scripts/robot-highlights.mjs). Add `motion` to the media item. The [linear fixture manifest](../examples/highlights/stroke-page.json), [recorded positions](../examples/highlights/stroke.json) and [independent target-plane calculation](../examples/highlights/stroke-events.json) are a runnable example. The student can pause the jaw at the first fully clear frame and inspect the source. The example describes one prescribed path.

- Set `movingPart`, `basis` (commanded, simulated or measured), `trace`, `observations`, `clock` and `attempt`. Each source has its own digest and redistribution flag.
- The observations file records the display revision, observed revision, piece identity, starting checkpoint and scope (`same-attempt`, `earlier-revision`, `independent-start` or `capacity-only`). Include the hashes of both clip and motion trace. If a model changes between pickup and release, publish the two scopes visibly. Use a shared piece, state and clock to support an uninterrupted path.
- Synchronize the video with increasing `{clipS,runS}` pairs, including zero clip time and the last represented run time. Add an anchor wherever playback changes speed. Each event gives a stable ID, `timeS`, target, criterion and an outcome of `reached`, `scored`, `missed` or `unresolved`. Apply the project's independent criterion before assigning an outcome. A capacity target supports an unresolved observation. A commanded motion is evidence of the illustrated pose. Reaching a mechanism stop can have a different criterion from scoring.
- Inspect distinct pickup, custody, release and target events when they matter to the design. A visible gap in the recordings is a legitimate result. The video control moves to the observed clock after loading the local film. Check the exact hosted asset at desktop and phone widths.

## Compare the delivered orbit model with its declared scope

Keep a separate expected article roster from a released assembly record, drawing or reviewed subsystem bill. Publish one expected row per installed item being claimed. Give every article a stable ID, subsystem, source reference, expected bounds and tolerance. Coordinates are `[xmin,ymin,zmin,xmax,ymax,zmax]` in millimetres in **published model axes** at the declared reference pose. For GLB convert the native frame into glTF axes before writing the expected dimensions. A whole-robot claim needs a roster that covers the entire claimed robot.

```sh
python <plugin>/scripts/check-showcase-inventory.py <project>/publication-map.json --project <project> --require-complete
```

The mapping uses schema `agent-frc/showcase-inventory@1`, a `revision` and `pose`, and two references named `model` and `expected`. Each reference has a project-relative `file` and `sha256`. The expected file has schema `agent-frc/showcase-roster@1`, the same revision and pose, and an `articles` array. For example:

```json
{"id":"left-jaw","subsystem":"receiver","source":"drawings/jaw.md","boundsMm":[10,30,0,90,34,24],"toleranceMm":0.25}
```

The map's `articles` array links those IDs to `project-original`, `authorized-supplier` or `project-proxy` using the `representation` field and a `provenance` explanation. Specify one unique reachable GLB mesh `node`, or `facets:[first,count]` for a contiguous range of a binary STL (optionally gzip). GLB uses metres internally. STL is interpreted in millimetres. Obtain ranges from the tessellator, not from an unverified node-order assumption. Use `representation:"omitted"` with a reason for known omissions. Unmapped rows remain unknown. The scanner measures indexed vertices with ancestor transforms and rejects ambiguous names, missing promised geometry, reused selectors, unsupported rendering extensions and out-of-tolerance placement. For an STL with a single solid, `[0,triangles]` selects the whole mesh. Record the publication rights for each supplied model before distributing it.

Omit `--require-complete` to report a partial study. A wrong placement or missing promised node still fails. To include coverage in a built-in orbit page, add `inventory:{"file":"publication-map.json","sha256":"…"}` to the highlights manifest. The displayed asset and revision must match. Custom GLB viewers can run the same checker on their exact served GLB. This checks the declared roster at rest. Bounds agreement alone cannot verify internal shape, motion, service access or camera visibility.

## Let students open each workflow document

Keep the documents in the robot repository. Use the [project setup convention](../skills/frc-project-setup/SKILL.md) to index the actual skill, output and supporting evidence in `docs/workflow.md`. Include `workflow:{"revisionUrl":"https://github.com/OWNER/PROJECT/blob/COMMIT"}` in the manifest, using a full commit SHA available in the checkout. The generated table links the documents at that revision. Keep restricted sources local and link a distributable project-authored record of the conclusions.


## Publish the actual interactive field lab

Add `fieldLab:{"file":"kickoff/field-lab.html","sha256":"…","shareable":true}` to the project manifest. Keep a Markdown link to that source or its hosted `/field-lab.html` in the project README. The standard page builder copies the verified, self-contained HTML into its output as `field-lab.html` and adds **Open the field lab** to the showcase navigation. Publish that entire directory. In the hosted lab, open the rehearsal and check the project-specific station names and piece stocks. When updating the lab, regenerate its digest with the new source.
