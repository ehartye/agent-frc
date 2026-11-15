# Evaluation scope

Run npm run evaluate to execute 13 deterministic public metadata-grounding cases. They check season exclusion, explicit historical inclusion, model/caller source discovery, stale-review labels and valid calendar dates. The runner uses the real lookup module with an empty configuration environment, emits selected IDs and hashes its inputs. It does not open a private catalog, generate an LLM answer or grade skill effectiveness.

A real defect was reproduced: 2026-02-30 passed Date.parse because JavaScript normalized it. Lookup now requires an exact ISO calendar round-trip; regression coverage accepts the real 2028 leap day and refuses impossible dates. asOf controls review-date comparison, not historical website reconstruction.

[Grounding cases](../eval/grounding-cases.json) and [recorded results](../eval/grounding-results.json). The six [human/agent cases](../eval/cases.json) remain unexecuted. Evaluate those later with held-out prompts, recorded model/tool versions, independent scoring and evidence citations; no installed-host or learner study is claimed.
