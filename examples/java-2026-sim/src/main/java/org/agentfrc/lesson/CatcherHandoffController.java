package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;
import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Offline normalized actuator-command protocol, NOT motor wiring or deployable catcher firmware. */
public final class CatcherHandoffController implements AutoCloseable {
 public enum State { WAIT_ARRIVAL,CLOSING,HOLD,OPENING,RELEASED,FAULT }
 private final DigitalInput arrival,tail,gateClosed,unloaded;
 private final PWMSparkMax gate,pinch;
 private final int needed;private boolean initialized,previousTail,everCommanded;private int pulses;private double time,stateTime,releaseWait;private State state=State.WAIT_ARRIVAL;
 public CatcherHandoffController(int needed){if(RobotBase.isReal())throw new IllegalStateException("Offline only");if(needed!=1&&needed!=2)throw new IllegalArgumentException();this.needed=needed;arrival=new DigitalInput(7);tail=new DigitalInput(8);gateClosed=new DigitalInput(9);unloaded=new DigitalInput(10);gate=new PWMSparkMax(2);pinch=new PWMSparkMax(3);}
 public void periodic(boolean enabled,boolean releaseRequested){
  boolean a=!arrival.get(),t=!tail.get();time+=.02;stateTime+=.02;
  if(!initialized){initialized=true;previousTail=t;if(a||t)state=State.FAULT;}else if(t&&!previousTail)pulses++;previousTail=t;
  boolean clear=!t&&pulses==needed;
  if(!enabled)state=State.FAULT;
  switch(state){
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
