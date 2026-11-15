# Rulebook-to-robot case-study workflow

Start with one season: [2024](2024/README.md), [2025](2025/README.md), [2026](2026/README.md). Never combine their requirements. These original case studies implement a narrow mechanism/control slice while documenting the remaining whole-robot work.

1. **Freeze evidence.** Record official manual URL, retrieval date, section versions and applicable updates/Q&A. The selected paragraphs are not a complete rules review. No manual bodies are bundled.
2. **Compare strategies.** List scoring/task opportunities, constraints, alliance roles, reliability and development cost. Label proposed choices and assumed numbers.
3. **Allocate subsystems.** Define sensors, commands, outputs, mechanical interfaces, units, ownership, mode transitions and failure behavior. Include drive, power, control and safety even when outside the runnable slice.
4. **Implement a vertical slice.** Run the pinned Java controller and plant tests before connecting any physical IO. Keep season policy separate from actuator control.
5. **Design in CAD.** Use named parameters and a dimension/assumption register. Generate the concept sideplate, run the Fusion script, inspect/interference-check, export STEP/F3D and reopen. Current Fusion execution is blocked by sign-in failure; generated DXF/SVG are the completed portable artifacts.
6. **Validate in simulation.** Couple declared CAD assumptions to plant parameters, exercise nominal and fault cases, and report what the model omits. Passing idealized tests does not validate launch accuracy, structural strength, collision clearance or physical safety.
7. **Review before hardware.** Close rule, drawing, electrical, mechanical restraint and test-procedure gaps with qualified mentors. This project has no deploy or hardware operations.

Run `npm run case -- --season 2025` for the exact case manifest. Run `npm run cases:validate` for cross-file trace/parameter checks. These are deterministic data checks, not an LLM evaluation.

Status and results belong in [validation](validation.json). Native CAD and full robot/field simulation must remain unexecuted until evidence exists.
