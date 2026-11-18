package org.agentfrc.lesson;
import edu.wpi.first.wpilibj.simulation.*;
/** Fixed flat torus/Y0 experiment. Raw encoder and ideal annular-ray observations are independent from controller scaling. */
public final class NoteContactRig implements AutoCloseable {
 public final NoteAdvanceController controller;private final NoteContactPlant plant;private final NoteContactPlant.Config config;private final EncoderSim encoder;private final DIOSim beam;private final PWMSim pwm;private final double scale;private final int beamFault;private NoteContactPlant.Sample last;
 public NoteContactRig(NoteContactPlant.Config c,double scale){this(c,scale,0);}public NoteContactRig(NoteContactPlant.Config c,double scale,int beamFault){if((scale!=1&&scale!=-1)||beamFault<0||beamFault>2)throw new IllegalArgumentException("Fault domain");this.scale=scale;this.beamFault=beamFault;config=c;plant=new NoteContactPlant(c,-.220,c.minorRadius(),.15);controller=new NoteAdvanceController();encoder=EncoderSim.createForChannel(0);beam=new DIOSim(2);pwm=new PWMSim(0);last=plant.sample(0);inject();}
 private void inject(){encoder.setCount((int)Math.round(last.angle()/(2*Math.PI/2048)*scale));beam.setValue(beamFault==1?false:beamFault==2?true:!NoteContactPlant.beamBlocked(config,last.x(),0));RoboRioSim.setVInVoltage(last.bus());}
 public NoteContactPlant.Sample step(boolean enabled,int substeps){if(substeps!=200&&substeps!=400)throw new IllegalArgumentException("Refinement domain");controller.periodic(enabled);for(int i=0;i<substeps;i++)last=plant.step(pwm.getSpeed(),.02/substeps);inject();return last;}
 public double maxEvaluatedRollerNormal(){return plant.maxEvaluatedRollerNormal();} @Override public void close(){controller.close();}
}

