import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';

// Contact forces come from independent linear springs at a prescribed pose. No balancing force is inserted.
export function makeSupportFixture(folder){
  mkdirSync(folder,{recursive:true});
  function save(file,value){
    const bytes=JSON.stringify(value,null,2)+'\n';writeFileSync(path.join(folder,file),bytes);
    return {path:file,pointer:'',sha256:digest(bytes)};
  }
  const ids=['left-pad','right-pad','upper-guide','lower-brace'],body='carrier',revision='fixture-A',frame='world-z-up';
  const variants=[
    ['settled',{braceRate:10000,cgX:.20,guideY:0}],
    ['stiffer-brace',{braceRate:12000,cgX:.20,guideY:0}],
    ['forward-load',{braceRate:10000,cgX:.24,guideY:0}],
    ['offset-guide',{braceRate:10000,cgX:.20,guideY:.10}]
  ];
  const ratings=Object.fromEntries(ids.map(id=>[id,{kind:'allowable-resultant-envelope',evidence:'teaching-assumption',contact:id,revision,unit:'N',modes:['static'],duties:['hold'],
    workingN:id==='lower-brace'?28:90,basis:'Invented direction-independent fixture contact envelope for the registered resultant.'}]));
  const rating=save('ratings.json',ratings);
  const contacts=ids.map(id=>({id,maxCompressionM:.008,compressionBasis:'Eight millimetres of simulated spring travel.',
    rating:{...rating,pointer:'/'+id}}));
  const plan=save('plan.json',{body,revision,frame,purpose:'teaching',scope:'whole-body',originM:[0,0,0],factor:1,forceToleranceN:.001,
    momentToleranceNm:.001,gapToleranceM:.00001,toleranceBasis:'Fixture distinguishes a one-newton change and a one-newton-metre residual.',
    contacts,loads:[],caseIds:variants.map(v=>v[0]),caseDuties:Object.fromEntries(variants.map(v=>[v[0],'hold'])),comparisons:[{id:'brace-rate',kind:'sensitivity',parameter:'braceRate',
      cases:['settled','stiffer-brace'],metric:'braceN',unit:'N',basis:'Compare measured normal force at identical spring overlap.'}]});
  const cases=variants.map(([id,settings])=>{
    const rows=[
      [[0,-.10,1],[0,0,1],.004,10000],
      [[0,.10,1],[0,0,1],.006,10000],
      [[0,settings.guideY,1],[-1,0,0],.0025,10000],
      [[0,0,.2],[1,0,0],.0025,settings.braceRate]
    ].map(([p,n,compression,k],i)=>({id:ids[i],kind:'contact-on-body',pointM:p,normal:n,forceN:n.map(v=>v*k*compression),active:true,gapM:-compression,mu:0}));
    const record={identity:{caseId:id,runId:'spring-'+id,body,revision,frame,units:'m,N,Nm,s',mode:'static',duty:'hold',
      reactionBasis:'independent-contact-solver',timeS:0,massEvidence:'modeled',massBasis:'Ten-kilogram teaching mass.',channels:{massKg:'/mass',cgM:'/cg',gravityMps2:'/g'},contactIds:ids,loadIds:[],metrics:{braceN:{pointer:'/braceN',unit:'N'}}},settings,
      mass:10,cg:[settings.cgX,.02,.5],g:[0,0,-10],rows,braceN:rows[3].forceN[0]};
    const map={identity:'/identity',settings:'/settings',massKg:'/mass',cgM:'/cg',gravityMps2:'/g',metrics:{braceN:'/braceN'},loads:[],
      contacts:rows.map((c,i)=>({id:c.id,row:'/rows/'+i,active:'/active',pointM:'/pointM',normal:'/normal',forceN:'/forceN',gapM:'/gapM',mu:'/mu'}))};
    return {id,source:save(id+'.json',record),map};
  });
  return save('study.json',{schema:'agent-frc/coupled-support-study@1',plan,cases});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Supply the output folder for the invented spring fixture.');
  console.log(makeSupportFixture(process.argv[2]));
}
