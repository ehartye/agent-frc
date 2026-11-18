package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;import java.util.*;import java.security.*;
import org.junit.jupiter.api.*;import edu.wpi.first.hal.HAL;import edu.wpi.first.wpilibj.simulation.*;
/** Prescribed motion through actual simulated IO, not force-coupled transport. */
class SegmentedReplayTest {
 static Path root;static Properties config;record Row(int tick,double x,String lower,String upper,String classification,boolean beam,int top,int bottom){}
 static String sha(byte[] b)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}
 static List<Row> rows(int year,String variant)throws Exception{var path=root.resolve(year+"-"+variant+".csv");assertEquals(config.getProperty(year+"-"+variant+".sha256"),sha(Files.readAllBytes(path)));var result=new ArrayList<Row>();for(String line:Files.readAllLines(path).subList(1,161)){var p=line.split(",");assertEquals(8,p.length);result.add(new Row(Integer.parseInt(p[0]),Double.parseDouble(p[1]),p[2],p[3],p[4],p[5].equals("1"),Integer.parseInt(p[6]),Integer.parseInt(p[7])));}return result;}
 @BeforeAll static void setup()throws Exception{assertTrue(HAL.initialize(500,0));assertNotNull(System.getenv("FRC_SEGMENTED_REPLAY"));root=Path.of(System.getenv("FRC_SEGMENTED_REPLAY"));config=new Properties();try(var in=Files.newInputStream(root.resolve("input.properties"))){config.load(in);}assertEquals("frc-segmented-prescribed-replay/v1",config.getProperty("schema"));assertEquals("blocked",config.getProperty("engineeringAcceptance"));assertEquals("prescribed-not-force-integrated",config.getProperty("motion"));}
 @BeforeEach void enable(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
 @AfterEach void disable(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();}
 record Outcome(boolean done,boolean timeout,int pulses,double finalTop,double finalBottom){}
 static Outcome replay(int year,String variant,int fault,boolean enabled,boolean write)throws Exception{
  try(var controller=new SeasonRollerController(Double.parseDouble(config.getProperty(year+".radiusM")),year==2024?2:1)){
   var top=EncoderSim.createForChannel(0);var bottom=EncoderSim.createForChannel(2);var beam=new DIOSim(6);var tp=new PWMSim(0);var bp=new PWMSim(1);var trace=new StringBuilder("tick,xM,geometryClassification,beam,topPwm,bottomPwm,pulses,done,timeout\n");
   for(var row:rows(year,variant)){top.setCount(fault==2?-row.top:row.top);bottom.setCount(row.bottom);beam.setValue(fault==1||!row.beam);controller.periodic(enabled);trace.append(row.tick+","+row.x+","+row.classification+","+row.beam+","+tp.getSpeed()+","+bp.getSpeed()+","+controller.pulses()+","+controller.done()+","+controller.timedOut()+"\n");if(!enabled){assertEquals(0,tp.getSpeed(),1e-12);assertEquals(0,bp.getSpeed(),1e-12);}}
   if(write)Files.writeString(root.resolve(year+"-"+variant+"-io.csv"),trace.toString(),StandardOpenOption.CREATE_NEW);
   return new Outcome(controller.done(),controller.timedOut(),controller.pulses(),tp.getSpeed(),bp.getSpeed());
  }
 }
 @Test void geometryHasSeparatedAndOverlappingStatesWithoutForces()throws Exception{for(int y:new int[]{2024,2025,2026}){var n=rows(y,"nominal");var c=rows(y,"compressed");assertFalse(n.stream().anyMatch(r->r.classification.equals("overlap")));assertTrue(c.stream().anyMatch(r->r.classification.equals("overlap")));assertTrue(c.stream().anyMatch(r->r.classification.equals("separated")));for(int i=0;i<160;i++)assertEquals(n.get(i).beam,c.get(i).beam);}}
 @Test void prescribedSequenceCompletesThroughRealSimulatedIo()throws Exception{var result=new Properties();for(int y:new int[]{2024,2025,2026})for(String v:new String[]{"nominal","compressed"}){var o=replay(y,v,0,true,true);assertTrue(o.done);assertFalse(o.timeout);assertEquals(y==2024?2:1,o.pulses);assertEquals(0,o.finalTop,1e-12);assertEquals(0,o.finalBottom,1e-12);result.setProperty(y+"-"+v+".pulses",Integer.toString(o.pulses));}result.setProperty("testClassSha256",sha(SegmentedReplayTest.class.getResourceAsStream("SegmentedReplayTest.class").readAllBytes()));result.setProperty("controllerClassSha256",sha(SeasonRollerController.class.getResourceAsStream("SeasonRollerController.class").readAllBytes()));result.setProperty("inputSha256",sha(Files.readAllBytes(root.resolve("input.properties"))));result.setProperty("engineeringAcceptance","blocked");result.setProperty("contactCausedTransport","false");try(var out=Files.newOutputStream(root.resolve("result.properties"),StandardOpenOption.CREATE_NEW)){result.store(out,"Prescribed geometry/IO replay, no calibrated dynamics");}}
 @Test void missingBeamCannotComplete()throws Exception{for(int y:new int[]{2024,2025,2026}){var o=replay(y,"compressed",1,true,false);assertFalse(o.done);assertTrue(o.timeout);}}
 @Test void reversedEncoderIsDetected()throws Exception{for(int y:new int[]{2024,2025,2026}){var o=replay(y,"compressed",2,true,false);assertFalse(o.done);assertTrue(o.timeout);}}
 @Test void disableZerosPwmNotPrescribedMotion()throws Exception{for(int y:new int[]{2024,2025,2026})replay(y,"compressed",0,false,false);}
}
