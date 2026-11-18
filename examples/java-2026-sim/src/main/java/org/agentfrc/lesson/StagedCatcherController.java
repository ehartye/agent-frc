package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;
import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Offline staged protocol. Arming establishes beam history only; it never grants
 * closure permission. Virtual bounded pose and independent pads gate acceptance. */
public final class StagedCatcherController implements AutoCloseable {
 public enum State { DISARMED,WAIT_ARRIVAL,CLOSING,HOLD,OPENING,RELEASED,FAULT }
 private final DigitalInput arrival,tail,gateClosed,unloaded;
 private final PWMSparkMax gate,pinch;
 private final int needed,year; private final BoundedCatcherSupervisor supervisor=new BoundedCatcherSupervisor(); private double lastNow=Double.NEGATIVE_INFINITY;private boolean initialized,previousTail,everCommanded;private int pulses;private double time,stateTime,releaseWait;private State state=State.DISARMED;
 public StagedCatcherController(int year){if(RobotBase.isReal())throw new IllegalStateException("Offline only");if(year<2024||year>2026)throw new IllegalArgumentException();this.year=year;this.needed=year==2024?2:1;arrival=new DigitalInput(7);tail=new DigitalInput(8);gateClosed=new DigitalInput(9);unloaded=new DigitalInput(10);gate=new PWMSparkMax(2);pinch=new PWMSparkMax(3);}
 public void periodic(boolean enabled,boolean armRequested,boolean releaseRequested,double now,BoundedCatcherSupervisor.Pose pose,BoundedCatcherSupervisor.Pads pads){
  boolean a=!arrival.get(),t=!tail.get();time+=.02;stateTime+=.02;
  if(!initialized){initialized=true;previousTail=t;if(a||t)state=State.FAULT;}else if(t&&!previousTail)pulses++;previousTail=t;
  boolean clear=!t&&pulses==needed;
  if(!enabled||!Double.isFinite(now)||now<=lastNow||(Double.isFinite(lastNow)&&now-lastNow>.020000001))state=State.FAULT;lastNow=now;
  boolean needsPose=state==State.CLOSING||state==State.HOLD||(state==State.WAIT_ARRIVAL&&a);
  if(needsPose){boolean padsRequired=state==State.CLOSING||state==State.HOLD;
   if(!supervisor.assess(now,pose!=null&&pose.year()==year?pose:null,pads,padsRequired).permitted())state=State.FAULT;
  }
  switch(state){
   case DISARMED -> {if(a||t||pulses!=0||time>=5)state=State.FAULT;else if(armRequested){state=State.WAIT_ARRIVAL;stateTime=0;}}
   case WAIT_ARRIVAL -> {if(a){if(clear){state=State.CLOSING;stateTime=0;everCommanded=true;}else state=State.FAULT;}else if(time>=5)state=State.FAULT;}
   case CLOSING -> {if(!clear)state=State.FAULT;else if(gateClosed.get()){state=State.HOLD;stateTime=0;}else if(stateTime>=.25)state=State.FAULT;}
   case HOLD -> {if(!gateClosed.get())state=State.FAULT;else if(releaseRequested){if(unloaded.get()){state=State.OPENING;stateTime=0;}else if((releaseWait+=.02)>=.5)state=State.FAULT;}}
   case OPENING -> {if(!gateClosed.get()){state=State.RELEASED;stateTime=0;}else if(stateTime>=.25)state=State.FAULT;}
   default -> {}
  }
  boolean retain=state==State.CLOSING||state==State.HOLD||(state==State.FAULT&&everCommanded);
  gate.set(retain?1:0);pinch.set(retain?1:0);
 }
 public State state(){return state;}public int tailPulses(){return pulses;}
 @Override public void close(){gate.set(0);pinch.set(0);gate.close();pinch.close();arrival.close();tail.close();gateClosed.close();unloaded.close();}
}
