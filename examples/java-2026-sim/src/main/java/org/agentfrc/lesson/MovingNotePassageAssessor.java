package org.agentfrc.lesson;
/** Independent model-local ordered passage evidence. Never used by the controller; not capture or scoring. */
public final class MovingNotePassageAssessor {
 private final NoteContactPlant.Config c;private double lastTime=Double.NaN,lastX,clearSince=Double.NaN;private boolean entry,center,reversed,recontact,verified;
 public MovingNotePassageAssessor(NoteContactPlant.Config c){this.c=c;}
 public void observe(double time,double x,double z,double relativeVx,double normal){if(!Double.isFinite(time)||time<0||(!Double.isNaN(lastTime)&&(time<=lastTime||time-lastTime>.0001000001))||!Double.isFinite(x)||Math.abs(x)>.4||!Double.isFinite(z)||z<.015||z>.06||!Double.isFinite(relativeVx)||!Double.isFinite(normal)||normal<0)throw new IllegalArgumentException("Finite increasing assessor observations required");if(entry&&!Double.isNaN(lastTime)&&x<lastX-1e-6)reversed=true;if(normal>0&&x<0)entry=true;if(entry&&x>=0)center=true;double q=Math.max(x-c.majorRadius(),Math.min(0,x+c.majorRadius())),gap=Math.hypot(q,z-c.rollerZ())-c.rollerRadius()-c.minorRadius();if(!Double.isNaN(clearSince)&&normal>0)recontact=true;boolean clear=entry&&center&&!reversed&&!recontact&&x>=c.majorRadius()+c.minorRadius()+.005&&gap>=.005&&relativeVx>.01;if(clear){if(Double.isNaN(clearSince))clearSince=time;if(time-clearSince>=.2)verified=true;}else{clearSince=Double.NaN;verified=false;}lastTime=time;lastX=x;}
 public boolean contacted(){return entry;}public boolean crossedCenter(){return center;}public boolean reversed(){return reversed;}public boolean recontact(){return recontact;}public boolean verified(){return verified;}
}


