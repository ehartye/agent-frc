"""Event-exact 1D acquisition boundary; not wired to the retained-rest Java plant."""
import math,json,pathlib,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1];G=9.80665
PINS=['scripts/acquisition-contract.py','case-studies/integrated-prototype-targets.json','case-studies/coral-mass-evidence.json','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/IntegratedPregripPrototype.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/PoweredGuidePlant.java']
def finite(x):
 if isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x):raise ValueError('finite input required')
 return x

def acquire(mass,angle,speed=.6,distance=.02,drag=.02,stop=True,restitution=0,retention='verified-virtual',capacity=.2,dwell=.2):
 for x in (mass,angle,speed,distance,drag,restitution,capacity,dwell):finite(x)
 if mass<=0 or not 0<=angle<=math.pi/2 or speed<=0 or distance<=0 or drag<0 or not 0<=restitution<=1 or capacity<0 or dwell<=0:raise ValueError('domain')
 if type(stop) is not bool or retention not in ('verified-virtual','missing','uncertain'):raise ValueError('observation domain')
 # Body center q=0 is the registered pregrip start. A real stop would contact the leading surface, not this center.
 a=G*math.sin(angle)+drag/mass;initial=.5*mass*speed**2;available=speed**2-2*a*distance
 travel=distance if available>0 else speed**2/(2*a)
 arrivalSpeed=math.sqrt(max(0,available));time=(speed-arrivalSpeed)/a if a else distance/speed
 q=-distance+travel;impact=stop and available>0
 after=-restitution*arrivalSpeed if impact else arrivalSpeed
 loss=.5*mass*(arrivalSpeed**2-after**2) if impact else 0
 gravitational=mass*G*math.sin(angle)*travel;friction=drag*travel
 final=.5*mass*after**2
 energyResidual=initial-gravitational-friction-loss-final
 eligible=impact and restitution==0 and loss<=capacity and retention=='verified-virtual'
 reason='conditional-retained-rest' if eligible else ('stalled-before-stop' if available<=0 else 'stop-absent' if not stop else 'rebound-no-settling' if restitution else 'stop-energy-capacity-exceeded' if loss>capacity else 'retention-not-established')
 trace=[dict(timeS=0,qM=-distance,vMps=speed,event='source-boundary'),dict(timeS=time,qM=q,vMps=arrivalSpeed,event='pre-impact' if impact else 'travel-terminal')]
 if impact:trace.append(dict(timeS=time,qM=q,vMps=after,event='impulse-accounted-impact'))
 if eligible:trace.append(dict(timeS=time+dwell,qM=q,vMps=0,event='conditional-latch-dwell'))
 return dict(inputs=locals_input(mass,angle,speed,distance,drag,stop,restitution,retention,capacity,dwell),trace=trace,sourceKineticEnergyJ=initial,potentialGainJ=gravitational,guideLossJ=friction,impactLossJ=loss,remainingKineticEnergyJ=final,energyResidualJ=energyResidual,requiredImpulseNs=mass*(after-arrivalSpeed) if impact else 0,requiredStaticRetentionForceN=mass*G*math.sin(angle),reason=reason,conditionalStateEligible=eligible,javaHandoffExecuted=False,terminalState=dict(qM=q,vMps=after),unresolvedPostTerminalDynamics=not eligible)
def locals_input(*values):return dict(zip(['massKg','pitchRad','sourceSpeedMps','distanceM','dragN','stopPresent','restitution','retentionEvidence','stopEnergyCapacityJ','dwellS'],values))
def report():
 runtime=json.loads((ROOT/PINS[1]).read_text());masses=sorted({(c['season'],c['sourceExit']['massKg'],c['sourceExit']['angleRad']) for c in runtime['cases']})
 rows=[]
 scenarios=[('nominal',{}),('no-stop',dict(stop=False)),('elastic-no-damping',dict(restitution=1,drag=0)),('excess-speed',dict(speed=4)),('missing-retention',dict(retention='missing')),('uncertain-retention',dict(retention='uncertain')),('underfed',dict(speed=.05))]
 for year,mass,angle in masses:
  for name,kw in scenarios:rows.append(dict(season=year,scenario=name,**acquire(mass,angle,**kw)))
 return dict(schema='frc-acquisition-contract/v1',pins={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},cases=rows,assumptions=['New constrained straight approach, same pitch as powered guide; prior floor or pad geometry not reused','Source delivers moving body at q=-.02m, speed.6m/s; its kinetic energy is explicit external input, not simulated human/intake acquisition','Hypothetical rigid stop with zero restitution plus passive latch; instantaneous velocity change is an explicitly accounted impulse, not hidden state reset','Hypothetical .2J stop capacity, .02N guide drag, .2s retained dwell; no sourced material or actuator rating','Latch supplies uphill weight reaction without motion/work during dwell; verified-virtual is a prescribed observation, not real evidence','No spin, lateral pose, deformation, peak impact force, compliance or source geometry modeled'],handoff=dict(runtimeConnected=False,required=['Import actual terminal q,v,time into shared plant, no fresh feed(0) reset','Demonstrate center q=0 registration and body pose to actual guide','Establish physical retention through nip closure and gate sequence','Validate bumper stroke/load and latch release path; currently ideal impulse','Keep acquisition source energy separate from subsequent motor work'],currentJavaBoundary='IntegratedPregripPrototype constructs a fresh PoweredGuidePlant and calls feed(0); it accepts no acquisition state'),calibration=None,officialScore=None,engineeringAcceptance='blocked')
if __name__=='__main__':print(json.dumps(report(),indent=2,allow_nan=False))
