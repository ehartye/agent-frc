package org.agentfrc.lesson;
import edu.wpi.first.math.MathUtil;
import edu.wpi.first.math.controller.PIDController;
import edu.wpi.first.wpilibj.Encoder;
import edu.wpi.first.wpilibj.RobotBase;
import edu.wpi.first.wpilibj.RobotController;
import edu.wpi.first.wpilibj.motorcontrol.PWMSparkMax;
/** Desktop-only candidate prototype. No plant truth is visible to this control class. */
public final class CandidateIoController implements AutoCloseable {
 public static final double RAD_PER_PULSE=2*Math.PI/2048;
 private final Encoder encoder;
 private final PWMSparkMax motor;
 private final PIDController pid=new PIDController(0.025,0,0,0.02);
 public CandidateIoController(double encoderScale){
  if(RobotBase.isReal())throw new IllegalStateException("Desktop prototype cannot operate hardware");
  if(!Double.isFinite(encoderScale)||encoderScale<=0)throw new IllegalArgumentException("Encoder scale");
  encoder=new Encoder(0,1);encoder.setDistancePerPulse(RAD_PER_PULSE*encoderScale);motor=new PWMSparkMax(0);motor.setSafetyEnabled(false);
 }
 public void periodic(boolean enabled,double targetRadPerSec){
  if(!Double.isFinite(targetRadPerSec)||targetRadPerSec<0||targetRadPerSec>500)throw new IllegalArgumentException("Target");
  double bus=RobotController.getBatteryVoltage();
  if(!enabled||bus<6){motor.set(0);pid.reset();return;}
  double volts=MathUtil.clamp(targetRadPerSec/50+pid.calculate(encoder.getRate(),targetRadPerSec),0,bus);
  motor.set(volts/bus);
 }
 public double measuredRate(){return encoder.getRate();}
 @Override public void close(){motor.set(0);motor.close();encoder.close();pid.close();}
}
