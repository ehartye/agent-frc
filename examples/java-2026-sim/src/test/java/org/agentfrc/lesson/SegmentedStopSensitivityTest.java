package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
/** Hypothetical external resistance/stop screen. No catcher or brake hardware is modeled. */
class SegmentedStopSensitivityTest {
 @AfterAll static void runtimeBinding() throws Exception {
  String token=System.getenv("FRC_STOP_RUN_ID"),output=System.getenv("FRC_STOP_RUNTIME");if(token==null&&output==null)return;assertNotNull(token);assertNotNull(output);
  var properties=new java.util.Properties();properties.setProperty("runId",token);
  for(Class<?> c:new Class<?>[]{SeasonRollerController.class,SegmentedEntryCouplingTest.class,SegmentedStopSensitivityTest.class}){
   properties.setProperty(c.getSimpleName()+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream(c.getSimpleName()+".class").readAllBytes())));
  }
  try(var stream=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){properties.store(stream,"Fresh native sensitivity run");}
 }
 @BeforeAll static void init(){assertTrue(HAL.initialize(500,0));}
 @BeforeEach void enable(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
 @AfterEach void disable(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();}
 record Result(boolean done,boolean timeout,double completionS,double eventX,double eventSpeed,double finalX,double finalSpeed,double postEventTravel,boolean hypothetical50mmScreen,double resistanceLossJ,double maxResidualJ){}
 static Result run(int year,double feed,int substeps,double approachResistance,double postDoneResistance){
  double dt=.02/substeps,x=-.25,v=feed,u=0,angle=0,work=0,loss=0,resistLoss=0,initial=.25*v*v,maxResidual=0;
  double eventX=Double.NaN,eventSpeed=Double.NaN,eventTime=Double.NaN;int eventTick=-1;
  try(var controller=new SeasonRollerController(SegmentedEntryCouplingTest.radius(year),year==2024?2:1)){
   var top=EncoderSim.createForChannel(0);var bottom=EncoderSim.createForChannel(2);var beam=new DIOSim(6);var tp=new PWMSim(0);var bp=new PWMSim(1);
   for(int tick=0;tick<250;tick++){
    int count=(int)Math.round(angle/(2*Math.PI/2048));top.setCount(-count);bottom.setCount(count);beam.setValue(!SegmentedEntryCouplingTest.beam(year,x));controller.periodic(true);
    if(controller.done()&&Double.isNaN(eventX)){eventX=x;eventSpeed=v;eventTime=tick*.02;eventTick=tick;}
    if(controller.done()||controller.timedOut()){assertEquals(0,tp.getSpeed(),1e-12);assertEquals(0,bp.getSpeed(),1e-12);}
    if(controller.timedOut()||(controller.done()&&tick>=eventTick+50))break;
    double force=5*(-tp.getSpeed()+bp.getSpeed())/2;
    for(int sub=0;sub<substeps;sub++){
     double driven=u+force*dt/.25;work+=.125*(driven*driven-u*u);
     double cap=SegmentedEntryCouplingTest.overlap(year,x)? .5*10*dt:0;
     double j=Math.max(-cap,Math.min(cap,(driven-v)/6));double vv=v+j/.5,uu=driven-j/.25;
     double delta=.25*(vv*vv-v*v)+.125*(uu*uu-driven*driven);assertTrue(delta<=1e-10);loss-=delta;
     // Capped external dry-friction impulse: dissipative, cannot reverse piece motion.
     double resistance=controller.done()?postDoneResistance:approachResistance;
     double braking=Math.copySign(Math.min(Math.abs(.5*vv),resistance*dt),vv);
     double after=vv-braking/.5;double removed=.25*(vv*vv-after*after);assertTrue(removed>=-1e-12);resistLoss+=removed;
     x+=after*dt;v=after;u=uu;angle+=u/SegmentedEntryCouplingTest.radius(year)*dt;
     double residual=.25*v*v+.125*u*u-initial-work+loss+resistLoss;maxResidual=Math.max(maxResidual,Math.abs(residual));assertEquals(0,residual,1e-8);
    }
   }
   double travel=Double.isNaN(eventX)?Double.NaN:x-eventX;
   boolean screen=controller.done()&&Math.abs(v)<.01&&travel<=.05;
   var r=new Result(controller.done(),controller.timedOut(),eventTime,eventX,eventSpeed,x,v,travel,screen,resistLoss,maxResidual);
   System.out.println("SEGMENTED_STOP year="+year+" feed="+feed+" substeps="+substeps+" approachResistance="+approachResistance+" postDoneResistance="+postDoneResistance+" "+r);return r;
  }
 }
 @Test void timestepAndFeedSweep(){for(int y:new int[]{2024,2025,2026})for(double feed:new double[]{.1,.2,.4})for(int sub:new int[]{2,4,8}){var r=run(y,feed,sub,0,0);assertTrue(r.done||r.timeout);if(r.done){assertTrue(r.eventSpeed>0);assertFalse(r.hypothetical50mmScreen);}}}
 @Test void beamCompletionDoesNotCapture(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,4,0,0);assertTrue(r.done);assertTrue(r.postEventTravel>.05);assertEquals(r.eventSpeed,r.postEventTravel,1e-10);assertTrue(r.finalSpeed>.01);assertFalse(r.hypothetical50mmScreen);}}
 @Test void externalStoppingForceIsOnlyAHypotheticalScreen(){for(int y:new int[]{2024,2025,2026}){var weak=run(y,.2,4,0,.5);var strong=run(y,.2,4,0,10);assertTrue(weak.done);assertTrue(strong.done);assertTrue(strong.postEventTravel<weak.postEventTravel);assertEquals(0,strong.finalSpeed,1e-10);assertTrue(strong.resistanceLossJ>0);var slow=run(y,.1,4,0,10);assertTrue(slow.done);if(y!=2026)assertFalse(slow.hypothetical50mmScreen);}}
 @Test void approachResistanceCanPreventAcquisition(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,4,.1,0);if(y==2026){assertFalse(r.done);assertTrue(r.timeout);assertEquals(0,r.finalSpeed,1e-10);}}}
}
