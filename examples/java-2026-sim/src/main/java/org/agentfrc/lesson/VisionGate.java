package org.agentfrc.lesson;

/** Original synthetic timestamp policy. Values here are lesson fixtures, not camera tuning. */
public final class VisionGate {
  public record Observation(double capturedAtSeconds, double yawErrorDegrees, boolean hasTarget) {}
  public static boolean accepts(Observation sample, double nowSeconds) {
    if (sample == null || !sample.hasTarget() || !Double.isFinite(nowSeconds)
        || !Double.isFinite(sample.capturedAtSeconds()) || !Double.isFinite(sample.yawErrorDegrees())) return false;
    double age = nowSeconds - sample.capturedAtSeconds();
    return age >= 0 && age <= 0.15 && Math.abs(sample.yawErrorDegrees()) <= 2.0;
  }
  private VisionGate() {}
}
