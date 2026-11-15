package org.agentfrc.lesson;

import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.Timer;
import edu.wpi.first.wpilibj.simulation.DriverStationSim;
import edu.wpi.first.wpilibj.simulation.RoboRioSim;
import edu.wpi.first.wpilibj.simulation.SimHooks;
import edu.wpi.first.wpilibj2.command.CommandScheduler;

/** Bounded 6-second virtual-time demonstration; no GUI or physical robot connection. */
public final class Demo {
  public static void main(String[] args) {
    if (!HAL.initialize(500, 0)) throw new IllegalStateException("HAL simulation initialization failed");
    SimHooks.pauseTiming(); RoboRioSim.setVInVoltage(12);
    DriverStationSim.setDsAttached(true); DriverStationSim.setEnabled(true); DriverStationSim.notifyNewData();
    var scheduler = CommandScheduler.getInstance();
    try (var launcher = new Launcher()) {
      var modes = new Modes(launcher); modes.enterAutonomous();
      int feedTicks=0, staleFeedTicks=0, saturatedTicks=0;
      double peakRpm=0;
      for(int tick=0;tick<300;tick++) {
        SimHooks.stepTiming(Launcher.DT);
        double now=Timer.getFPGATimestamp();
        boolean stale=tick>=70 && tick<90;
        launcher.setObservation(new VisionGate.Observation(now-(stale?0.5:0.01),0,true));
        if(tick==100)launcher.disturb(0.6);
        if(tick==150)modes.enterTeleop();
        DriverStationSim.notifyNewData(); scheduler.run();
        if(launcher.feeding()){feedTicks++;if(stale)staleFeedTicks++;}
        if(launcher.saturated())saturatedTicks++;
        peakRpm=Math.max(peakRpm,launcher.rpm());
      }
      if(feedTicks==0||staleFeedTicks!=0||launcher.feeding()||launcher.targetRpm()!=0||launcher.volts()!=0)throw new AssertionError("Simulation invariant failed");
      System.out.printf("{\"virtualSeconds\":6,\"peakRpm\":%.2f,\"feedTicks\":%d,\"staleFeedTicks\":%d,\"saturatedTicks\":%d,\"finalTargetRpm\":%.1f,\"finalVolts\":%.1f}%n",peakRpm,feedTicks,staleFeedTicks,saturatedTicks,launcher.targetRpm(),launcher.volts());
      scheduler.unregisterSubsystem(launcher);
    } finally { scheduler.cancelAll(); DriverStationSim.setEnabled(false); DriverStationSim.notifyNewData(); SimHooks.resumeTiming(); }
  }
}
