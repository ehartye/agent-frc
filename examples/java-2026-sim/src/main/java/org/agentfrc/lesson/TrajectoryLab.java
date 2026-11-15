package org.agentfrc.lesson;

import java.util.List;
import edu.wpi.first.math.controller.LTVUnicycleController;
import edu.wpi.first.math.geometry.*;
import edu.wpi.first.math.kinematics.DifferentialDriveKinematics;
import edu.wpi.first.math.trajectory.*;

/** Original bounded ideal-kinematic exercise. No motor, traction, or field model. */
public final class TrajectoryLab {
  public static final double DT=0.02, TRACK_WIDTH=0.6, MAX_REFERENCE_SPEED=1.5, OUTPUT_LIMIT=3.0;
  public record Result(double translationErrorMeters, double headingErrorRadians,
      double peakRequestedWheelSpeed, double peakAppliedWheelSpeed, int steps) {}
  public static Trajectory path() {
    var config=new TrajectoryConfig(MAX_REFERENCE_SPEED,1.0)
        .setKinematics(new DifferentialDriveKinematics(TRACK_WIDTH));
    var trajectory=TrajectoryGenerator.generateTrajectory(new Pose2d(1,1,new Rotation2d()),
        List.of(new Translation2d(2,1.2),new Translation2d(3,1.2)),
        new Pose2d(4,1,new Rotation2d()),config);
    requireUsable(trajectory);
    return trajectory;
  }
  public static void requireUsable(Trajectory trajectory) {
    if(trajectory==null || trajectory.getStates().size()<2 ||
        !Double.isFinite(trajectory.getTotalTimeSeconds()) || trajectory.getTotalTimeSeconds()<=0 ||
        trajectory.getTotalTimeSeconds()>15) throw new IllegalArgumentException("Unusable lesson trajectory");
    for(var s:trajectory.getStates()) if(!Double.isFinite(s.timeSeconds) ||
        !Double.isFinite(s.velocityMetersPerSecond) || !Double.isFinite(s.accelerationMetersPerSecondSq) ||
        !Double.isFinite(s.curvatureRadPerMeter) || !Double.isFinite(s.poseMeters.getX()) ||
        !Double.isFinite(s.poseMeters.getY()) || !Double.isFinite(s.poseMeters.getRotation().getRadians()))
      throw new IllegalArgumentException("Nonfinite trajectory state");
  }
  public static Result run() {
    var trajectory=path(); var kinematics=new DifferentialDriveKinematics(TRACK_WIDTH);
    var controller=new LTVUnicycleController(DT);
    var pose=new Pose2d(0.9,1.1,Rotation2d.fromDegrees(5));
    double peakRequested=0,peakApplied=0; int steps=(int)Math.ceil(trajectory.getTotalTimeSeconds()/DT);
    for(int i=0;i<steps;i++) {
      var speeds=controller.calculate(pose,trajectory.sample(i*DT));
      var wheels=kinematics.toWheelSpeeds(speeds);
      peakRequested=Math.max(peakRequested,Math.max(Math.abs(wheels.leftMetersPerSecond),Math.abs(wheels.rightMetersPerSecond)));
      wheels.desaturate(OUTPUT_LIMIT);
      peakApplied=Math.max(peakApplied,Math.max(Math.abs(wheels.leftMetersPerSecond),Math.abs(wheels.rightMetersPerSecond)));
      var applied=kinematics.toChassisSpeeds(wheels);
      pose=pose.exp(new Twist2d(applied.vxMetersPerSecond*DT,0,applied.omegaRadiansPerSecond*DT));
    }
    var end=trajectory.sample(trajectory.getTotalTimeSeconds()).poseMeters;
    return new Result(pose.getTranslation().getDistance(end.getTranslation()),
        Math.abs(pose.getRotation().minus(end.getRotation()).getRadians()),peakRequested,peakApplied,steps);
  }
  private TrajectoryLab() {}
}
