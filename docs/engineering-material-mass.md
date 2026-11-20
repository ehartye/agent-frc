# Compare a Fusion archive with its bill of materials

A raw CAD mass can include display shells, field fixtures or a demonstration game piece. A bought motor may appear as one solid block or many internal bodies. Use the optional `nativeMass` section of [assembly accounting](assembly-accounting.md) when a project needs to reconcile the selected physical build with the exact student or engineering archive. Run the normal command from the installed plugin:

```sh
npm run assembly:check -- /path/to/project/engineering/mapping.json
```

## Issue three independent inputs

Add the archive, native observation JSON and engineering plan JSON to the mapping’s existing SHA-256 `sources`. Give their IDs to the checker:

```json
"nativeMass": {
  "archive": "issued-design",
  "observations": "reopened-bodies",
  "plan": "engineering-plan",
  "baselineScope": "inspection"
}
```

Omit `baselineScope` when the existing mass baseline has a different scope. Otherwise choose `installed` or `inspection`. Comparable intervals must overlap. The report gives both intervals; a wide overlap can leave a large engineering uncertainty.

1. **Reopen the exact archived bytes.** Capture all body occurrences, including hidden geometry. Use occurrence-context physical properties so reused definitions appear once per installation. Record the raw count and sum from the complete reopened body inventory. Use cm³ and kg explicitly. Fusion appearance and physical material are separate properties.
2. **Prepare the independent engineering plan.** Start from the configured articles, named source geometry, released stock specifications and references. Give every body one owner or a documented reference role. An identity must trace to a persistent project part/source or verified native binding. Read the owner and stock assignment from the actual saved part or an independently bound component registry. Copying planned identities onto observed names or matching by list order would hide a substitution.
3. **Pin the bill.** Use the existing assembly instance and quantity records. Obtain a grade, temper, polymer or foam specification for each manufactured stock. A density interval alone cannot identify strength or processing condition. Use the supplier's mass per installed unit for a purchased assembly. A carton, the solid volume of its proxy and an uninstalled spare each have a different mass scope. Classify loose installed equipment separately and state any inspection exclusions.

### Observations from Fusion

Use schema `agent-frc/native-physical-properties@1`, `opened:true`, the actual `archiveSha256`, the mapping’s `configuration`, integer `nativeBodyCount`, numeric `rawBodyTotalKg` and a `bodies` array. Each row includes:

| Field | Meaning |
| --- | --- |
| `occurrence`, `body` | Full occurrence path and component-local body name. Together they must be unique in this archive. |
| `identity` | Observed stable part/body identity independent of its visible name. A verified occurrence-binding receipt or a saved engineering ID can supply it. |
| `instance` | Physical BOM owner from the recorded binding. Use explicit `null` for a fixture or display-only body. |
| `materialId`, `volumeCm3`, `massKg` | Observed physical material library identity, volume and physical-property mass. Stock must have positive volume. Record these even for an oversized proxy. |
| `stock` | Stock specification code for a made body. Persist it in the part or bind it independently to the reopened identity. |

### Engineering plan

Use schema `agent-frc/engineering-material-plan@1`, the same configuration and archive digest, and these three arrays:

- **`bodies`** uses the same occurrence/body key and anticipated `identity`. A `stock` row names an `instance` and `stock` code. An `article-proxy` names its installed `instance`; the raw solid mass is set aside even when a vendor model depicts many internal parts. A `display` or `fixture` row supplies a `reason` and omits `instance`. Use `unresolved` with a reason for a body awaiting reliable identity or ownership. Its raw mass remains visible and final ranges stay open. Keep a physical battery or removable bumper in the installed bill even if the selected inspection rule excludes it.
- **`stocks`** contains `{id,source,pointer}` rows locating independent stock records such as `{"id":"pad-Q","grade":"Closed-cell material, grade Q","materialIds":["library-foam-Q"],"densityKgM3":[48,52]}`. The physical library ID, bound specification and density must all agree. Express material/stock tolerance in the source interval. The checker only introduces numerical round-off tolerance.
- **`instances`** has one entry per configured physical ID, including unmodeled loose items. Set `basis` to `stock`, `supplier`, `allowance` or `unknown`. Use `inspection:"counted"` or `"excluded"` with a reason. For an exclusion, link `inspectionEvidence:{source,pointer}` to an independent `{criterion,instances}` record that names the rule or project policy and eligible physical IDs. A supplier row also needs `supplier:{source,pointer}` locating `{sku,unit:"kg per installed unit",rangeKg:[low,high]}`. The purchased article’s SKU and the instance’s existing pinned mass interval must agree with that record.

The [synthetic regression](../test/assembly-native-mass.test.mjs) shows all three inputs together. Its offline fixture exercises the portable comparator.

## Read the result at the right scope

`rawNativeKg` covers every observed body. `rawByRoleKg` separates stock, purchased representations and references. Physical stock must fall within its independently booked per-instance range. The BOM contributes each configured physical instance once, including source-backed supplier masses and declared allowances. Compare `knownInstalledRangeKg`, `inspectionExclusionsKg` and `knownInspectionRangeKg` before using the complete ranges. Catalog substitutions and estimated allowances have separate subtotals; each allowance retains its source and range. A modeled part covered only by an allowance remains provisional, including a fabricated piece represented by a shell. Unknown items, provisional items, partial inventory or omissions leave the final ranges and margin open. A mismatched identity, stock, source, SKU, unit or duplicate assignment raises an error.

A passing review establishes consistency among the specified archive, observed properties, engineering assignments and BOM. The project still needs fabrication and assembly evidence. For each subsystem, take one critical joint from blank stock and loose articles. Locate both mating datums on the final reopened parts, derive the hole and tolerance stack, fastener grip, thread engagement and washer/nut or captive retention. Show tool access and reversible installation order. Reconcile every remaining article to a drawing or a source-qualified purchase, including loose hardware. Record the load case separately and keep measured mass and inspection results distinct from design estimates. [Fabrication capability](fabrication-capabilities.md) · [Mounted support fit](hidden-backing-fit.md) · [Native source and handoff](native-fusion-handoff.md)
