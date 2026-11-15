# Implemented architecture

Version 0.2.0 contains six guidance skills, original worksheets, a pinned desktop-only WPILib Java lesson, dependency-free context inspection and a read-only metadata selector. No MCP server, cloud service or installed host integration exists.

Public mode reads the small public reference list. Explicit FRC_VAULT_PATH mode uses the bounded catalog loader; it rejects catalog symlinks, unsupported schema and oversized files. Lookup requires a season and as-of date, preserves preview/stale labels, and returns allowlisted metadata only. It never reads capture bodies or arbitrary paths stored in a record, and performs no network request or upload.

The Java lesson has a simulated flywheel plant, command scheduler, pure readiness gate and bounded virtual-time demo. It instantiates no real actuator/network control devices and has no deployment targets. Dependency artifacts are downloaded for local builds, not repackaged for distribution.

Future full-text retrieval, richer semantic matching, production-controller support and live hardware integration are not implemented.
