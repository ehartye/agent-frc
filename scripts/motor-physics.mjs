import fs from 'node:fs';
import {createHash} from 'node:crypto';
const check=(x,m)=>{if(!x)throw Error(m);};
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const closed=(x,ks)=>check(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k)),'Missing or unsupported fields');
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bounded=(x,lo,hi)=>Number.isFinite(x)&&x>=lo&&x<=hi;
export const MODEL='coupled-dc-motor-thermal-rk4/v1';
const parameterKeys=['resistanceOhm','torqueConstantNmPerAmp','inertiaKgM2','viscousFrictionNmPerRadPerSec','thermalCapacityJPerK','coolingWPerK','resistanceTempCoeffPerK'];
export const LIMITATIONS=Object.freeze(['Synthetic uncalibrated numerical benchmark, not a model validated against a physical robot.','Supplied code/CAD hashes are attribution only: no candidate robot code is executed and no CAD geometry or mass property is extracted.','One ideal direct-drive rotor, Kt=Ke in SI, constant DC source and algebraic current; no PWM, inductance, current controller, regeneration, gearbox or battery state-of-charge.','Viscous rotational drag only: no stiction, tire traction/contact, chassis weight distribution, tipping, structure or collision.','Single thermal capacitance receives winding I-squared-R loss only; friction/battery heat dissipate outside it. No winding/case gradients or hardware thermal limits.','Numerical energy/convergence checks verify this implementation, not engineering requirements, calibration, safety or real-world accuracy.']);
function validateInputs(p,s){
 closed(p,parameterKeys);closed(s,['steps','dtSeconds','openCircuitVolts','batteryResistanceOhm','ambientC']);
 for(const k of ['resistanceOhm','torqueConstantNmPerAmp','inertiaKgM2','thermalCapacityJPerK'])check(bounded(p[k],1e-6,1e6),'Invalid positive model parameter '+k);
 for(const k of ['viscousFrictionNmPerRadPerSec','coolingWPerK','resistanceTempCoeffPerK'])check(bounded(p[k],0,100),'Invalid nonnegative model parameter '+k);
 check(Number.isInteger(s.steps)&&s.steps>=1&&s.steps<=10000&&bounded(s.dtSeconds,1e-6,0.01)&&s.steps*s.dtSeconds<=30,'Scenario execution bound');
 check(bounded(s.openCircuitVolts,0,24)&&bounded(s.batteryResistanceOhm,0,10)&&bounded(s.ambientC,-20,60),'Invalid supply/ambient');
 const mechanicalRate=(p.torqueConstantNmPerAmp**2/p.resistanceOhm+p.viscousFrictionNmPerRadPerSec)/p.inertiaKgM2;
 check(s.dtSeconds*mechanicalRate<=0.1&&s.dtSeconds*p.coolingWPerK/p.thermalCapacityJPerK<=0.1,'Timestep too large for selected model rates');
}
// States: angular speed, temperature, integrated source energy, battery loss, viscous loss, cooling.
function derivative(y,p,s){
 const [w,T]=y,R=p.resistanceOhm*(1+p.resistanceTempCoeffPerK*(T-s.ambientC));
 check(y.every(Number.isFinite)&&bounded(w,-1e-10,1e6)&&bounded(T,s.ambientC-1e-8,500)&&R>0,'Numerical state outside supported model domain');
 const I=(s.openCircuitVolts-p.torqueConstantNmPerAmp*w)/(R+s.batteryResistanceOhm);
 check(I>=-1e-10&&I<=1e5,'Regeneration or excessive current outside benchmark scope');
 const loss=I*I*R,cooling=p.coolingWPerK*(T-s.ambientC);
 return [(p.torqueConstantNmPerAmp*I-p.viscousFrictionNmPerRadPerSec*w)/p.inertiaKgM2,(loss-cooling)/p.thermalCapacityJPerK,s.openCircuitVolts*I,I*I*s.batteryResistanceOhm,p.viscousFrictionNmPerRadPerSec*w*w,cooling];
}
function sample(y,p,s,t){const R=p.resistanceOhm*(1+p.resistanceTempCoeffPerK*(y[1]-s.ambientC)),currentAmp=(s.openCircuitVolts-p.torqueConstantNmPerAmp*y[0])/(R+s.batteryResistanceOhm);return {timeSeconds:t,angularSpeedRadPerSec:y[0],temperatureC:y[1],currentAmp,terminalVolts:s.openCircuitVolts-s.batteryResistanceOhm*currentAmp};}
export function simulateMotor(parameters,scenario){
 validateInputs(parameters,scenario);const p=parameters,s=scenario,dt=s.dtSeconds;let y=[0,s.ambientC,0,0,0,0];const trace=[sample(y,p,s,0)];
 const add=(a,b,k)=>a.map((v,i)=>v+b[i]*k);
 for(let i=0;i<s.steps;i++){const a=derivative(y,p,s),b=derivative(add(y,a,dt/2),p,s),c=derivative(add(y,b,dt/2),p,s),d=derivative(add(y,c,dt),p,s);y=y.map((v,j)=>v+dt*(a[j]+2*b[j]+2*c[j]+d[j])/6);derivative(y,p,s);trace.push(sample(y,p,s,(i+1)*dt));}
 const kineticJ=0.5*p.inertiaKgM2*y[0]**2,thermalJ=p.thermalCapacityJPerK*(y[1]-s.ambientC),residualJ=y[2]-kineticJ-thermalJ-y[3]-y[4]-y[5];
 return {trace,traceSha256:digest(trace),final:trace.at(-1),energy:{sourceJ:y[2],rotationalKineticJ:kineticJ,thermalStoredJ:thermalJ,batteryDissipatedJ:y[3],viscousDissipatedJ:y[4],coolingJ:y[5],residualJ,relativeResidual:Math.abs(residualJ)/Math.max(1,Math.abs(y[2]))}};
}
export function runMotorBenchmark(config){
 check(Buffer.byteLength(JSON.stringify(config),'utf8')<=16384,'Config size bound');closed(config,['schema','basis','assumptionStatement','baseline','candidate','scenario']);
 check(config.schema==='frc-motor-physics-benchmark/v1'&&config.basis==='synthetic-unvalidated'&&typeof config.assumptionStatement==='string'&&config.assumptionStatement.trim()&&config.assumptionStatement.length<=4096,'Explicit synthetic assumptions required');
 check(config.scenario?.steps<=5000&&config.scenario?.dtSeconds>=2e-6,'Benchmark bounds require steps<=5000 and dt>=0.000002 for timestep-halving replay');
 const runs={};for(const key of ['baseline','candidate']){const subject=config[key];closed(subject,['subject','parameters']);closed(subject.subject,['codeSha256','cadSha256']);check(hash(subject.subject.codeSha256)&&hash(subject.subject.cadSha256),'Explicit subject attribution hashes required');
 const coarse=simulateMotor(subject.parameters,config.scenario),fine=simulateMotor(subject.parameters,{...config.scenario,steps:config.scenario.steps*2,dtSeconds:config.scenario.dtSeconds/2});
 let speedRelativeDifference=0,temperatureDifferenceC=0;for(let i=0;i<coarse.trace.length;i++){const a=coarse.trace[i],b=fine.trace[2*i];speedRelativeDifference=Math.max(speedRelativeDifference,Math.abs(a.angularSpeedRadPerSec-b.angularSpeedRadPerSec)/Math.max(1,Math.abs(b.angularSpeedRadPerSec)));temperatureDifferenceC=Math.max(temperatureDifferenceC,Math.abs(a.temperatureC-b.temperatureC));}
 const numericalChecks={energyRelativeResidualLimit:1e-5,speedRelativeDifferenceLimit:1e-4,temperatureDifferenceLimitC:1e-5,speedRelativeDifference,temperatureDifferenceC,passed:Math.max(coarse.energy.relativeResidual,fine.energy.relativeResidual)<=1e-5&&speedRelativeDifference<=1e-4&&temperatureDifferenceC<=1e-5};
 runs[key]={subject:structuredClone(subject.subject),parameterSha256:digest(subject.parameters),coarse,fine,numericalChecks};}
 return {schema:'frc-motor-physics-receipt/v1',model:MODEL,modelSourceSha256:createHash('sha256').update(fs.readFileSync(new URL('motor-physics.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),configSha256:digest(config),scenarioSha256:digest(config.scenario),runStatus:'executed',runtime:{node:process.version,platform:process.platform,arch:process.arch},runs,coveredModelDomains:['voltage-ohmic-sag','single-node-motor-heat','viscous-rotor-friction','rotational-inertia'],unsupportedRobotDomains:['chassis-weight-distribution','tire-contact','mechanism-interaction','candidate-code-execution','candidate-cad-extraction'],candidateBinding:'unverified',robotCodeExecuted:false,cadGeometryExecuted:false,calibration:'none',engineeringAcceptance:'blocked',limitations:[...LIMITATIONS]};
}
export function validateMotorReceipt(config,receipt){check(receipt&&digest(runMotorBenchmark(config))===digest(receipt),'Motor receipt differs from registered-model replay');return true;}


