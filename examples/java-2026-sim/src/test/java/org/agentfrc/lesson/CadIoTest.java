package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
class CadIoTest {
 static String sha(byte[] b)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}
 @BeforeAll static void hal(){assertTrue(HAL.initialize(500,0));}
 @Test void actualExtractedCadInertiaDrivesCompiledControllerAndEncoderPwmLoop()throws Exception{
  String properties=System.getenv("FRC_CAD_PROPERTIES"),step=System.getenv("FRC_CAD_STEP"),output=System.getenv("FRC_IO_OUTPUT");
  assertNotNull(properties,"CAD extraction not run");assertNotNull(step,"Native source absent");assertNotNull(output,"Output destination absent");
  byte[] input=Files.readAllBytes(Path.of(properties));Properties p=new Properties();try(var in=Files.newInputStream(Path.of(properties))){p.load(in);}
  assertEquals("frc-cad-io-fixture/v1",p.getProperty("schema"));assertEquals("explicit-unvalidated-uniform-assumption",p.getProperty("densityBasis"));assertEquals("deliberately-nonphysical-rotating-sideplate-integration-fixture",p.getProperty("fixtureRole"));assertEquals("blocked",p.getProperty("engineeringAcceptance"));
  assertEquals(p.getProperty("sourceSha256"),sha(Files.readAllBytes(Path.of(step))));
  double inertia=Double.parseDouble(p.getProperty("inertiaZKgM2"));assertTrue(Double.isFinite(inertia)&&inertia>0&&inertia<10);
  DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();
  StringBuilder csv=new StringBuilder("tick,trueRadPerSec,encoderRadPerSec,pwm,appliedVolts,currentAmp\n");CandidateIoRig.Result r=null;
  try(var rig=new CandidateIoRig(inertia,1,12)){
   for(int i=0;i<600;i++){r=rig.step(true,150);assertEquals(r.trueRate(),r.measuredRate(),1e-8);csv.append(i).append(',').append(r.trueRate()).append(',').append(r.measuredRate()).append(',').append(r.pwm()).append(',').append(r.appliedVolts()).append(',').append(r.currentAmp()).append('\n');}
   assertEquals(150,r.trueRate(),20,"Development fixture tracking check, not hardware acceptance");assertEquals(0,rig.step(false,150).pwm(),1e-10);
  }finally{DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
  Path dir=Path.of(output);Files.writeString(dir.resolve("io-trace.csv"),csv.toString(),StandardOpenOption.CREATE_NEW);
  Properties result=new Properties();result.setProperty("cadPropertiesSha256",sha(input));result.setProperty("cadSourceSha256",p.getProperty("sourceSha256"));result.setProperty("inertiaZKgM2",Double.toString(inertia));result.setProperty("finalRateRadPerSec",Double.toString(r.trueRate()));result.setProperty("controllerClassSha256",sha(CandidateIoController.class.getResourceAsStream("CandidateIoController.class").readAllBytes()));result.setProperty("engineeringAcceptance","blocked");result.setProperty("fixtureRole",p.getProperty("fixtureRole"));
  try(var out=Files.newOutputStream(dir.resolve("io-result.properties"),StandardOpenOption.CREATE_NEW)){result.store(out,"Executed desktop prototype; not calibrated robot evidence");}
 }
}
