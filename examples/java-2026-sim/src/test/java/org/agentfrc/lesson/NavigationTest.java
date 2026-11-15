package org.agentfrc.lesson;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import edu.wpi.first.math.geometry.*;
import edu.wpi.first.math.kinematics.*;
import edu.wpi.first.math.trajectory.Trajectory;
import edu.wpi.first.math.estimator.DifferentialDrivePoseEstimator;

class NavigationTest {
  static final Rotation2d ZERO=new Rotation2d();
  static Pose2d at(double x) {return new Pose2d(x,0,ZERO);}
  static DifferentialDrivePoseEstimator history() {
    var e=PoseEstimatorLab.create(new Pose2d());
    for(int i=0;i<=100;i++)e.updateWithTime(i*0.02,ZERO,i*0.02,i*0.02);
    return e;
  }
  @Test void generatedPathHasBoundedReferenceAndIntendedEndpoints() {
    var t=TrajectoryLab.path();assertEquals(1,t.getInitialPose().getX(),1e-9);
    assertEquals(4,t.sample(t.getTotalTimeSeconds()).poseMeters.getX(),1e-9);
    var k=new DifferentialDriveKinematics(TrajectoryLab.TRACK_WIDTH);
    for(var s:t.getStates()) {
      var w=k.toWheelSpeeds(new ChassisSpeeds(s.velocityMetersPerSecond,0,s.velocityMetersPerSecond*s.curvatureRadPerMeter));
      assertTrue(Math.abs(w.leftMetersPerSecond)<=1.500001);assertTrue(Math.abs(w.rightMetersPerSecond)<=1.500001);
    }
    assertThrows(IllegalArgumentException.class,()->TrajectoryLab.requireUsable(new Trajectory()));
  }
  @Test void idealKinematicsTracksOriginalCurvedPath() {
    var r=TrajectoryLab.run();assertTrue(r.steps()<750);
    assertTrue(r.translationErrorMeters()<0.10,r.toString());
    assertTrue(r.headingErrorRadians()<Math.toRadians(3),r.toString());
    assertTrue(r.peakAppliedWheelSpeed()<=TrajectoryLab.OUTPUT_LIMIT);
    System.out.println("NAVIGATION_RESULT "+r);
  }
  @Test void wheelSignsAndRoundTripAreConsistent() {
    var k=new DifferentialDriveKinematics(0.6);var w=k.toWheelSpeeds(new ChassisSpeeds(0,0,1));
    assertEquals(-0.3,w.leftMetersPerSecond,1e-9);assertEquals(0.3,w.rightMetersPerSecond,1e-9);
    var c=k.toChassisSpeeds(w);assertEquals(0,c.vxMetersPerSecond,1e-9);assertEquals(1,c.omegaRadiansPerSecond,1e-9);
  }
  @Test void captureTimestampAvoidsArrivalTimeBias() {
    var capture=history();var arrival=history();capture.addVisionMeasurement(at(1),1);arrival.addVisionMeasurement(at(1),2);
    assertEquals(2,capture.getEstimatedPosition().getX(),1e-9);assertEquals(1.5,arrival.getEstimatedPosition().getX(),1e-9);
  }
  @Test void lateInsertionReplacesLaterVisionCorrection() {
    var reversed=history();reversed.addVisionMeasurement(at(2.4),2);reversed.addVisionMeasurement(at(1.2),1);
    var ordered=history();ordered.addVisionMeasurement(at(1.2),1);ordered.addVisionMeasurement(at(2.4),2);
    assertEquals(2.1,reversed.getEstimatedPosition().getX(),1e-9);assertEquals(2.25,ordered.getEstimatedPosition().getX(),1e-9);
  }
  @Test void rawEstimatorAcceptsFutureAndOutlierButPolicyRejectsThem() {
    var raw=history();raw.addVisionMeasurement(at(100),3);assertTrue(raw.getEstimatedPosition().getX()>40);
    var p=new PoseEstimatorLab();p.update(2,ZERO,2,2);
    assertEquals(PoseEstimatorLab.Decision.FUTURE,p.vision(3,at(2)));
    assertEquals(PoseEstimatorLab.Decision.OUTLIER,p.vision(2,at(100)));
    assertEquals(2,p.pose().getX(),1e-9);
  }
  @Test void temporalPolicyRejectsMissingOldDuplicateAndInvalidFrames() {
    var p=new PoseEstimatorLab();assertEquals(PoseEstimatorLab.Decision.NO_HISTORY,p.vision(0,at(0)));
    p.update(0,ZERO,0,0);p.update(1,ZERO,1,1);
    assertEquals(PoseEstimatorLab.Decision.STALE,p.vision(0.4,at(0.4)));
    assertEquals(PoseEstimatorLab.Decision.NONFINITE,p.vision(Double.NaN,at(1)));
    assertEquals(PoseEstimatorLab.Decision.ACCEPTED,p.vision(1,at(1)));
    assertEquals(PoseEstimatorLab.Decision.OUT_OF_ORDER_OR_DUPLICATE,p.vision(1,at(1)));
    assertEquals(PoseEstimatorLab.Decision.OUT_OF_ORDER_OR_DUPLICATE,p.vision(0.9,at(0.9)));
    assertThrows(IllegalArgumentException.class,()->p.update(1,ZERO,1,1));
    assertThrows(IllegalArgumentException.class,()->p.update(0.9,ZERO,1,1));
  }
  @Test void resetUsesActualEncoderBaselineAndFieldHeading() {
    var p=new PoseEstimatorLab();p.update(1,ZERO,1,1);
    p.reset(2,Rotation2d.fromDegrees(30),10,10,new Pose2d(5,3,Rotation2d.fromDegrees(90)));
    assertThrows(IllegalArgumentException.class,()->p.reset(1.5,ZERO,0,0,new Pose2d()));
    p.update(2.02,Rotation2d.fromDegrees(30),10,10);assertEquals(3,p.pose().getY(),1e-9);
    assertEquals(PoseEstimatorLab.Decision.BEFORE_RESET,p.vision(1.9,new Pose2d()));
    p.update(2.04,Rotation2d.fromDegrees(30),11,11);
    assertEquals(5,p.pose().getX(),1e-9);assertEquals(4,p.pose().getY(),1e-9);
  }
  @Test void delayedVisionReducesSyntheticEncoderBias() {
    var e=PoseEstimatorLab.create(new Pose2d());
    for(int i=0;i<=100;i++)e.updateWithTime(i*0.02,ZERO,i*0.022,i*0.022);
    double before=Math.abs(e.getEstimatedPosition().getX()-2);
    e.addVisionMeasurement(at(1.8),1.8);double after=Math.abs(e.getEstimatedPosition().getX()-2);
    assertEquals(0.2,before,1e-9);assertEquals(0.11,after,1e-9);assertTrue(after<before);
  }
}
