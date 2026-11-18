import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=(url,locator)=>({url,locator,reviewed:'2026-11-16',revision:'rolling-page',verification:'web-text-only',bodySha256:null,nativeCadInspected:false});
export function buildProfiledCandidates() {
  const sources={
    wheels:source('https://www.revrobotics.com/ION-Compliant-Wheels/','exact SKU options and family specifications'),
    hubs:source('https://www.revrobotics.com/MAXHubs/','REV-21-2037-PK2 aluminum half-inch hex MAXHub'),
    hubUse:source('https://docs.revrobotics.com/ion-build/motion/maxhubs','shaft-to-MAXSpline torque-transfer description'),
    shafts:source('https://www.revrobotics.com/.5in-Rounded-Hex-Shafts/','REV-21-1135 36-inch untapped stock; 12.7 mm flats; 13.75 mm corner circle'),
    bearings:source('https://www.revrobotics.com/ION-Bearings/','REV-21-1916-PK4 rounded-hex shaft support'),
    collars:source('https://www.revrobotics.com/Shaft-Collars-0.5in-Hex-Bore/','REV-21-2900-PK4 narrow aluminum hex collar'),
    retainer:source('https://www.revrobotics.com/rev-21-2286/','REV-21-2286-PK10 bearing retaining plate'),
    materialConflict:{url:'https://www.revrobotics.com/content/docs/2in-Compliant-Wheel-Hex-Bore-DR.pdf',locator:'REV-21-2030 row and material block',reviewed:'2026-11-16',revision:'drawing 2021-02-12; prior bounded review only',verification:'existing-project-research-not-reopened-in-this-pass',bodySha256:null,nativeCadInspected:false}
  };
  const specs=[
    {season:2024,path:'note-fixture-nominal.json',sku:'REV-21-2457',diameterMm:101.6,widthMm:25.4,count:8,pitchMm:50,shaftLengthMm:500,bearingHalfSpanMm:220},
    {season:2025,path:'coral-fixture-nominal.json',sku:'REV-21-2030-PK4',diameterMm:50.8,widthMm:12.7,count:8,pitchMm:19.05,shaftLengthMm:250,bearingHalfSpanMm:100},
    {season:2026,path:'intake-fixture-nominal.json',sku:'REV-21-2456',diameterMm:76.2,widthMm:25.4,count:6,pitchMm:30,shaftLengthMm:300,bearingHalfSpanMm:125}
  ];
  return {schema:'frc-profiled-wheel-bank-proposal/v1',sources,candidates:specs.map(s=>{
    const path='case-studies/'+s.season+'/'+s.path,bytes=readFileSync(resolve(root,path)),base=JSON.parse(bytes.toString('utf8'));
    return {id:s.season+'-segmented-profiled-bank-r1',season:s.season,revision:1,
      status:'original-layout-proposal-not-selected-hardware',baseline:{path,sha256:createHash('sha256').update(bytes).digest('hex'),changed:false},
      wheel:{sku:s.sku,unitQuantity:s.count,quantityBasis:'individual-wheels-not-retail-packs',nominalDiameterMm:s.diameterMm,nominalWidthMm:s.widthMm,sourceRef:'wheels',forceLaw:null},
      hub:s.season===2025?{sku:null,reason:'wheel has its own half-inch hex bore; no MAXHub assumed'}:
        {sku:'REV-21-2037-PK2',sourceRefs:['hubs','hubUse'],quantity:null,quantityReason:'required insertion orientation, engagement and fastening per wheel remain unresolved'},
      shaft:{stockSku:'REV-21-1135',stockLengthMm:914.4,proposedFinishedLengthMm:s.shaftLengthMm,
        profile:'half-inch-rounded-hex',acrossFlatsMm:12.7,cornerCircleMm:13.75,ends:'untapped-stock-no-finished-thread-assumed',sourceRef:'shafts'},
      supports:{bearingSku:'REV-21-1916-PK4',unitQuantity:2,bearingCentersYmm:[-s.bearingHalfSpanMm,s.bearingHalfSpanMm],
        sourceRef:'bearings',housingDesign:null,retainerCandidateSku:'REV-21-2286-PK10',retainerSourceRef:'retainer',retainerFit:null},
      retention:{collarCandidateSku:'REV-21-2900-PK4',sourceRef:'collars',unitQuantity:null,axialStack:null,preload:null,holdingForceN:null},
      layout:{frame:'shaft axis Y; wheel bank centered at Y=0; units mm',basis:'unvalidated-layout-hypothesis',
        wheelCentersYmm:Array.from({length:s.count},(_,i)=>(i-(s.count-1)/2)*s.pitchMm),
        contactWidthBasis:'nominal-catalog-width-not-loaded-contact-width',
        originalContinuousSleeveLengthMm:base.roller.lengthMm,originalRadiusMm:base.roller.outerRadiusMm,
        hubFastenerEnvelope:null,deflectionMm:null},
      paths:{torque:s.season===2025?'unselected-transmission -> rounded-hex shaft -> hex wheel bore':
        'unselected-transmission -> rounded-hex shaft -> hex MAXHub -> MAXSpline wheel',
        support:'wheel loads -> shaft -> two bearing locations -> unresolved housings/frame',
        axial:'unresolved wheel/hub spacers and fasteners -> candidate collars -> unresolved inner-race stack'},
      missing:['transmission identity and drive entry','exact hub and axial fastener stack','housing/retainer fit and tolerances','shaft bending and jam/impact load bounds','bearing and collar load limits','spacer sizing and alignment','native assembled CAD and inertia','segmented contact model with lateral wheel gaps','contact force/slip/temperature calibration','seasonal component availability and legality'],
      materialIdentity:s.season===2025?'blocked-product-vs-drawing-conflict-do-not-choose-density-or-hardness':'manufacturer-family-only-not-calibrated-properties',
      evidence:{nativeCadExecuted:false,simulationExecuted:false,physicalTestExecuted:false,teamInventory:null,historicalAvailability:null},
      supersedesBaseline:false,oldContactEvidenceReusable:false,engineeringAcceptance:'blocked'
    };
  })};
}
export function screenCandidateLayout(c) {
  const l=c.layout, w=c.wheel, centers=l.wheelCentersYmm;
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  if (!Array.isArray(centers)||centers.length!==w.unitQuantity||!Number.isInteger(w.unitQuantity)||w.unitQuantity<1||
      !centers.every(finite)||!finite(w.nominalWidthMm)||w.nominalWidthMm<=0||
      !Array.isArray(c.supports.bearingCentersYmm)||c.supports.bearingCentersYmm.length!==2||
      !c.supports.bearingCentersYmm.every(finite)||!finite(c.shaft.proposedFinishedLengthMm)||c.shaft.proposedFinishedLengthMm<=0)
    throw Error('Explicit finite wheel/support layout required');
  const sorted=[...centers].sort((a,b)=>a-b),width=w.nominalWidthMm;
  if (new Set(sorted).size!==sorted.length) throw Error('Duplicate wheel station');
  const min=sorted[0]-width/2,max=sorted.at(-1)+width/2;
  const [left,right]=c.supports.bearingCentersYmm;
  if (!(left<min&&right>max&&left>-c.shaft.proposedFinishedLengthMm/2&&right<c.shaft.proposedFinishedLengthMm/2))
    throw Error('Proposed supports must bracket nominal wheel faces and lie inside shaft ends');
  const gaps=sorted.slice(1).map((x,i)=>x-sorted[i]-width);
  if(gaps.some(g=>g<0))throw Error('Nominal wheel envelopes overlap');
  return {nominalWheelBankExtentMm:[min,max],nominalGapsMm:gaps,
    nominalWheelEnvelopeBracketing:'passes-layout-only',fullAssemblyClearance:'unverified-hubs-fasteners-collars-housings-missing',
    supportCapacity:'unverified',contactEquivalenceToContinuousSleeve:false,engineeringAcceptance:'blocked'};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==2)throw Error('Read-only proposal accepts no arguments');
  const result=buildProfiledCandidates();result.candidates=result.candidates.map(c=>({...c,layoutScreen:screenCandidateLayout(c)}));
  console.log(JSON.stringify(result,null,2));
}
