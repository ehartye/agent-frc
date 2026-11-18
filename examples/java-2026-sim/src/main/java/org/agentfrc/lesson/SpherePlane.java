package org.agentfrc.lesson;
/** Rigid perfectly-inelastic sphere/plane experiment; uniform inertia and friction are assumptions. */
public final class SpherePlane {
 public static final double G=9.80665;
 public record State(double x,double z,double vx,double vz,double omega){}
 public record Result(State state,double normalImpulse,double tangentImpulse,double lossJ,boolean impact,boolean supported,String tangentialRegime){}
 private record Rest(double x,double vx,double omega,double impulse,double loss){}
 public final double mass,radius,mu,inertia;
 public SpherePlane(double mass,double radius,double mu){if(!finite(mass,.1,1)||!finite(radius,.01,.2)||!finite(mu,0,2))throw new IllegalArgumentException("Sphere hypothesis domain");this.mass=mass;this.radius=radius;this.mu=mu;inertia=.4*mass*radius*radius;}
 private static boolean finite(double x,double lo,double hi){return Double.isFinite(x)&&x>=lo&&x<=hi;}
 private void validate(State s){if(s==null||!finite(s.x,-20,20)||!finite(s.z,radius,radius+2)||!finite(s.vx,-20,20)||!finite(s.vz,-10,10)||!finite(s.omega,-1000,1000))throw new IllegalArgumentException("Sphere state domain; penetration unsupported");}
 public double energy(State s){return .5*mass*(s.vx*s.vx+s.vz*s.vz)+.5*inertia*s.omega*s.omega+mass*G*(s.z-radius);}
 private double inverseTangentMass(){return 1/mass+radius*radius/inertia;}
 private Rest rest(double x,double vx,double omega,double dt){double slip=vx-radius*omega;if(dt==0||mu==0||slip==0)return new Rest(x+vx*dt,vx,omega,0,0);double needed=-slip/inverseTangentMass(),force=mu*mass*G,stopTime=Math.abs(needed)/force,slidingTime=Math.min(dt,stopTime),p=stopTime<=dt?needed:-Math.copySign(force*dt,slip);double nextV=vx+p/mass,nextW=omega-radius*p/inertia;double nextX=x+.5*(vx+nextV)*slidingTime+nextV*(dt-slidingTime);double loss=-p*slip-.5*inverseTangentMass()*p*p;return new Rest(nextX,nextV,nextW,p,loss);}
 public Result step(State s,double dt){validate(s);if(!finite(dt,1e-6,.02))throw new IllegalArgumentException("Sphere timestep domain");double x=s.x,z=s.z,vx=s.vx,vz=s.vz,w=s.omega,pn=0,pt=0,loss=0;boolean impact=false;double remaining=dt;
  if(!(z==radius&&vz==0)){
   double end=z+vz*dt-.5*G*dt*dt;
   if(end>radius){x+=vx*dt;z=end;vz-=G*dt;remaining=0;}
   else {double gap=z-radius;double root=Math.sqrt(vz*vz+2*G*gap);double t=vz>0?(vz+root)/G:gap==0?0:2*gap/(root-vz);if(!finite(t,0,dt+1e-12))throw new IllegalStateException("Impact time outside step");t=Math.min(t,dt);x+=vx*t;vz-=G*t;z=radius;double beforeSlip=vx-radius*w;pn=-mass*vz;double wanted=-beforeSlip/inverseTangentMass();pt=Math.max(-mu*pn,Math.min(mu*pn,wanted));loss=.5*mass*vz*vz-pt*beforeSlip-.5*inverseTangentMass()*pt*pt;vx+=pt/mass;w-=radius*pt/inertia;vz=0;remaining=dt-t;impact=true;}
  }
  if(remaining>0){var r=rest(x,vx,w,remaining);x=r.x;vx=r.vx;w=r.omega;pt+=r.impulse;loss+=r.loss;pn+=mass*G*remaining;z=radius;vz=0;}
  State next=new State(x,z,vx,vz,w);validate(next);if(pn< -1e-12||loss< -1e-12||Math.abs(energy(s)-energy(next)-loss)>1e-9||Math.abs(mass*(next.vx-s.vx)-pt)>1e-10||Math.abs(inertia*(next.omega-s.omega)+radius*pt)>1e-10||Math.abs(mass*(next.vz-s.vz)+mass*G*dt-pn)>1e-10)throw new IllegalStateException("Sphere impulse/energy audit");boolean supported=z==radius&&vz==0;String regime=!supported?"flight":Math.abs(vx-radius*w)<1e-12?"rolling":"sliding";return new Result(next,pn,pt,loss,impact,supported,regime);
 }
}
