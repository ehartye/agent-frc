package org.agentfrc.lesson;
/** Virtual independently-ticked command lease. Zero output is NOT a physical safe state. */
public final class VirtualCommandLease {
 public record Output(boolean gate,boolean pinch,boolean expired) {}
 private double received=Double.NEGATIVE_INFINITY,lastTick=Double.NEGATIVE_INFINITY;
 private long sequence=-1;private boolean gate,pinch,fault;
 public void receive(double now,long seq,boolean healthy,boolean requestedGate,boolean requestedPinch){
  if(fault)return;
  if(!Double.isFinite(now)||now<received||seq<=sequence||seq<0||!healthy){fault=true;return;}
  received=now;sequence=seq;gate=requestedGate;pinch=requestedPinch;
 }
 public Output tick(double now){
  if(!Double.isFinite(now)||now<lastTick){fault=true;return new Output(false,false,true);}lastTick=now;
  boolean expired=fault||now<received||now-received>=.04-1e-12;
  if(expired&&Double.isFinite(received))fault=true;
  return expired?new Output(false,false,true):new Output(gate,pinch,false);
 }
}
