package org.agentfrc.lesson;
/** Opt-in HAL protocol adapter. Not a physical safety system. A supervisor denial
 * faults the legacy protocol, whose existing fault output may RETAIN closure.
 * This denies HOLD/release acceptance; it does not promise zero-force stopping. */
public final class SupervisedCatcherAdapter implements AutoCloseable {
 private final CatcherHandoffController controller; private final int year;
 private final BoundedCatcherSupervisor supervisor=new BoundedCatcherSupervisor();
 private BoundedCatcherSupervisor.Verdict verdict;
 public SupervisedCatcherAdapter(int year){if(year<2024||year>2026)throw new IllegalArgumentException("season required");this.year=year;controller=new CatcherHandoffController(year==2024?2:1);}
 public void periodic(boolean enabled,boolean release,double now,BoundedCatcherSupervisor.Pose pose,BoundedCatcherSupervisor.Pads pads){
  var state=controller.state();
  boolean padsRequired=state==CatcherHandoffController.State.CLOSING||state==CatcherHandoffController.State.HOLD;
  verdict=supervisor.assess(now,pose!=null&&pose.year()==year?pose:null,pads,padsRequired);
  controller.periodic(enabled&&verdict.permitted(),release);
 }
 public CatcherHandoffController.State state(){return controller.state();}
 public BoundedCatcherSupervisor.Verdict verdict(){return verdict;}
 @Override public void close(){controller.close();}
}

