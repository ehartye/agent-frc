// The order is the teaching sequence. A stage may send students back to an earlier decision.
export const stages = [
  {
    id: 'rules', name: 'Model the game', question: 'What can a robot score, and when?',
    objective: 'Turn the release-day manual into a model of the game before drawing a robot. Count the pieces, locate them, identify scoring targets and split the match into useful time windows.',
    activity: 'Trace a possible path from a starting location to a piece source and then to a scoring zone. Compare it with paths available to partners and opponents. A crossing suggests a traffic exposure to investigate.',
    handoff: 'A dated game model with citations, piece inventory, field coordinates, phase lengths and a list of unknowns.',
    skills: ['frc-season','frc-case-study'], docs: [['Prepare a project rules model','docs/project-rules-model.md'],['Invented training profile','examples/kickoff/training-field.json']]
  },
  {
    id: 'field', name: 'Explore the field', question: 'What changes when the robot changes shape?',
    objective: 'Give students an adjustable box and a scale field. Try different widths, headings and approaches using the same manual edition.',
    activity: 'Change the box dimensions, then assign routes to red and blue robots. Watch the match clock and queue markers. Save the crossing, time lost and exposed capture mechanism as evidence for the match story.',
    handoff: 'Recorded poses, robot dimensions and student observations that the team can cite in its match story.',
    skills: ['frc-previsualization','frc-season'], docs: [['Kickoff field lab','docs/kickoff-field-lab.md'],['Match rehearsal','docs/field-rehearsal.md']]
  },
  {
    id: 'story', name: 'Choose a match role', question: 'Which scoring cycle should our team own?',
    objective: 'Use the field observations to tell two plausible match stories. Compare the contribution each role could make, the time it needs, the work left for partners and a fallback.',
    activity: 'Allocate the pieces likely to reach one robot in one window. Subtract time spent traveling and aligning. Compare the required pieces per second with a candidate loader’s repeatable cycle time.',
    handoff: 'A team-selected role, a repeatable cycle, a fallback and the assumption most likely to change the choice.',
    skills: ['frc-strategic-narrative','frc-case-study'], docs: [['Strategy decision workflow','docs/game-to-robot-strategy.md']]
  },
  {
    id: 'contract', name: 'Specify capabilities', question: 'What must the robot do for this story to hold?',
    objective: 'Translate each important part of the chosen cycle into a requirement with units, operating conditions and a measurable acceptance check.',
    activity: 'Specify the capture cadence. If route overlap exposes the intake, identify the contact direction and assumptions about speed, mass and compliance. Define which function must survive and how to check it afterward.',
    handoff: 'A capability contract tying each requirement to a rule, observation or assumption and a planned verification activity.',
    skills: ['frc-strategic-narrative','frc-mechanism-cad','frc-modes'], docs: [['Capability contract','templates/capability-contract.md'],['Impact-load example','docs/impact-load-envelope.md']]
  },
  {
    id: 'design', name: 'Build a candidate', question: 'Which design can meet the contract?',
    objective: 'Compare a small set of mechanism and control alternatives. Keep geometry, sensor frames, actuator behavior and mode transitions together as the design changes.',
    activity: 'Carry a selected blockout into CAD. Specify where the sensor sees the piece, what the controller commands, and how the robot behaves when a piece jams or a command is interrupted.',
    handoff: 'A versioned CAD and control candidate, a named fallback, and testable subsystem interfaces.',
    skills: ['frc-previsualization','frc-mechanism-cad','frc-java','frc-vision','frc-modes','frc-swerve'], docs: [['Editable design artifacts','docs/design-artifact.md'],['Subsystem contracts','docs/subsystem-contracts.md'],['Swerve Fusion sample','examples/swerve/README.md']]
  },
  {
    id: 'verify', name: 'Test and revise', question: 'Which decision does the evidence support?',
    objective: 'Test the assumption with the greatest consequence for the design. Record the exact candidate, inputs, observed result and limitations.',
    activity: 'Choose the smallest experiment that distinguishes the candidates. If it fails, trace the result back to the capability and match story. A returning team can reopen that record and choose its next test.',
    handoff: 'A result tied to the tested revision, the team’s next decision and any remaining physical verification.',
    skills: ['frc-setup','frc-troubleshoot','frc-java','frc-mechanism-cad'], docs: [['Recorded release height','docs/recorded-release-height.md'],['Simulation selection','docs/simulator-selection.md'],['Resume a design investigation','docs/strategy-first-continuation.md']]
  }
];
export const purpose = {
  'frc-swerve': 'Connect module geometry, two independent motions and feedback conventions to drivetrain verification.',
  'frc-season': 'Pin the season, applicable manual edition and source boundaries.',
  'frc-case-study': 'Trace game objectives through strategy, subsystems and engineering evidence.',
  'frc-previsualization': 'Explore field reach, robot space and reversible design comparisons.',
  'frc-strategic-narrative': 'Turn match roles into explicit stories and provisional requirements.',
  'frc-mechanism-cad': 'Develop the mechanism, its interfaces and the CAD evidence it needs.',
  'frc-modes': 'Define autonomous, teleop, trigger and interruption behavior.',
  'frc-java': 'Implement and test the robot’s WPILib Java control behavior.',
  'frc-vision': 'Check sensor geometry, localization and targeting assumptions.',
  'frc-setup': 'Check the toolchain needed for the chosen experiment.',
  'frc-troubleshoot': 'Isolate faults and record the evidence that changes the diagnosis.'
};
