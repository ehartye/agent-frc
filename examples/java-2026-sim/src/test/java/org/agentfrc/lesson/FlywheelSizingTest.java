package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import edu.wpi.first.hal.HAL;

class FlywheelSizingTest {
 @BeforeAll static void initializeHal(){assertTrue(HAL.initialize(500,0));}
 @Test void largerAssumedWheelAcceleratesSlowerButHasSameUnloadedSteadySpeed(){
   var nominal=FlywheelSizingLab.simulate(0.6,30);
   var larger=FlywheelSizingLab.simulate(0.6,60);
   assertEquals(0.00027,nominal.inertiaKgM2(),1e-12);
   assertEquals(4*nominal.inertiaKgM2(),larger.inertiaKgM2(),1e-12);
   assertTrue(larger.rpmAt20ms()<nominal.rpmAt20ms());
   assertTrue(larger.rpmAt20ms()>0);
   assertEquals(nominal.rpmAt4s(),larger.rpmAt4s(),0.1);
   assertTrue(nominal.rpmAt4s()>nominal.rpmAt20ms());
   System.out.println("INERTIA_SENSITIVITY nominal="+nominal+" larger="+larger+" synthetic=true vendorAdapter=false");
 }
 @Test void invalidPhysicalAssumptionsFailExplicitly(){
   for(double value:new double[]{0,-1,Double.NaN,Double.POSITIVE_INFINITY}){
     assertThrows(IllegalArgumentException.class,()->FlywheelSizingLab.simulate(value,30));
     assertThrows(IllegalArgumentException.class,()->FlywheelSizingLab.simulate(0.6,value));
   }
 }
}
