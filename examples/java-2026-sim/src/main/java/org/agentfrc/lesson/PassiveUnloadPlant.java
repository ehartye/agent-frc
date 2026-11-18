package org.agentfrc.lesson;
import edu.wpi.first.math.system.plant.DCMotor;
/** Separately versioned ideal neutral-mode hypothesis; not REV firmware or hardware behavior. */
public final class PassiveUnloadPlant {
 public enum NeutralMode {BRAKE,OPEN}
 private NeutralMode mode=NeutralMode.BRAKE;
 public record Config(double mass,double radius,double rollerRadius,double rollerInertia,double rollerZ,double wallX,double gear,double rollerMu) {
  public Config {if(!finite(mass,.20,.23)||!finite(radius,.074,.076)||!finite(rollerRadius,.03,.05)||!finite(rollerInertia,.0001,.01)||!finite(rollerZ,.18,.20)||!finite(wallX,.085,.1)||!finite(gear,1,20)||!finite(rollerMu,0,1.5))throw new IllegalArgumentException("Fixture domain");}
 }
 public record Contact(double normal,double tangent,double sphereTorque,double rollerTorque,double potential,double normalLoss,double frictionLoss,double overlap,double fx,double fz){}
 public record Sample(double x,double z,double vx,double vz,double sphereOmega,double rollerOmega,double rollerAngle,double bus,double current,double mechanicalResidual,double maxOverlap,double normalLoss,double frictionLoss,double rollerNormal,double backEmfVolts,double armatureAmps,double electromagneticTorque,NeutralMode appliedMode){}
 private final Config c; private final DCMotor motor=DCMotor.getNEO(1); private final double sphereI; private double[] q=new double[10]; private final double initialEnergy;
 public PassiveUnloadPlant(Config c,double x,double z,double vx){this.c=c;sphereI=.4*c.mass*c.radius*c.radius;q[0]=x;q[1]=z;q[2]=vx;validate(q);initialEnergy=energy(q);}
 public static boolean finite(double x,double lo,double hi){return Double.isFinite(x)&&x>=lo&&x<=hi;}
 /** n points from fixture into sphere; angular signs are right-hand +Y. */
 public static Contact law(double delta,double nx,double nz,double vx,double vz,double ws,double wr,double r,double R,double k,double d,double mu){
  if(!Double.isFinite(nx)||!Double.isFinite(nz)||!finite(vx,-20,20)||!finite(vz,-20,20)||!finite(ws,-1000,1000)||!finite(wr,-1000,1000)||!finite(r,.001,.2)||!finite(R,0,.2)||!finite(delta,-1,.02)||!finite(k,1,100000)||!finite(d,0,100)||!finite(mu,0,1.5)||Math.abs(nx*nx+nz*nz-1)>1e-9)throw new IllegalArgumentException("Contact domain");
  if(delta<=0)return new Contact(0,0,0,0,0,0,0,0,0,0);
  double dd=-(nx*vx+nz*vz), elastic=k*delta, factor=1+d*dd, fn=elastic*Math.max(0,factor);
  double slip=vx*nz-vz*nx-r*ws-R*wr, ft=-mu*fn*Math.tanh(slip/.01);
  double nd=factor>=0?k*d*delta*dd*dd:-elastic*dd;
  return new Contact(fn,ft,-r*ft,-R*ft,.5*k*delta*delta,nd,-ft*slip,delta,fn*nx+ft*nz,fn*nz-ft*nx);
 }
 private Contact[] contacts(double[] a){double dx=a[0],dz=a[1]-c.rollerZ,dist=Math.hypot(dx,dz);if(dist<.01)throw new IllegalArgumentException("Degenerate roller contact");return new Contact[]{law(c.radius-a[1],0,1,a[2],a[3],a[4],0,c.radius,0,50000,5,.4),law(a[0]+c.radius-c.wallX,-1,0,a[2],a[3],a[4],0,c.radius,0,50000,5,.2),law(c.radius+c.rollerRadius-dist,dx/dist,dz/dist,a[2],a[3],a[4],a[5],c.radius,c.rollerRadius,5000,5,c.rollerMu)};}
 private double energy(double[] a){double e=.5*c.mass*(a[2]*a[2]+a[3]*a[3])+.5*sphereI*a[4]*a[4]+.5*c.rollerInertia*a[5]*a[5]+c.mass*9.80665*a[1];for(var p:contacts(a))e+=p.potential;return e;}
 private SharedSupply.Result supply(double[] a,double duty){try{return SharedSupply.solve(12,.02,new double[]{duty},new double[]{a[5]*c.gear/motor.KvRadPerSecPerVolt},new double[]{motor.rOhms},new boolean[]{mode==NeutralMode.BRAKE});}catch(IllegalArgumentException e){throw new IllegalArgumentException(e.getMessage()+" at x="+a[0]+" vx="+a[2]+" ws="+a[4]+" wr="+a[5]+" duty="+duty,e);}}
 private double[] derivative(double[] a,double duty){var s=supply(a,duty);double torque=c.gear*motor.KtNMPerAmp*s.armatureAmps()[0];double[] b={a[2],a[3],0,-9.80665,0,torque/c.rollerInertia,a[5],torque*a[5],0,0};for(var p:contacts(a)){b[2]+=p.fx/c.mass;b[3]+=p.fz/c.mass;b[4]+=p.sphereTorque/sphereI;b[5]+=p.rollerTorque/c.rollerInertia;b[8]+=p.normalLoss;b[9]+=p.frictionLoss;}return b;}
 private static double[] stage(double[] a,double[] d,double dt){double[] b=a.clone();for(int i=0;i<b.length;i++)b[i]+=d[i]*dt;return b;}
 private void validate(double[] a){for(double v:a)if(!Double.isFinite(v))throw new IllegalArgumentException("Nonfinite state");if(!finite(a[0],-.30,.03)||!finite(a[1],.05,.20)||Math.abs(a[2])>5||Math.abs(a[3])>5||Math.abs(a[4])>200||Math.abs(a[5])>200)throw new IllegalArgumentException("Face-only fixture bounds");for(var p:contacts(a))if(p.overlap>.008)throw new IllegalArgumentException("Excessive compliant overlap");}
 public void setMode(NeutralMode requested,double duty){if(requested==null||requested==NeutralMode.OPEN&&duty!=0)throw new IllegalArgumentException("Open mode requires zero duty");mode=requested;}
 public Sample step(double duty,double dt,NeutralMode applied){setMode(applied,duty);if(!finite(duty,-.2,.2)||!finite(dt,.00001,.0002))throw new IllegalArgumentException("Integration domain");var a=derivative(q,duty);var b=derivative(stage(q,a,dt/2),duty);var d=derivative(stage(q,b,dt/2),duty);var e=derivative(stage(q,d,dt),duty);for(int i=0;i<q.length;i++)q[i]+=dt*(a[i]+2*b[i]+2*d[i]+e[i])/6;validate(q);return sample(duty);}
 public Sample sample(double duty){var s=supply(q,duty);double overlap=0;for(var p:contacts(q))overlap=Math.max(overlap,p.overlap);return new Sample(q[0],q[1],q[2],q[3],q[4],q[5],q[6],s.volts(),s.batteryAmps(),energy(q)+q[8]+q[9]-q[7]-initialEnergy,overlap,q[8],q[9],contacts(q)[2].normal,q[5]*c.gear/motor.KvRadPerSecPerVolt,s.armatureAmps()[0],c.gear*motor.KtNMPerAmp*s.armatureAmps()[0],mode);}
}
