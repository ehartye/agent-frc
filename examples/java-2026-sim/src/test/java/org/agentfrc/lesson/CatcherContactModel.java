package org.agentfrc.lesson;
/** Port of the checked Python discrete-gradient unilateral subsystem, in SI units. */
final class CatcherContactModel {
 static double potential(double p,double k,double cap){p=Math.max(0,p);return p<=cap/k?.5*k*p*p:cap*p-.5*cap*cap/k;}
 static double spring(double a,double b,double k,double cap){double lo=Math.min(a,b),hi=Math.max(a,b),t=cap/k;if(hi==lo)return Math.min(cap,k*Math.max(hi,0));double start=Math.max(lo,0),end=Math.max(hi,0);if(end<=start)return 0;double q0=Math.min(start,t),q1=Math.min(end,t);return (.5*k*(q1-q0)*(q1+q0)+cap*Math.max(0,end-Math.max(start,t)))/(hi-lo);}
 static double fraction(double a,double b){double lo=Math.min(a,b),hi=Math.max(a,b);return hi<=0?0:lo>=0?1:hi/(hi-lo);}
 static double clamp(double v,double lo,double hi){return Math.max(lo,Math.min(hi,v));}
 static double force(double a,double b,double v,boolean closed,boolean pinch){
  double fraction=fraction(a,b),front=clamp(spring(a,b,200,50)+20*v*fraction,0,50*fraction);
  fraction=closed?fraction(-a-.02,-b-.02):0;
  double rear=closed?clamp(spring(-a-.02,-b-.02,1000,50)-20*v*fraction,0,50*fraction):0;
  double lo=Math.min(a,b),hi=Math.max(a,b);fraction=hi>lo?Math.max(0,Math.min(hi,.07)-Math.max(lo,-.07))/(hi-lo):(Math.abs(lo)<.07?1:0);
  double hold=pinch?clamp(10*v,-2,2)*fraction:0;return rear-front-hold;
 }
 static double energy(double x,double v,boolean closed){return .25*v*v+potential(x,200,50)+(closed?potential(-x-.02,1000,50):0);}
 record Step(double x,double v,double loss){}
 static Step step(double x,double v,double dt,boolean closed,boolean pinch){
  double lo=v-200*dt,hi=v+200*dt;
  for(int i=0;i<55;i++){double vn=(lo+hi)/2,mid=(v+vn)/2,xn=x+dt*mid;double r=.5*(vn-v)-dt*force(x,xn,mid,closed,pinch);if(r>0)hi=vn;else lo=vn;}
  double vn=(lo+hi)/2,xn=x+dt*(v+vn)/2,loss=energy(x,v,closed)-energy(xn,vn,closed);
  if(loss< -1e-9)throw new IllegalStateException("Nonpassive catcher step");return new Step(xn,vn,loss);
 }
}
