package org.agentfrc.lesson;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.Timer;
import edu.wpi.first.wpilibj.simulation.DriverStationSim;
import edu.wpi.first.wpilibj.simulation.RoboRioSim;
import edu.wpi.first.wpilibj.simulation.SimHooks;
import edu.wpi.first.wpilibj2.command.CommandScheduler;

class LessonTest {
  Launcher launcher;
  CommandScheduler scheduler;
  @BeforeAll static void initialize() { assertTrue(HAL.initialize(500, 0)); }
  @BeforeEach void setup() {
    SimHooks.pauseTiming(); RoboRioSim.setVInVoltage(12);
    DriverStationSim.resetData(); DriverStationSim.setDsAttached(true); DriverStationSim.setEnabled(true); DriverStationSim.notifyNewData();
    scheduler=CommandScheduler.getInstance(); scheduler.cancelAll(); launcher=new Launcher();
  }
  @AfterEach void cleanup() { scheduler.cancelAll(); scheduler.unregisterSubsystem(launcher); launcher.close(); DriverStationSim.setEnabled(false); DriverStationSim.notifyNewData(); SimHooks.resumeTiming(); }
  void tick(int count, boolean validTarget) {
    for(int i=0;i<count;i++) {
      SimHooks.stepTiming(Launcher.DT);
      launcher.setObservation(new VisionGate.Observation(Timer.getFPGATimestamp()-0.01,0,validTarget));
      DriverStationSim.notifyNewData(); scheduler.run();
    }
  }
  @Test void intakeCannotRunRetractedAndStopsOnRetraction() {
    launcher.requestIntake(true); assertFalse(launcher.intakeRunning());
    launcher.setIntakeDeployed(true); assertTrue(launcher.intakeRunning());
    launcher.setIntakeDeployed(false); assertFalse(launcher.intakeRunning());
  }
  @Test void invalidOrStaleOrFutureVisionCannotAuthorizeFeed() {
    assertFalse(VisionGate.accepts(null,10));
    assertFalse(VisionGate.accepts(new VisionGate.Observation(9,0,true),10));
    assertFalse(VisionGate.accepts(new VisionGate.Observation(11,0,true),10));
    assertFalse(VisionGate.accepts(new VisionGate.Observation(10,Double.NaN,true),10));
    assertFalse(VisionGate.accepts(new VisionGate.Observation(10,0,false),10));
    assertTrue(VisionGate.accepts(new VisionGate.Observation(9.9,1,true),10));
  }
  @Test void flywheelConvergesAndOutputRemainsBounded() {
    launcher.setTargetRpm(3000); tick(150,true);
    assertEquals(3000,launcher.rpm(),75); assertTrue(Math.abs(launcher.volts())<=12);
  }
  @Test void feedingRechecksReadinessAfterSpeedLoss() {
    launcher.setTargetRpm(3000); launcher.requestFeed(true); tick(150,true); assertTrue(launcher.feeding());
    launcher.disturb(0.5); tick(1,true); assertFalse(launcher.feeding());
    tick(150,true); assertTrue(launcher.feeding());
  }
  @Test void losingTargetInhibitsAlreadyActiveFeeder() {
    launcher.setTargetRpm(3000); launcher.requestFeed(true); tick(150,true); assertTrue(launcher.feeding());
    tick(1,false); assertFalse(launcher.feeding());
  }
  @Test void missingPieceInhibitsFeeding() {
    launcher.setTargetRpm(3000); launcher.requestFeed(true); tick(150,true);
    launcher.setHeldPiece(false); tick(1,true); assertFalse(launcher.feeding());
  }
  @Test void boundedAutonomousStopsWithoutTarget() {
    var command=new Modes(launcher).shot(0.5); scheduler.schedule(command); tick(50,false);
    assertFalse(command.isScheduled()); assertEquals(0,launcher.targetRpm()); assertEquals(0,launcher.volts()); assertFalse(launcher.feeding());
  }
  @Test void teleopTransitionCancelsAutonomousOutputs() {
    var modes=new Modes(launcher); modes.enterAutonomous(); tick(50,true); assertTrue(launcher.targetRpm()>0);
    modes.enterTeleop(); tick(1,true); assertEquals(0,launcher.targetRpm()); assertEquals(0,launcher.volts()); assertFalse(launcher.feeding());
  }
  @Test void requirementConflictInterruptsPriorCommand() {
    var modes=new Modes(launcher); var first=modes.shot(5);scheduler.schedule(first);tick(10,true);
    var replacement=edu.wpi.first.wpilibj2.command.Commands.runOnce(launcher::stop,launcher);scheduler.schedule(replacement);
    assertFalse(first.isScheduled());tick(1,true);assertEquals(0,launcher.targetRpm());
  }
  @Test void setpointRejectsNonfiniteAndOutOfFixtureRange() {
    assertThrows(IllegalArgumentException.class,()->launcher.setTargetRpm(Double.NaN));
    assertThrows(IllegalArgumentException.class,()->launcher.setTargetRpm(-1));
    assertThrows(IllegalArgumentException.class,()->launcher.setTargetRpm(5000));
  }
}
