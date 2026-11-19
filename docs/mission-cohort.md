# Review a frozen mission cohort

Decide which starting conditions you want the robot to handle. Before the first evaluation run, record the exact starts, the number of successes you require and what one complete mission must demonstrate. Keep a copy of the manifest digest in the project log. It lets another student check whether the roster, criteria or source revisions changed after the results were known.

## Try the synthetic exercise

A simulated tabletop carrier presents two marked blocks to a reader. Its fixture offset changes on each of twenty starts. The invented requirement is nineteen completed attempts. The controller can sense an arriving edge. It starts with no knowledge of the fixture offset.

```sh
node examples/cohort/make-demo.mjs demo-cohort
npm run cohort:review -- demo-cohort/manifest.json demo-cohort/journal.json --manifest-sha256 SAVED_DIGEST
```

Use a new directory and replace `SAVED_DIGEST` with the hexadecimal value printed by the first command. The example writes the freeze and simulated results together for teaching. In a project, save the freeze before running the evaluation. The review should show 19 passes and one failed mission. Delete the first entry from the journal and repeat the review. It should show 18 passes, one failed mission and one missing attempt. The threshold remains open and the denominator stays twenty.

## Freeze the experiment

Use the generated `manifest.json` as a complete example of `agent-frc/mission-cohort@1`. Each file reference has a relative `file` and a lowercase hexadecimal `sha256` over its exact bytes. Put referenced files under the manifest directory. A revision can point to one executable file or a project-owned inventory pinning the full model and its dependencies. The project must verify dependencies named within its inventory.

| Manifest field | What to write |
| --- | --- |
| `id`, `basis` | Name this experiment and identify `modeled` or `measured` evidence. |
| `revisions` | File references for `controller`, `scorer`, `geometry` and `observationPolicy`. Pin the settings and software actually used. |
| `inputs` | For each ranged input, record `id`, `unit`, `min`, `max`, `provenance` and `access`. For each of `simulator`, `controller` and `scorer`, set `when` to `initial`, `observed` or `hidden` and describe the source and timing in `basis`. |
| `attempts`, `tuningIds` | In planned order, give each evaluation an `id`, sampled `values` and its own native `initial` state reference. Reserve different IDs for tuning. Include independently varied seeds among modeled inputs. Measured repeats at the same setting need distinct initial observations and execution evidence. |
| `stages`, `itemChecks`, `missionChecks` | Name the stages in order, the checks for each credited item, and any whole-mission checks. The project scorer defines and tests their physical meaning. |
| `requiredItems`, `deadlineS`, `requiredPasses` | Specify distinct item count per attempt, inclusive mission deadline in elapsed seconds, and successes required in the original roster. |

A displaced object can be visible to the simulator before the robot can observe it. Initialize the physical object independently, keep the controller's reference unchanged and record the raw sensor event at which the controller first learns anything about the displacement. Exercise a deliberately unavailable observation in the project's controller tests. The reviewer checks the declared inputs at startup. Only the project can establish what its controller actually read later.

## Record what each execution consumed

1. Write one `agent-frc/mission-attempt@1` receipt per execution. Record `attemptId`, a unique `runId`, `manifestSha256`, the four revision digests in `revisions`, `initialSha256`, actual sampled `values` and `controllerInitialInputs`. The last map contains exactly the initially available varied inputs. If one simulator batch runs several cases, combine its native batch ID with its recorded case key.
2. For a finished attempt, set `status` to `finished` and supply an ordered `chain` of stage references. An `agent-frc/mission-stage@1` record carries `attemptId`, `runId`, `stage`, `timeS`, `source` for its own native execution evidence, and its achieved `outputState`. Its `parentSha256` identifies the preceding stage envelope and `inputStateSha256` identifies the native state it consumed. For the first stage, both identify the frozen initial state. Pin what the next stage actually read when it executed. A changed achieved opening invalidates a restart saved from an earlier opening. Use separate case-specific records or trace segments when a log contains several runs.
3. Put the project scorer's `decision` on the last available stage. A pass requires the full chain, `verdict: "pass"`, `completionS`, a `checks` map of required mission booleans and an `items` list. Each item needs its own `id`, `timeS` and required boolean `checks`. A mission failure can occur earlier. Record `verdict: "mission-failure"`, `firstFailedCheck` and `failureTimeS`. Keep the native time, item identity and observation behind each score in the stage source.
4. For an infrastructure failure, record `status: "infrastructure-failure"`, a `reason` and incident `source`. Retry only that original slot with the same frozen inputs and a fresh execution ID. Append every execution in order to the `entries` of an `agent-frc/mission-journal@1` document using `{attemptId, receipt}`. Give the journal its `manifestSha256`. Retain the journal history in your project so a later omission can be detected independently.

## Read the result

The report shows every slot, including missing attempts, unsupported evidence and unresolved infrastructure failures. Identical receipt replays count once. Replacing a final result or supplying one native execution for multiple slots raises an issue. The command exits with 0 when the threshold is met, 1 when it is open or unreachable, and 2 when the freeze or journal cannot be reviewed. An unreachable threshold appears as `missed`. The review only credits evidence supplied for each slot.

Digests verify bytes and recorded handoffs. An independent projector or sensor check must establish the meaning of a scored observation. Keep subsystem acceptance separate from a full mission, and numerical timestep checks separate from new starts. A pass fraction describes this frozen roster. Inferring a real-world success rate also requires evidence for how starts were sampled and how the model represents the robot.
