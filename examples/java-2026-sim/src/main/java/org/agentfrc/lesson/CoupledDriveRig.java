package org.agentfrc.lesson;
import edu.wpi.first.math.system.plant.*;
import edu.wpi.first.wpilibj.simulation.*;
/** Integrated planar no-slip drivetrain + authentic bare-wheel auxiliary on one assumed supply. */
public final class CoupledDriveRig implements AutoCloseable {
 public enum NeutralMode { BRAKE, COAST }
 public record Parameters(double massKg,double yawInertia,double trackWidth,double radius,double gearing,double voc,double rb){
  public Parameters{double[] v={massKg,yawInertia,trackWidth,radius,gearing,voc};for(double x:v)if(!Double.isFinite(x)||x<=0)throw new IllegalArgumentException("Positive finite assumptions required");if(massKg<1||massKg>100||yawInertia<.01||yawInertia>50||trackWidth<.1||trackWidth>2||radius<.01||radius>.5||gearing<1||gearing>50||voc<1||voc>14||!Double.isFinite(rb)||rb<0||rb>.1)throw new IllegalArgumentException("Assumption bounds");var motor=DCMotor.getNEO(2);double damping=gearing*gearing*motor.KtNMPerAmp/(motor.rOhms*motor.KvRadPerSecPerVolt*radius*radius)*Math.max(2/massKg,trackWidth*trackWidth/(2*yawInertia));if(damping>10000)throw new IllegalArgumentException("Unsupported numerical stiffness");}
 }
 public record Sample(double time,double x,double y,double heading,double leftSpeed,double rightSpeed,double measuredLeft,double measuredRight,double measuredHeading,double bus,double batteryAmps,double leftDuty,double rightDuty,double auxDuty,double auxSpeed,double electricalResidual,boolean leftOpen,boolean rightOpen,boolean auxiliaryOpen){}
 // Separate physical pulse convention: changing controller conversion must not cancel here.
 private final double physicalMetersPerPulse;
 private final CoupledDriveController controller;private final NeutralDrivetrainSim drive;private final NeutralMode neutralMode;private final FlywheelSim auxiliary;
 private final DCMotor motors=DCMotor.getNEO(2),auxMotor=DCMotor.getNEO(1);private final EncoderSim l,r;private final AnalogGyroSim gyro;private final PWMSim lp,rp,ap;private final Parameters p;
 private double time,bus,sourceJ,batteryLossJ,copperJ,emfExchangeJ;
 public CoupledDriveRig(Parameters p,double cadInertia,double sensorScale){this(p,cadInertia,sensorScale,NeutralMode.BRAKE);}
 public CoupledDriveRig(Parameters p,double cadInertia,double sensorScale,NeutralMode neutralMode){
  if(neutralMode==null)throw new IllegalArgumentException("Explicit neutral mode required");this.neutralMode=neutralMode;
  if(!Double.isFinite(cadInertia)||cadInertia<1e-6||cadInertia>.1)throw new IllegalArgumentException("Native load inertia");this.p=p;physicalMetersPerPulse=2*Math.PI*p.radius()/2048;bus=p.voc();controller=new CoupledDriveController(sensorScale);l=EncoderSim.createForChannel(0);r=EncoderSim.createForChannel(2);gyro=new AnalogGyroSim(0);lp=new PWMSim(0);rp=new PWMSim(1);ap=new PWMSim(2);
  drive=new NeutralDrivetrainSim(motors,p.gearing(),p.yawInertia(),p.massKg(),p.radius(),p.trackWidth());auxiliary=new FlywheelSim(LinearSystemId.createFlywheelSystem(auxMotor,cadInertia,1),auxMotor);
  l.setPeriod(Double.MAX_VALUE);r.setPeriod(Double.MAX_VALUE);gyro.setAngle(0);RoboRioSim.setVInVoltage(bus);
 }
 public Sample step(boolean enabled,double lt,double rt,double ad,int substeps){
  if(substeps<20||substeps>200||200%substeps!=0)throw new IllegalArgumentException("Bounded substeps");controller.periodic(enabled,lt,rt,ad);double[] duty={lp.getSpeed(),rp.getSpeed(),ap.getSpeed()};boolean[] closed={neutralMode==NeutralMode.BRAKE||duty[0]!=0,neutralMode==NeutralMode.BRAKE||duty[1]!=0,neutralMode==NeutralMode.BRAKE||duty[2]!=0};drive.setOpen(!closed[0],!closed[1]);double dt=.02/substeps;SharedSupply.Result supply=null;
  for(int k=0;k<substeps;k++){
   double[] emf={drive.getLeftVelocityMetersPerSecond()*p.gearing()/p.radius()/motors.KvRadPerSecPerVolt,drive.getRightVelocityMetersPerSecond()*p.gearing()/p.radius()/motors.KvRadPerSecPerVolt,auxiliary.getAngularVelocityRadPerSec()/auxMotor.KvRadPerSecPerVolt};double[] resistance={motors.rOhms,motors.rOhms,auxMotor.rOhms};
   supply=SharedSupply.solve(p.voc(),p.rb(),duty,emf,resistance,closed);bus=supply.volts();RoboRioSim.setVInVoltage(bus);
   sourceJ+=p.voc()*supply.batteryAmps()*dt;batteryLossJ+=p.rb()*supply.batteryAmps()*supply.batteryAmps()*dt;
   for(int i=0;i<3;i++){double current=supply.armatureAmps()[i];copperJ+=current*current*resistance[i]*dt;emfExchangeJ+=emf[i]*current*dt;}
   drive.setInputs(duty[0]*bus,duty[1]*bus);auxiliary.setInputVoltage(duty[2]*bus);drive.update(dt);if(closed[2])auxiliary.update(dt);for(double state:new double[]{drive.getPose().getX(),drive.getPose().getY(),drive.getHeading().getRadians(),drive.getLeftVelocityMetersPerSecond(),drive.getRightVelocityMetersPerSecond(),auxiliary.getAngularVelocityRadPerSec()})if(!Double.isFinite(state))throw new IllegalStateException("Nonfinite integrated state");time+=dt;
  }
  double lv=drive.getLeftVelocityMetersPerSecond(),rv=drive.getRightVelocityMetersPerSecond();l.setPeriod(lv==0?Double.MAX_VALUE:physicalMetersPerPulse/lv);r.setPeriod(rv==0?Double.MAX_VALUE:physicalMetersPerPulse/rv);l.setDirection(lv>=0);r.setDirection(rv>=0);gyro.setAngle(-drive.getHeading().getDegrees());
  return new Sample(time,drive.getPose().getX(),drive.getPose().getY(),drive.getHeading().getRadians(),lv,rv,controller.leftRate(),controller.rightRate(),controller.headingDegrees(),bus,supply.batteryAmps(),duty[0],duty[1],duty[2],auxiliary.getAngularVelocityRadPerSec(),supply.maxElectricalResidualWatts(),!closed[0],!closed[1],!closed[2]);
 }
 public double copperLossJ(){return copperJ;}
 public double electricalLedgerResidual(){return sourceJ-batteryLossJ-copperJ-emfExchangeJ;}
 public void close(){controller.close();RoboRioSim.setVInVoltage(12);}
}
