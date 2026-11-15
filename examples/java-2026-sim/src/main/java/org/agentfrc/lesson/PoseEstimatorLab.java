package org.agentfrc.lesson;

import edu.wpi.first.math.VecBuilder;
import edu.wpi.first.math.estimator.DifferentialDrivePoseEstimator;
import edu.wpi.first.math.geometry.*;
import edu.wpi.first.math.kinematics.DifferentialDriveKinematics;

/** Original application policy around pinned WPILib. Thresholds are synthetic fixtures. */
public final class PoseEstimatorLab {
  public enum Decision { ACCEPTED, NO_HISTORY, NONFINITE, FUTURE, STALE, BEFORE_RESET,
    OUT_OF_ORDER_OR_DUPLICATE, OUTLIER }
  private final DifferentialDrivePoseEstimator estimator=create(new Pose2d());
  private double latest=Double.NEGATIVE_INFINITY, oldest=Double.POSITIVE_INFINITY;
  private double epoch=Double.NEGATIVE_INFINITY,lastVision=Double.NEGATIVE_INFINITY;
  public static DifferentialDrivePoseEstimator create(Pose2d initial) {
    return new DifferentialDrivePoseEstimator(new DifferentialDriveKinematics(0.6),new Rotation2d(),0,0,
        initial,VecBuilder.fill(0.1,0.1,0.1),VecBuilder.fill(0.1,0.1,0.1));
  }
  public Pose2d pose() { return estimator.getEstimatedPosition(); }
  public void update(double time,Rotation2d gyro,double left,double right) {
    if(!Double.isFinite(time)||!Double.isFinite(gyro.getRadians())||!Double.isFinite(left)||!Double.isFinite(right)||time<=latest||time<epoch)
      throw new IllegalArgumentException("Odometry must be finite and strictly increasing");
    estimator.updateWithTime(time,gyro,left,right);latest=time;oldest=Math.min(oldest,time);
  }
  public void reset(double time,Rotation2d gyro,double left,double right,Pose2d pose) {
    if(!Double.isFinite(time)||time<latest||time<epoch||!finite(pose)||!Double.isFinite(gyro.getRadians())||!Double.isFinite(left)||!Double.isFinite(right))
      throw new IllegalArgumentException("Invalid reset");
    estimator.resetPosition(gyro,left,right,pose);epoch=time;latest=Double.NEGATIVE_INFINITY;
    oldest=Double.POSITIVE_INFINITY;lastVision=Double.NEGATIVE_INFINITY;
  }
  public Decision vision(double capturedAt,Pose2d fieldPose) {
    if(!Double.isFinite(capturedAt)||!finite(fieldPose))return Decision.NONFINITE;
    if(!Double.isFinite(latest))return Decision.NO_HISTORY;
    if(capturedAt<epoch)return Decision.BEFORE_RESET;
    if(capturedAt>latest)return Decision.FUTURE;
    // Conservative policy: 0.5 s max age, independent from the library's 1.5 s buffer.
    if(capturedAt<oldest||latest-capturedAt>0.5)return Decision.STALE;
    if(capturedAt<=lastVision)return Decision.OUT_OF_ORDER_OR_DUPLICATE;
    var reference=estimator.sampleAt(capturedAt);
    if(reference.isEmpty())return Decision.NO_HISTORY;
    if(fieldPose.getTranslation().getDistance(reference.get().getTranslation())>1.0 ||
        Math.abs(fieldPose.getRotation().minus(reference.get().getRotation()).getRadians())>Math.toRadians(30))
      return Decision.OUTLIER;
    estimator.addVisionMeasurement(fieldPose,capturedAt);lastVision=capturedAt;return Decision.ACCEPTED;
  }
  private static boolean finite(Pose2d p) {return p!=null&&Double.isFinite(p.getX())&&Double.isFinite(p.getY())&&Double.isFinite(p.getRotation().getRadians());}
}
