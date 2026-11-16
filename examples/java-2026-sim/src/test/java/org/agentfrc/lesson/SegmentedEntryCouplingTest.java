package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.*;
/** Hypothetical two-DOF plant + actual controller IO. Not calibrated normal mechanics. */
class SegmentedEntryCouplingTest {
 @AfterAll static void runtimeBinding() throws Exception {
  String token=System.getenv("FRC_ENTRY_RUN_ID"),output=System.getenv("FRC_ENTRY_RUNTIME");
  if(token==null&&output==null)return;
  assertNotNull(token);assertNotNull(output);
  var properties=new java.util.Properties();properties.setProperty("runId",token);
  for(Class<?> c:new Class<?>[]{SeasonRollerController.class,SegmentedEntryCouplingTest.class}){
   byte[] bytes=c.getResourceAsStream(c.getSimpleName()+".class").readAllBytes();
   properties.setProperty(c.getSimpleName()+"Sha256",java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
  }
  try(var stream=java.nio.file.Files.newOutputStream(java.nio.file.Path.of(output),java.nio.file.StandardOpenOption.CREATE_NEW)){properties.store(stream,"Fresh native startup run");}
 }
 @BeforeAll static void init(){assertTrue(HAL.initialize(500,0));}
 @BeforeEach void enable(){DriverStationSim.resetData();DriverStationSim.setDsAttached(true);DriverStationSim.setEnabled(true);DriverStationSim.notifyNewData();RoboRioSim.setVInVoltage(12);}
 @AfterEach void disable(){DriverStationSim.setEnabled(false);DriverStationSim.notifyNewData();}
 static double radius(int year){return year==2024?.0508:year==2025?.0254:.0381;}
 static boolean beam(int year,double x){return year==2024?(Math.abs(x)>=.127&&Math.abs(x)<=.1778):Math.abs(x)<=(year==2025?.1508125:.075);}
 static double sphereGap(double x,double y,double z,double r,double wy,double wz,double wr,double h){return Math.hypot(Math.max(Math.hypot(x,z-wz)-wr,0),Math.max(Math.abs(y-wy)-h,0))-r;}
 static boolean overlap(int year,double x){
  double mm=x*1000;
  if(year==2025){
   double nx=Math.max(Math.abs(mm)-150.8125,0);if(nx>25.4)return false;
   double top=57.15+Math.sqrt(57.15*57.15-3.175*3.175);
   return 134.7-Math.sqrt(25.4*25.4-nx*nx)<top;
  }
  if(year==2026){for(double y:new double[]{-87.3125,-52.3875,-17.4625,17.4625,52.3875,87.3125})if(sphereGap(mm,0,75,75,y,183.1,38.1,12.00625)<-1e-6)return true;return false;}
  // Interval-certified torus envelope, refining only ambiguous samples.
  for(int n:new int[]{720,7200,72000}){
   double upper=Double.POSITIVE_INFINITY;
   for(int i=0;i<n;i++){double a=2*Math.PI*i/n,cx=mm+152.4*Math.cos(a),cy=152.4*Math.sin(a);
    for(double y:new double[]{-175,-125,-75,-25,25,75,125,175})upper=Math.min(upper,sphereGap(cx,cy,25.4,25.4,y,96.6,50.8,12.00625));}
   if(upper< -1e-6)return true;
   if(upper-152.4*Math.PI/n>1e-6)return false;
  }
  throw new IllegalStateException("Unresolved NOTE contact interval; stop rather than invent contact");
 }
 record Result(boolean done,boolean timeout,int pulses,double x,double speed,double energyResidual,int contactTicks,double impulse,double driveWork){}
 static Result run(int year,double initialSpeed,double mu,boolean missingBeam,boolean enabled){
  // External feeder supplies initial kinetic energy only, not prescribed subsequent motion.
  double x=-.25,v=initialSpeed,u=0,angle=0,work=0,loss=0,initial=.5*.5*v*v,totalImpulse=0,residual=0;int contacts=0;
  try(var controller=new SeasonRollerController(radius(year),year==2024?2:1)){
   var top=EncoderSim.createForChannel(0);var bottom=EncoderSim.createForChannel(2);var sensor=new DIOSim(6);var tp=new PWMSim(0);var bp=new PWMSim(1);
   for(int tick=0;tick<160;tick++){
    int count=(int)Math.round(angle/(2*Math.PI/2048));top.setCount(-count);bottom.setCount(count);
    sensor.setValue(missingBeam||!beam(year,x));controller.periodic(enabled);
    if(!enabled){assertEquals(0,tp.getSpeed(),1e-12);assertEquals(0,bp.getSpeed(),1e-12);}
    if(controller.done()||controller.timedOut())break;
    // Equivalent bank effort from complementary PWM. 5 N/duty is a hypothetical adapter, not a motor spec.
    double force=5*(-tp.getSpeed()+bp.getSpeed())/2;
    for(int sub=0;sub<4;sub++){
     double driven=u+force*.005/.25;work+=.5*.25*(driven*driven-u*u);
     boolean contact=overlap(year,x);if(contact)contacts++;
     double cap=contact?mu*10*.005:0;
     double impulse=Math.max(-cap,Math.min(cap,(driven-v)/(1/.5+1/.25)));
     double vv=v+impulse/.5,uu=driven-impulse/.25;
     double delta=.5*.5*(vv*vv-v*v)+.5*.25*(uu*uu-driven*driven);
     assertTrue(delta<=1e-10);loss-=delta;totalImpulse+=Math.abs(impulse);
     x+=vv*.005;v=vv;u=uu;angle+=u/radius(year)*.005;
     residual=.5*.5*v*v+.5*.25*u*u-initial-work+loss;
     assertEquals(0,residual,1e-9);
    }
   }
   var result=new Result(controller.done(),controller.timedOut(),controller.pulses(),x,v,residual,contacts,totalImpulse,work);
   System.out.println("SEGMENTED_ENTRY year="+year+" initialSpeed="+initialSpeed+" mu="+mu+" missingBeam="+missingBeam+" enabled="+enabled+" "+result);
   return result;
  }
 }
 @Test void externallySeededEntryCompletesWithControllerFeedback(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,.5,false,true);assertTrue(r.done);assertFalse(r.timeout);assertEquals(y==2024?2:1,r.pulses);assertTrue(r.impulse>0);assertTrue(r.driveWork>0);}}
 @Test void noFeederMomentumCannotSelfStart(){for(int y:new int[]{2024,2025,2026}){var r=run(y,0,.5,false,true);assertFalse(r.done);assertTrue(r.timeout);assertEquals(-.25,r.x,1e-12);assertEquals(0,r.impulse,1e-12);}}
 @Test void missingBeamStillFaults(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,.5,true,true);assertFalse(r.done);assertTrue(r.timeout);}}
 @Test void zeroFrictionIsFeederCoastNotMotorTransport(){for(int y:new int[]{2024,2025,2026}){var r=run(y,.2,0,false,true);assertEquals(.2,r.speed,1e-12);assertEquals(0,r.impulse,1e-12);assertTrue(r.done);}}
 @Test void disabledPwmIsNotAClaimOfPhysicalStop(){for(int y:new int[]{2024,2025,2026})run(y,.2,0,false,false);}
 @Test void coralEntryPredicateMatchesBoundarySamples(){assertFalse(overlap(2025,-.166));assertTrue(overlap(2025,-.165));assertTrue(overlap(2025,0));assertFalse(overlap(2025,.166));}
}
