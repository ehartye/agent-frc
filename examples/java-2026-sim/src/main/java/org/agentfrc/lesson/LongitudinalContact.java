package org.agentfrc.lesson;
/** Two effective side contacts on a level surface. Original bounded impulse model, not calibrated tire physics. */
public final class LongitudinalContact {
 public static final double G=9.80665;
 public record Result(double velocity,double leftOmega,double rightOmega,double leftImpulse,double rightImpulse,double leftSlip,double rightSlip,double lossJ,double projectionLossJ,double kktResidual){}
 public final double mass,radius,inertia,mu;
 public LongitudinalContact(double mass,double radius,double inertia,double mu){
  if(!Double.isFinite(mass)||mass<1||mass>100||!Double.isFinite(radius)||radius<.01||radius>.2||!Double.isFinite(inertia)||inertia<.001||inertia>1||!Double.isFinite(mu)||mu<0||mu>2)throw new IllegalArgumentException("Contact hypothesis computational domain");this.mass=mass;this.radius=radius;this.inertia=inertia;this.mu=mu;
 }
 public double kinetic(double v,double wl,double wr){return .5*mass*v*v+.5*inertia*(wl*wl+wr*wr);}
 public Result resolve(double v,double wl,double wr,double dt){
  if(!Double.isFinite(v)||Math.abs(v)>20||!Double.isFinite(wl)||Math.abs(wl)>2000||!Double.isFinite(wr)||Math.abs(wr)>2000||!Double.isFinite(dt)||dt<1e-5||dt>.001)throw new IllegalArgumentException("Contact state/time domain");
  double a=radius*radius/inertia+1/mass,b=1/mass,cap=mu*mass*G*.5*dt,s0=radius*wl-v,s1=radius*wr-v;
  double best=Double.POSITIVE_INFINITY,p0=0,p1=0;
  for(int t0=-1;t0<=1;t0++)for(int t1=-1;t1<=1;t1++){
   double q0=t0*cap,q1=t1*cap;
   if(t0==0&&t1==0){double det=a*a-b*b;q0=(a*s0-b*s1)/det;q1=(a*s1-b*s0)/det;}
   else if(t0==0)q0=(s0-b*q1)/a;else if(t1==0)q1=(s1-b*q0)/a;
   if(Math.abs(q0)>cap+1e-12||Math.abs(q1)>cap+1e-12)continue;q0=Math.max(-cap,Math.min(cap,q0));q1=Math.max(-cap,Math.min(cap,q1));
   double value=.5*(a*q0*q0+2*b*q0*q1+a*q1*q1)-s0*q0-s1*q1;if(value<best){best=value;p0=q0;p1=q1;}
  }
  if(!Double.isFinite(best))throw new IllegalStateException("No feasible contact impulse");
  double nv=v+(p0+p1)/mass,nl=wl-radius*p0/inertia,nr=wr-radius*p1/inertia;
  double slip0=radius*nl-nv,slip1=radius*nr-nv,projection=.5*(a*p0*p0+2*b*p0*p1+a*p1*p1),loss=p0*s0+p1*s1-projection;
  double residual=Math.max(kkt(p0,cap,-slip0),kkt(p1,cap,-slip1));
  if(residual>1e-8||loss < -1e-9||p0*slip0+p1*slip1 < -1e-9||Math.abs((kinetic(v,wl,wr)-kinetic(nv,nl,nr))-loss)>1e-7)throw new IllegalStateException("Contact feasibility/dissipation audit");
  return new Result(nv,nl,nr,p0,p1,slip0,slip1,loss,projection,residual);
 }
 private static double kkt(double p,double cap,double gradient){if(cap==0)return 0;if(Math.abs(p+cap)<1e-10)return Math.max(0,-gradient);if(Math.abs(p-cap)<1e-10)return Math.max(0,gradient);return Math.abs(gradient);}
}
