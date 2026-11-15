package org.agentfrc.lesson;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.DriverStationSim;
import edu.wpi.first.wpilibj.simulation.SimHooks;
import edu.wpi.first.wpilibj2.command.*;

/** Pure demand-state counterexamples. No motor controller or physical output exists. */
class CleanupTest {
  static final class Model extends SubsystemBase { double demand; }
  Model model;
  CommandScheduler scheduler;
  @BeforeAll static void initialize() { assertTrue(HAL.initialize(500,0)); }
  @BeforeEach void setup() {
    SimHooks.pauseTiming(); DriverStationSim.resetData();
    DriverStationSim.setDsAttached(true); DriverStationSim.setEnabled(true); DriverStationSim.notifyNewData();
    scheduler=CommandScheduler.getInstance();scheduler.cancelAll();model=new Model();
  }
  @AfterEach void cleanup() {
    scheduler.cancelAll();scheduler.unregisterSubsystem(model);
    DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();SimHooks.resumeTiming();
  }
  void tick(int count) {for(int i=0;i<count;i++){SimHooks.stepTiming(0.02);DriverStationSim.notifyNewData();scheduler.run();}}
  Command trailingCleanup() {
    return Commands.run(()->model.demand=1,model).withTimeout(0.08)
        .andThen(Commands.runOnce(()->model.demand=0,model));
  }
  Command endCleanup() {return Commands.runEnd(()->model.demand=1,()->model.demand=0,model);}
  @Test void trailingStepIsSkippedWhenSequenceIsCancelled() {
    var c=trailingCleanup();scheduler.schedule(c);tick(2);scheduler.cancel(c);
    assertFalse(c.isScheduled());assertEquals(1,model.demand);
    // This expected retained value demonstrates the deliberately incomplete policy.
  }
  @Test void sameTrailingStepRunsAfterNormalCompletion() {
    var c=trailingCleanup();scheduler.schedule(c);tick(10);
    assertFalse(c.isScheduled());assertEquals(0,model.demand);
  }
  @Test void endCleanupRunsForCancellationAndRequirementConflict() {
    var c=endCleanup();scheduler.schedule(c);tick(2);scheduler.cancel(c);assertEquals(0,model.demand);
    var d=endCleanup();scheduler.schedule(d);tick(2);assertEquals(1,model.demand);
    scheduler.schedule(Commands.runOnce(()->{},model));assertFalse(d.isScheduled());assertEquals(0,model.demand);
  }
  @Test void disableCancelsNonDisabledCommandAndRunsItsEnd() {
    var c=endCleanup();scheduler.schedule(c);tick(2);assertEquals(1,model.demand);
    DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();scheduler.run();
    assertFalse(c.isScheduled());assertEquals(0,model.demand);
  }
}
