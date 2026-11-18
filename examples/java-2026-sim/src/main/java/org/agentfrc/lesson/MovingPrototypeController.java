package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.RobotBase;
/** Actual bounded concurrent drive/transfer command. Terminal demand zero is not a physical safe-stop claim. */
public final class MovingPrototypeController implements AutoCloseable {
 private final CoupledDriveController drive;private final SeasonRollerController mechanism;private final boolean diagnosticContinueDriving;
 public MovingPrototypeController(double radius,int pulses,boolean diagnosticContinueDriving){if(RobotBase.isReal())throw new IllegalStateException("Offline only");this.diagnosticContinueDriving=diagnosticContinueDriving;drive=new CoupledDriveController(1);mechanism=new SeasonRollerController(radius,pulses,4,6,8,3,4);}
 public void periodic(boolean enabled,boolean mechanismEnabled,double target){mechanism.periodic(enabled&&mechanismEnabled);boolean terminal=mechanism.done()||mechanism.timedOut();drive.periodic(enabled&&(diagnosticContinueDriving||!terminal),target,target,0);}
 public boolean done(){return mechanism.done();}public boolean faulted(){return mechanism.timedOut();}
 @Override public void close(){mechanism.close();drive.close();}
}
