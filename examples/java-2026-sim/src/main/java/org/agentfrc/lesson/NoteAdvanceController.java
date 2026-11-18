package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Offline annular two-pulse transport experiment. Beam completion is not capture or score. */
public final class NoteAdvanceController implements AutoCloseable {
 public enum Phase{FEED,STOP,FAULT} private final Encoder encoder;private final DigitalInput beam;private final PWMSparkMax motor;private Phase phase=Phase.FEED;private double previous,time;private boolean initialized,wasBlocked;private int pulses;
 public NoteAdvanceController(){if(RobotBase.isReal())throw new IllegalStateException("Offline only");encoder=new Encoder(0,1);encoder.setDistancePerPulse(2*Math.PI/2048);beam=new DigitalInput(2);motor=new PWMSparkMax(0);}
 public void periodic(boolean enabled){if(!enabled||RobotController.getBatteryVoltage()<6)phase=Phase.FAULT;if(phase!=Phase.FEED){motor.set(0);return;}double angle=encoder.getDistance(),rate=(angle-previous)/.02;previous=angle;time+=.02;boolean blocked=!beam.get();if(!initialized){initialized=true;if(blocked)phase=Phase.FAULT;}if(time>4||!Double.isFinite(rate)||rate>1)phase=Phase.FAULT;if(wasBlocked&&!blocked)pulses++;wasBlocked=blocked;if(phase==Phase.FEED&&pulses==2)phase=Phase.STOP;motor.set(phase==Phase.FEED?-.12:0);}
 public Phase phase(){return phase;}public int pulses(){return pulses;}
 @Override public void close(){motor.set(0);motor.close();encoder.close();beam.close();}
}
