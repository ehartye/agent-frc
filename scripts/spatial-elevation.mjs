// Static vertical forces in a right-handed frame with +Z up. Moments use N·m.
export const finitePair = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const dot = (a,b) => a[0]*b[0] + a[1]*b[1];
const length = v => Math.hypot(...v);
const scaled = (v,k) => v.map(n=>k*n);
const minus = (a,b) => a.map((n,i)=>n-b[i]);
const nearZero = v => length(v) <= 1e-8;

export function spatialReactions(stations, pose, totalN) {
  const active = stations.filter(s=>s.id!==pose.unavailableSupport);
  if (!active.length) return {status:'fail',reason:'All supports unavailable.'};
  if (!active.every(s=>finitePair(s.xyM)) || !finitePair(pose.cgXYM) || !finitePair(pose.appliedMomentXYNm))
    return {status:'open',reason:'Supply both horizontal coordinates for the CG and active stations, and both applied moments.'};
  if (!nearZero(pose.appliedMomentXYNm) && !pose.appliedMomentBasis?.trim())
    return {status:'open',reason:'Supply the source and sign of the applied external couple.'};

  const [first,second] = active;
  const [dx,dy] = minus(pose.cgXYM,first.xyM);
  const moment = [pose.appliedMomentXYNm[0]-totalN*dy,pose.appliedMomentXYNm[1]+totalN*dx];
  const loads = new Map([[first.id,totalN]]);
  let line = null;
  let residual = [...moment];
  if (second) {
    const delta = minus(second.xyM,first.xyM);
    const span = length(delta);
    if (span < 1e-9) return {status:'open',reason:'Coincident support stations do not determine a unique load split.'};
    line = scaled(delta,1/span);
    const normal = [-line[1],line[0]];
    const secondN = dot(moment,normal)/span;
    loads.set(second.id,secondN);
    loads.set(first.id,totalN-secondN);
    residual = minus(moment,scaled(normal,secondN*span));
  }

  const restrained = active.filter(s=>s.momentRestraint);
  const moments = {originXYM:first.xyM, supportLineXY:line, appliedAndGravityMomentXYNm:moment,
    residualAfterVerticalForcesXYNm:residual, requiredRestraintReactionXYNm:scaled(residual,-1)};
  if (restrained.length > 1)
    return {...moments,status:'open',reason:'Multiple moment restraints require a stiffness or load-sharing model.'};
  const support = restrained[0];
  let demandNm = 0;
  let unbalanced = residual;
  if (support) {
    const restraint = support.momentRestraint;
    if (!finitePair(restraint.axisXY) || length(restraint.axisXY)<1e-9 || !restraint.basis?.trim())
      return {...moments,status:'open',reason:'Identify the installed restraint, its physical axis and source.'};
    const axis = scaled(restraint.axisXY,1/length(restraint.axisXY));
    if (line && Math.abs(line[0]*axis[1]-line[1]*axis[0])>1e-9)
      return {...moments,status:'open',reason:'A restraint coupled to the load-sharing axis needs a stiffness model.'};
    demandNm = dot(residual,axis);
    unbalanced = minus(residual,scaled(axis,demandNm));
  }
  return {...moments, loads:stations.map(s=>loads.get(s.id)??0),
    restraintSupport:support?.id, appliedRestraintDemandNm:demandNm,
    unbalancedMomentXYNm:unbalanced, momentEquilibrium:nearZero(unbalanced)?'balanced':'unbalanced',
    status:nearZero(unbalanced)?'pass':'fail'};
}
