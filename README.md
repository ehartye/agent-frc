# agent-frc

Version **0.3.0** provides six season-aware FRC learning skills, an original runnable Java desktop laboratory, ten engineering worksheets and optional local-vault metadata lookup. Independent educational work; no FIRST or vendor endorsement.

- [Java laboratory](examples/java-2026-sim/README.md): Java 17, Gradle 8.11, WPILib 2026.2.1. Nineteen behavior tests plus a bounded demo passed on Windows x86-64. New [navigation exercises](examples/java-2026-sim/NAVIGATION.md) cover trajectories and delayed pose estimation.
- [Worksheets](worksheets/README.md): original blank templates for mechanisms, CAD/field, calibration, navigation, device evidence and source-file tracing.
- [Architecture and six skills](docs/architecture.md): season selection, Java, mechanism/CAD, vision, modes and troubleshooting, with public primary-source links.

## Metadata lookup

Node 20.11+; no Node dependencies. Run npm test and npm run validate.

`npm run lookup -- --season 2026 --as-of 2026-11-15 --topic trajectory`

Nine Node tests cover explicit configuration, bounded schema/size checks, allowlisted metadata, season selection and freshness labels. Lookup defaults to public links. FRC_VAULT_PATH must be explicitly configured to read a compatible local catalog; no guessed path, clone, upload or sync exists. It never returns source bodies or arbitrary catalog paths. --historical admits past seasons only. Reopen official sources before rules decisions.

## Boundaries

The laboratory has no robot deployment targets or physical I/O. Its ideal models and thresholds do not establish hardware readiness. The plugin is source-only: installation/host loading and human/agent effectiveness remain untested. No MCP server or cloud service exists.

2026 published/stable references remain separate from 2027 previews. Final 2027 game rules and production Systemcore compatibility remain unverified. See [validation](docs/validation.md), [grounding](docs/grounding.md) and [roadmap](docs/roadmap.md).

Original code/prose is MIT. FIRST materials remain link-only. Selected [third-party notices](examples/java-2026-sim/THIRD_PARTY.md) cover build/wrapper sources. Runtime dependencies download locally and are not bundled. No private catalog, team data or credentials are shipped.
