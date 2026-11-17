// Pure virtual-model helpers. SI units; world XY, positive CCW heading, body X forward/Y left.
function scalar(x,name){if(typeof x!=='number'||!Number.isFinite(x))throw Error(name+' must be finite');return x}
function vector(v,name){if(!Array.isArray(v)||v.length!==2)throw Error(name+' must be a two-vector');return v.map((x,i)=>scalar(x,name+i))}
export function relativeBodyObservation({robotPosition,robotVelocity,heading,yawRate,targetPosition,targetVelocity}) {
 const rp=vector(robotPosition,'robotPosition'),rv=vector(robotVelocity,'robotVelocity'),tp=vector(targetPosition,'targetPosition'),tv=vector(targetVelocity,'targetVelocity');scalar(heading,'heading');scalar(yawRate,'yawRate');
 const c=Math.cos(heading),s=Math.sin(heading),dx=tp[0]-rp[0],dy=tp[1]-rp[1],ux=tv[0]-rv[0],uy=tv[1]-rv[1];
 const q=[c*dx+s*dy,-s*dx+c*dy],qdot=[c*ux+s*uy+yawRate*q[1],-s*ux+c*uy-yawRate*q[0]];
 vector(q,'relativePosition');vector(qdot,'relativeVelocity');return {relativePosition:q,relativeVelocity:qdot};
}
// Across the instantaneous fault/mode transition only, not across a finite integration step.
// Unchanged mass/inertia; any instantaneous momentum change needs an explicit modeled impulse.
export function checkFaultMomentumTransition({mass,inertia,beforeVelocity,afterVelocity,beforeYawRate,afterYawRate,linearImpulse,angularImpulse,linearTolerance,angularTolerance}) {
 for(const [k,v]of Object.entries({mass,inertia,beforeYawRate,afterYawRate,angularImpulse,linearTolerance,angularTolerance}))scalar(v,k);
 if(mass<=0||inertia<=0||linearTolerance<0||angularTolerance<0)throw Error('positive mass/inertia and nonnegative tolerances required');
 const before=vector(beforeVelocity,'beforeVelocity'),after=vector(afterVelocity,'afterVelocity'),impulse=vector(linearImpulse,'linearImpulse');
 const linearResidual=after.map((v,i)=>mass*(v-before[i])-impulse[i]);const angularResidual=inertia*(afterYawRate-beforeYawRate)-angularImpulse;
 vector(linearResidual,'linearResidual');scalar(angularResidual,'angularResidual');
 return {consistent:Math.hypot(...linearResidual)<=linearTolerance&&Math.abs(angularResidual)<=angularTolerance,linearResidual,angularResidual,scope:'instantaneous declared impulse consistency, not physical validation'};
}
