# Convert a rulebook into a design input

Start in the team's project directory. Ask for the release packet or the specific manual edition and update cutoff. Open the actual documents and drawings. A rolling web page, remembered rule or another robot's design cannot establish what was available on kickoff day.

1. **Register each source.** Capture its publisher, title, edition, date, section or drawing locator, URL or project-relative file, units and checksum where available. Keep permitted source material in the project or its research wiki. Record conflicting editions and unknowns.
2. **Translate the playing space.** Declare the frame, scale, boundary planes, obstacle polygons and height ranges. Locate starts, possible sources, targets and waiting areas by alliance. Distinguish a cited dimension, a derived coordinate and an assumed robot-center approach. Record the formula or registration assumption. Leave unsupported positions unresolved.
3. **Count the opportunities.** Extract phases and playable durations, resource inventory, initial distribution, replenishment, capacity or possession limits, legal actions, target limits and point values. Record conditions for bonuses, human interaction, scoring assessment after time expires and non-piece tasks. Preserve clauses outside the simulator's vocabulary in the rules register with their locators.
4. **Propose comparable trials.** Put robot size, speed, timing, allocation, action order, fallback and shared-lane assumptions in candidate scenarios. A total field inventory and a robot's reachable share are different quantities. Keep fields dependent on unverified assumptions visibly conditional.
5. **Write the project file.** Use the [synthetic worked schema](../examples/kickoff/training-field.json) to identify field names. Replace every fixture value with the team's evidence or an explicitly labeled assumption. Save the result as `rules-model.json` in the external project. The project owns the model and its revisions. Use a new filename for each material update.
6. **Verify and interpret it.** Run the command below with the absolute path to the installed plugin script, or run the npm equivalent from the plugin checkout with absolute paths to your project files. The validated file contains the model and its derived route hypotheses. Review the model with the students before opening the lab. A novel scoring action can still inform the narrative and a testable requirement even when a renderer cannot execute it.

```sh
node <plugin-root>/scripts/rules.mjs init register.json
# Fill the register and project field profile from the selected release packet.
node <plugin-root>/scripts/rules.mjs review register.json
node <plugin-root>/scripts/rules.mjs compile register.json rules-model.json reviewed-rules.json
node <plugin-root>/scripts/kickoff.mjs --profile reviewed-rules.json --output field.html
```

Record which inputs an observation depends on. When an update changes field geometry, a scoring rule or the match clock, regenerate the affected trials. Revisit the narrative and requirements that cited them. Keep team-specific source material and historical findings in the research wiki.

## Record a rule once

For a register containing several documents, set `manualSourceId` to the governing manual's source ID. A single source is selected automatically. Set the profile's `manual` to that source's location (a URL or project-relative path). You can also state its exact `manualEdition` and `manualSha256`. Keep the project edition label and the manual publisher's edition in their respective fields.

When two locations serve identical bytes, hash each copy independently. Put the lowercase `sha256` on the canonical source and list the copy in its `mirrors` array as `{"location":"packet/copy.pdf","sha256":"…"}` with the same digest. Without verified matching bytes, keep using the reviewed location. Compilation records the selected source and verifies the declared identity offline. An unpinned rolling URL still requires checking the document at the time of use.

Give each source an ID, title, edition and location. In the register name the edition and evidence cutoff. Each fact records an ID, topic, source ID, locator and statement. Use the topics field, inventory, timing, scoring and restrictions for coverage. Add a new topic when an unfamiliar game action requires it.

A modeled fact also carries a JSON Pointer to the field profile and the value read from the source. For example, a diagram with an invented field width of 200 inches could produce the following entry:

~~~json
{"id":"width","topic":"field","sourceId":"handout","locator":"drawing A, dimension W","statement":"Field width is 200 inches","status":"modeled","pointer":"/field/width","value":200}
~~~

Give an unmodeled fact a reason and describe its design consequence. Keep unresolved interpretations in openQuestions. The compile command checks the edition, source IDs and each declared value against the profile, then embeds the register and its file digest in the project model. Review uncited profile assumptions separately. An agent or student must read and interpret the actual manual before running this consistency check.
