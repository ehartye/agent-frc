package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
class SupervisedCatcherTest {
 @BeforeAll static void init(){assertTrue(HAL.initialize(500,0));}
 @BeforeEach void enable(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();}
 @AfterEach void disable(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();}
 static BoundedCatcherSupervisor.Pose pose(int y,double t){return new BoundedCatcherSupervisor.Pose(y,t,0,0,0,0,1,1,0,0,0,0,0);}
 static BoundedCatcherSupervisor.Pads pads(double t){return new BoundedCatcherSupervisor.Pads(t,true,true,true);}
 static void approach(SupervisedCatcherAdapter a,int y){
  var arrival=new DIOSim(7);var tail=new DIOSim(8);new DIOSim(9).setValue(false);new DIOSim(10).setValue(true);
  arrival.setValue(true);tail.setValue(true);a.periodic(true,false,0,pose(y,0),null);
  int pulses=y==2024?2:1;
  for(int i=0;i<pulses;i++){double t=.02+i*.04;tail.setValue(false);a.periodic(true,false,t,pose(y,t),null);tail.setValue(true);a.periodic(true,false,t+.02,pose(y,t+.02),null);}
  arrival.setValue(false);a.periodic(true,false,.12,pose(y,.12),null);assertEquals(CatcherHandoffController.State.CLOSING,a.state());
 }
 @Test void allSeasonsRequireIndependentPadsBeforeHoldAndPermitGuardedRelease(){for(int y=2024;y<=2026;y++)try(var a=new SupervisedCatcherAdapter(y)){
  approach(a,y);new DIOSim(9).setValue(true);a.periodic(true,false,.14,pose(y,.14),pads(.14));assertEquals(CatcherHandoffController.State.HOLD,a.state());
  a.periodic(true,true,.16,pose(y,.16),pads(.16));assertEquals(CatcherHandoffController.State.OPENING,a.state());new DIOSim(9).setValue(false);a.periodic(true,true,.18,pose(y,.18),null);assertEquals(CatcherHandoffController.State.RELEASED,a.state());
 }}
 @Test void invalidPadsDenyHoldEvenWithClosedFeedback(){for(int y=2024;y<=2026;y++)for(int f=0;f<5;f++)try(var a=new SupervisedCatcherAdapter(y)){
  approach(a,y);new DIOSim(9).setValue(true);var p=f==0?null:new BoundedCatcherSupervisor.Pads(f==4?0:.14,f!=1,f!=2,f!=3);a.periodic(true,false,.14,pose(y,.14),p);assertEquals(CatcherHandoffController.State.FAULT,a.state());
  a.periodic(true,true,.16,pose(y,.16),pads(.16));assertEquals(CatcherHandoffController.State.FAULT,a.state());assertTrue(new PWMSim(2).getSpeed()>.5,"legacy fault retains closure, not safe stopping");
 }}
 @Test void lossAfterHoldCannotAuthorizeRelease(){for(int y=2024;y<=2026;y++)for(int f=0;f<4;f++)try(var a=new SupervisedCatcherAdapter(y)){
  approach(a,y);new DIOSim(9).setValue(true);a.periodic(true,false,.14,pose(y,.14),pads(.14));assertEquals(CatcherHandoffController.State.HOLD,a.state());
  if(f==3)new DIOSim(9).setValue(false);
  a.periodic(true,true,.18,f==0?null:f==1?pose(y,.14):pose(y,.18),f==2?new BoundedCatcherSupervisor.Pads(.18,true,true,false):pads(.18));assertEquals(CatcherHandoffController.State.FAULT,a.state());
 }}
 @Test void staleFutureAndClockRegressionFailClosed(){
  for(double stamp:new double[]{-.021,.001,Double.NaN,Double.POSITIVE_INFINITY})assertFalse(new BoundedCatcherSupervisor().assess(0,pose(2024,stamp),null,false).permitted());
  var s=new BoundedCatcherSupervisor();assertTrue(s.assess(.1,pose(2024,.1),null,false).permitted());assertFalse(s.assess(.09,pose(2024,.09),null,false).permitted());assertFalse(s.assess(.12,pose(2024,.12),null,false).permitted());
  s=new BoundedCatcherSupervisor();assertTrue(s.assess(0,pose(2024,0),null,false).permitted());assertFalse(s.assess(.02,pose(2025,.02),null,false).permitted());
 }
 @Test void geometricCounterexampleAndAgeHorizonAreNotBypassed(){
  var rotated=new BoundedCatcherSupervisor.Pose(2025,0,-17.9,0,3,0,0,0,0,0,0,0,0);assertFalse(new BoundedCatcherSupervisor().assess(0,rotated,null,false).permitted());
  var moving=new BoundedCatcherSupervisor.Pose(2026,0,0,0,0,0,0,0,0,0,0,-500,0);
  assertTrue(new BoundedCatcherSupervisor().assess(0,moving,null,false).permitted());assertFalse(new BoundedCatcherSupervisor().assess(.02,moving,null,false).permitted());
  // Nominal clearance never supplies independent pad load evidence.
  assertFalse(new BoundedCatcherSupervisor().assess(0,pose(2024,0),new BoundedCatcherSupervisor.Pads(0,true,true,false),true).permitted());
 }
 @Test void pythonClearanceGoldenVectorsMatch() throws Exception {
  try(var in=getClass().getResourceAsStream("/supervisor-clearance-golden.csv")){assertNotNull(in);var rows=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).lines().skip(1).toList();assertEquals(30,rows.size());
   for(var row:rows){var v=row.split(",");double[] x=java.util.Arrays.stream(v).mapToDouble(Double::parseDouble).toArray();var p=new BoundedCatcherSupervisor.Pose((int)x[0],0,x[2],x[3],x[4],x[5],x[6],x[7],x[8],x[9],x[10],x[11],x[12]);var result=new BoundedCatcherSupervisor().assess(x[1],p,null,false);assertEquals(x[15]==1,result.permitted());if(result.permitted()){assertEquals(x[13],result.rearMm(),1e-9);assertEquals(x[14],result.sideMm(),1e-9);}}
  }
 }
 @Test void invalidBoundsAndWrongSeasonNeverCommandClosure(){
  for(double bad:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,-1}){
   var p=new BoundedCatcherSupervisor.Pose(2024,0,0,0,0,0,bad,0,0,0,0,0,0);assertFalse(new BoundedCatcherSupervisor().assess(0,p,null,false).permitted());
  }
  for(int y=2024;y<=2026;y++)try(var a=new SupervisedCatcherAdapter(y)){
   new DIOSim(7).setValue(true);new DIOSim(8).setValue(true);a.periodic(true,false,0,pose(y==2024?2025:2024,0),null);assertEquals(CatcherHandoffController.State.FAULT,a.state());assertEquals(0,new PWMSim(2).getSpeed(),1e-9);
  }
 }
 @AfterAll static void binding() throws Exception {
  String token=System.getenv("FRC_SUPERVISOR_RUN_ID"),output=System.getenv("FRC_SUPERVISOR_RUNTIME");if(token==null&&output==null)return;assertNotNull(token);assertNotNull(output);var p=new java.util.Properties();p.setProperty("runId",token);
  for(Class<?> c:new Class<?>[]{CatcherHandoffController.class,BoundedCatcherSupervisor.class,BoundedCatcherSupervisor.Pose.class,BoundedCatcherSupervisor.Pads.class,BoundedCatcherSupervisor.Verdict.class,SupervisedCatcherAdapter.class,SupervisedCatcherTest.class}){String n=c.getName().substring(c.getName().lastIndexOf('.')+1);p.setProperty(n+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream(n+".class").readAllBytes())));}
  try(var out=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){p.store(out,"Fresh supervisor execution");}
 }
}

