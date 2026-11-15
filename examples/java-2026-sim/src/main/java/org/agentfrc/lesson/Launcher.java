package org.agentfrc.lesson;

import edu.wpi.first.math.MathUtil;
import edu.wpi.first.math.controller.PIDController;
import edu.wpi.first.math.system.plant.DCMotor;
import edu.wpi.first.math.system.plant.LinearSystemId;
import edu.wpi.first.math.util.Units;
import edu.wpi.first.wpilibj.Timer;
import edu.wpi.first.wpilibj.simulation.FlywheelSim;
import edu.wpi.first.wpilibj2.command.SubsystemBase;

/** Desktop-only model: no motor controllers, network clients or robot I/O. */
public final class Launcher extends SubsystemBase implements AutoCloseable {
  public static final double DT = 0.02;
  private static final DCMotor MOTOR = DCMotor.getNEO(1);
  private final FlywheelSim plant = new FlywheelSim(
      LinearSystemId.createFlywheelSystem(MOTOR, 0.004, 1.0), MOTOR);
  private final PIDController feedback = new PIDController(0.10, 0.0, 0.0, DT);
  private double targetRpm;
  private double requestedVolts;
  private double appliedVolts;
  private boolean intakeDeployed;
  private boolean intakeRequested;
  private boolean feedRequested;
  private boolean feeding;
  private boolean heldPiece = true;
  private VisionGate.Observation observation;

  public void setTargetRpm(double rpm) {
    if (!Double.isFinite(rpm) || rpm < 0 || rpm > 4500) throw new IllegalArgumentException("Invalid fixture setpoint");
    targetRpm = rpm;
  }
  public void setObservation(VisionGate.Observation value) { observation = value; }
  public void setHeldPiece(boolean value) { heldPiece = value; }
  public void setIntakeDeployed(boolean value) { intakeDeployed = value; }
  public void requestIntake(boolean value) { intakeRequested = value; }
  public boolean intakeRunning() { return intakeRequested && intakeDeployed; }
  public void requestFeed(boolean value) { feedRequested = value; if (!value) feeding = false; }
  public boolean speedReady() { return targetRpm > 0 && Math.abs(targetRpm - rpm()) <= 75; }
  public boolean ready() { return heldPiece && speedReady() && VisionGate.accepts(observation, Timer.getFPGATimestamp()); }
  public boolean feeding() { return feeding; }
  public double rpm() { return plant.getAngularVelocityRPM(); }
  public double volts() { return appliedVolts; }
  public double targetRpm() { return targetRpm; }
  public boolean saturated() { return Math.abs(requestedVolts) > 12; }
  public void disturb(double retainedSpeed) {
    if (!Double.isFinite(retainedSpeed) || retainedSpeed < 0 || retainedSpeed > 1) throw new IllegalArgumentException();
    plant.setAngularVelocity(plant.getAngularVelocityRadPerSec() * retainedSpeed);
  }
  @Override public void periodic() {
    double targetRadPerSec = Units.rotationsPerMinuteToRadiansPerSecond(targetRpm);
    // Analytic motor model plus feedback; all parameters are synthetic lesson fixtures.
    requestedVolts = targetRpm == 0 ? 0 : targetRadPerSec / MOTOR.KvRadPerSecPerVolt
        + feedback.calculate(plant.getAngularVelocityRadPerSec(), targetRadPerSec);
    appliedVolts = MathUtil.clamp(requestedVolts, -12, 12);
    feeding = feedRequested && ready(); // Continuously re-evaluate, not only at spin-up transition.
    plant.setInputVoltage(appliedVolts);
    plant.update(DT);
  }
  public void stop() {
    targetRpm = 0; requestedVolts = 0; appliedVolts = 0;
    intakeRequested = false; feedRequested = false; feeding = false;
    feedback.reset(); plant.setInputVoltage(0);
  }
  @Override public void close() { stop(); feedback.close(); }
}
