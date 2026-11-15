# Implemented architecture

The package contains six Markdown skills, original reference policy, portable/compatibility manifests and a dependency-free Node context reader. It has no MCP server or installed host integration.

Public source links are a small allowlisted reference set. The context reader defaults to public-only mode; explicit vault configuration reads a bounded catalog after checking the exact path is a regular non-symlink file within the resolved root. It returns only record count and as-of metadata. It does not perform semantic retrieval or execute catalog content.

Proposed richer retrieval would add read-only topic lookup with path confinement, source freshness filters, version selection and an auditable answer-evidence ledger. That work is not implemented. Keep private indexes outside the public repository and make any ingestion a separate explicit action.
