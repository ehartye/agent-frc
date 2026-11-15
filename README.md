# agent-frc

Version **0.2.0**: six season-aware FRC learning skills, an original runnable Java desktop lesson, seven engineering worksheets, and explicit optional local-vault metadata lookup. Independent educational work; no FIRST/vendor endorsement.

## Runnable learning tools

- [Java 2026 desktop lesson](examples/java-2026-sim/README.md): Java 17, Gradle 8.11 and WPILib 2026.2.1; ten behavior tests plus a bounded headless simulation passed on Windows x86-64. [Execution evidence](examples/java-2026-sim/VALIDATION.md).
- [Worksheets](worksheets/README.md): mechanism experiments, mode acceptance, calibration, drawings, motion, interference and field geometry. These are blank templates, not completed inspections.
- [Skills](docs/architecture.md): season selection, Java, mechanism/CAD, vision, modes and troubleshooting.

## Metadata lookup

Node 20.11+ (tested with Node 25.0.0); no Node dependencies. Run `npm test`, `npm run validate`, or `npm run lookup -- --season 2026 --as-of 2026-11-15 --topic Java`. Nine Node tests cover privacy boundaries, schema/size rejection, explicit season selection, preview/freshness labels and historical filtering.

By default lookup uses only bundled public links. Set FRC_VAULT_PATH explicitly to inspect a compatible local catalog; no guessed path, automatic clone, upload or sync exists. Lookup returns allowlisted metadata, never source bodies or arbitrary catalog paths. --historical admits earlier seasons only. Re-open official sources before making a rules decision.

## Boundaries

The desktop lesson has no robot deployment targets or physical I/O. It demonstrates synthetic behavior, not robot readiness. This source package has not been installed or host-load tested. Human/agent skill-effectiveness prompts remain proposed. No MCP server or cloud service is present.

2026 published/stable references and 2027 development previews remain separate. Final 2027 game rules and production Systemcore compatibility are unverified. See [grounding policy](docs/grounding.md), [architecture](docs/architecture.md), [validation](docs/validation.md) and [roadmap](docs/roadmap.md).

Original code/prose is MIT. FIRST materials remain link-only; selected build/wrapper notices are retained under the lesson’s [third-party notice](examples/java-2026-sim/THIRD_PARTY.md). Runtime dependencies download during local builds and are not bundled. Private vault records and team data are not shipped.
