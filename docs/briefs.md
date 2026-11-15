# Learning briefs

Generate a reviewable plan with explicit context and evidence gaps:

`npm run brief -- --workflow modes --season 2026 --as-of 2026-11-15`

Workflows: season, java, mechanism-cad, vision, modes, troubleshoot. --historical explicitly admits older-season source links. FRC_VAULT_PATH is optional and never guessed.

The result includes required context, ordered checks, acceptance conditions, an expected deliverable, source metadata and a lab baseline when relevant. It reads no source bodies and performs no network or hardware action. Open linked sources before making factual decisions.

Source groups are interleaved; at most 12 links are shown. unmatchedQueries and omitted counts expose incomplete retrieval. The per-query selector itself returns at most 20 records, so retrievedCandidateCount is not a corpus-wide total. Partial coverage is expected: public mechanism/CAD planning may find CAD sources without a current-season mechanism match. Add explicit historical scope or supply known authoritative sources; never infer missing facts.

A 2026 lab is a separate pinned exercise, not verification of a user's project. Other selected seasons receive an unverified-baseline label. Rules authority always requires official-source review. asOf compares review dates, not past web snapshots.

The brief contract has seven Node regressions and seven cases within the 20-case deterministic evaluation suite. No LLM answer generation, installed-host test or learning-effectiveness study has occurred. [Evaluation scope](evaluation.md).
