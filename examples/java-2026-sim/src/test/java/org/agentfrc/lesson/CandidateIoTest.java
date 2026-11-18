package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
class CandidateIoTest {
 @BeforeAll static void hal(){assertTrue(HAL.initialize(500,0));}
 @BeforeEach void setup(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();}
 @AfterEach void stop(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
 @Test void realEncoderReadbackClosesLoopAndDisableZerosPwm(){try(var rig=new CandidateIoRig(0.01,1,12)){CandidateIoRig.Result r=null;for(int i=0;i<300;i++)r=rig.step(true,150);assertEquals(r.trueRate(),r.measuredRate(),1e-8);assertEquals(150,r.trueRate(),20);assertTrue(r.appliedVolts()>0);r=rig.step(false,150);assertEquals(0,r.pwm(),1e-10);assertEquals(0,r.appliedVolts(),1e-10);}}
 @Test void wrongEncoderConversionIsObservableInActualControlLoop(){double correct,wrong;try(var rig=new CandidateIoRig(0.01,1,12)){CandidateIoRig.Result r=null;for(int i=0;i<300;i++)r=rig.step(true,150);correct=r.trueRate();}try(var rig=new CandidateIoRig(0.01,2,12)){CandidateIoRig.Result r=null;for(int i=0;i<300;i++)r=rig.step(true,150);wrong=r.trueRate();assertEquals(2*wrong,r.measuredRate(),1e-8);}assertTrue(Math.abs(correct-wrong)>30);assertTrue(Math.abs(wrong-150)>20);}
 @Test void reducedSupplyChangesAppliedVoltageAndLowVoltageInhibits(){double normal;try(var rig=new CandidateIoRig(0.01,1,12)){normal=rig.step(true,500).appliedVolts();}try(var rig=new CandidateIoRig(0.01,1,8)){assertTrue(rig.step(true,500).appliedVolts()<normal);}try(var rig=new CandidateIoRig(0.01,1,5)){assertEquals(0,rig.step(true,150).pwm());}}
}
