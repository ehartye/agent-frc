# Fabrication requirements and school capabilities

The first custom-fabrication draft assumes **all required tools are available for design exploration only**. It still names the machines, processes, materials, setup space, precision, tooling and qualified roles each part needs. That assumption never becomes a statement that a school owns equipment, students can operate it, or the part is manufacturing-ready.

## Reusable records

Start with `templates/fabrication-plan.json` and `templates/school-capabilities.json`. They are deliberately incomplete; the part reference is a placeholder and the school registry is unknown. No actual school inventory was provided or inferred. Keep private school records outside the public package.

A plan (`frc-fabrication-plan/v1`) has identity/revision, the fixed `all-required-tools-assumed-for-design-only` assumption, evidence and parts. Each part has an exact design-record pin, description, unresolved inputs, route coverage and one or more alternative routes. The design pin is declared provenance, not proof that CAD was opened, inspected or authenticated. A graph adapter can bind it to a versioned design-input record so an acknowledged design revision invalidates dependents.

Each route has an **ordered** operation list. Every operation declares:

- Exact process, machine class and material/grade IDs. Use shared IDs consistently, such as a specific alloy/temper/stock condition. The matcher does not guess that two names are equivalent.
- Setup envelope XYZ in millimetres, including stock, fixtures and necessary access allowances. The fixed convention is `stock-and-fixture-XYZ-no-rotation`. The comparator never rotates the part, assumes usable travel equals advertised travel, or proves cutter reach/workholding.
- Allowed absolute deviation in millimetres (a positive symmetric magnitude, not an unlabeled total tolerance band). The corresponding registered achievable deviation must be no larger. This numeric comparison is not proof of process capability.
- Required fixture/tooling IDs and operator-capability role ID. `null` means unknown; an empty fixture list is an explicit declaration that none are required, not an automatic default.
- Basis (`assumed` or `drawing-requirement`), source references and unresolved inputs. Assumed requirements remain visibly assumed even when a tool's declared capacity matches.

Alternative routes must be explicitly authored, source-bound and independently reviewed. A larger machine, laser, router, waterjet, casting or printing process is not silently substituted for a mill. An alternative process may change stock, tolerances, material properties, interfaces, cost or physics assumptions. Those design consequences need their own evidence and review.

## Registering a school's capabilities

`frc-school-capabilities/v1` separates registry coverage (`unknown`, `partial`, `declared-complete`) from each named tool. A missing record is not proof that equipment is absent. Record a tool only from authorized school information; do not infer ownership from a photograph, purchase link or manufacturer specification.

A tool record contains `id`, descriptive `label`, exact `machineClass`, `availability`, `condition`, `access`, `evidenceRefs`, and process/material-specific `capabilities`.

- Availability: `unknown`, `available`, `unavailable`.
- Condition: `unknown`, `serviceable`, `needs-review`, `unserviceable`.
- `access` has separate `setup`, `training`, `supervision`, `safetyReview` declarations; each is `unknown`, `declared-current` or `unavailable`.
- Each capability has `id`, exact `processId` and `materialId`, `usableSetupMm`, the same envelope convention, `achievableDeviationMm`, `fixtureIds`, `operatorCapabilityId`, and `evidenceRefs`. Capacity belongs to the **specific process/material/setup**, not the machine name alone.

A qualified school contact can fill a local copy of this JSON using current assessments. Updating that file is registration in this first slice; there is no hosted enrollment form, automatic inventory discovery, school-account authentication or machine-control integration. Role IDs are sufficient; do not put student identity or sensitive records into a public artifact.

For example, an unverified placeholder tool must use `availability: unknown`, `condition: unknown`, all four access declarations `unknown`, and null dimensions/deviation/fixtures/role rather than invented values. A manufacturer sheet can describe nominal capabilities but cannot establish the school's actual availability, condition, setup or access. Design-only assumptions are rejected as school evidence.

Evidence records carry ID, kind (`design-assumption`, `design-record`, `school-record`, `manufacturer-spec`), original description, source locator, revision, SHA-256 or explicit null, recorded date and review-due date. Locators may refer to an authorized local assessment; this tool does not fetch or transmit them. Declared matches require current source revisions/hashes and school-specific evidence for the actual tool and its setup capability. Evidence labels and hashes are not authenticated attestations or a physical inspection. All dates use YYYY-MM-DD; the comparison date is explicit and pinned, not silently refreshed.

## Comparing and guiding the next step

```
node scripts/fabrication-capabilities.mjs plan.json school.json 2026-11-16
node scripts/fabrication-capabilities.mjs plan.json null 2026-11-16
```

`compareFabrication(plan, profileOrNull, {asOf})` emits exact complete-input hashes and preserves each part/route/operation separately. It identifies named tool/capability candidates, numeric or categorical gaps, missing evidence, stale assessments, unresolved requirements and alternate declared routes. It never turns the unrestricted-shop assumption into inventory.

- `declared-match-needs-qualified-review`: the recorded facts satisfy this **limited desk comparison**. The output names the tool and process to discuss with qualified staff, not a machine the student is authorized to use.
- `declared-gap`: an explicitly recorded constraint does not fit.
- `unknown` / `requirements-unresolved` / `school-capabilities-unresolved`: establish the missing requirement, registry or evidence instead of inventing capacity.
- A route is only a declared route match when every listed operation matches and the part has no unresolved inputs. Partial route coverage stays visible; it is not proof that the operation sequence covers all fabrication steps.

For a gap, the report suggests reviewing another explicitly modeled route, redesign, external qualified capability or a purchased/custom-service part. It does not choose a supplier, place an order, change a design requirement, or claim an unlisted alternative works. Material substitutions and relaxed tolerances require a justified design change, not a matcher workaround. A future richer interface may add schedule/cost/inspection/finish constraints; they are not currently modeled automatically and must remain in unresolved inputs until reviewed.

The CLI returns 1 for invalid input and 2 for a desk comparison, even if every declared capacity matches. It never returns machine-operation approval. API outputs always retain `manufacturingReadiness: not-established`, `engineeringAcceptance: not-assessed` and `machineOperationAuthorized: false`. There is no installed CI/branch protection or authenticated physical-release enforcement.

## Changes and safety

The plan and registry have independent revisions and hashes. Recompare after source, part, material, process, fixture, machine availability or training/access changes. Exact date-bound outputs cannot establish freshness at a later date. A graph adapter may propagate declared dependencies; it cannot discover an unrecorded machine fault, unpublished school change or omitted physical coupling.

No spindle speed, feed, cutting depth, wiring, machine sequence or energized procedure is supplied. Machine-specific guarding, workholding, material hazards, ventilation, PPE, age/access restrictions, competence, supervision and approved procedures require the school's qualified process. A declared safety-review field is not student authorization. Procurement, external sharing, fabrication and hardware operation are separate actions.

This slice compares declared manufacturing capabilities. It does not validate strength, deflection, heat, friction, weight distribution, dimensional inspection or robot performance. The owner's actual-physics evidence requirement remains in force for relevant design/code/CAD changes; neither this comparison nor a shop assumption fills missing simulation or physical evidence.

## Implemented boundaries

Implemented: strict schema validation; exact-ID process/material/machine matching; XYZ envelope and deviation checks; fixtures/role/access/condition/availability checks; source-date/hash/revision completeness; explicit null/unknown handling; per-route alternatives; immutable inputs and deterministic whole-input hashes. The code reads JSON and writes only its stdout report.

Not implemented: authenticated school registration, source retrieval/authentication, actual machine inspection or calibrated process capability, cost/lead-time optimization, native CAD feature-to-process inference, toolpath generation, geometric access/workholding validation, automatic design edits, purchasing or operation. The shipped template and regression fixtures are not an actual school registry.

Input bounds: at most 1 MiB per plan/profile, 100 parts, 10 routes per part, 50 operations per route, 100 tools, 50 capabilities per tool, 1000 total operations, 2000 total capabilities and 100000 operation/capability pairs. Larger studies must be deliberately split without hiding whole-assembly dependencies. A `drawing-requirement` may not cite only assumed evidence; it needs declared design-record or manufacturer evidence, which still is not authenticated by this tool.
