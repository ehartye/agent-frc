package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Actual offline PWM/encoder/DIO controller plus a simulation-only neutral-mode request. No CAN adapter. */
public final class PassiveUnloadController implements AutoCloseable {
 public enum Phase {ACQUIRE,DWELL,UNLOAD,DONE,FAULT}
 private final Encoder encoder;private final DigitalInput nip,exit;private final PWMSparkMax motor;private final PassiveUnloadPlant.NeutralMode policy;private PassiveUnloadPlant.NeutralMode commanded=PassiveUnloadPlant.NeutralMode.BRAKE;private Phase phase=Phase.ACQUIRE;private double time,phaseTime,previous,rate;private int stable;private boolean initialized,exitBlocked;
 public PassiveUnloadController(PassiveUnloadPlant.NeutralMode policy){if(RobotBase.isReal())throw new IllegalStateException("Offline only; no neutral-mode hardware adapter");if(policy==null)throw new IllegalArgumentException("Policy required");this.policy=policy;encoder=new Encoder(0,1);encoder.setDistancePerPulse(2*Math.PI/2048);nip=new DigitalInput(2);exit=new DigitalInput(3);motor=new PWMSparkMax(0);}
 public void periodic(boolean enabled,boolean unloadRequested){if(!enabled){phase=Phase.FAULT;motor.set(0);commanded=PassiveUnloadPlant.NeutralMode.BRAKE;return;}if(phase==Phase.FAULT){motor.set(0);commanded=PassiveUnloadPlant.NeutralMode.BRAKE;return;}if(phase==Phase.DONE){motor.set(0);return;}double angle=encoder.getDistance();rate=(angle-previous)/.02;previous=angle;time+=.02;phaseTime+=.02;boolean occupied=!nip.get();if(!initialized){initialized=true;if(occupied||exit.get())phase=Phase.FAULT;}if(!enabled||RobotController.getBatteryVoltage()<6||time>4||!Double.isFinite(rate))phase=Phase.FAULT;
 if(phase==Phase.ACQUIRE&&rate>1)phase=Phase.FAULT;
 if(phase==Phase.ACQUIRE&&occupied){phase=Phase.DWELL;phaseTime=0;}
 else if(phase==Phase.DWELL){stable=occupied&&Math.abs(rate)<=.2?stable+1:0;if(!occupied)phase=Phase.FAULT;else if(phaseTime>=.5&&stable>=3&&unloadRequested){if(!exit.get())phase=Phase.FAULT;else{phase=Phase.UNLOAD;phaseTime=0;commanded=policy;}}}
 else if(phase==Phase.UNLOAD){if(!exit.get())exitBlocked=true;else if(exitBlocked)phase=Phase.DONE;}
 if(phase==Phase.FAULT)commanded=PassiveUnloadPlant.NeutralMode.BRAKE;
 motor.set(phase==Phase.ACQUIRE?-.12:0);
 }
 public Phase phase(){return phase;}public PassiveUnloadPlant.NeutralMode commandedMode(){return commanded;}public double rate(){return rate;}public boolean exitSequence(){return exitBlocked&&phase==Phase.DONE;}
 @Override public void close(){motor.set(0);commanded=PassiveUnloadPlant.NeutralMode.BRAKE;motor.close();encoder.close();nip.close();exit.close();}
}
