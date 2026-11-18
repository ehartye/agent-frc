package org.agentfrc.lesson;

import edu.wpi.first.math.system.plant.DCMotor;
import edu.wpi.first.math.system.plant.LinearSystemId;
import edu.wpi.first.wpilibj.simulation.FlywheelSim;

/** Synthetic inertia sensitivity; radius/mass are assumptions, not measured CAD material. */
public final class FlywheelSizingLab {
  private FlywheelSizingLab() {}
  public record Result(double inertiaKgM2,double rpmAt20ms,double rpmAt4s) {}
  public static Result simulate(double assumedMassKg,double assumedRadiusMm) {
    if(!Double.isFinite(assumedMassKg)||assumedMassKg<=0||!Double.isFinite(assumedRadiusMm)||assumedRadiusMm<=0)
      throw new IllegalArgumentException("Positive finite mass and radius required");
    double radiusM=assumedRadiusMm/1000;
    double inertia=0.5*assumedMassKg*radiusM*radiusM;
    var motor=DCMotor.getNEO(1); // Motor constants only; no REV simulation adapter.
    var plant=new FlywheelSim(LinearSystemId.createFlywheelSystem(motor,inertia,1),motor);
    plant.setInputVoltage(6);
    plant.update(0.02);
    double early=plant.getAngularVelocityRPM();
    for(int i=1;i<200;i++)plant.update(0.02);
    double finalRpm=plant.getAngularVelocityRPM();
    plant.setInputVoltage(0);
    return new Result(inertia,early,finalRpm);
  }
}
