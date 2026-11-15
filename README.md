# agent-frc

A source-only, early FRC education plugin project. Six skills cover season selection, Java/WPILib, mechanisms and Fusion CAD, vision, teleop/autonomous, and troubleshooting. It supplies original workflows and public source links. It is not affiliated with or endorsed by FIRST or the referenced maintainers.

**Version 0.1.0 is a staged foundation.** No plugin has been installed, no robot code built and no hardware operated. The context utility and package checks are locally tested; skill effectiveness and host installation remain unevaluated.

## Use the source

Read a skill under skills/ and [grounding policy](docs/grounding.md). Root plugin.json provides the portable manifest; .claude-plugin and .codex-plugin contain compatibility metadata. There is no MCP service, network client, robot deployment command or background task.

Node 20.8+ runs `npm test` and `npm run validate` with no dependencies. `npm run context` prints public-reference-only mode by default. To inspect a vault, explicitly set FRC_VAULT_PATH to its root; the utility reads only the expected source catalog and reports counts/versions, not source bodies. The configured path is never printed or embedded.

## Seasonal boundary

Snapshot: 2026-11-15. 2026 REBUILT TU22 and WPILib 2026.2.1 are the observed published/stable references. 2027 BIOCORE previews and Systemcore announcements are draft transition context; final 2027 game rules were not verified. Always recheck official sources before a rules-sensitive answer or software selection.

## Optional private grounding

The plugin works without a vault. No private repository URL, team data or private catalog is bundled. An explicitly configured local vault stays separate; this code performs no upload, cloning or sync. See [interface contract](docs/grounding.md), [architecture](docs/architecture.md), [evaluation cases](eval/cases.json) and [roadmap](docs/roadmap.md).

Original plugin content is MIT. Linked materials retain their own rights; FIRST manuals/assets are link-only. Public links and file metadata are not permission to copy manuals, CAD, images or code.
