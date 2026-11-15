# Evaluation scope

Run npm run evaluate for 20 deterministic cases:13 metadata-selection scenarios and 7 learning-brief scenarios. The suite uses the actual lookup and brief modules, records selected IDs and hashes implementation/data inputs. It checks season exclusion, historical inclusion, model/caller discovery, stale dates, invalid calendar dates, workflow contracts and future-season laboratory limits.

Seventeen Node regressions additionally check explicit configuration, metadata privacy, partial source coverage and balanced display budgets. The brief module reads no source bodies; its checklist is original static guidance.

[Cases](../eval/grounding-cases.json), [results](../eval/grounding-results.json), [brief contract](briefs.md). Six [human/agent prompts](../eval/cases.json) remain unexecuted. No model response was generated or graded; no installed-host or learner effectiveness study is claimed.

Previously reproduced/fixed: Date.parse accepted an impossible February 30 date. Exact ISO calendar round-trip now rejects it. asOf compares review dates; it does not reconstruct historical website content.
