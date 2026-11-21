// The order is the teaching sequence. A stage may send students back to an earlier decision.
export const stages = [
  {
    id: 'rules', milestone: 'Cited rules and field model', name: 'Model the game', question: 'What can a robot score, and when?',
    objective: 'Turn the release-day manual into a model of the game before drawing a robot. Count the pieces, locate them, identify scoring targets and split the match into useful time windows.',
    activity: 'Identify the governing manual and its edition before tracing a route from a starting location through a piece source to a scoring zone. Compare that route with the paths available to partners and opponents.',
    handoff: 'A dated game model with citations, piece inventory, field coordinates, phase lengths and a list of unknowns.',
    skills: ['frc-project-setup','frc-season','frc-case-study'], docs: [['Prepare a project rules model','docs/project-rules-model.md'],['Invented training profile','examples/kickoff/training-field.json']]
  },
  {
    id: 'field', milestone: 'Recorded pre-sim observations', name: 'Explore the field', question: 'What changes when the robot changes shape?',
    objective: 'Give students an adjustable box and a scale field. Try different widths, headings and approaches using the same manual edition.',
    activity: 'Play three robots on each alliance. Watch the front intake pursue a marked loose piece. Follow the hopper and live score as each delivered piece clears the feeder at the project’s modeled rate. Compare distinct opening assignments and wait times. Compare one more scoring trip with switching to a terminal objective. Change the switch time and the assumed support at assessment, then compare ordinary points, occupied slots and terminal awards on the same match clock.',
    handoff: 'Recorded poses, robot dimensions and student observations that the team can cite in its match story.',
    skills: ['frc-previsualization','frc-season'], docs: [['Kickoff field lab','docs/kickoff-field-lab.md'],['Match rehearsal','docs/field-rehearsal.md'],['Terminal objectives and shared capacity','docs/terminal-objectives.md']]
  },
  {
    id: 'story', milestone: 'Team-selected match narrative', name: 'Choose a match role', question: 'Which scoring cycle should our team own?',
    objective: 'Use the field observations to tell two plausible match stories. Compare the contribution each role could make, the time it needs, the work left for partners and a fallback.',
    activity: 'Replay a specialist and a complementary role against the same partners and opposition. Compare individual waits, available terminal slots and the alliance margin. Allocate the pieces likely to reach one robot in one window. Subtract time spent traveling and aligning. Compare the required pieces per second with a candidate loader’s repeatable cycle time.',
    handoff: 'A team-selected role, a repeatable cycle, a fallback and the assumption most likely to change the choice.',
    skills: ['frc-season-meta','frc-strategic-narrative','frc-case-study'], docs: [['Run the matched alliance role study','docs/season-meta-lab.md'],['Strategy decision workflow','docs/game-to-robot-strategy.md']]
  },
  {
    id: 'contract', milestone: 'Measurable robot requirements', name: 'Specify capabilities', question: 'What must the robot do for this story to hold?',
    objective: 'Translate each important part of the chosen cycle into a requirement with units, operating conditions and a measurable acceptance check.',
    activity: 'Specify the capture cadence. If route overlap exposes the intake, identify the contact direction and assumptions about speed, mass and compliance. Define which function must survive and how to check it afterward.',
    handoff: 'A capability contract tying each requirement to a rule, observation or assumption and a planned verification activity.',
    skills: ['frc-strategic-narrative','frc-mechanism-cad','frc-modes'], docs: [['Capability contract','templates/capability-contract.md'],['Follow stored pieces through a loaded gate','docs/storage-to-service.md'],['Impact-load example','docs/impact-load-envelope.md']]
  },
  {
    id: 'design', milestone: 'Fusion candidate and control design', name: 'Build a candidate', question: 'Which design can meet the contract?',
    objective: 'Export the focal robot’s finite scoring window from the field lab. Compare how different whole-robot architectures serve that window before allocating subsystems. Compare their resource use on the same nominal and adverse match cases. Keep geometry, sensor frames, actuator behavior and mode transitions together as the design changes.',
    activity: 'Author the selected candidate in Fusion using exact manufacturer models where available. Start with four-module swerve unless another drivetrain is specified. Compare supplier and shop-built options. Trace the optical path through the seated piece. Move it toward the exit and check whether the last port clears while the piece still rests on the mechanism.',
    handoff: 'A versioned CAD and control candidate, a named fallback, and testable subsystem interfaces.',
    skills: ['frc-whole-robot-design','frc-previsualization','frc-mechanism-cad','frc-java','frc-vision','frc-modes','frc-swerve'], docs: [['Set the frame and bumper outline','docs/frame-profile.md'],['Check a proposed Fusion placement','docs/checked-placement.md'],['Freeze the required parts before opening a donor','docs/article-functions.md'],['Compare whole-robot architectures','docs/whole-robot-comparison.md'],['Trace partner custody through the final reset','docs/alliance-completion.md'],['Compare shared electrical loads','docs/shared-power-review.md'],['Check sensor placement and release','docs/sensor-observability.md'],['Check a camera after the robot moves','docs/camera-reference.md'],['Trace installed parts and weight through successive revisions','docs/assembly-accounting.md'],['Compare native materials with the engineering bill','docs/engineering-material-mass.md'],['Editable design artifacts','docs/design-artifact.md'],['Subsystem contracts','docs/subsystem-contracts.md'],['Verify swerve placement and sensor frames','examples/swerve/README.md'],['Test shaft power and loaded motion','skills/frc-swerve/references/loaded-simulation.md']]
  },
  {
    id: 'verify', milestone: 'Test evidence and robot showcase', name: 'Test and revise', question: 'Which decision does the evidence support?',
    objective: 'Compare the installed scoring rate with the chosen role over its exact clock window. Freeze the trial settings and include a held-out case when refining the design. Test whether two supports can carry the weight while the robot still rotates about the line joining them. Trace every path through acceleration, hold and power loss. Record the exact candidate, inputs, observed result and limitations.',
    activity: 'Locate each installed mount against its drawing datums. Follow a piece from its donor onto the commissioned receiving support. Measure the load the receiver carries and the time the whole piece remains inside its intended region. Check the departing support for remaining contact. Check where every robot part travels as the mechanism extends, including at the scoring pose. A sensor may see the piece enter the goal while a slide strikes the field. Trace installed loads through structural hardware into the chassis. A nearby cover can hide a gap underneath a bracket. Compare the recorded path with the full robot and field inventories. Replay the same loaded trip against the other five robots on the match clock; locate the first occupied lane and trace which later handoffs are still reachable. Then shift the target map toward the tightest clearance. Compare the observer decision with the margin in an independent field frame.',
    handoff: 'Run the installed checks on the exact Fusion issue. Compare every installed body, test the service and operating paths, and show the governing load and repeated trials. Promote the model after its mechanical review passes.',
    skills: ['frc-mechanical-readiness','frc-mechanism-hardening','frc-robot-highlights','frc-setup','frc-troubleshoot','frc-java','frc-mechanism-cad','frc-vision'], docs: [['Check finite article motion, installed load balance and linked travel','docs/operating-intent.md'],['Check native mounts, material and revision changes','docs/mechanical-methods.md'],['Verify the published still and playable native motions','docs/mesh-correspondence.md'],['Run project checks and verify the final showcase locally','docs/project-ci.md'],['Check a loaded route against five frozen peers','docs/loaded-route.md'],['Check measured motion and momentum from retrieval through recovery','docs/loaded-transfer.md'],['Check the actual student mesh against every installed solid','docs/mesh-correspondence.md'],['Keep a native job reproducible through cold readback','docs/native-job.md'],['Find the current Fusion design and re-export its STEP','docs/fusion-authority.md'],['Qualify a candidate before replacing the public model','docs/mechanical-readiness.md'],['Reproduce a mechanical defect with the installed tools','docs/mechanical-methods.md'],['Protect the current public model','docs/private-model-release.md'],['Trace individual and shared failure paths','docs/lift-path-faults.md'],['Review powered travel, obstruction and unpowered holding','docs/actuator-duty-review.md'],['Resolve coupled support forces and all three moments','docs/coupled-support.md'],['Check supported robot weight and sustained scoring rate','docs/mechanism-hardening.md'],['Verify what the saved CAD still actually shows','docs/cad-capture-review.md'],['Inspect the model and time an observed result','docs/showcase-evidence.md'],['Play a series of complete matches','docs/match-series.md'],['Build a robot evidence page','skills/frc-robot-highlights/SKILL.md'],['Review a frozen mission cohort','docs/mission-cohort.md'],['Challenge the field reference','docs/field-references.md'],['Interpret the electrical margin','docs/shared-power-review.md'],['Check the route to a robot or game-piece observation','docs/field-route-evidence.md'],['Download a verified editable Fusion assembly','docs/public-fusion-handoff.md'],['Replay a saved native study','docs/native-study-replay.md'],['Verify Fusion volume and cut participants','docs/fusion-volume-study.md'],['Check hidden backing and bearing area','docs/hidden-backing-fit.md'],['Recorded release height','docs/recorded-release-height.md'],['Resolve the plugin runtime and check the experiment environment','docs/setup-health.md'],['Simulation selection','docs/simulator-selection.md'],['Resume a design investigation','docs/strategy-first-continuation.md']]
  }
];
export const purpose = {
  'frc-mechanical-readiness': 'Check installed parts, shop access and load paths, then compare the published still and moving model with the verified Fusion issue.',
  'frc-season-meta': 'Find when a different role improves the alliance result under shared supply, traffic and terminal capacity.',
  'frc-whole-robot-design': 'Compare original architectures under common constraints before selecting subsystems.',
  'frc-mechanism-hardening': 'Test the weakest load path and the repeatable match rate under perturbations and service recovery.',
  'frc-robot-highlights': 'Rotate the CAD assembly, inspect printed markings and watch mechanism motion. Publish the styled showcase and its source evidence on GitHub Pages.',
  'frc-swerve': 'Connect module geometry, two independent motions and feedback conventions to drivetrain verification.',
  'frc-season': 'Pin the season, applicable manual edition and source boundaries.',
  'frc-case-study': 'Trace game objectives through strategy, subsystems and engineering evidence.',
  'frc-previsualization': 'Explore field reach, robot space and reversible design comparisons.',
  'frc-strategic-narrative': 'Turn match roles into explicit stories and provisional requirements.',
  'frc-mechanism-cad': 'Develop the mechanism and its interfaces. Use the default component palette or the project’s overrides across Fusion, the README still and the showcase.',
  'frc-modes': 'Define autonomous, teleop, trigger and interruption behavior.',
  'frc-java': 'Implement and test the robot’s WPILib Java control behavior.',
  'frc-vision': 'Check sensor geometry, localization and targeting assumptions.',
  'frc-project-setup': 'Organize student projects and keep current Fusion CAD, experiments and published evidence easy to find.',
  'frc-setup': 'Check the toolchain for the experiment. For a combined CAD and simulation test, verify both libraries in the same Python process.',
  'frc-troubleshoot': 'Isolate faults and record the evidence that changes the diagnosis.'
};
