package org.agentfrc.lesson;
import edu.wpi.first.math.system.plant.DCMotor;import edu.wpi.first.math.util.Units;
/** Complete conflicting source profiles, never blended or represented as calibrated hardware. */
public enum NeoEvidenceProfile {
 WPILIB_2026_2_1_PRODUCT_SPEC,
 REV_RELATIVE_DYNO_UNCALIBRATED;
 public DCMotor motor(int count){if(count<1||count>4)throw new IllegalArgumentException("Motor count");return this==WPILIB_2026_2_1_PRODUCT_SPEC?DCMotor.getNEO(count):new DCMotor(12,3,160,2.065,Units.rotationsPerMinuteToRadiansPerSecond(5820),count);}
}
