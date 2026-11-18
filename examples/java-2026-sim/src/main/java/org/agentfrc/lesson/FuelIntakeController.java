package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Offline sensor-supervised contact experiment. Controller state is not proof of retention. */
public final class FuelIntakeController implements AutoCloseable {
 public enum Phase {ACQUIRE,DWELL,REVERSE,EXIT,DONE,FAULT}
 private final Encoder encoder;private final DigitalInput nip,exit;private final PWMSparkMax motor;private Phase phase=Phase.ACQUIRE;private double time,phaseTime,previous,rate;private boolean initialized;
 public FuelIntakeController(){if(RobotBase.isReal())throw new IllegalStateException("Offline only");encoder=new Encoder(0,1);encoder.setDistancePerPulse(2*Math.PI/2048);nip=new DigitalInput(2);exit=new DigitalInput(3);motor=new PWMSparkMax(0);}
 public void periodic(boolean enabled,boolean releaseRequested){if(phase==Phase.DONE||phase==Phase.FAULT){motor.set(0);return;}double angle=encoder.getDistance();rate=(angle-previous)/.02;previous=angle;time+=.02;phaseTime+=.02;boolean occupied=!nip.get();if(!initialized){initialized=true;if(occupied||exit.get())phase=Phase.FAULT;}if(!enabled||RobotController.getBatteryVoltage()<6||time>4||!Double.isFinite(rate))phase=Phase.FAULT;
  if(phase==Phase.ACQUIRE&&rate>1)phase=Phase.FAULT;
  if(phase==Phase.ACQUIRE&&occupied){phase=Phase.DWELL;phaseTime=0;}
  else if(phase==Phase.DWELL){if(!occupied)phase=Phase.FAULT;else if(phaseTime>=.5&&releaseRequested){phase=Phase.REVERSE;phaseTime=0;}}
  else if(phase==Phase.REVERSE&&!occupied){phase=Phase.EXIT;phaseTime=0;}
  else if(phase==Phase.EXIT&&exit.get()){phase=Phase.DONE;phaseTime=0;}
  motor.set(phase==Phase.ACQUIRE?-.12:phase==Phase.REVERSE?.12:0);
 }
 public Phase phase(){return phase;}public double rate(){return rate;}
 @Override public void close(){motor.set(0);motor.close();encoder.close();nip.close();exit.close();}
}
