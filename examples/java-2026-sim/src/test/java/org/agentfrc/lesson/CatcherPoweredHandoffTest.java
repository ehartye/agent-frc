package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
class CatcherPoweredHandoffTest {
 @AfterAll static void binding() throws Exception {
  String token=System.getenv("FRC_HANDOFF_RUN_ID"),output=System.getenv("FRC_HANDOFF_RUNTIME");if(token==null&&output==null)return;assertNotNull(token);assertNotNull(output);
  var p=new java.util.Properties();p.setProperty("runId",token);
  for(String name:new String[]{"PadConsistencyMonitor","PadConsistencyMonitor$Sample","VirtualCommandLease","VirtualCommandLease$Output","SeasonRollerController","StagedCatcherController","BoundedCatcherSupervisor","BoundedCatcherSupervisor$Pose","BoundedCatcherSupervisor$Pads","BoundedCatcherSupervisor$Verdict","SegmentedEntryCouplingTest","CatcherContactModel","DiagnosticWorldCatcherTest","DiagnosticWorldCatcherTest$ExitState","PoweredGuidePlant","PoweredGuidePlant$Config","PoweredGuidePlant$Sample","SharedSupply","SharedSupply$Result","CatcherPoweredHandoffTest","CatcherPoweredHandoffTest$Joined"}){Class<?> c=Class.forName("org.agentfrc.lesson."+name);p.setProperty(name+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream(name+".class").readAllBytes())));}
  var c=edu.wpi.first.math.system.plant.DCMotor.class;p.setProperty("DCMotorSha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream("DCMotor.class").readAllBytes())));
  try(var stream=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){p.store(stream,"Fresh catcher powered handoff");}System.out.println("HANDOFF_RUN_ID="+token);
 }
 @BeforeAll static void init(){DiagnosticWorldCatcherTest.init();}
 @BeforeEach void enable(){new DiagnosticWorldCatcherTest().enable();}
 @AfterEach void disable(){new DiagnosticWorldCatcherTest().disable();}
 record Joined(double sourceTime,double sourceX,double sourceV,double finalTime,double finalWorldX,double finalWorldV,double inheritedEnergy,double finalEnergyResidual,double upstreamGap,boolean exited,boolean heldBodyReachesGuideEntrance){}
 static PoweredGuidePlant.Config config(int y,double length,double normal){return new PoweredGuidePlant.Config(.5,y==2024?.0508:y==2025?.0254:.0381,.004,length,0,normal,.8,y==2025?.08:.6,12);}
 static Joined join(DiagnosticWorldCatcherTest.ExitState e,double length,double normal,double dt){
  if(e.gateClosed()||e.padContact()||e.mass()!=.5||e.velocity()>=0||!Double.isFinite(e.velocity())||e.releaseImpulse()!=.2)throw new IllegalArgumentException("Invalid release evidence");
  double hx=e.year()==2024?.1778:e.year()==2025?.1508125:.075;
  double gap=e.x()-length-hx-SegmentedEntryCouplingTest.radius(e.year());
  if(gap<.002)throw new IllegalArgumentException("Upstream intake path overlap");
  var p=new PoweredGuidePlant(config(e.year(),length,normal));
  // Advance the independent wheel clock from t=0 to the actual catcher exit time.
  int steps=(int)Math.ceil(e.time()/dt);double spinStep=e.time()/steps;
  for(int k=0;k<steps;k++)p.step(spinStep);
  var before=p.sample();p.acceptHorizontalHandoff(e.mass(),-e.velocity(),e.time());var at=p.sample();
  assertEquals(before.omega(),at.omega());assertEquals(before.motorWork(),at.motorWork());assertEquals(e.time(),at.time(),1e-8);assertEquals(e.velocity(),-at.speed());assertEquals(e.x(),e.x()-at.x());
  assertEquals(.5*e.mass()*e.velocity()*e.velocity(),at.feedEnergy(),1e-14);
  var r=at;for(int k=0;k<40000&&!r.exited();k++){r=p.step(dt);assertEquals(0,r.energyResidual(),2e-5);assertFalse(SegmentedEntryCouplingTest.overlap(e.year(),e.x()-r.x()));}
  return new Joined(e.time(),e.x(),e.velocity(),r.time(),e.x()-r.x(),-r.speed(),r.feedEnergy(),r.energyResidual(),gap,r.exited(),.4-hx<=e.x());
 }
 @Test void continuousStateMassClockAndEnergy(){for(int y:new int[]{2024,2025,2026})for(double speed:new double[]{.1,.2,.4}){
  final DiagnosticWorldCatcherTest.ExitState[] exit={null};var result=DiagnosticWorldCatcherTest.run(y,speed,0,e->exit[0]=e);assertTrue(result.locallyReleased());assertNotNull(exit[0]);double length=y==2025?.15:.1;
  var a=join(exit[0],length,15,.0001);var b=join(exit[0],length,15,.00005);assertTrue(a.exited());assertTrue(b.exited());assertEquals(a.finalWorldV(),b.finalWorldV(),.0001);assertEquals(a.finalTime(),b.finalTime(),.00001);
  System.out.println("JOINED_EXIT year="+y+" initialSpeed="+speed+" length="+length+" "+b);
 }}
 @Test void upstreamOverlapAndReleaseFaultsDenied(){for(int y:new int[]{2024,2025,2026}){
  final DiagnosticWorldCatcherTest.ExitState[] exit={null};var result=DiagnosticWorldCatcherTest.run(y,.2,4,e->exit[0]=e);assertFalse(result.locallyReleased());assertNull(exit[0]);
  var e=new DiagnosticWorldCatcherTest.ExitState(y,3,.3496,-.4,.5,false,false,.2);assertThrows(IllegalArgumentException.class,()->join(e,.3,15,.0001));
  var closed=new DiagnosticWorldCatcherTest.ExitState(y,3,.3496,-.4,.5,true,false,.2);assertThrows(IllegalArgumentException.class,()->join(closed,.1,15,.0001));
 }}
 @Test void bodyExtentChallengesDelayedContactAssumption(){for(int y:new int[]{2024,2025,2026}){double hx=y==2024?.1778:y==2025?.1508125:.075;assertTrue(.4-hx<.3496,"held body already reaches nominal guide entrance; fixed closed nip isolation is unproven");}}
 @Test void alteredMassClockOrDirectionCannotTransfer(){var p=new PoweredGuidePlant(config(2024,.1,15));assertThrows(IllegalArgumentException.class,()->p.acceptHorizontalHandoff(.235,.4,0));assertThrows(IllegalArgumentException.class,()->p.acceptHorizontalHandoff(.5,.4,1));assertThrows(IllegalArgumentException.class,()->p.acceptHorizontalHandoff(.5,-.4,0));var tilted=new PoweredGuidePlant(new PoweredGuidePlant.Config(.5,.05,.004,.1,.5,15,.8,.6,12));assertThrows(IllegalArgumentException.class,()->tilted.acceptHorizontalHandoff(.5,.4,0));}
 @Test void absentContactPreservesSpeedRatherThanInventingAcceleration(){for(int y:new int[]{2024,2025,2026}){var e=new DiagnosticWorldCatcherTest.ExitState(y,3,.3496,-.4,.5,false,false,.2);var j=join(e,.1,0,.0001);assertTrue(j.exited());assertEquals(e.velocity(),j.finalWorldV(),1e-12);}}
}
