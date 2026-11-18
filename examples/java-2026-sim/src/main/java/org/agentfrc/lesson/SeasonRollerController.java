package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Offline prototype: monotone spin-up, ideal beam counting, bounded timeout. Not hardware firmware. */
public final class SeasonRollerController implements AutoCloseable {
 private final Encoder upper,lower;private final DigitalInput beam;private final PWMSparkMax top,bottom;
 private final int needed;private final double radius;private double previousUpper,previousLower,demand=.04,time;private boolean previousBeam,initialized,done,timedOut;private int pulses;private double upperRate,lowerRate;
 public SeasonRollerController(double radius,int needed){this(radius,needed,0,2,6,0,1);}
 public SeasonRollerController(double radius,int needed,int topEncoderA,int bottomEncoderA,int beamChannel,int topPwm,int bottomPwm){if(RobotBase.isReal())throw new IllegalStateException("Offline only");if(!Double.isFinite(radius)||radius<.01||radius>.2||(needed!=1&&needed!=2))throw new IllegalArgumentException("Controller configuration");if(topEncoderA<0||bottomEncoderA<0||topEncoderA>8||bottomEncoderA>8||Math.abs(topEncoderA-bottomEncoderA)<2||beamChannel<0||beamChannel>9||beamChannel==topEncoderA||beamChannel==topEncoderA+1||beamChannel==bottomEncoderA||beamChannel==bottomEncoderA+1||topPwm<0||topPwm>9||bottomPwm<0||bottomPwm>9||topPwm==bottomPwm)throw new IllegalArgumentException("IO mapping");this.radius=radius;this.needed=needed;upper=new Encoder(topEncoderA,topEncoderA+1);lower=new Encoder(bottomEncoderA,bottomEncoderA+1);beam=new DigitalInput(beamChannel);top=new PWMSparkMax(topPwm);bottom=new PWMSparkMax(bottomPwm);upper.setDistancePerPulse(2*Math.PI/2048);lower.setDistancePerPulse(2*Math.PI/2048);}
 public void periodic(boolean enabled){if(done||timedOut){top.set(0);bottom.set(0);return;}double a=upper.getDistance(),b=lower.getDistance();upperRate=(a-previousUpper)/.02;lowerRate=(b-previousLower)/.02;previousUpper=a;previousLower=b;boolean blocked=!beam.get();if(!initialized){previousBeam=blocked;initialized=true;if(blocked)timedOut=true;}else if(!previousBeam&&blocked)pulses++;if(!timedOut&&previousBeam&&!blocked&&pulses==needed)done=true;previousBeam=blocked;time+=.02;if(time>=3&&!done)timedOut=true;
 if(!enabled||done||timedOut||RobotController.getBatteryVoltage()<6){top.set(0);bottom.set(0);return;}if(!Double.isFinite(upperRate)||!Double.isFinite(lowerRate)||upperRate>1||lowerRate< -1){timedOut=true;top.set(0);bottom.set(0);return;}
 // No demand reduction except final neutral: active regeneration is deliberately unsupported.
 if(Math.min(-upperRate,lowerRate)*radius<2)demand=Math.min(.35,demand+.008);
 top.set(-demand);bottom.set(demand);
 }
 public boolean done(){return done;}public boolean timedOut(){return timedOut;}public int pulses(){return pulses;}public double upperRate(){return upperRate;}public double lowerRate(){return lowerRate;}
 @Override public void close(){top.set(0);bottom.set(0);top.close();bottom.close();upper.close();lower.close();beam.close();}
}
