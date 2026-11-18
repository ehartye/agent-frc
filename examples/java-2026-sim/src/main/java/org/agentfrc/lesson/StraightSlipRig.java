package org.agentfrc.lesson;
import edu.wpi.first.math.system.plant.*;import edu.wpi.first.wpilibj.simulation.*;
/** Straight symmetric level-surface plant. Replaces, never adds force to, the no-slip drive plant. */
public final class StraightSlipRig implements AutoCloseable {
 public record Sample(double x,double velocity,double wheelSurfaceSpeed,double encoderRate,double encoderDistance,double wheelDistance,double slip,double bus,double batteryAmps,double leftForce,double rightForce,double contactLossJ,double projectionLossJ,double mechanicalResidual,double auxOmega){}
 private final CoupledDriveController controller;private final LongitudinalContact contact;private final CoupledDriveRig.Parameters p;private final DCMotor driveMotor,auxMotor;private final FlywheelSim auxiliary;private final EncoderSim l,r;private final AnalogGyroSim gyro;private final PWMSim lp,rp,ap;
 private double x,v,wl,wr,angleL,angleR,bus,work,loss,projection;
 private static final double PHYSICAL_RAD_PER_PULSE=2*Math.PI/2048;
 public StraightSlipRig(CoupledDriveRig.Parameters p,double sideInertia,double mu,double cadAuxInertia,NeoEvidenceProfile profile){
  if(profile==null||!Double.isFinite(cadAuxInertia)||cadAuxInertia<1e-6||cadAuxInertia>.1)throw new IllegalArgumentException("Explicit source profile/native load required");this.p=p;contact=new LongitudinalContact(p.massKg(),p.radius(),sideInertia,mu);driveMotor=profile.motor(2);auxMotor=profile.motor(1);controller=new CoupledDriveController(1);l=EncoderSim.createForChannel(0);r=EncoderSim.createForChannel(2);gyro=new AnalogGyroSim(0);lp=new PWMSim(0);rp=new PWMSim(1);ap=new PWMSim(2);auxiliary=new FlywheelSim(LinearSystemId.createFlywheelSystem(auxMotor,cadAuxInertia,1),auxMotor);l.setPeriod(Double.MAX_VALUE);r.setPeriod(Double.MAX_VALUE);l.setCount(0);r.setCount(0);gyro.setAngle(0);bus=p.voc();RoboRioSim.setVInVoltage(bus);
 }
 public Sample step(boolean enabled,double target,double auxDuty,int substeps){
  if(substeps<20||substeps>200||200%substeps!=0)throw new IllegalArgumentException("Bounded traction timestep");double dt=.02/substeps;double damping=p.gearing()*p.gearing()*driveMotor.KtNMPerAmp/(driveMotor.rOhms*driveMotor.KvRadPerSecPerVolt*contact.inertia);if(dt*damping>.25)throw new IllegalArgumentException("Unsupported explicit motor-step stiffness");
  controller.periodic(enabled,target,target,auxDuty);double[] d={lp.getSpeed(),rp.getSpeed(),ap.getSpeed()};if(Math.abs(d[0]-d[1])>1e-8)throw new IllegalArgumentException("Unsupported asymmetric/turning demand");SharedSupply.Result supply=null;LongitudinalContact.Result c=null;
  for(int k=0;k<substeps;k++){
   double[] emf={wl*p.gearing()/driveMotor.KvRadPerSecPerVolt,wr*p.gearing()/driveMotor.KvRadPerSecPerVolt,auxiliary.getAngularVelocityRadPerSec()/auxMotor.KvRadPerSecPerVolt};supply=SharedSupply.solve(p.voc(),p.rb(),d,emf,new double[]{driveMotor.rOhms,driveMotor.rOhms,auxMotor.rOhms});bus=supply.volts();RoboRioSim.setVInVoltage(bus);
   double tl=p.gearing()*driveMotor.KtNMPerAmp*supply.armatureAmps()[0],tr=p.gearing()*driveMotor.KtNMPerAmp*supply.armatureAmps()[1];double fl=wl+tl*dt/contact.inertia,fr=wr+tr*dt/contact.inertia;work+=tl*dt*(wl+fl)/2+tr*dt*(wr+fr)/2;
   c=contact.resolve(v,fl,fr,dt);v=c.velocity();wl=c.leftOmega();wr=c.rightOmega();loss+=c.lossJ();projection+=c.projectionLossJ();x+=v*dt;angleL+=wl*dt;angleR+=wr*dt;auxiliary.setInputVoltage(d[2]*bus);auxiliary.update(dt);
   if(Math.abs(contact.kinetic(v,wl,wr)+loss-work)>1e-6)throw new IllegalStateException("Mechanical-only work audit");
  }
  l.setPeriod(wl==0?Double.MAX_VALUE:PHYSICAL_RAD_PER_PULSE/wl);r.setPeriod(wr==0?Double.MAX_VALUE:PHYSICAL_RAD_PER_PULSE/wr);l.setCount((int)Math.round(angleL/PHYSICAL_RAD_PER_PULSE));r.setCount((int)Math.round(angleR/PHYSICAL_RAD_PER_PULSE));gyro.setAngle(0);
  return new Sample(x,v,p.radius()*wl,controller.leftRate(),controller.leftDistanceMeters(),p.radius()*angleL,c.leftSlip(),bus,supply.batteryAmps(),c.leftImpulse()/dt,c.rightImpulse()/dt,loss,projection,contact.kinetic(v,wl,wr)+loss-work,auxiliary.getAngularVelocityRadPerSec());
 }
 public void close(){controller.close();RoboRioSim.setVInVoltage(12);}
}
