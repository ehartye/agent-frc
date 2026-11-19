# Define, check and iterate the operating space

Use this shared reference from previsualization, mechanism CAD or troubleshooting. It extends those skills rather than replacing strategy or adding another mandatory interview. Start from the student's selected narrative and existing design revision. Ask one consequential question at a time: “What must still work when the piece arrives off-center, worn, or while the robot is moving?” Offer a small first experiment and do routine artifact work yourself.

## 1. Define what must work, and what each boundary means

Name the task and observable outcome: acquire, retain during a specified motion, transfer, or release. Define coordinate frames, units, parts/versions, start state and state transitions. Separate commanded goals from measured/simulated states. Include simultaneous actions and realistic recovery paths, not only an ideal stopped robot.

Classify each limit by its source. Record physical stops, the governing rule and edition, component ratings and measured capabilities. Track the chosen study extent, supported model range and numerical guards separately. When a candidate exceeds the model range, its feasibility remains unknown. Extend the dependent obstacle filters and coverage before repeating the test. [Gates when connecting or changing models](simulator-selection.md#gates-when-connecting-or-changing-models)

## 2. Make variation and uncertainty explicit

Create a range table covering relevant position/orientation, speed, load, part dimensions, assembly alignment, wear, game-piece dimensions/stiffness/friction and sensor/actuator error. Label each value nominal, supplier limit, measured range, hypothesis or unknown. Link the exact drawing/edition or measurement and its conditions. Do not invent tolerances, assume a native simplified bore is a fit specification, or borrow a similar component variant's dimensions.

Distinguish manufacturing/assembly tolerance, dynamic deflection/backlash, game-piece variation, measurement uncertainty and numerical tolerance. Build the dimensional chain to the functional gap, pinch, reach or alignment. Use worst-case bounds where justified; use statistical combination only with documented distributions/correlations and an appropriate decision purpose. Preserve unknown correlations. A nominal positive gap smaller than unresolved uncertainty is not a verified clearance. Neither a collision margin nor a mesh tolerance is a physical manufacturing allowance.

## 3. Check the entire operating path

Compare original and candidate states over acquisition/feed, transitions, actuation travel and service/recovery access, including relevant intermediate poses. Include fixed supports, fasteners, cables and moving subassemblies, not just the contact patch. Vary coupled coordinates together: a held-pose preload check may miss interference while a game piece advances. Test both commanded and physically possible states; do not derive actual position solely from command angle.

Use the cheapest defensible check first: dimension chain, conservative volume, native geometry, numerical dynamics, then appropriately supervised physical evidence when separately authorized. State what each check can establish. Broadphase overlap is a candidate, not proven collision; a local contact patch is not retention; empty Boolean results with contradictory interior evidence remain unknown. Geometry, achievable force/work and state continuity are separate gates.

## 4. Save a small, revisable design artifact

Copy [the operating-space worksheet](../worksheets/operating-space.md) into the project's own CAD/code repository. Link strategy requirement IDs to parameters/volumes, tested states, source pins, results and next decisions. Keep editable CAD/blockout and pseudocode alongside the evidence, not only a screenshot. The worksheet is a human-reviewed sidecar, not an extension secretly inserted into the strict design-artifact JSON schema.

Record actual test commands and outcomes separately from proposed tests. Preserve rejected alternatives and negative controls. Classify findings as supported within scope, contradicted, unknown or not checked; avoid a blanket “passes” badge. Use trace:inspect for frozen supported trace receipts, with PARTIAL status, timestamps, missing fields and rejected trials visible. Its dashboard is evidence navigation, not acceptance automation.

## 5. Recheck what changed, then choose the next iteration

Maintain a change-impact list: changed source/parameter -> affected geometry, force model, controller/sensor logic, fabrication/assembly process, rules screen and tests. Mark dependent results stale before reusing them. Rebuild cached obstacle inventories if operating bounds change; preserve source/model identity, physical state/energy and controller tick phase for continuations. Compare numerical refinements at the same physical time, not mismatched midpoint and endpoint forces.

Recommend the smallest next change that separates competing explanations. For example, compare wider acquisition allowance with unchanged mechanics/controller before blaming the intake, or compare measured fit adjustments before redesigning the whole mechanism. Let the student choose consequential tradeoffs in weight, reliability, cycle time, fabrication effort and recovery. Design intent may change when evidence contradicts the strategy; neither CAD nor strategy is sacred.

Stop the iteration when the stated question is answered to its agreed evidence level, not when all conceivable tests are exhausted. Hand off unresolved conditions explicitly. No hardware operation, robot deployment, automatic adoption, rules certification or physical safety approval is granted by this reference.
