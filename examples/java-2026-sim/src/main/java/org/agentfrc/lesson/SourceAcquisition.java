package org.agentfrc.lesson;
/** Ideal event-exact source approach along the existing guide pitch, not physical acquisition. */
public final class SourceAcquisition {
 public static double pitch(int year){return switch(year){case 2024->Math.toRadians(50);case 2025->0;case 2026->Math.toRadians(60);default->throw new IllegalArgumentException("season");};}
 public static final class Retained {
  public final int year,fault;public final double mass,pitch,q,v,elapsed,sourceEnergy,potentialGain,guideLoss,impactLoss,remainingEnergy,impulse,residual,preImpactSpeed,travelTime;public final boolean eligible;private boolean consumed;
  private Retained(int y,int f,double m,double a,double x,double speed,double t,double input,double potential,double drag,double loss,double finalEnergy,double j,double before,double travel,boolean ok){year=y;fault=f;mass=m;pitch=a;q=x;v=speed;elapsed=t;sourceEnergy=input;potentialGain=potential;guideLoss=drag;impactLoss=loss;remainingEnergy=finalEnergy;impulse=j;residual=input-potential-drag-loss-finalEnergy;preImpactSpeed=before;travelTime=travel;eligible=ok;}
  synchronized void consume(){if(consumed)throw new IllegalStateException("acquisition already consumed");consumed=true;if(!eligible||q!=0||v!=0||pitch!=SourceAcquisition.pitch(year))throw new IllegalStateException("retained exact-rest state required");}
 }
 /** fault: 0 nominal,1 no stop,2 elastic/no damping,3 excessive feed,4 missing retention,5 uncertain retention,6 underfeed. */
 public static Retained run(int year,double mass,int fault){
  double angle=pitch(year);if(!Double.isFinite(mass)||mass<=0||fault<0||fault>6)throw new IllegalArgumentException("scenario");
  double speed=fault==3?4:fault==6?.05:.6,distance=.02,drag=fault==2?0:.02,g=9.80665;
  double acceleration=g*Math.sin(angle)+drag/mass,available=speed*speed-2*acceleration*distance;
  double travel=available>0?distance:speed*speed/(2*acceleration),before=Math.sqrt(Math.max(0,available));
  double t=acceleration==0?distance/speed:(speed-before)/acceleration;
  boolean impact=fault!=1&&available>0;double after=impact?(fault==2?-before:0):before;
  double loss=impact?.5*mass*(before*before-after*after):0,input=.5*mass*speed*speed,potential=mass*g*Math.sin(angle)*travel,friction=drag*travel;
  boolean ok=impact&&fault!=2&&loss<=.2&&fault!=4&&fault!=5;
  return new Retained(year,fault,mass,angle,-distance+travel,after,t+(ok?.2:0),input,potential,friction,loss,.5*mass*after*after,impact?mass*(after-before):0,before,t,ok);
 }
}
