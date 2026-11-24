// The weight limits of a rules model: a list of {name, limit: {value, unit}, excludesRoles, factId}. The value is as the
// manual prints it. excludesRoles names the design group roles a limit leaves out; groups of role payload and service
// never count, and fixtures are not the robot, so none of those is listed. An absent list means the limits are unknown.
export const ROBOT_ROLES = Object.freeze(['structure', 'bumper', 'drive', 'battery', 'mechanism', 'other']);
const KG_PER_LB = 0.45359237;

export const limitKg = ({value, unit}) => unit === 'lb' ? value * KG_PER_LB : value;
export const limitLb = ({value, unit}) => unit === 'lb' ? value : value / KG_PER_LB;

const text = value => typeof value === 'string' && value.trim().length > 0;
const isObject = o => o !== null && typeof o === 'object' && !Array.isArray(o);

/** Check a profile's weightLimits and return it. Throws an Error that names the entry and what is wrong. */
export function validateWeightLimits(list) {
  const fail = message => { throw Error('weightLimits' + message); };
  if (!Array.isArray(list)) fail(' must be a list of {name, limit, excludesRoles, factId}.');
  if (!list.length) fail(' is empty: list the known limits, or leave it out.');
  const only = (o, at, keys) => {
    if (!isObject(o)) fail(at + ' must be an object with ' + keys.join(', ') + '.');
    for (const key of Object.keys(o)) if (!keys.includes(key)) fail(at + ' has an unknown field ' + JSON.stringify(key) + '.');
  };
  const names = new Set();
  list.forEach((entry, i) => {
    const at = '[' + i + ']';
    only(entry, at, ['name', 'limit', 'excludesRoles', 'factId']);
    if (!text(entry.name)) fail(at + '.name must be a name.');
    if (names.has(entry.name)) fail(at + '.name repeats ' + JSON.stringify(entry.name) + '.');
    names.add(entry.name);
    only(entry.limit, at + '.limit', ['value', 'unit']);
    if (!['lb', 'kg'].includes(entry.limit.unit)) fail(at + '.limit.unit must be "lb" or "kg".');
    if (!Number.isFinite(entry.limit.value) || entry.limit.value <= 0) fail(at + '.limit.value must be a number above zero.');
    if (!Array.isArray(entry.excludesRoles)) fail(at + '.excludesRoles must be a list of roles, empty when none is left out.');
    for (const role of entry.excludesRoles) if (!ROBOT_ROLES.includes(role)) {
      fail(at + '.excludesRoles names ' + JSON.stringify(role) + '. Name the group roles it leaves out: ' + ROBOT_ROLES.join(', ') + '.');
    }
    if (!text(entry.factId)) fail(at + '.factId must name the fact that supports the limit.');
  });
  return list;
}

/** The limit named "inspection" as {value, factId} in pounds, the unit of a concept's mass; undefined when there is none. */
export function inspectionLimitLb(profile) {
  const found = profile?.weightLimits?.find(entry => entry.name === 'inspection');
  return found && {value: limitLb(found.limit), factId: found.factId};
}
