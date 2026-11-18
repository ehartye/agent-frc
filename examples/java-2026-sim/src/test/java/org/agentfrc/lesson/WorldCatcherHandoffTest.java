package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
/** One world-coordinate plant, original intake controller, and separate guarded catcher protocol. */
class WorldCatcherHandoffTest {
 @AfterAll static void binding() throws Exception {
  String token=System.getenv("FRC_WORLD_RUN_ID"),output=System.getenv("FRC_WORLD_RUNTIME");if(token==null&&output==null)return;assertNotNull(token);assertNotNull(output);
  var p=new java.util.Properties();p.setProperty("runId",token);
  for(Class<?> c:new Class<?>[]{SeasonRollerController.class,CatcherHandoffController.class,SegmentedEntryCouplingTest.class,CatcherContactModel.class,WorldCatcherHandoffTest.class})p.setProperty(c.getSimpleName()+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(c.getResourceAsStream(c.getSimpleName()+".class").readAllBytes())));
  try(var stream=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){p.store(stream,"Fresh world handoff execution");}
 }
 @BeforeAll static void init(){assertTrue(HAL.initialize(500,0));}
 @BeforeEach void enable(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
 @AfterEach void disable(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();}
 record Result(boolean intakeDone,String catcherState,boolean captured,boolean locallyReleased,int tailPulses,double arrivalS,double finalX,double finalSpeed,double maxCaptureDisplacement,double preDwellSpeed,double postDwellSpeed,double minIsolationGap,double maxEnergyResidual){}
 // fault1=missing arrival,2=missing tail,3=closed feedback stuck false,4=unloaded feedback false,
 // 5=500ms closing lag,6=disabled catcher. All feedback and actuator parameters are hypothetical.
 static Result run(int year,double initialSpeed,int fault) {
  final double dt=.002;double x=-.25,v=initialSpeed,u=0,angle=0,work=0,loss=0,initial=.25*v*v,maxResidual=0;
  double hx=year==2024?.1778:year==2025?.1508125:.075,wr=SegmentedEntryCouplingTest.radius(year);
  double arrivalPlane=.4+hx-.005,tailPlane=.4-hx-.018;
  int arrivalStep=-1,actuatorTicks=0;boolean gateClosed=false,lastCommand=false,hadHold=false,pushApplied=false;
  double maxX=0,pre=0,post=0,minIsolation=Double.POSITIVE_INFINITY;
  try(var intake=new SeasonRollerController(wr,year==2024?2:1);var catcher=new CatcherHandoffController(year==2024?2:1)){
   var top=EncoderSim.createForChannel(0);var bottom=EncoderSim.createForChannel(2);var beam=new DIOSim(6);var arrival=new DIOSim(7);var tail=new DIOSim(8);var feedback=new DIOSim(9);var unloaded=new DIOSim(10);
   var tp=new PWMSim(0);var bp=new PWMSim(1);var gate=new PWMSim(2);var pinch=new PWMSim(3);
   for(int step=0;step<3500;step++){
    if(step%10==0){
     int count=(int)Math.round(angle/(2*Math.PI/2048));top.setCount(-count);bottom.setCount(count);beam.setValue(!SegmentedEntryCouplingTest.beam(year,x));
     arrival.setValue(fault==1||!SegmentedEntryCouplingTest.beam(year,x-arrivalPlane));tail.setValue(fault==2||!SegmentedEntryCouplingTest.beam(year,x-tailPlane));feedback.setValue(fault!=3&&gateClosed);
     unloaded.setValue(fault!=4&&CatcherContactModel.potential(-(x-.4)-.02,1000,50)<=1e-10);
     intake.periodic(true);catcher.periodic(fault!=6,arrivalStep>=0&&step>=arrivalStep+1000);
     if(arrivalStep<0&&catcher.state()==CatcherHandoffController.State.CLOSING)arrivalStep=step;
     hadHold|=catcher.state()==CatcherHandoffController.State.HOLD;
     if(catcher.state()==CatcherHandoffController.State.FAULT)break;
    }
    boolean command=gate.getSpeed()>.5;
    if(command!=lastCommand){actuatorTicks=0;lastCommand=command;}actuatorTicks++;
    int closeLag=fault==5?250:10;
    if(command&&actuatorTicks>=closeLag&&!gateClosed&&x-.4>-.018)gateClosed=true;
    if(!command&&actuatorTicks>=10&&gateClosed&&CatcherContactModel.potential(-(x-.4)-.02,1000,50)<=1e-10)gateClosed=false;
    if(gateClosed){minIsolation=Math.min(minIsolation,x-hx-wr);assertTrue(x-hx-wr>0);}
    if(arrivalStep>=0&&step==arrivalStep+500){double nv=v+.2/.5;work+=.25*(nv*nv-v*v);v=nv;}
    if(arrivalStep>=0&&step>=arrivalStep+1050&&!pushApplied&&catcher.state()==CatcherHandoffController.State.RELEASED){double nv=v-.2/.5;work+=.25*(nv*nv-v*v);v=nv;pushApplied=true;}
    double driven=u+5*(-tp.getSpeed()+bp.getSpeed())/2*dt/.25;work+=.125*(driven*driven-u*u);
    double cap=SegmentedEntryCouplingTest.overlap(year,x)?5*dt:0;
    double j=CatcherContactModel.clamp((driven-v)/6,-cap,cap);double vv=v+j/.5,uu=driven-j/.25;
    double contactDelta=.25*(vv*vv-v*v)+.125*(uu*uu-driven*driven);assertTrue(contactDelta<=1e-9);loss-=contactDelta;
    var next=CatcherContactModel.step(x-.4,vv,dt,gateClosed,gateClosed&&pinch.getSpeed()>.5);x=.4+next.x();v=next.v();u=uu;loss+=next.loss();angle+=u/wr*dt;
    double energy=CatcherContactModel.energy(x-.4,v,gateClosed)+.125*u*u;
    maxResidual=Math.max(maxResidual,Math.abs(energy-initial-work+loss));assertTrue(maxResidual<1e-8);
    if(arrivalStep>=0&&step+1<=arrivalStep+1000){maxX=Math.max(maxX,Math.abs(x-.4));if(step+1>=arrivalStep+375&&step+1<=arrivalStep+500)pre=Math.max(pre,Math.abs(v));if(step+1>=arrivalStep+875)post=Math.max(post,Math.abs(v));}
    if(pushApplied&&x<.35)break;
   }
   boolean captured=hadHold&&maxX<=.05&&pre<=.01&&post<=.01&&catcher.state()!=CatcherHandoffController.State.FAULT;
   var r=new Result(intake.done(),catcher.state().name(),captured,pushApplied&&x<.35,catcher.tailPulses(),arrivalStep<0?-1:arrivalStep*dt,x,v,maxX,pre,post,Double.isFinite(minIsolation)?minIsolation:-1,maxResidual);
   System.out.println("WORLD_CATCHER year="+year+" initialSpeed="+initialSpeed+" fault="+fault+" "+r);return r;
  }
 }
 @Test void continuousWorldHandoffAndRelease(){for(int y:new int[]{2024,2025,2026})for(double speed:new double[]{.1,.2,.4}){var r=run(y,speed,0);assertTrue(r.intakeDone);assertEquals("RELEASED",r.catcherState);assertTrue(r.captured);assertTrue(r.locallyReleased);assertTrue(r.minIsolationGap>0);}}
 @Test void missingArrivalOrTailCannotCapture(){for(int y:new int[]{2024,2025,2026})for(int fault:new int[]{1,2}){var r=run(y,.2,fault);assertEquals("FAULT",r.catcherState);assertFalse(r.captured);assertFalse(r.locallyReleased);}}
 @Test void gateFeedbackOrDelayCannotClaimSuccess(){for(int y:new int[]{2024,2025,2026})for(int fault:new int[]{3,5}){var r=run(y,.2,fault);assertEquals("FAULT",r.catcherState);assertFalse(r.captured);assertFalse(r.locallyReleased);}}
 @Test void loadedReleaseIndicationKeepsGateCommanded(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,4);assertEquals("FAULT",r.catcherState);assertFalse(r.locallyReleased);}}
 @Test void absentApproachMomentumCannotInventTransport(){for(int y:new int[]{2024,2025,2026}){var r=run(y,0,0);assertEquals("FAULT",r.catcherState);assertEquals(-.25,r.finalX,1e-10);assertFalse(r.captured);}}
 @Test void disabledCatcherCannotReportCapture(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,6);assertEquals("FAULT",r.catcherState);assertFalse(r.captured);assertFalse(r.locallyReleased);}}
 @Test void modelPortMatchesIndependentPythonVectors() throws Exception {
  var lines=java.nio.file.Files.readAllLines(java.nio.file.Path.of("src/test/resources/catcher-contact-golden.csv"));
  for(String line:lines.subList(1,lines.size())){var a=line.split(",");var r=CatcherContactModel.step(Double.parseDouble(a[0]),Double.parseDouble(a[1]),Double.parseDouble(a[2]),a[3].equals("1"),a[4].equals("1"));assertEquals(Double.parseDouble(a[5]),r.x(),1e-11);assertEquals(Double.parseDouble(a[6]),r.v(),1e-11);assertEquals(Double.parseDouble(a[7]),r.loss(),1e-11);}
 }
}
