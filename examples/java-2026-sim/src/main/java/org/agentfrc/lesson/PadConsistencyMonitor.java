package org.agentfrc.lesson;
/** Hypothetical independent readback consistency checks, NOT sensor independence proof. */
public final class PadConsistencyMonitor {
 public record Sample(long sequence,double stamp,double leftTravel,double rightTravel,
   double leftForce,double rightForce,boolean leftBit,boolean rightBit,boolean loadBit) {}
 private long lastSequence=-1; private double lastNow=Double.NEGATIVE_INFINITY;
 private boolean baselineSeen,fault;
 private boolean reject(){fault=true;return false;}
 public boolean update(double now,Sample s){
  if(fault)return false;
  if(s==null||!Double.isFinite(now)||now<=lastNow)return reject();lastNow=now;
  for(double v:new double[]{s.stamp,s.leftTravel,s.rightTravel,s.leftForce,s.rightForce})if(!Double.isFinite(v))return reject();
  if(s.sequence<=lastSequence||s.sequence<0||s.stamp>now||now-s.stamp>.020000001)return reject();lastSequence=s.sequence;
  if(s.leftTravel<0||s.leftTravel>12.2||s.rightTravel<0||s.rightTravel>12.2||s.leftForce<0||s.leftForce>10||s.rightForce<0||s.rightForce>10)return reject();
  // Only assert contradiction outside the assumed 0.2 mm / 0.2 N ambiguity band.
  if((s.leftBit&&(s.leftTravel<9.8||s.leftForce<.2))||(s.rightBit&&(s.rightTravel<9.8||s.rightForce<.2)))return reject();
  if((!s.leftBit&&s.leftTravel>10.2&&s.leftForce>.2)||(!s.rightBit&&s.rightTravel>10.2&&s.rightForce>.2))return reject();
  if(s.loadBit&&(s.leftForce<.8||s.leftForce>3.2||s.rightForce<.8||s.rightForce>3.2))return reject();
  if(!baselineSeen){
   if(s.leftBit||s.rightBit||s.loadBit||s.leftTravel>.2||s.rightTravel>.2||s.leftForce>.2||s.rightForce>.2)return reject();
   baselineSeen=true;
  }
  return true;
 }
 public boolean baselineSeen(){return baselineSeen;}
}
