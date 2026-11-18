# From assembly occurrences to a build list

Use the assembly check when deciding which parts to fabricate or source and whether proposed changes fit the same inspection budget. Run the synthetic tabletop example from the plugin checkout.

```sh
npm run assembly:check -- examples/assembly-accounting/mapping.json
```

The example contains two physical bearings with one article number, a drive shaft tip supplied with its motor, and a tool-access space. Two bearings require one pack of two when stock is zero. Adding both proposed parts puts the upper mass estimate 0.05 kg above the selected limit. [Example mapping](../examples/assembly-accounting/mapping.json)

## Prepare a project mapping

- Set `schema` to `agent-frc/assembly-accounting@1`. Identify the selected configuration, its source commit or export SHA-256 in `revision`, and `complete` or `partial` coverage. List missing inventory in `omissions`.
- List source files with an ID, filename relative to the mapping, and SHA-256. An export points into a pinned JSON inventory with a JSON Pointer. An empty pointer selects the root. Supported inventories are an array of names, an array of records with an `idField`, or an object keyed by occurrence name. Repeated poses may share physical instances. Use `variant: {"group":"finish","choice":"light"}` to identify mutually exclusive installations. For a configuration that carries several interchangeable kits, describe the shared chassis once and assign each carried part its own physical identity.
- Each occurrence assignment names its export and occurrence. An `installed` occurrence identifies an instance. An `included` occurrence names the parent instance that supplies it. Service and external geometry use `service` and `external` with no instance. The report lists missing assignments, duplicates, and included parts whose parent is absent.
- Give each physical instance a `make`, `buy` or `undecided` disposition and a `modeled`, `unmodeled` or `candidate` presence. Use unmodeled instances for required loose equipment of known quantity. Record unknown quantities in omissions. Bought instances name an article. Record its supplier-qualified SKU, units per pack and stock on hand when known. The report counts demand before applying stock. A null purchase quantity identifies missing evidence. Check availability with the supplier separately.
- Configure mass in kilograms. Bind the inspection limit and baseline to the same configuration and revision. An evidence record names its source, numeric JSON Pointer, ordered `rangeKg` and `measured` or `estimated` basis. A point value uses equal endpoints. An unknown baseline or change uses `null`. The individual subtotal counts only known masses of selected physical instances. A separately evidenced assembly total can include unweighed components.
- Changes identify added and removed physical instances and a pinned signed net mass interval. Select them by ID. Use `exclusiveGroup` for alternative builds. The same baseline instance can receive one removal credit. A represented margin covers the declared baseline and changes. A complete configuration margin also requires full inventory coverage and an empty list of mass omissions. Use the lower end of the margin to judge the heavier end of the estimate. Scale measurements and inspection remain separate.

Review incomplete coverage, open selections and missing mass before using the result. The command reads project files and returns JSON. Invalid evidence or incompatible changes produce a nonzero exit. An incomplete but valid analysis returns its unknowns.
