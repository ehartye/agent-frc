package org.agentfrc.lesson;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import edu.wpi.first.hal.HAL;
import edu.wpi.first.wpilibj.simulation.RoboRioSim;
import static org.agentfrc.lesson.SeasonMechanism.Gate.*;

class SeasonCaseTest {
 @BeforeAll static void setup(){assertTrue(HAL.initialize(500,0));RoboRioSim.setVInVoltage(12);}
 static double nominal(int season){try(var m=new SeasonMechanism(season)){
   assertTrue(m.acquire());double peak=0,first=-1;int feedTicks=0;
   for(int i=0;i<400;i++){var s=m.step(true,true,ACTIVE,true,12);peak=Math.max(peak,Math.abs(s.volts()));
     if(s.feeding()){if(first<0)first=i*0.02;if(++feedTicks==6)m.completeRelease();}
     assertFalse(s.fault());assertTrue(Math.abs(s.volts())<=12);
   }
   assertTrue(first>=0&&first<5,"No bounded readiness: "+season);assertEquals(0,m.snapshot().inventory());
   assertFalse(m.snapshot().feeding());assertEquals(0,m.snapshot().volts(),1e-9);
   System.out.println("CASE_RESULT season="+season+" firstFeedSeconds="+first+" peakVolts="+peak+" released=1 modelOnly=true");return first;
 }}
 @Test void autoDeadlineRespectsSeason(){for(int year=2024;year<=2026;year++)try(var m=new SeasonMechanism(year)){m.acquire();double deadline=year==2026?20:15;assertTrue(Math.abs(m.autonomousStep(deadline-0.02,UNKNOWN,true,12).volts())>0);var stopped=m.autonomousStep(deadline,ACTIVE,true,12);assertEquals(0,stopped.volts());assertFalse(stopped.feeding());}}
 @Test void crescendoNominal(){nominal(2024);}
 @Test void reefscapeNominal(){nominal(2025);}
 @Test void rebuiltNominal(){nominal(2026);}
 @Test void unknownGateNeverFeeds(){for(int year=2024;year<=2026;year++)try(var m=new SeasonMechanism(year)){m.acquire();for(int i=0;i<200;i++)assertFalse(m.step(true,true,UNKNOWN,true,12).feeding());}}
 @Test void gateLossStopsFeed(){try(var m=new SeasonMechanism(2026)){m.acquire();for(int i=0;i<200;i++){if(m.step(true,true,ACTIVE,true,12).feeding())break;}assertTrue(m.snapshot().feeding());assertFalse(m.step(true,true,INACTIVE,true,12).feeding());}}
 @Test void disabledStopsDemand(){for(int year=2024;year<=2026;year++)try(var m=new SeasonMechanism(year)){m.acquire();for(int i=0;i<100;i++)m.step(true,true,UNKNOWN,true,12);var s=m.step(false,true,ACTIVE,true,12);assertEquals(0,s.volts());assertFalse(s.feeding());}}
 @Test void onePocketRejectsSecondAcquire(){try(var m=new SeasonMechanism(2024)){assertTrue(m.acquire());assertFalse(m.acquire());assertEquals(1,m.snapshot().inventory());}}
 @Test void jamLatchesUntilExplicitDisabledReset(){try(var m=new SeasonMechanism(2026)){m.acquire();for(int i=0;i<400;i++)m.step(true,true,ACTIVE,true,12);assertTrue(m.snapshot().fault());assertEquals(0,m.snapshot().volts());assertThrows(IllegalStateException.class,()->m.resetFaultWhileDisabled(false));m.resetFaultWhileDisabled(true);assertFalse(m.snapshot().fault());}}
 @Test void badSensorStopsOutput(){try(var m=new SeasonMechanism(2025)){m.acquire();m.setSensorValid(false);var s=m.step(true,true,ACTIVE,true,12);assertTrue(s.fault());assertEquals(0,s.volts());assertFalse(s.feeding());}}
 @Test void reducedSupplyCannotReachShooterTarget(){try(var m=new SeasonMechanism(2024)){m.acquire();for(int i=0;i<200;i++){var s=m.step(true,true,ACTIVE,true,2);assertFalse(s.feeding());assertTrue(Math.abs(s.volts())<=2);}}}
 @Test void invalidInputsFailExplicitly(){assertThrows(IllegalArgumentException.class,()->new SeasonMechanism(2027));try(var m=new SeasonMechanism(2024)){assertThrows(IllegalArgumentException.class,()->m.step(true,true,ACTIVE,true,Double.NaN));}}
 @Test void misalignmentBlocksRelease(){for(int year=2024;year<=2026;year++)try(var m=new SeasonMechanism(year)){m.acquire();for(int i=0;i<200;i++)assertFalse(m.step(true,true,ACTIVE,false,12).feeding());}}
}
