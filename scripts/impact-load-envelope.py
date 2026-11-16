"""Declared collision scenarios, NOT bumper ratings or structural qualification.
Two freely translating bodies, central normal collision, perfectly inelastic end.
No tire/field impulse, rotation coupling, deformation curve or measured duration.
"""
import math,json,argparse,pathlib,itertools
LB_KG=0.45359237

def positive(value,name,zero=False):
 if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or (value<0 if zero else value<=0):raise ValueError(name)
 return float(value)

def scenario(own_kg,opponent_kg,relative_speed_mps,relative_compression_m,offset_m=0):
 m=positive(own_kg,'own mass');n=positive(opponent_kg,'opponent mass');v=positive(relative_speed_mps,'closing speed',True);d=positive(relative_compression_m,'relative compression');r=positive(offset_m,'offset',True)
 if not(.001<=m<=1e6 and .001<=n<=1e6 and v<=100 and 1e-6<=d<=10 and r<=10):raise ValueError('outside numerical screening domain')
 mu=m/(1+m/n);energy=.5*mu*v*v;impulse=mu*v;force=energy/d
 # Offset result is only a load-path torque scale. Actual off-axis dynamics change the effective mass.
 out=dict(ownMassKg=m,opponentMassKg=n,closingSpeedMps=v,assumedRelativeCompressionM=d,loadPathOffsetM=r,reducedMassKg=mu,relativeEnergyJ=energy,centralInelasticImpulseNs=impulse,ownDeltaVMps=impulse/m,opponentDeltaVMps=impulse/n,averageCompressionForceN=force,offsetMomentScaleNm=force*r,constantForceDurationS=(2*d/v if v else None),peakForceN=None,structuralPass=None,scope='Central 1D unpowered free bodies; offset moment is a separate screening scale, not rotational dynamics')
 if any(isinstance(x,(int,float)) and not math.isfinite(x) for x in out.values()):raise ValueError('nonfinite computed load')
 return out

def report():
 rows=[scenario(a*LB_KG,b*LB_KG,v,d,r) for a,b,v,d,r in itertools.product((100,120),(100,120,150),(2,4,6),(.025,.05,.1),(0,.25))]
 return dict(schema='frc-assumed-impact-load-envelope/v1',scenarioCount=len(rows),cases=rows,assumptions=['Masses are design scenarios, not measured robot masses or season limits','Closing speed is relative, not each robot speed','Compression is combined relative crush distance, not bumper thickness','Perfectly inelastic normal collision; no external field/traction impulse','Average force from energy/distance does not establish peak force or strength','Offset moment scale is not a solved off-axis collision','No bumper stiffness, attachment stress, fatigue, fastener shear, retention or injury claim'],requiredNext=['Attach candidate bumper/frame/attachment geometry','Choose mass and inertia estimates from assembly','Bound normal and oblique impact cases with traction and deformation','Check load paths, joint bearing/shear, bending, exposed mechanisms and retained components','Keep collision avoidance/arena simulation distinct from structural survivability'])
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.write_text(json.dumps(report(),indent=2,allow_nan=False)+'\n')
