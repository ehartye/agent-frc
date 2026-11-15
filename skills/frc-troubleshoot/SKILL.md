---
name: frc-troubleshoot
description: "Use when diagnosing FRC electrical, communications, control or mechanism faults."
---
# frc-troubleshoot

Read [grounding policy](../../docs/grounding.md) and [public source links](../../references/public-sources.json). Optional vault use must be explicit; absence is normal.

Identify hardware/firmware and collect symptoms, times and logs. Separate power, communications, robot code, operating mode and command conflicts. Match status indicators to device documentation. Inspect wiring only through documented, qualified, de-energized procedures. Form one testable hypothesis; choose a reversible software/log analysis first. Do not reset/reimage devices or change current limits without actual evidence and authorization. Stop physical work on unsafe or unknown energy state.

Output a concise scope/version statement, evidence links, original guidance, validation performed and remaining gaps. Include only relevant safety constraints. Do not claim runtime verification from documentation.

Optional vault coverage keys: troubleshooting, electrical-controls, safety. Resolve through the configured catalog, never a hard-coded path.

## Developed learning tools

Use expected-versus-observed evidence: model mismatch, timing mismatch, stale observations, saturation and command conflicts can resemble bad tuning. Request targeted logs only. The synthetic Java lesson supports safe software hypothesis tests, not physical fault certification.

## Version 0.3 evidence workflow

Use [device worksheet](../../worksheets/device-evidence.csv). Identify exact PDH/PDP2/PH/PCM and connector/firmware/client version. PDH Hardware Client 2 guidance does not establish PH26.x USB compatibility; consult each device changelog. Preserve sticky-fault evidence. Distinguish electrical command, measured pressure and stored-energy state; disabled software does not vent air. Device ratings and 2026 rules do not establish2027 legality.

## Caller and evidence review

AMPD now has an official installation overview, but global maximum wire gauge is not per-terminal permission. Battery evidence must name exact suffix, document revision, temperature and rating basis. Preserve conflicting MK/Power-Sonic presentations; do not manufacture a charging recipe from an SDS or season current ceiling.
