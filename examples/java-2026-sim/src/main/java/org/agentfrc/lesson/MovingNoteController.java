package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Offline signed straight approach; wheel encoders, not body truth. Neutral is an experiment boundary, not hardware safety. */
public final class MovingNoteController implements AutoCloseable {
 public enum Phase{APPROACH,STOP,FAULT}
 public final NoteAdvanceController mechanism;private final Encoder left,right;private final PWMSparkMax leftMotor,rightMotor;private Phase phase=Phase.APPROACH;private double oldLeft,oldRight,time,leftRate,rightRate;
 public MovingNoteController(){if(RobotBase.isReal())throw new IllegalStateException("Offline only");mechanism=new NoteAdvanceController();left=new Encoder(4,5);right=new Encoder(6,7);left.setDistancePerPulse(.0762*2*Math.PI/2048);right.setDistancePerPulse(.0762*2*Math.PI/2048);leftMotor=new PWMSparkMax(1);rightMotor=new PWMSparkMax(2);}
 public void periodic(boolean enabled){double l=left.getDistance(),r=right.getDistance();leftRate=(l-oldLeft)/.02;rightRate=(r-oldRight)/.02;oldLeft=l;oldRight=r;time+=.02;double bus=RobotController.getBatteryVoltage();if(!enabled||!Double.isFinite(bus)||bus<6||!Double.isFinite(leftRate)||!Double.isFinite(rightRate)||Math.abs(leftRate-rightRate)>.1||leftRate>.05||rightRate>.05||time>4.2)phase=Phase.FAULT;mechanism.periodic(enabled&&phase!=Phase.FAULT);if(mechanism.phase()==NoteAdvanceController.Phase.FAULT)phase=Phase.FAULT;if(phase!=Phase.FAULT&&mechanism.phase()==NoteAdvanceController.Phase.STOP)phase=Phase.STOP;double demand=0;if(phase==Phase.APPROACH){double target=-.15,measured=(leftRate+rightRate)/2;demand=Math.max(-.2,Math.min(.2,(2.3*target+2*(target-measured))/bus));}leftMotor.set(demand);rightMotor.set(demand);}
 public Phase phase(){return phase;}public double leftRate(){return leftRate;}public double rightRate(){return rightRate;}
 @Override public void close(){leftMotor.set(0);rightMotor.set(0);leftMotor.close();rightMotor.close();left.close();right.close();mechanism.close();}
}
