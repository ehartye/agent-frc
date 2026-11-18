# Transfer CAD measurements into a simulation

Name the exact source file, revision, component or body identity, reference frame and units. Record which measurements came directly from CAD and which mass, density or friction values the team supplied. Include the uncertainty and omitted components.

Write a project-owned input contract containing the source digest, measured geometry, pin locations and transform into the robot frame. Reject a stale source, ambiguous body, missing datum or incompatible units before running code.

Exercise one independently predictable position or motion. Save expected and observed values and the difference. Use [native export checks](native-viewer-contracts.md) to match the exported object inventory, and [trace diagnostics](trace-diagnostics.md) to evaluate simulated feedback.
