---
name: frc-season
description: "Use when choosing an FRC season, reading rules, planning Kit of Parts or resolving source freshness."
---
# frc-season

Read [grounding policy](../../docs/grounding.md) and [public source links](../../references/public-sources.json). Optional vault use must be explicit; absence is normal.

Establish the requested season and event. Open the official manual/update gateway and record edition and access date. Distinguish rule text, Q&A, draft previews, vendor requirements and historical examples. Inventory rookie/veteran/opt-out/region-specific kit provisions; never assume identical hardware. Record disagreements and unresolved requirements. Produce a requirement worksheet with exact rule IDs; do not invent final 2027 rules from previews.

Output a concise scope/version statement, evidence links, original guidance, validation performed and remaining gaps. Include only relevant safety constraints. Do not claim runtime verification from documentation.

Optional vault coverage keys: season-selection, kit-of-parts, rules-2026. Resolve through the configured catalog, never a hard-coded path.

## Developed learning tools

The read-only metadata selector is `node scripts/lookup.mjs --season YEAR --as-of YYYY-MM-DD --topic TEXT`. Use a path relative to the plugin root. It returns preview/stale labels and excludes unrelated seasons unless --historical is explicit. It does not verify rules; open official sources before answering.

## Version 0.3 evidence workflow

For 2027 veteran opt-outs, official detailed KoP sections and Nov 12reminder specify selection plus purchased/secured registration before Nov 17, 2026 at 17:00 Eastern; generic table says noon. Cite both and flag the conflict. Drive-base alternative is$450 AndyMark; tote alternative$125 each REV/AndyMark. Do not infer eligibility, register, pay or expose voucher codes.
