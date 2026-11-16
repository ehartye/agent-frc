package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
class IntegratedPregripPrototypeTest {
 @Test void allSeasonRuntimeExitsAndTimestepSensitivity(){for(int y:new int[]{2024,2025,2026})for(double m:(y==2025?new double[]{.498951607,.816466266}:new double[]{y==2024?.235:.215}))for(double v:new double[]{9,12})for(double inertia:new double[]{.004,.001,.0005,.0003}){
  var a=IntegratedPregripPrototype.run(y,m,v,.0001,0,inertia);var b=IntegratedPregripPrototype.run(y,m,v,.00005,0,inertia);
  assertEquals(PregripSupervisor.State.DONE,b.state());assertTrue(b.plant().exited());assertEquals(y==2025?.08:.6,b.commandedDuty());assertEquals(0,b.plant().feedEnergy());assertEquals(0,b.plant().energyResidual(),2e-5);assertEquals(a.plant().speed(),b.plant().speed(),.0001);assertEquals(a.finalTime(),b.finalTime(),.00001);
  System.out.println("PROTOTYPE_EXIT year="+y+" volts="+v+" dt=0.00005 angleRad="+b.angle()+" massKg="+m+" guideLengthM="+b.length()+" radiusM="+b.radius()+" inertiaEach="+b.inertia()+" commandedDuty="+b.commandedDuty()+" releaseTime="+b.releaseTime()+" "+b.plant());
 }}
 @Test void missingContactAndGateFeedbackNeverFeed(){for(int y:new int[]{2024,2025,2026})for(int f:new int[]{1,2,4}){var r=IntegratedPregripPrototype.run(y,.5,12,.0001,f);assertEquals(PregripSupervisor.State.FAULT,r.state());assertEquals(-1,r.releaseTime());assertEquals(0,r.plant().motorWork());}}
 @Test void lostGripTerminatesWithoutClaimingPhysicalStop(){for(int y:new int[]{2024,2025,2026}){var r=IntegratedPregripPrototype.run(y,.5,12,.0001,3);assertEquals(PregripSupervisor.State.FAULT,r.state());assertTrue(r.releaseTime()>0);assertFalse(r.plant().exited());assertTrue(r.plant().omega()>0);}}
 @Test void invalidScenariosRejected(){assertThrows(IllegalArgumentException.class,()->IntegratedPregripPrototype.run(2023,.5,12,.0001,0));assertThrows(IllegalArgumentException.class,()->IntegratedPregripPrototype.run(2024,.5,12,Double.NaN,0));}
 @Test void zeroAndChangedDemandReachThePlant(){var zero=IntegratedPregripPrototype.run(2024,.235,12,.0001,0,.0005,0);assertEquals(0,zero.commandedDuty());assertEquals(-1,zero.releaseTime());assertEquals(0,zero.plant().motorWork());assertEquals(0,zero.plant().omega());assertFalse(zero.plant().exited());var low=IntegratedPregripPrototype.run(2024,.235,12,.0001,0,.0005,.3);var high=IntegratedPregripPrototype.run(2024,.235,12,.0001,0,.0005,.6);assertEquals(.3,low.commandedDuty());assertEquals(.6,high.commandedDuty());assertTrue(high.plant().speed()>low.plant().speed());assertTrue(high.plant().motorWork()>low.plant().motorWork());}
 @AfterAll static void binding()throws Exception{
  String token=System.getenv("FRC_PROTOTYPE_RUN_ID"),output=System.getenv("FRC_PROTOTYPE_RUNTIME");if(token==null&&output==null)return;assertNotNull(token);assertNotNull(output);var p=new java.util.Properties();p.setProperty("runId",token);
  for(String n:new String[]{"IntegratedPregripPrototype","IntegratedPregripPrototype$Result","IntegratedPregripPrototypeTest","PregripSupervisor","PregripSupervisor$State","PregripSupervisor$Observation","PregripSupervisor$Output","PoweredGuidePlant","PoweredGuidePlant$Config","PoweredGuidePlant$Sample","SharedSupply","SharedSupply$Result"}){Class<?> c=Class.forName("org.agentfrc.lesson."+n);p.setProperty(n+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream(n+".class").readAllBytes())));}
  var c=edu.wpi.first.math.system.plant.DCMotor.class;p.setProperty("DCMotorSha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream("DCMotor.class").readAllBytes())));
  try(var out=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){p.store(out,"Fresh integrated virtual prototype");}System.out.println("PROTOTYPE_RUN_ID="+token);
 }
}
