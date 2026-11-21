# Check a loaded ground route against five robots on the match clock

A mechanism can carry an article to a handoff in an empty field while a teammate occupies the proposed lane. Use `frc-season-meta` to freeze the six-robot roles and match history. Use `frc-mechanism-hardening` to identify the physical cargo, occupied envelope, actual timing and downstream observation. Test a different partner assignment against the same physical trace.

## Try the two partner assignments

From the plugin root, create the original teaching project in a new directory. Use the SHA-256 printed by the first command in the second.

```sh
node examples/design-methods/loaded-route.mjs NEW_EXERCISE
node scripts/loaded-route.mjs NEW_EXERCISE NEW_EXERCISE/registration.json REGISTRATION_SHA256 results.json
```

Both contexts begin with the same named tile onboard, the same chassis and the same two-second ground path. The field counterpart is the first object from a finite supply. When the partner vacates the lane, the whole interval has bounded peer clearance. When the partner holds position, the first intersecting sample is at match 3.30 s, physical 1.30 s. The far-end observation belongs to the mechanical run. The frozen partner prevents that route from reaching it.

## Register a project comparison

Freeze the registration digest independently of the proposed route decision. Keep the project-relative path and SHA-256 for every JSON input. A read-only station may keep the registration outside the project. The verifier interprets RFC 6901 JSON pointers against the exact files. Use the generated exercise's registration as a complete input example.

| Registration | What the team supplies |
| --- | --- |
| `profile` and `baseline` | The exact kickoff profile and released `agent-frc/rehearsal-series@1` result, including the original roster, peer roles, custody events, score and period history. The installed engine replays and compares the entire original result for each selected match. A mismatch stops the comparison. |
| `focal`, `contexts` | Name the substituted robot and one or more frozen matches. Each context sets a phase and the seconds from that phase's start to the first physical sample. Keep the interval inside that phase. For a positive clearance result, pin a separate original synchronization receipt in each context’s `clock.source`. Its pointer fields `match`, `phase`, `focal`, `matchS`, `physicalS`, `traceSha256`, `profileSha256` and `baselineSha256` identify this actor, the two starting clocks and all three input issues. Its `samples` mapping names every synchronized row: physical and match time, the substituted focal center and yaw, its cargo, and all five original peer IDs, centers in field inches and headings in radians. The checker compares the complete roster at every submitted instant, including the intermediate poses. Without this witness the comparison remains conditional. |
| `motion` | Pin the physical or prescribed ground-motion output. Point to the complete initial `inventory`, the `frames` array and its `time`, `center`, `yaw` and `onboard` fields. Preserve distinct physical IDs over the full `windowS`. Start a separate acquisition duty if a discharged piece is taken back. State the physical basis, units (`in`, `mm` or `m`), angle units (`deg` or `rad`), field origin in inches and counterclockwise source-frame yaw in degrees. |
| `footprint` | Pin evidence for a convex local footprint in inches, or list `boundsMm` pointers to source-measured robot-frame solids recorded as `[xmin,ymin,zmin,xmax,ymax,zmax]`. The latter uses their enclosing rectangle. State whether the evidence covers `chassis-only` or `chassis-and-carried-load` for every submitted pose. Include exposed mechanisms and carried articles when claiming loaded clearance. |
| `entry` | Freeze physically justified pose tolerances, and a one-to-one `pieceIds` map from each physical object onboard to its distinct field-inventory ID. Compare the actual focal starting center, heading and complete onboard set at the registered match time. A proposed route may reveal a conflict even when its entry custody remains open. |
| `clearanceIn` and `checkpoints` | Set the required margin between robot envelopes. Optional `motion.checkpoints` identify a named physical condition, its rows in the raw source, and pointers for piece ID and physical time. The result shows whether peer occupancy still permits that milestone. |

The checker uses the actual headings and per-robot dimensions in the replay. A positive sampled gap is the distance between the model polygons. A negative value is penetration in their separating-axis test. For a conservative enclosing rectangle, overlap identifies a conflict in the model; exact component contact requires the original shapes. The report names the limiting peer, first witnessed conflict, preceding observation, cargo and clocks.

To bound motion between observations, the raw focal source must explicitly register `piecewise-linear-between-observations` at its `centerLaw` pointer. Observations must cover each rehearsal tick. The engine moves a peer center on one segment per tick. Disjoint circumscribed disks prove clearance regardless of yaw, while overlapping inscribed disks can establish a conflict between two clear endpoint poses. Ambiguous intervals stay open. Omitting the law, or declaring `sampled`, keeps results at their observed times. Register the source's actual interpolation; measuring maximum speed from those same samples cannot prove its unseen trajectory.

## Read the decision

- **Blocked** identifies a witnessed overlap or violation of the registered clearance margin on the frozen route. Later physical observations retain their original timestamps and their peer-route disposition.
- **Peer-clear in the frozen model** requires matching entry pose and cargo, a loaded envelope and bounded clearance throughout. The result concerns these five unchanged peer plans and the stated model assumptions.
- **Open** identifies an unmatched entry, partial geometry or unresolved intervals. A missing or stale required input exits nonzero. A completed report can contain both successful and adverse contexts.

Check actual mechanisms, static field geometry, reactive partners, location errors, driving capability and scoring criteria using their own evidence. A physical delivery, its acceptance by another robot and scoring credit are separate claims. [Loaded mechanical transfer](loaded-transfer.md) · [Mission cohort](mission-cohort.md) · [Season strategy lab](season-meta-lab.md)
