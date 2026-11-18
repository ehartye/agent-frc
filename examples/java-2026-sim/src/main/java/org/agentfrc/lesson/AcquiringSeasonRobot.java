package org.agentfrc.lesson;
/** Single-use exact-rest adapter. Ideal rigid carry during kinematic approach, no drive energy model. */
public final class AcquiringSeasonRobot {
 public record Run(SourceAcquisition.Retained acquisition,SeasonRobotPrototype.Run robot,double globalExitTime){}
 public static Run run(SourceAcquisition.Retained retained,double volts,int driveFault){
  if(retained==null||!Double.isFinite(volts)||volts<0||driveFault<0||driveFault>2)throw new IllegalArgumentException("scenario");
  retained.consume(); // No threshold, teleport, frame rotation or unaccounted speed reset.
  var robot=SeasonRobotPrototype.run(retained.year,retained.mass,volts,driveFault);
  if(robot.mechanism()!=null&&(robot.mechanism().mass()!=retained.mass||robot.mechanism().angle()!=retained.pitch))throw new IllegalStateException("mass/pitch mismatch");
  return new Run(retained,robot,retained.elapsed+robot.absoluteExitTime());
 }
}
