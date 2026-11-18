# Fabrication decision-chain linkage

The comparator's provisional unrestricted-shop assumption is a design convenience, not actual school capability. The checked-in example has **no registered school tools**, an unresolved placeholder part design reference and unknown manufacturing requirements. It is not a viable bracket, a machine instruction or permission to operate equipment.

`linkFabricationComparison(study, {envelopeId, plan, profile, asOf, prefix})` creates explicit design-reference records for every part, a versioned plan and a comparison linked to exact school/model inputs. `profile:null` means no known school profile. The default shared IDs `school-capabilities` and `fabrication-assessor` are reused across candidate branches; different content requires an explicit revision before linkage. Caller-supplied distinct IDs may represent distinct schools, not silent replacement of a shared registry.

Each per-part design input stores the external design record pin with `hypothetical-or-external-unverified` scope. It does not authenticate a file or invent a subsystem specification. A real CAD/design change must be explicitly ingested as a new design-input revision; there is no filesystem watcher. That revision marks the dependent plan and comparison stale. A school or model revision marks every comparison referencing it stale; unrelated siblings remain intact.

The comparison stores the entire declared comparator output, exact input pins, evaluation date and output digest. Direct appended records must identify the installed comparator source before full replay; a different source hash is rejected rather than attributed to the current code. Plan and every bound design input must also reference the same exact envelope revision. caller-written match labels or approvals cannot replace its results. `currentFabricationComparison(study,id,{asOf})` returns the full pinned receipt only when dependencies are current, the requested date equals the recorded date and the installed comparator source matches. Advancing the comparison date requires reassessment, including evidence review dates.

Historical raw records remain append-only, but graph validation/replay of their comparisons requires the corresponding model implementation. An unavailable historical model is explicitly unsupported, not reinterpreted or marked current. A future incompatible model needs an explicit migration/versioned replay path; this v1 reader does not silently reinterpret old outputs as current evidence. Hashes and declared school records establish consistency, not authenticity or qualified safety approval.

## Reusable review cycle

1. Register machines and setups only from school-specific evidence, with source revision/hash, review dates, supported material/process, demonstrated setup envelope and deviation, fixtures, training, supervision and safety review. Missing records mean unknown, not absence.
2. Record each part's design revision, material, process route, stock/fixture XYZ envelope, required precision and operator capability. Keep assumed requirements distinct from drawing requirements.
3. Execute a comparison on the same dated profile for each alternative. Preserve every mismatch and unknown; do not silently rotate stock, relax tolerances, change material or select outsourcing.
4. Revise an affected part or an explicitly proposed alternate route in its own branch. Re-run downstream engineering evidence when material, geometry, joining or process changes affect function.
5. Merge reviewed changes only after exact source/interface checks and regression tests against the current main revision. A declared match still requires qualified review and never authorizes manufacturing or hardware operation.
