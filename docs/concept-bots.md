# Describe and rehearse a concept bot

A concept bot is one candidate robot for conceptual design, written as one JSON document. It records the body, the swerve drive, the faces that pick pieces up and the outputs that place or shoot them. Every number carries a label and a basis. The Field Lab then drives the robot the way that robot would drive. It accelerates, rotates, acquires only through its declared input faces and scores only from poses its outputs can reach.

The project owns each document. The plugin ships only invented examples: [a turret shooter](../examples/concept-bots/turret-shooter.json), [a fixed shooter](../examples/concept-bots/fixed-shooter.json) and [a front-intake placer](../examples/concept-bots/front-intake-placer.json). Replace every number in them with the team's own evidence or a labelled assumption.

## Format and units

The schema is `agent-frc/concept-bot@1`. Units are inches, seconds and degrees, as in the field rehearsal. Plan angles are measured counterclockwise from +x. A face is `front`, `back`, `left` or `right`. Each face turns its normal 0°, 180°, +90° or −90° from the robot heading. The validator rejects any field the format does not define.

Every physical number is one of two shapes:

| Shape | JSON | Use |
| --- | --- | --- |
| Quantity | `{"value": 180, "label": "assumed", "basis": "…"}` | One value |
| Range | `{"min": 200, "max": 400, "label": "assumed", "basis": "…"}` | A band. `min` must not exceed `max`. A fixed value is `min == max` |

`label` is `required` (a rule or a team decision), `assumed` (a placeholder or an estimate) or `observed` (measured on hardware or in a test). `basis` states where the number came from. An elevation or turret range also carries `slewDegS`, a quantity. An adjustable range needs `slewDegS`. A fixed one can give `null` or omit it.

## Fields

| Field | Contents |
| --- | --- |
| `schema`, `id`, `name`, `basis` | The schema string. An ID of letters, digits, dot, dash or underscore. A name. Where the concept came from |
| `body` | `frameLengthIn`, `frameWidthIn`, `bumperIn`, `stowedHeightIn`, `maxHeightIn` (not below the stowed height) and `maxReachIn`, the greatest extension beyond the frame perimeter. An optional `frameProfile` uses the [frame profile](frame-profile.md) kinds |
| `massLb` | An optional range in pounds. See [Mass is a range](#mass-is-a-range) |
| `drive` | `type: "swerve"` plus `topSpeedInS`, `accelInS2` and `rotationDegS`. Version 1 admits only swerve |
| `inputs[]` | Each has `id`, `face`, `widthIn` (it must fit the bumpered face), `extensionIn` beyond the bumper, `pieces[]`, `headingToleranceDeg`, `acquireHeightIn {min,max}`, `secondsPerPiece` and `requiresStop` |
| `storage` | `capacity`, a quantity for each piece type, and `transferS`, the time from acquisition until the piece is ready at an output. Every piece type a port handles needs a capacity |
| `outputs[]` | Each has `id`, `face`, `kind` (`place` or `ranged`), `pieces[]`, `secondsPerPiece`, `requiresStop` and `successFraction`, the share of releases that score |
| `outputs[].place` | `standOffIn {min,max}` from the face to the target, `headingToleranceDeg` and `releaseHeightIn {min,max}` |
| `outputs[].ranged` | `releaseHeightIn` and `launchSpeedInS {min,max}`. `elevationDeg {min,max,slewDegS}`. `turret`: `null`, or `{min,max,slewDegS}` in degrees from the face normal, with travel that includes 0. `aimToleranceDeg`. `firesWhileMoving`: `false`, or `{maxRobotSpeedInS, successFraction}`, whose fraction replaces the port's own while the robot moves. An output with `requiresStop: true` must set `firesWhileMoving` to `false` |
| `concurrency` | `intakeWhileScoring`, true or false. It is recorded for preliminary design; the version 1 rehearsal does not use it (see [What the model leaves out](#what-the-model-leaves-out)) |
| `defaultsApplied` | Written by the tools, not by hand: the fields a profile filled in, currently only `massLb` with `"default": true` |

Port IDs are unique across inputs and outputs. The validator stops at the first problem and names its field path, for example `drive.topSpeedInS: is required.`

## Validity ranges

Each number must lie inside its range. Capacities are whole numbers. These ranges are wide on purpose. They reject a typing error and mark the open side of a premise, and they are not design advice.

| Field | Range |
| --- | --- |
| `body.frameLengthIn`, `body.frameWidthIn` | 1 to 300 |
| `body.bumperIn` | 0 to 12 |
| `body.stowedHeightIn`, `body.maxHeightIn` | 1 to 300 |
| `body.maxReachIn` | 0 to 300 |
| `massLb` | 0 to 500 |
| `drive.topSpeedInS` | 1 to 500 |
| `drive.accelInS2`, `drive.rotationDegS` | 1 to 2000 |
| `inputs[].widthIn` | 1 to 300 |
| `inputs[].extensionIn`, `inputs[].acquireHeightIn` | 0 to 300 |
| `inputs[].headingToleranceDeg` | 0 to 180 |
| `inputs[].secondsPerPiece`, `outputs[].secondsPerPiece` | 0.01 to 60 |
| `storage.capacity.*` | 1 to 50, whole |
| `storage.transferS` | 0 to 60 |
| `outputs[].successFraction`, `outputs[].ranged.firesWhileMoving.successFraction` | 0 to 1 |
| `outputs[].place.standOffIn`, `outputs[].place.releaseHeightIn`, `outputs[].ranged.releaseHeightIn` | 0 to 300 |
| `outputs[].place.headingToleranceDeg`, `outputs[].ranged.aimToleranceDeg` | 0 to 180 |
| `outputs[].ranged.launchSpeedInS` | 1 to 2000 |
| `outputs[].ranged.elevationDeg` | −90 to 90 |
| `outputs[].ranged.turret` | −180 to 180 |
| `outputs[].ranged.elevationDeg.slewDegS`, `outputs[].ranged.turret.slewDegS` | 1 to 5000 |
| `outputs[].ranged.firesWhileMoving.maxRobotSpeedInS` | 1 to 500 |

## Default swerve bounds

Start a drive from these bounds when the team has no module, gearing or current limit yet. Label each value `assumed` and cite these sources in its basis. Replace the bounds with the project's own module, gear ratio, wheel and current limits as soon as those are chosen.

| Field | Bound | What it stands for |
| --- | --- | --- |
| `topSpeedInS` | 120–240 in/s (10–20 ft/s) | About 80% of the free speed of current purchased modules |
| `accelInS2` | 150–400 in/s² (3.8–10.2 m/s²) | Above the planners' gentle path defaults and below the traction limit, once current limits apply |
| `rotationDegS` | 180–540 deg/s | The rotation caps shipped in planners and library examples |

**Top speed.** Purchased modules reach roughly 12.5 to 25 ft/s free speed, depending on the module, the ratio and the motor. See the manufacturers' ratio options: [SDS MK4i](https://www.swervedrivespecialties.com/products/mk4i-swerve-module), [SDS MK4n](https://www.swervedrivespecialties.com/products/mk4n-swerve-module), [REV MAXSwerve gear ratio kit](https://www.revrobotics.com/rev-21-3008/), [WCP Swerve X2](https://docs.wcproducts.com/welcome/gearboxes/wcp-swerve-x2/general-info/ratio-options), [WCP Swerve X2S](https://docs.wcproducts.com/welcome/gearboxes/wcp-swerve-x2s/general-info/ratio-options) and [Thrifty Swerve](https://www.thethriftybot.com/products/thrifty-swerve). Motor free speeds come from [WCP's brushless motor data](https://docs.wcproducts.com/welcome/frc-build-system/electronics-and-pneumatics/brushless-motors) and [REV's motor comparison](https://docs.revrobotics.com/brushless/neo/compare). Choreo recommends about 80% of free speed as a usable maximum ([Choreo robot configuration](https://choreo.autos/document-settings/robot-configuration/)). PathPlanner asks for the true maximum speed under load ([PathPlanner robot config](https://pathplanner.dev/robot-config.html)). Eighty percent of 12.5–25 ft/s is 10–20 ft/s.

**Acceleration.** Traction limits acceleration to the wheel friction coefficient times g ([Choreo theoretical panel](https://raw.githubusercontent.com/SleipnirGroup/Choreo/717f5f151b1a644a7ca6f6e41886e8d152752482/src/components/config/robotconfig/TheoreticalPanel.tsx)). The planners' default coefficients are 1.2 ([PathPlanner defaults](https://raw.githubusercontent.com/mjansen4857/pathplanner/e02bbf3176588166e8fe5192ab8dea85f6d62f7a/lib/util/prefs.dart)) and 1.5 ([Choreo defaults](https://raw.githubusercontent.com/SleipnirGroup/Choreo/717f5f151b1a644a7ca6f6e41886e8d152752482/src/document/RobotConfigStore.ts)), which give about 460–580 in/s². Current limits cut the deliverable torque well below that ([CTRE current limits](https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/improving-performance-with-current-limits.html)). The path defaults of 3 m/s² (about 118 in/s²) sit below the bound: PathPlanner's defaults above, and the [WPILib swerve controller example](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibjExamples/src/main/java/edu/wpi/first/wpilibj/examples/swervecontrollercommand/Constants.java).

**Rotation.** The [WPILib swerve example](https://raw.githubusercontent.com/wpilibsuite/allwpilib/v2026.2.1/wpilibjExamples/src/main/java/edu/wpi/first/wpilibj/examples/swervebot/Drivetrain.java) caps rotation at half a turn per second (180 deg/s). The [CTRE Phoenix 6 swerve example](https://raw.githubusercontent.com/CrossTheRoadElec/Phoenix6-Examples/b5d4978b3ee59bf463dc19281648ed06a2d74190/java/SwerveWithPathPlanner/src/main/java/frc/robot/RobotContainer.java) caps it at three quarters of a turn (270 deg/s). The PathPlanner defaults above cap it at 540 deg/s. These are drivability caps, below what the wheels could reach.

## Mass is a range

`massLb` is a budget, never an input to the motion. When a concept has no `massLb` and the profile has `rehearsal.robotLimits.massLb`, the range defaults to 75–95% of that inspection limit. The default is labelled `assumed`, carries `"default": true`, and its basis names the limit's `factId`. With a 100 lb limit it is 75–95 lb.

The default assumes the robot will be built close to the limit, holding about 5% back for late additions. It says nothing about this concept's mechanisms. The agent proposes it, says what it assumes and asks the student for evidence that narrows or shifts it. Useful evidence includes known component or kit masses, a module and battery count, or a comparable earlier build. The agent then writes the refined range into the document with its basis, labels it `observed` or `assumed`, and removes `default`. Without a limit and without an estimate, mass stays `unresolved` and the concept is still valid.

## Robot limits and entry regions in the rules model

Two optional additions to the [project rules model](project-rules-model.md) let a concept be checked against the game. Each value names the rule-register fact that supports it with a `factId`. `rules compile` carries both, and each fact's JSON pointer reaches into them.

- `rehearsal.robotLimits` lists `perimeterIn`, `startingHeightIn`, `maxHeightIn`, `maxExtensionIn` and `massLb`. Each is `{value, factId}` with a positive value, or `null` when the rule is unknown. All five keys are required, and `maxHeightIn` must not be below `startingHeightIn`.
- A scoring station may carry an `entry`, the opening a scored piece must pass through:
  - a **window**: `{centerIn:[x,y,z], kind:"window", widthIn, heightIn, facingDeg, factId}`. `facingDeg` is the plan direction the opening faces, toward the side a robot shoots from.
  - a **ring**: `{centerIn:[x,y,z], kind:"ring", radiusIn, factId}`, a horizontal opening entered from above.

A ranged output aimed at a target without an `entry` cannot score. A place output at such a target works as before, and its release height is not checked. The [training field](../examples/kickoff/training-field.json) carries invented limits and two mirrored windows.

## The drag-free arc check

`scripts/concept-arc.mjs` decides whether a ranged output can score from a pose. A piece is a sphere of its radius that flies a parabola under 386.09 in/s² of gravity, with no drag, spin or contact. The robot's velocity is added to the launch velocity.

- A **window** passes when the piece centre crosses the window plane from the side it faces. The crossing must lie inside the opening, shrunk by the piece radius on every side.
- A **ring** passes when the piece descends through the ring plane within `radiusIn` minus the piece radius of its centre.

`arcCheck(release, target, port, robotVelocity)` searches the port's elevation and speed ranges. It solves speed exactly at each elevation and steps elevation by 0.05°. It returns the most centred arc as `{feasible:true, elevationDeg, speedInS, flightS}`, or `{feasible:false, reason}`. A reason names the cause, such as an entry above the reachable apex, the release behind a window, or an arc outside the elevation or speed range. `standOffBand(entry, pieceRadiusIn, port, releaseHeightIn, approachDeg)` scans stationary releases 0–600 in from the entry in 1 in steps, aimed at its centre. It returns the feasible distance bands. A window's default approach is opposite its facing. A ring is the same from every direction. `createArcModel()` returns the same functions from one self-contained factory, which the Field Lab page inlines.

**Piece radius.** The rehearsal and `concept:check` share one rule, `pieceRadiusFor(stations, pieceType)` in the arc model. The radius of a piece type is the `radiusIn` of the first `retrieval` station of that type whose `floor` or `service` gives a finite, positive radius. Without one the piece is treated as a point. That widens every band, so the rehearsal narrative reports `<robot> piece radius unknown for <type>; arc check assumes 0.` Give a loose or staffed source its physical radius to remove the notice.

## How a concept robot behaves in the rehearsal

A robot named with `concept: "<id>"` on `rehearsal.defaults` or a roster row takes the compiled record: its body, its speed and its ports. A robot without one behaves exactly as before, with a fixed heading, a constant speed and the optional front `intake`.

- **Motion.** Each leg follows a trapezoidal speed profile that accelerates at `accelInS2` up to `topSpeedInS` and stops at the leg end. The heading turns the shorter way toward the leg's required heading at up to `rotationDegS` while the robot translates. The ports set that heading on acquisition and scoring legs. A program step can also set it with `requiredHeading`: degrees in the field frame, between −360 and 360, read only by concept robots. The leg ends when both are done. Speed never changes faster than `accelInS2`. Told to hold, or to end a leg while moving, the robot brakes along its last direction of travel at no more than `accelInS2`, so it can run slightly past a goal it cannot stop at. Only a blocked move stops it at once. In any tick in which the heading changes, the robot occupies the circle that circumscribes its footprint and bumpers. On a port leg, where the rehearsal chooses the heading, a turn blocked only by a wall or obstacle lets the robot keep driving at its present heading and turn once its circumscribed circle is clear. A turn blocked by another robot, or one required by an authored step's `requiredHeading`, is still a wait.
- **Acquisition.** For a loose or staffed source the robot chooses the piece, input port and heading that arrive soonest. The face normal is set on the approach bearing. Contact counts when the piece touches that face's mouth within `headingToleranceDeg` and the piece height lies in `acquireHeightIn`. A side or back mouth sits half the width or length, plus the bumper, plus `extensionIn`, from the centre. With `requiresStop: true` the `secondsPerPiece` clock starts once the robot is still in contact, and the robot holds there. With `requiresStop: false` the piece leaves the field on contact at any speed and lands aboard `secondsPerPiece` later. The acquisition event is logged when it lands, with `startedS` set to the contact time. The robot drives straight on toward its next pickup or the leg's next goal without stopping. It aims its mouth one piece radius past the piece so that contact comes on the move, and that port takes its next piece only after the interval.
- **Fixed sources.** At a source without `floor` or `service`, the station's `at` stands in for the piece. The robot picks the compatible input port that arrives soonest, drives halfway in from the station radius on the bearing toward `at`, and turns that face toward `at`. Stock moves only while the robot centre is inside the station (its radius, or `areaIn` when it has one) and the face is within `headingToleranceDeg` of the bearing from the centre to `at`. A misaligned robot takes nothing. The `secondsPerPiece` clock starts on the first tick the robot is inside and aligned, and restarts if it leaves or loses alignment. With `requiresStop: true` it starts only once the robot is still. With `false` it runs whether or not the robot moves.
- **Storage.** Capacity is per piece type. A piece can leave through an output only `transferS` after its acquisition.
- **Output choice.** The scoring port is the first output that can serve the target: a place output whose `releaseHeightIn` covers the entry height, or that scores at a target with no entry, or a ranged output when the target has an entry.
- **Place outputs.** The robot drives to put its face at the band minimum from the station centre, facing the target. It releases when the face point lies inside `standOffIn` and the heading is within tolerance. When the target has an `entry`, the release-height range must include the entry height. A place release made on the move is recorded with `moving: true` and still scores the port's own `successFraction`.
- **Ranged outputs.** The release point is the centre of the output face's bumper surface at `releaseHeightIn`: the robot centre plus half the length (front or back) or half the width (left or right), plus the bumper, along the face normal. Stand-off bands are distances from that face point. A ranged leg chooses its shooting heading first, then places the goal so the output face at that heading sits at the chosen band distance on the approach line. If the face is already inside a band at the start of the leg, the robot stays put. Otherwise the face stops 1 in inside the nearest band edge, or at the middle of a band narrower than 2 in. Without a turret the shooting heading is face-on to the target. A turret robot weighs two headings: its present heading when the target bearing lies inside the turret's travel (otherwise the smallest turn that brings it inside), and the face-on heading. It takes the one with the earlier first shot, timed as the larger of the drive, turn and turret-slew times, and the present heading on a tie. On the way it holds that heading while the bearing stays inside the turret's travel. A shooter with `firesWhileMoving` may also release on the way whenever it is at or below `maxRobotSpeedInS`, on target and the arc, including the robot's velocity, passes. The capability therefore never delays the first release. An output with `requiresStop: true` never releases while moving. A start behind a window approaches straight on toward its facing side. The leg gives up with "found no arc" only from a settled pose: arrived and still, with the body turn and both the turret and elevation slews finished. A robot still turning or slewing keeps trying. Each ranged release event records that point as `pose.releaseIn`.
- **Aim.** Aim is measured about the robot centre: the face normal, plus the turret angle when there is one, must be within `aimToleranceDeg` of the bearing to the entry. Each match starts with every turret at 0° and every elevation at its `min`. Aim persists between shots. The turret slews toward the target bearing, within its travel, while the body holds the shooting heading chosen for the leg. A robot without a turret turns its face onto the target within `aimToleranceDeg`. The elevation slews toward the best arc from the current pose. A shot needs the aim on target, a feasible arc at the current elevation and, while moving, `firesWhileMoving` with the robot under its cap.
- **Rates and credit.** Each port's `secondsPerPiece` sets its rate. A concept robot ignores a program step's `dwell`, `quantity` and `deliveryRatePerS`, and the narrative says so. A credited release scores the target's points × the port's `successFraction`, or × the moving fraction while moving. A release on a step with no `outcome` is `unresolved`, as for a robot without a concept. The piece leaves the robot either way and follows the profile's `returns` rules. The scoreboard and narrative carry these fractional expected points.

The narrative download records each concept's ID and digest, the port used for each event and the success fraction. It also records each notice: an ignored step rate, "no entry region", a release height that misses the entry, no feasible stand-off, no arc from a settled pose, a missing port and an unknown piece radius.

## Check a concept

From the plugin checkout, or from the team project with the installed plugin's script:

```sh
npm run concept:check -- concept.json --profile rules-model.json
node "<plugin>/scripts/concept-check.mjs" concept.json --profile rules-model.json
```

The command prints a JSON report. It exits 0 when the concept is valid, even with an exceeded limit. It exits 2 for invalid input or an unreadable file, and prints the validator's field-naming message. `--profile` is optional.

| Report field | Contents |
| --- | --- |
| `valid`, `concept`, `digest` | The result, the concept ID and its digest |
| `labels` | How many values carry each label, counted after profile defaults |
| `limits` | `perimeter`, `startingHeight`, `maxHeight`, `extension` and `mass`, each `within`, `exceeds` or `unresolved` |
| `limitValues` | The concept's value and the `{value, factId}` limit behind each status |
| `mass` | `min`, `max`, `label`, `basis`, `default` and `shareOfLimit` (max ÷ limit, or `null`) |
| `ports` | For each ranged output and each scoring station that accepts one of its pieces: `standOffBand` with the piece radius used and `measuredFrom: "output face"`, or `status: "unresolved"` with `reason: "no entry region"`. Band distances run from the release point on the output face, the same point the rehearsal shoots from |

The perimeter is the length of the frame outline in plan, in inches, without bumpers. The outline is the concept's `frameProfile`, else the project's, else a rectangle. The starting height compares `stowedHeightIn` with `startingHeightIn`. The maximum height compares `maxHeightIn` with `maxHeightIn`, extension compares `maxReachIn` with `maxExtensionIn`, and mass compares the range's `max` with `massLb`.

## Rehearse it in the Field Lab

Pass each concept file to kickoff with a repeatable `--concept`:

```sh
node "<plugin>/scripts/kickoff.mjs" --profile rules-model.json --concept turret.json --concept placer.json --output field.html
```

Kickoff validates each file and fills in profile defaults such as the mass range, listing them in `defaultsApplied`. It compiles the concept and appends `{document, record}` to `rehearsal.concepts`. A duplicate ID is refused. When the profile is reopened, each document is validated again and each record is compiled again; a record edited by hand is rejected. A `concept` reference to an ID that is not embedded is also rejected.

In the lab, each robot card has a **Concept bot** choice. Choosing one keeps the robot's plans. Choosing none restores its prism. Gold bars mark input mouths and mint bars mark output faces. A dashed wedge shows a turret's travel and its solid ray the current aim. A white arrow shows each concept robot's heading, which turns during playback. [Kickoff field lab](kickoff-field-lab.md) · [Match rehearsal](field-rehearsal.md)

**Digest.** A concept's digest is the SHA-256 of the source document's canonical JSON, with keys sorted. Fields a profile filled in, and the `defaultsApplied` list itself, are left out. One file therefore has one digest under any profile, and the narrative's digest identifies the file the student wrote.

## What the model leaves out

- `concurrency.intakeWhileScoring` is recorded for preliminary design but has no effect in the version 1 rehearsal, because a robot runs one leg at a time.
- No drag, spin or contact on release. The arc check is a screen, not a trajectory prediction.
- One success fraction per port, plus one while moving. Accuracy does not vary with range.
- No input trajectory and no piece orientation at pickup. Acquisition is modelled by face, heading tolerance, mouth geometry and `acquireHeightIn`.
- Mass is a budget only and never changes the motion.
- Collision while rotating is conservative: a turning robot occupies its whole circumscribed circle.
- Motion is optimistic. Acceleration follows a trapezoid with no traction or current model. Rotation runs independently of translation, although a real swerve at top speed has less wheel speed left to turn, so fast turning sprints come out too quick.
- Swerve only in version 1. Tank, mecanum, underbody and top acquisition faces, defence and pushing are not modelled.

Every number is a premise to test. A concept that wins on assumed numbers has only shown which assumptions to measure first.
