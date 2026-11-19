# Publish what students can inspect

A kickoff project can publish a rules analysis, strategic narrative and untested scoring opportunities immediately. Set `stage` to `analysis` in the highlights manifest. Keep the revision, sources and results. The build sheet and the model are optional at this stage. Existing design manifests retain their build sheet.

## Show a time on the recording

For a single source-declared event register, use a local, shareable MP4 or WebM and the normal [highlights builder](../scripts/robot-highlights.mjs). Add `motion` to the media item. The [linear fixture manifest](../examples/highlights/stroke-page.json), [recorded positions](../examples/highlights/stroke.json) and [independent target-plane calculation](../examples/highlights/stroke-events.json) are a runnable example. The student can pause the jaw at the first fully clear frame and inspect the source. The example describes one prescribed path.

- Set `movingPart`, `basis` (commanded, simulated or measured), `trace`, `observations`, `clock` and `attempt`. Each source has its own digest and redistribution flag.
- The observations file records the display revision, observed revision, piece identity, starting checkpoint and scope (`same-attempt`, `earlier-revision`, `independent-start` or `capacity-only`). Include the hashes of both clip and motion trace. If a model changes between pickup and release, publish the two scopes visibly. Use a shared piece, state and clock to support an uninterrupted path.
- Synchronize the video with increasing `{clipS,runS}` pairs, including zero clip time and the last represented run time. Add an anchor wherever playback changes speed. Each event gives a stable ID, `timeS`, target, criterion and an outcome of `reached`, `scored`, `missed` or `unresolved`. Apply the project's independent criterion before assigning an outcome. A capacity target supports an unresolved observation. A commanded motion is evidence of the illustrated pose. Reaching a mechanism stop can have a different criterion from scoring.
- Inspect distinct pickup, custody, release and target events when they matter to the design. A visible gap in the recordings is a legitimate result. The video control moves to the observed clock after loading the local film. Check the exact hosted asset at desktop and phone widths.

## Mark the boundary between two studies

A chapter cut can change the test fixture, the clock or the displayed robot. Have the student select the chapter and inspect the source, then seek to the observed event. The [worked chapter register](../examples/highlights/stroke-chapters.json), [checkpoints](../examples/highlights/stroke-checkpoints.json), [target observation](../examples/highlights/stroke-targets.json) and [fixture generator](../examples/highlights/register-chapters.mjs) show a continuous case. The two chapter names describe an interval of the film on either side of the same recorded state.

Add `chapters:{"register":"chapters","trace":"checkpoints","observations":"targets"}` to the film in a [highlights manifest](../examples/highlights/stroke-chapter-page.json). Each value is a separately registered local JSON source ID. The chapter register pins the exact media, checkpoint source and independent observation source. Its paths resolve from the project root. Students can select chapter starts and individual target events. An earlier observed revision appears beside its chapter.

- A chapter names its start and end rows by JSON pointer. Each source row identifies a revision, attempt, piece, clock and time in seconds. The first and last synchronization anchors must match those times. Use intermediate anchors for slow motion. Each source event is selected by pointer and must agree on event type, time, identity and projected outcome.
- Set the next chapter's `join.kind` to `fixture` when it resets the piece, mechanism or plant. Use `position` for a common piece and revision in the same coordinate frame and unit, with a declared Euclidean tolerance. The strongest option, `checkpoint`, also compares the attempt, clock, timestamp, named checkpoint and the entire declared state object. Include all quantities needed to resume this experiment, such as velocity, successive controller states and contact state. A source may only support the weaker position claim.
- The independent source supplies the criterion, target, `kind` (`target` or `score`) and `qualified` (`true`, `false` or `null`). A score criterion also names the governing rule. A positive ordinary target yields “reached”, a positive scoring criterion yields “scored”, an observed negative yields “missed” and missing qualification yields “unresolved”. Emit a stable observed type that distinguishes passage through an opening from satisfaction of a downstream criterion. Preserve separate event rows for each. If a rule-qualified observation occurs after the clip, extend the recording or link it as an off-camera finding.
- For project-native traces with different field names, generate the two input records from preserved source bytes. Include original digests and the project adapter that selects the run, unit/frame, criterion and clock. The checker verifies the declared projection. Experimental validity and completeness of the state depend on that source. For a film, inspect the first/last frames and any hold after the last observed sample. The browser also checks seek positions against decoded duration.

### Use the same observations in a custom animated GLB viewer

Run the installed tool against the same GLB bytes that are published. The optional second argument supplies the project root.

```sh
node <plugin>/scripts/replay-chapters.mjs project/chapters.json project > project/checked-chapters.json
```

Give each chapter its actual `animation` name with local clip time starting at zero. For a matched cut also give both chapters the same named, directly reachable root mesh `node`, and the source checkpoints' `frame:"glTF scene"`, `unit:"m"` and translations in those coordinates. The checker reads native float32 key arrays and the animation duration. It compares the root mesh origin and outgoing/incoming keys with the stated tolerance, allowing 0.000001 m for source registration. Skinning, child-local/world pose reconstruction and cubic pose interpolation are outside this positional check. A root's position alone cannot verify its visibility, orientation or velocity.

Copy the [accessible chapter controls](../templates/replay-chapter-controls.mjs) alongside the checked JSON and project viewer. Call `attachChapterControls(container, register, player)` after the player loads. The helper selects the named animation, pauses it and jumps to the checked clock. If keeping custom controls, use the returned `classification`, observed revision and piece beside each chapter button. For each returned event show the outcome, target and rule alongside its control. In a project that uses a model-viewer element, set `animationName` to the verified chapter name, await `updateComplete`, pause and set `currentTime` to the verified event's `clipS` after checking decoded duration. Test a jump from the other clip and inspect the actual served model on mobile. The normal MP4/WebM highlights page provides its own buttons.

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
