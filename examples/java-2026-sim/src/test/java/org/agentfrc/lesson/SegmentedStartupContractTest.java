package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
/** Actual controller startup contract, not a coupled mechanical intake test. */
class SegmentedStartupContractTest {
 @AfterAll static void runtimeBinding() throws Exception {
  String token=System.getenv("FRC_STARTUP_RUN_ID"),output=System.getenv("FRC_STARTUP_RUNTIME");
  if(token==null&&output==null)return;
  assertNotNull(token);assertNotNull(output);
  var properties=new java.util.Properties();properties.setProperty("runId",token);
  for(Class<?> c:new Class<?>[]{SeasonRollerController.class,SegmentedStartupContractTest.class}){
   byte[] bytes=c.getResourceAsStream(c.getSimpleName()+".class").readAllBytes();
   properties.setProperty(c.getSimpleName()+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
  }
  try(var stream=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){properties.store(stream,"Fresh native startup run");}
 }
 @BeforeAll static void init(){assertTrue(HAL.initialize(500,0));}
 @BeforeEach void enable(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
 @AfterEach void disable(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();}
 static void checkInitiallyBlocked(double radius){
  try(var controller=new SeasonRollerController(radius,1)){
   EncoderSim.createForChannel(0).setCount(0);EncoderSim.createForChannel(2).setCount(0);
   new DIOSim(6).setValue(false);controller.periodic(true);
   assertTrue(controller.timedOut());assertFalse(controller.done());assertEquals(0,controller.pulses());
   assertEquals(0,new PWMSim(0).getSpeed(),1e-12);assertEquals(0,new PWMSim(1).getSpeed(),1e-12);
  }
 }
 @Test void preloadedCoralCenterIsRejected(){checkInitiallyBlocked(.0254);}
 @Test void preloadedFuelCenterIsRejected(){checkInitiallyBlocked(.0381);}
 @Test void noteHoleOrEmptyEntranceStartsButCannotCompleteWithoutBeamEvents(){
  try(var controller=new SeasonRollerController(.0508,2)){
   EncoderSim.createForChannel(0).setCount(0);EncoderSim.createForChannel(2).setCount(0);
   new DIOSim(6).setValue(true);controller.periodic(true);
   assertFalse(controller.timedOut());assertFalse(controller.done());
   assertTrue(new PWMSim(0).getSpeed()<0);assertTrue(new PWMSim(1).getSpeed()>0);
   for(int i=1;i<160;i++)controller.periodic(true);
   assertTrue(controller.timedOut());assertFalse(controller.done());assertEquals(0,controller.pulses());
   assertEquals(0,new PWMSim(0).getSpeed(),1e-12);assertEquals(0,new PWMSim(1).getSpeed(),1e-12);
  }
 }
}
