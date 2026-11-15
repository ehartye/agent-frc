# Implemented architecture

Version 0.5.1 contains six guidance skills, original worksheets, a pinned desktop-only WPILib Java lesson, dependency-free context inspection and a read-only metadata selector and deterministic workflow-brief generator. No MCP server, cloud service or installed host integration exists.

Public mode reads the small public reference list. Explicit FRC_VAULT_PATH mode uses the bounded catalog loader; it rejects catalog symlinks, unsupported schema and oversized files. Lookup requires a season and as-of date, preserves preview/stale labels, and returns allowlisted metadata only. It never reads capture bodies or arbitrary paths stored in a record, and performs no network request or upload.

The Java laboratory has a simulated flywheel plant, command scheduler, readiness gate, bounded virtual-time demo, ideal trajectory controller and delayed-pose regression exercises and pure-state command cleanup tests. It instantiates no real actuator/network control devices and has no deployment targets. Dependency artifacts are downloaded for local builds, not repackaged for distribution.

Future full-text retrieval, richer semantic matching, production-controller support and live hardware integration are not implemented.

The brief module interleaves query results, limits source display, exposes unmatched queries and labels its output as metadata/checklist evidence. Its pinned lab baseline is not compatibility certification for another season.
