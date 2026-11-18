package org.agentfrc.lesson;

/** Simulation-only observation boundary. Every bound and validity bit is supplied by a
 * hypothetical source, not inferred from beam breaks, PWM, pose, or native tangency. */
public final class BoundedCatcherSupervisor {
 public record Pose(int year,double stamp,double q,double lateral,double yaw,double pitch,
   double xError,double yError,double angleError,double angularRate,double lateralSpeed,
   double vLower,double acceleration) {}
 public record Pads(double stamp,boolean leftContact,boolean rightContact,
   boolean independentLoadValid) {}
 public record Verdict(boolean permitted,String reason,double rearMm,double sideMm) {}
 private double lastNow=Double.NEGATIVE_INFINITY,lastPose=Double.NEGATIVE_INFINITY,lastPads=Double.NEGATIVE_INFINITY;
 private boolean fault; private int season;
 // Protocol study limits, not sensor specifications. Age is included in the motion horizon.
 public static final double MAX_AGE=.02, HORIZON=.02;
 private static boolean finite(double... xs){for(double x:xs)if(!Double.isFinite(x))return false;return true;}
 private Verdict deny(String why){fault=true;return new Verdict(false,why,Double.NaN,Double.NaN);}
 public Verdict assess(double now,Pose p,Pads pads,boolean requirePads){
  if(fault)return deny("latched fault");
  if(!finite(now)||now<=lastNow)return deny("invalid or reversed clock");lastNow=now;
  if(p==null)return deny("missing pose");
  if(!finite(p.stamp,p.q,p.lateral,p.yaw,p.pitch,p.xError,p.yError,p.angleError,p.angularRate,p.lateralSpeed,p.vLower,p.acceleration))return deny("nonfinite pose");
  if(season!=0&&p.year!=season)return deny("season changed");season=p.year;
  double age=now-p.stamp;
  if(age<0||age>MAX_AGE+1e-12||p.stamp<lastPose)return deny("stale future or reversed pose");lastPose=p.stamp;
  if(p.year<2024||p.year>2026||Math.abs(p.q)>200||Math.abs(p.lateral)>100||Math.abs(p.yaw)>45||Math.abs(p.pitch)>45||p.xError<0||p.yError<0||p.angleError<0||p.angleError>20||p.angularRate<0||p.angularRate>360||p.lateralSpeed<0||Math.abs(p.vLower)>3000||p.acceleration<0||p.acceleration>200000)return deny("outside study bounds");
  double t=age+HORIZON,nomX=p.year==2024?177.8:p.year==2025?150.8125:75,nomY=p.year==2024?177.8:p.year==2025?57.15:75;
  double yaw=Math.toRadians(p.yaw),pitch=Math.toRadians(p.pitch),sx,sy,r;
  if(p.year==2026){sx=75;sy=75;r=75;}
  else if(p.year==2025){double ax=Math.cos(pitch)*Math.cos(yaw),ay=Math.cos(pitch)*Math.sin(yaw);sx=150.8125*Math.abs(ax)+57.15*Math.sqrt(Math.max(0,1-ax*ax));sy=150.8125*Math.abs(ay)+57.15*Math.sqrt(Math.max(0,1-ay*ay));r=Math.hypot(150.8125,57.15);}
  else {double nx=Math.sin(pitch)*Math.cos(yaw),ny=Math.sin(pitch)*Math.sin(yaw);sx=152.4*Math.sqrt(Math.max(0,1-nx*nx))+25.4;sy=152.4*Math.sqrt(Math.max(0,1-ny*ny))+25.4;r=177.8;}
  double inflation=p.year==2026?0:r*Math.toRadians(p.angleError+p.angularRate*t);
  double rear=20+p.q-p.xError-(sx+inflation-nomX)+Math.min(0,p.vLower*t-.5*p.acceleration*t*t);
  double side=nomY+10-(Math.abs(p.lateral)+p.yError+sy+inflation+p.lateralSpeed*t);
  if(!finite(rear,side)||rear<2||side<2)return deny("clearance bound failed");
  if(requirePads){
   if(pads==null||!finite(pads.stamp)||now-pads.stamp<0||now-pads.stamp>MAX_AGE+1e-12||pads.stamp<lastPads)return deny("missing stale future or reversed pad evidence");
   lastPads=pads.stamp;
   if(!pads.leftContact||!pads.rightContact||!pads.independentLoadValid)return deny("independent bilateral contact and load validity required");
  }
  return new Verdict(true,"conditional virtual permission only",rear,side);
 }
}
