package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.*;
import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Desktop candidate code, never a deployable robot. No plant truth input. */
public final class CoupledDriveController implements AutoCloseable {
 public static final double METERS_PER_PULSE=2*Math.PI*.0762/2048;
 private final Encoder left,right;private final AnalogGyro gyro;private final PWMSparkMax l,r,aux;
 public CoupledDriveController(double leftScale){
  if(RobotBase.isReal())throw new IllegalStateException("Desktop only");
  if(!Double.isFinite(leftScale)||Math.abs(leftScale)!=1&&leftScale!=2)throw new IllegalArgumentException("Sensor fixture scale");
  left=new Encoder(0,1);right=new Encoder(2,3);left.setDistancePerPulse(METERS_PER_PULSE*leftScale);right.setDistancePerPulse(METERS_PER_PULSE);gyro=new AnalogGyro(0);l=new PWMSparkMax(0);r=new PWMSparkMax(1);aux=new PWMSparkMax(2);
 }
 public void periodic(boolean enabled,double leftTarget,double rightTarget,double auxDuty){
  if(!Double.isFinite(leftTarget)||!Double.isFinite(rightTarget)||leftTarget<0||rightTarget<0||leftTarget>3||rightTarget>3||!Double.isFinite(auxDuty)||auxDuty<0||auxDuty>1)throw new IllegalArgumentException("Command domain");
  double bus=RobotController.getBatteryVoltage();
  if(!enabled||bus<6||!Double.isFinite(gyro.getAngle())||!Double.isFinite(left.getRate())||!Double.isFinite(right.getRate())){l.set(0);r.set(0);aux.set(0);return;}
  // Fixed declared hypothesis feedforward, not measured drivetrain characterization.
  double headingCorrection=leftTarget==rightTarget?.01*Math.toRadians(gyro.getAngle()):0;
  l.set(Math.max(0,Math.min(1,(2.8*leftTarget+.2*(leftTarget-left.getRate())-headingCorrection)/bus)));
  r.set(Math.max(0,Math.min(1,(2.8*rightTarget+.2*(rightTarget-right.getRate())+headingCorrection)/bus)));
  aux.set(auxDuty);
 }
 public double leftDistanceMeters(){return left.getDistance();}
 public double leftRate(){return left.getRate();}public double rightRate(){return right.getRate();}public double headingDegrees(){return gyro.getAngle();}
 public void close(){l.set(0);r.set(0);aux.set(0);l.close();r.close();aux.close();left.close();right.close();gyro.close();}
}
