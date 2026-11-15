package org.agentfrc.lesson;

import java.io.IOException;
import java.util.Properties;
import edu.wpi.first.math.MathUtil;
import edu.wpi.first.math.controller.PIDController;
import edu.wpi.first.math.system.plant.DCMotor;
import edu.wpi.first.math.system.plant.LinearSystemId;
import edu.wpi.first.math.util.Units;
import edu.wpi.first.wpilibj.simulation.ElevatorSim;
import edu.wpi.first.wpilibj.simulation.FlywheelSim;

/** Original desktop mechanism slice. No real IO, game-clock parser or legality engine. */
public final class SeasonMechanism implements AutoCloseable {
  public enum Gate { ACTIVE, INACTIVE, UNKNOWN }
  public record Sample(double position, double volts, boolean feeding, boolean fault, int inventory) {}
  public static final double DT=0.02;
  private final DCMotor motor=DCMotor.getNEO(1);
  private final FlywheelSim wheel;
  private final ElevatorSim lift;
  private final PIDController pid;
  private final double target, gravityVolts, autoSeconds;
  private int inventory, stable;
  private double volts, releaseTime;
  private boolean feeding, fault, sensorValid=true;

  public SeasonMechanism(int season) {
    if(season<2024||season>2026) throw new IllegalArgumentException("Unsupported educational case");
    Properties p=new Properties();
    try(var stream=SeasonMechanism.class.getResourceAsStream("/case-"+season+".properties")) {
      if(stream==null) throw new IllegalStateException("Missing case parameters"); p.load(stream);
    } catch(IOException e) { throw new IllegalStateException(e); }
    target=number(p,"target");autoSeconds=number(p,"autoSeconds");
    if(p.getProperty("kind").equals("elevator")) {
      double mass=number(p,"carriageMass"),radius=number(p,"drumRadius"),gear=number(p,"gearing");
      lift=new ElevatorSim(motor,gear,mass,radius,0,number(p,"maxHeight"),true,0);
      wheel=null;pid=new PIDController(40,0,2,DT);
      gravityVolts=mass*9.8*radius/gear/motor.KtNMPerAmp*motor.rOhms;
    } else {
      wheel=new FlywheelSim(LinearSystemId.createFlywheelSystem(motor,number(p,"inertia"),number(p,"gearing")),motor);
      lift=null;pid=new PIDController(0.04,0,0,DT);gravityVolts=0;
    }
  }
  private static double number(Properties p,String key) {
    double n=Double.parseDouble(p.getProperty(key));
    if(!Double.isFinite(n)||n<=0)throw new IllegalArgumentException("Invalid parameter "+key);return n;
  }
  /** Synthetic inventory event, not a sensor or motor operation. Capacity one is our design choice. */
  public boolean acquire() { if(inventory!=0||fault)return false;inventory=1;return true; }
  public void completeRelease() {inventory=0;releaseTime=0;feeding=false;}
  public void setSensorValid(boolean value) {sensorValid=value;}
  public void resetFaultWhileDisabled(boolean disabled) {
    if(!disabled)throw new IllegalStateException("Disable before reset");fault=false;stable=0;releaseTime=0;pid.reset();
  }
  public Sample step(boolean enabled,boolean scoreRequest,Gate gate,boolean aligned,double supplyVolts) {
    if(gate==null||!Double.isFinite(supplyVolts)||supplyVolts<0||supplyVolts>12)
      throw new IllegalArgumentException("Invalid fixture input");
    feeding=false;volts=0;
    if(!sensorValid)fault=true;
    if(enabled&&!fault&&scoreRequest&&inventory>0) {
      double measurement=position();
      double feedforward=lift!=null?gravityVolts:Units.rotationsPerMinuteToRadiansPerSecond(target)/motor.KvRadPerSecPerVolt;
      // Wheel feedback uses radians/second; lift uses metres.
      volts=MathUtil.clamp(feedforward+pid.calculate(lift!=null?measurement:Units.rotationsPerMinuteToRadiansPerSecond(measurement),lift!=null?target:Units.rotationsPerMinuteToRadiansPerSecond(target)),-supplyVolts,supplyVolts);
      boolean ready=Math.abs(measurement-target)<(lift!=null?0.015:75);
      stable=ready?stable+1:0;
      feeding=stable>=5&&gate==Gate.ACTIVE&&aligned;
      if(feeding)releaseTime+=DT;
      if(releaseTime>=0.5){fault=true;feeding=false;volts=0;}
    } else {stable=0;releaseTime=0;pid.reset();}
    if(lift!=null){lift.setInputVoltage(volts);lift.update(DT);}
    else {wheel.setInputVoltage(volts);wheel.update(DT);}
    return snapshot();
  }
  /** Caller supplies monotonic elapsed AUTO time; this is not a Driver Station/FMS adapter. */
  public Sample autonomousStep(double elapsedSeconds,Gate gate,boolean aligned,double supplyVolts) {
    if(!Double.isFinite(elapsedSeconds)||elapsedSeconds<0)throw new IllegalArgumentException("Invalid elapsed time");
    return step(elapsedSeconds<autoSeconds,true,gate,aligned,supplyVolts);
  }
  public double position(){return lift!=null?lift.getPositionMeters():wheel.getAngularVelocityRPM();}
  public double target(){return target;}
  public Sample snapshot(){return new Sample(position(),volts,feeding,fault,inventory);}
  @Override public void close(){volts=0;feeding=false;pid.close();if(lift!=null)lift.setInputVoltage(0);else wheel.setInputVoltage(0);}
}
