package org.agentfrc.lesson;
import edu.wpi.first.math.Matrix;import edu.wpi.first.math.numbers.*;import edu.wpi.first.math.system.plant.DCMotor;import edu.wpi.first.wpilibj.simulation.DifferentialDrivetrainSim;
/** Open-armature cancellation in this exact physical motor-derived WPILib plant only. */
public final class NeutralDrivetrainSim extends DifferentialDrivetrainSim {
 private final double radius,kv;private boolean leftOpen,rightOpen;
 public NeutralDrivetrainSim(DCMotor motor,double gearing,double inertia,double mass,double radius,double track){super(motor,gearing,inertia,mass,radius,track,null);this.radius=radius;kv=motor.KvRadPerSecPerVolt;}
 public void setOpen(boolean left,boolean right){leftOpen=left;rightOpen=right;}
 @Override public void setCurrentGearing(double gearing){throw new UnsupportedOperationException("Immutable development gearing");}
 @Override protected Matrix<N7,N1> getDynamics(Matrix<N7,N1> x,Matrix<N2,N1> heldInput){
  var equivalentInput=heldInput.copy();
  // Stage-local algebraic cancellation, NOT a bus-supplied actuator voltage.
  if(leftOpen)equivalentInput.set(0,0,x.get(3,0)*getCurrentGearing()/radius/kv);
  if(rightOpen)equivalentInput.set(1,0,x.get(4,0)*getCurrentGearing()/radius/kv);
  return super.getDynamics(x,equivalentInput);
 }
 // Inherited current methods see held inputs rather than the open boundary. Fail instead of misleading telemetry.
 @Override public double getLeftCurrentDrawAmps(){throw new UnsupportedOperationException("Use explicit shared-supply branch currents");}
 @Override public double getRightCurrentDrawAmps(){throw new UnsupportedOperationException("Use explicit shared-supply branch currents");}
 @Override public double getCurrentDrawAmps(){throw new UnsupportedOperationException("Use explicit shared-supply branch currents");}
}
