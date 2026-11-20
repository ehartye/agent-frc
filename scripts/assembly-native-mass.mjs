const text = value => typeof value === 'string' && value.trim().length > 0;
const fail = message => { throw Error('Native mass: ' + message); };

function unique(rows, key, label) {
  if (!Array.isArray(rows)) fail(label + ' must be a list');
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!text(id) || result.has(id)) fail('missing or duplicate ' + label + ' identity: ' + id);
    result.set(id, row);
  }
  return result;
}

function bodyKey(row) {
  if (!text(row?.occurrence) || !text(row.body)) fail('body needs an occurrence path and local body name');
  return JSON.stringify([row.occurrence, row.body]);
}

function sameKeys(expected, actual, label) {
  for (const id of expected.keys()) if (!actual.has(id)) fail('missing ' + label + ' ' + id);
  for (const id of actual.keys()) if (!expected.has(id)) fail('unexpected ' + label + ' ' + id);
}

function interval(range, positive = false) {
  return Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)
    && (positive ? range[0] > 0 : range[0] >= 0) && range[0] <= range[1];
}

function within(value, [low, high]) {
  // Absorb floating-point rounding only. Manufacturing tolerances belong in the source intervals.
  const rounding = 1e-9 * Math.max(1, Math.abs(value), high);
  return value >= low - rounding && value <= high + rounding;
}

function add(total, range) {
  total[0] += range[0];
  total[1] += range[1];
}

export function reconcileNativeMass(request, result, pins, locate) {
  const review = request.nativeMass;
  const pin = id => pins.get(id) ?? fail('unknown source ' + id);
  const archive = pin(review.archive);
  if (!/\.f3[dz]$/i.test(archive.file)) fail('select the issued F3D or F3Z archive');
  const observations = locate({source:review.observations, pointer:''});
  const plan = locate({source:review.plan, pointer:''});
  const digests = [archive.sha256, pin(review.observations).sha256, pin(review.plan).sha256];
  if (new Set(digests).size !== 3) fail('archive, observations and independent engineering plan must be distinct');
  if (observations.schema !== 'agent-frc/native-physical-properties@1' || observations.opened !== true
    || plan.schema !== 'agent-frc/engineering-material-plan@1') fail('supply a reopened native observation and engineering plan');
  for (const record of [plan, observations]) {
    if (record.archiveSha256 !== archive.sha256 || record.configuration !== request.configuration) fail('archive or configuration mismatch');
  }

  const planned = unique(plan.bodies, bodyKey, 'planned bodies');
  const observed = unique(observations.bodies, bodyKey, 'observed bodies');
  if (!planned.size) fail('empty native inventory');
  sameKeys(planned, observed, 'body');
  if (observations.nativeBodyCount !== observed.size) fail('observed body count differs from the reopened inventory');
  const policy = unique(plan.instances, row => row.id, 'engineering instances');
  const configured = new Set([...result.make, ...result.undecided, ...result.buy.flatMap(item => item.instances)]);
  sameKeys(configured, policy, 'configured instance');
  const bom = new Map(request.instances.map(row => [row.id, row]));
  const supplied = new Map(result.buy.map(article => [article.article, article]));
  const stocks = unique(plan.stocks, row => row.id, 'stock specifications');
  function independent(ref) {
    if (!text(ref?.source) || digests.includes(pin(ref.source).sha256)) fail('use independently pinned stock or BOM evidence');
    return locate(ref);
  }
  const specifications = new Map();
  for (const [id, ref] of stocks) {
    const spec = independent(ref);
    if (spec?.id !== id || !text(spec.grade) || !Array.isArray(spec.materialIds)
      || !spec.materialIds.length || !spec.materialIds.every(text) || !interval(spec.densityKgM3, true))
      fail('invalid grade, native material IDs or density interval for ' + id);
    specifications.set(id, spec);
  }

  const byInstance = new Map();
  const rawKg = {stock:0, 'article-proxy':0, display:0, fixture:0, unresolved:0}, unresolvedBodies = [];
  for (const [id, actual] of observed) {
    const expected = planned.get(id);
    if (!text(actual.materialId) || !Number.isFinite(actual.volumeCm3) || actual.volumeCm3 < 0
      || !Number.isFinite(actual.massKg) || actual.massKg < 0 || (!actual.volumeCm3 && actual.massKg !== 0))
      fail('invalid physical properties at ' + id);
    if (!Object.hasOwn(rawKg, expected.role)) fail('unknown body role at ' + id);
    rawKg[expected.role] += actual.massKg;
    if (expected.role === 'unresolved') {
      if (!text(expected.reason)) fail('supply the unresolved assignment reason at ' + id);
      unresolvedBodies.push([actual.occurrence,actual.body]);
      continue;
    }
    if (!text(expected.identity) || expected.identity !== actual.identity) fail('persistent engineering identity mismatch at ' + id);
    if (expected.role === 'display' || expected.role === 'fixture') {
      if (expected.instance !== undefined || !text(expected.reason)) fail('reference must have a reason and no installed owner at ' + id);
      if (actual.instance !== null) fail('reopened reference has an installed owner at ' + id);
      continue;
    }
    const owner = policy.get(expected.instance);
    if (!owner) fail('absent physical instance at ' + id);
    if (actual.instance !== owner.id) fail('reopened physical owner differs from the engineering plan at ' + id);
    if (!byInstance.has(owner.id)) byInstance.set(owner.id, {stock:0, actual:0, proxy:0});
    const subtotal = byInstance.get(owner.id);
    if (expected.role === 'article-proxy') {
      subtotal.proxy++;
      if (owner.basis !== 'supplier' && owner.basis !== 'allowance' && owner.basis !== 'unknown') fail('proxy cannot supply stock mass at ' + id);
      continue;
    }
    if (owner.basis !== 'stock') fail('stock body assigned to a non-stock instance at ' + id);
    const spec = specifications.get(expected.stock);
    if (!spec || !actual.volumeCm3 || actual.stock !== expected.stock || !spec.materialIds.includes(actual.materialId)) fail('stock or physical material mismatch at ' + id);
    if (!within(actual.massKg * 1e6 / actual.volumeCm3, spec.densityKgM3)) fail('native density outside stock specification at ' + id);
    subtotal.stock++;
    subtotal.actual += actual.massKg;
  }
  const rawTotal = Object.values(rawKg).reduce((sum, mass) => sum + mass, 0);
  if (!Number.isFinite(observations.rawBodyTotalKg) || !within(rawTotal,[observations.rawBodyTotalKg,observations.rawBodyTotalKg]))
    fail('sum of body masses disagrees with the reported raw native body total');

  const installed = [0,0], inspection = [0,0], excluded = [0,0];
  const allowances = [0,0], supplier = [0,0], omissions = [], provisional = [], allowanceItems = [];
  for (const [id, owner] of policy) {
    const item = bom.get(id), covered = byInstance.get(id);
    if (!['counted','excluded'].includes(owner.inspection) || (owner.inspection === 'excluded' && !text(owner.reason))) fail('declare inspection treatment for ' + id);
    if (owner.inspection === 'excluded') {
      const authority = independent(owner.inspectionEvidence);
      if (!text(authority?.criterion) || !Array.isArray(authority.instances) || !authority.instances.includes(id))
        fail('inspection exclusion must identify this instance and its criterion: ' + id);
    }
    if (!['stock','supplier','allowance','unknown'].includes(owner.basis)) fail('unknown mass basis for ' + id);
    if (item.presence === 'unmodeled' && covered) fail('native body assigned to a declared unmodeled instance ' + id);
    if (owner.basis === 'stock' && (item.disposition !== 'make' || !covered?.stock)) fail('made stock missing native coverage for ' + id);
    if (owner.basis === 'supplier') {
      const sku = supplied.get(item.article)?.sku;
      const source = independent(owner.supplier);
      if (item.disposition !== 'buy' || !sku || source?.sku !== sku || source.unit !== 'kg per installed unit'
        || !interval(source.rangeKg) || !item.mass || !source.rangeKg.every((value,i) => value === item.mass.rangeKg[i]))
        fail('supplier mass must match the installed SKU and its independent per-unit kilogram range for ' + id);
    }
    if (!covered && item.presence !== 'unmodeled') fail('configured geometry lacks a body for ' + id);
    if (owner.basis === 'unknown' || !item.mass) {
      omissions.push(id);
      continue;
    }
    independent(item.mass);
    const range = item.mass.rangeKg;
    if (owner.basis === 'stock' && !within(covered.actual, range)) fail('native stock mass outside independent BOM interval for ' + id);
    if (owner.basis === 'supplier') add(supplier, range);
    if (owner.basis === 'allowance') {
      add(allowances, range);
      allowanceItems.push({instance:id,source:item.mass.source,pointer:item.mass.pointer,rangeKg:range});
      if (item.presence !== 'unmodeled') provisional.push(id);
    }
    add(installed, range);
    add(owner.inspection === 'counted' ? inspection : excluded, range);
  }
  const complete = result.inventoryComplete && !result.mass.omissions.length && !omissions.length && !provisional.length && !unresolvedBodies.length;
  const scope = review.baselineScope;
  if (scope !== undefined && !['installed','inspection'].includes(scope)) fail('invalid baseline scope');
  const range = result.mass.representedRangeKg, comparison = scope === 'installed' ? installed : inspection;
  if (complete && scope && range && (range[0] > comparison[1] && !within(range[0],comparison)
    || range[1] < comparison[0] && !within(range[1],comparison))) fail('reconciled ' + scope + ' bill disagrees with the declared baseline');
  return {archive:archive.file, archiveSha256:archive.sha256, observationsSha256:digests[1], planSha256:digests[2], configuration:request.configuration,
    nativeBodies:observed.size, rawNativeKg:rawTotal, rawByRoleKg:rawKg,
    supplierSubtotalKg:supplier, allowanceSubtotalKg:allowances, allowanceItems, knownInstalledRangeKg:installed, knownInspectionRangeKg:inspection,
    inspectionExclusionsKg:excluded, unresolvedInstances:omissions, provisionalInstances:provisional, unresolvedBodies, complete,
    installedRangeKg:complete ? installed : null, inspectionRangeKg:complete ? inspection : null,
    inspectionMarginKg:complete && result.mass.limitBasis === 'source-pinned' ? [result.mass.limitKg-inspection[1],result.mass.limitKg-inspection[0]] : null,
    baselineComparison:scope && range ? {scope,baselineRangeKg:range,status:complete?'overlapping intervals':'incomplete'} : null};
}
