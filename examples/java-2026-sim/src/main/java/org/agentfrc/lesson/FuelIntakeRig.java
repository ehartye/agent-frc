package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.simulation.*;
/** Actual WPILib IO with independent raw counts and ideal vertical-ray sphere observations. */
public final class FuelIntakeRig implements AutoCloseable {
 public final FuelIntakeController controller;private final FuelIntakePlant plant;private final EncoderSim encoder;private final DIOSim nip,exit;private final PWMSim pwm;private FuelIntakePlant.Sample last;private final double radius,scale;
 public FuelIntakeRig(FuelIntakePlant.Config c,double encoderScale){if(encoderScale!=1&&encoderScale!=-1)throw new IllegalArgumentException("Declared scale fault only");plant=new FuelIntakePlant(c,-.06,.075,.15);radius=c.radius();scale=encoderScale;controller=new FuelIntakeController();encoder=EncoderSim.createForChannel(0);nip=new DIOSim(2);exit=new DIOSim(3);pwm=new PWMSim(0);last=plant.sample(0);inject();}
 private void inject(){encoder.setCount((int)Math.round(last.rollerAngle()/(2*Math.PI/2048)*scale));nip.setValue(Math.abs(last.x()-.072)>radius);exit.setValue(Math.abs(last.x()+.10)>radius);RoboRioSim.setVInVoltage(last.bus());}
 public FuelIntakePlant.Sample step(boolean enabled,boolean releaseRequested,int substeps){if(substeps!=200&&substeps!=400)throw new IllegalArgumentException("Refinement domain");controller.periodic(enabled,releaseRequested);for(int i=0;i<substeps;i++)last=plant.step(pwm.getSpeed(),.02/substeps);inject();return last;}
 @Override public void close(){controller.close();}
}
