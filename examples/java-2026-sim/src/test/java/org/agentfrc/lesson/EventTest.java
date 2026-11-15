package org.agentfrc.lesson;

import static org.junit.jupiter.api.Assertions.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.event.EventLoop;
import edu.wpi.first.wpilibj.simulation.DriverStationSim;
import edu.wpi.first.wpilibj.simulation.SimHooks;
import edu.wpi.first.wpilibj2.command.*;
import edu.wpi.first.wpilibj2.command.button.Trigger;

/** Original event/lifecycle fixtures; only numeric state is affected. */
class EventTest {
  static final class Model extends SubsystemBase { double demand; }
  Model model;CommandScheduler scheduler;EventLoop loop;
  @BeforeAll static void initialize(){assertTrue(HAL.initialize(500,0));}
  @BeforeEach void setup(){
    SimHooks.pauseTiming();DriverStationSim.resetData();DriverStationSim.setDsAttached(true);
    DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();
    scheduler=CommandScheduler.getInstance();scheduler.enable();scheduler.cancelAll();
    model=new Model();loop=new EventLoop();scheduler.setActiveButtonLoop(loop);
  }
  @AfterEach void cleanup(){
    scheduler.enable();scheduler.cancelAll();scheduler.unregisterSubsystem(model);loop.clear();
    scheduler.setActiveButtonLoop(scheduler.getDefaultButtonLoop());
    DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();SimHooks.resumeTiming();
  }
  void tick(){SimHooks.stepTiming(0.02);DriverStationSim.notifyNewData();scheduler.run();}
  @Test void heldTriggerDoesNotRestartFinishedCommandUntilNewPress(){
    var held=new AtomicBoolean(false);var starts=new AtomicInteger();
    new Trigger(loop,held::get).whileTrue(Commands.runOnce(starts::incrementAndGet,model));
    tick();held.set(true);tick();assertEquals(1,starts.get());tick();tick();assertEquals(1,starts.get());
    held.set(false);tick();held.set(true);tick();assertEquals(2,starts.get());
  }
  @Test void trueAtBindingNeedsANewRisingEdge(){
    var held=new AtomicBoolean(true);var starts=new AtomicInteger();
    new Trigger(loop,held::get).whileTrue(Commands.runOnce(starts::incrementAndGet,model));
    tick();assertEquals(0,starts.get());held.set(false);tick();held.set(true);tick();assertEquals(1,starts.get());
  }
  @Test void releasingTriggerInvokesCleanup(){
    var held=new AtomicBoolean(false);
    var c=Commands.runEnd(()->model.demand=1,()->model.demand=0,model);
    new Trigger(loop,held::get).whileTrue(c);held.set(true);tick();assertEquals(1,model.demand);
    held.set(false);tick();assertFalse(c.isScheduled());assertEquals(0,model.demand);
  }
  @Test void schedulerDisableIsNotCancellation(){
    var c=Commands.runEnd(()->model.demand=1,()->model.demand=0,model);scheduler.schedule(c);tick();
    scheduler.disable();tick();assertTrue(c.isScheduled());assertEquals(1,model.demand);
    scheduler.enable();scheduler.cancel(c);assertFalse(c.isScheduled());assertEquals(0,model.demand);
  }
  @Test void cancelRequestedInsideExecuteEndsAtLoopBoundary(){
    var ended=new AtomicBoolean(false);var observedDeferred=new AtomicBoolean(false);
    final Command[] holder=new Command[1];
    holder[0]=new FunctionalCommand(()->{},()->{scheduler.cancel(holder[0]);observedDeferred.set(!ended.get());},
        interrupted->{assertTrue(interrupted);ended.set(true);},()->false,model);
    scheduler.schedule(holder[0]);tick();assertTrue(observedDeferred.get());assertTrue(ended.get());assertFalse(holder[0].isScheduled());
  }
  @Test void cancelIncomingRejectsConflictButAllowsExplicitCancellation(){
    var protectedCommand=Commands.runEnd(()->model.demand=1,()->model.demand=0,model)
        .withInterruptBehavior(Command.InterruptionBehavior.kCancelIncoming);
    var replacement=Commands.runOnce(()->model.demand=2,model);
    scheduler.schedule(protectedCommand);tick();scheduler.schedule(replacement);
    assertTrue(protectedCommand.isScheduled());assertFalse(replacement.isScheduled());assertEquals(1,model.demand);
    scheduler.cancel(protectedCommand);assertEquals(0,model.demand);assertFalse(protectedCommand.isScheduled());
  }
}
