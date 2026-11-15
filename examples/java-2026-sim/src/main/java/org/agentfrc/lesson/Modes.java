package org.agentfrc.lesson;

import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.Commands;
import edu.wpi.first.wpilibj2.command.CommandScheduler;

/** Original example of bounded behavior and mode-transition cleanup. */
public final class Modes {
  private final Launcher launcher;
  private Command autonomous;
  public Modes(Launcher launcher) { this.launcher = launcher; }
  public Command shot(double timeoutSeconds) {
    return Commands.runEnd(() -> { launcher.setTargetRpm(3000); launcher.requestFeed(true); },
        launcher::stop, launcher).withTimeout(timeoutSeconds);
  }
  public void enterAutonomous() { enterDisabled(); autonomous = shot(3.0); CommandScheduler.getInstance().schedule(autonomous); }
  public void enterTeleop() { if (autonomous != null) autonomous.cancel(); autonomous = null; launcher.stop(); }
  public void enterDisabled() { enterTeleop(); }
}
