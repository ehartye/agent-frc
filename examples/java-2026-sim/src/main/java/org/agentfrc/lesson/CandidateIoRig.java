package org.agentfrc.lesson;
import edu.wpi.first.math.system.plant.DCMotor;
import edu.wpi.first.math.system.plant.LinearSystemId;
import edu.wpi.first.wpilibj.simulation.*;
/** Separate simulation adapter. Load provenance and missing physical effects belong to each explicit fixture. */
public final class CandidateIoRig implements AutoCloseable {
 // Physical sensor fixture is independent of controller configuration/constants.
 public static final double PHYSICAL_RAD_PER_PULSE=2*Math.PI/2048;
 public record Result(double trueRate,double measuredRate,double pwm,double appliedVolts,double currentAmp){}
 private final CandidateIoController controller;
 private final EncoderSim sensor;
 private final PWMSim pwm;
 private final FlywheelSim plant;
 private final double supply;
 public CandidateIoRig(double inertia,double encoderScale,double supply){
  if(!Double.isFinite(inertia)||inertia<=0||inertia>10||!Double.isFinite(supply)||supply<0||supply>12)throw new IllegalArgumentException("Fixture parameters");
  this.supply=supply;controller=new CandidateIoController(encoderScale);sensor=EncoderSim.createForChannel(0);pwm=new PWMSim(0);
  var motor=DCMotor.getNEO(1);plant=new FlywheelSim(LinearSystemId.createFlywheelSystem(motor,inertia,1),motor);sensor.setPeriod(Double.MAX_VALUE);
 }
 public Result step(boolean enabled,double target){
  RoboRioSim.setVInVoltage(supply);controller.periodic(enabled,target);double speed=pwm.getSpeed(),applied=speed*supply;
  plant.setInputVoltage(applied);plant.update(0.02);double w=plant.getAngularVelocityRadPerSec();
  // Independent physical pulse conversion: never use configured encoder scale here.
  sensor.setPeriod(w==0?Double.MAX_VALUE:PHYSICAL_RAD_PER_PULSE/w);
  return new Result(w,controller.measuredRate(),speed,applied,plant.getCurrentDrawAmps());
 }
 @Override public void close(){controller.close();plant.setInputVoltage(0);}
}

