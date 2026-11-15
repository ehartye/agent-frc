---
name: frc-troubleshoot
description: "Use when diagnosing FRC power, pneumatics, communications, control or mechanism faults."
---
# Device and evidence troubleshooting plan

Read [grounding policy](../../docs/grounding.md). Start with the [learning brief](../../docs/briefs.md): npm run brief -- --workflow troubleshoot --season YEAR --as-of YYYY-MM-DD. The brief is optional scaffolding, not a source-reading substitute. No vault is required; local catalog use must be explicitly configured.

## Establish context

- Exact device/connector/firmware/client versions.
- Symptom timeline and targeted logs.
- Electrical, pneumatic, spring and gravity energy states.

## Work through the evidence

1. Match the device-specific manual and changelog before interpreting indicators.
2. Separate command, requested output, sensor reading and physical state.
3. Preserve fault history; formulate one software/log hypothesis before a qualified physical procedure.

Inspect unmatchedQueries, omitted counts, source versions and review dates. Open relevant official/pinned sources before factual decisions. Keep source findings, recommendations and unknowns separate. Never infer compatibility from an empty season list or a matching keyword.

Read the [electrical evidence exercise](../../docs/electrical-review.md). Identify connector revision and conductor preparation separately; record telemetry validity before diagnosing a zero. Missing terminal values remain unresolved. Use existing logs and paper calculations; this skill authorizes no physical procedure.

## Reviewable output

Deliver an expected/observed evidence table with source and next verification step. For each material claim identify source URL/version, applicability and verification level. Record actual commands/results separately from proposed tests.

- A warning indicator is not assumed to inhibit output.
- Component ratings do not establish season legality or every terminal specification.
- Battery variants/revisions and conflicting charge data stay explicit.

No hardware operation or deployment is authorized by this skill. Do not infer physical safety, CAD validity or model effectiveness from static review or passing software fixtures. Source/file/dependency licenses must be checked before copying.
