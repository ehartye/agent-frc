// Browser-compatible editable geometry and planning evidence.
export const SCHEMA = 'agent-frc/design-artifact@2';
export const LIMITATIONS = [
  'Robot and reference solids are reserved volumes. Confirm moving paths, interference and structural support separately.',
  'A route budget uses declared motion and action times. Measure a complete cycle to validate it.',
  'Confirm the datum and orientation of each reference against its project drawing.',
];
const pose = (x, y, z, headingDeg, basis) => ({ x, y, z, headingDeg, basis });
const ruleIds = ['frame-perimeter', 'bumper-zone', 'height', 'stow'];

export function createDesign(project = {}) {
  if (!record(project) || Object.keys(project).some(k => !['id','workspace','rules','sources'].includes(k))) {
    throw Error('Project may define id, workspace, rules and sources');
  }
  const requirement = (id, outcome, screen) => ({ id, narrativeIds: ['transfer'], outcome, screen, status: 'unknown' });
  const artifact = {
    schema: SCHEMA, id: 'editable-blockout', revision: 1, parentRevision: null, units: 'm',
    workspace: {
      lengthM: 8, widthM: 5,
      targetSizeM: [.15,.5,.4], pieceSizeM: [.12,.10,.08],
      pieceCenterM: [1,.5,.04], basis: 'Illustrative workspace and reference boxes',
    },
    rules: [], sources: [],
    frames: {
      world: {axes: 'x downfield, y across field, z up', basis: 'Origin at the midpoint of the near field edge'},
      robot: pose(2,0,0,0,'Assumed starting pose'),
      target: pose(5,0,.8,0,'Target box center, provisional registration'),
    },
    strategy: {
      activeNarrativeId: 'transfer',
      narratives: [{id:'transfer',title:'Transfer cycle',status:'exploring',narrative:'Acquire an object, transport it and deliver it to a target.'}],
      requirements: [
        requirement('acquire','Accept an object at the intended approach angle.','Measure entrance clearance during a full approach.'),
        requirement('deliver','Release at the required pose.','Establish release and recovery conditions from measured trials.'),
        requirement('piece-variation','Accept dimensional and condition variation.','Measure new and worn samples before setting tolerances.'),
        requirement('reliability-pit','Restore operation after a component swap.','Record fault evidence and retest after replacement.'),
      ],
      decisions: [{id:'architecture-options',narrativeIds:['transfer'],text:'Compare shared and dedicated transport paths.',basis:'Track occupied spaces, throughput and recovery access for each option.'}],
    },
    design: {
      parameters:{frameLengthM:.70,frameWidthM:.64,trackM:.52,bumperBottomM:.06,bumperHeightM:.12,bumperDepthM:.06,height:.65,reach:0,toolHeight:.5,opening:.32,phase:'start'},
      requirementLinks:{tool:['acquire','deliver','piece-variation'],'frame-plate':['acquire','reliability-pit'],'body-envelope':['acquire']},
    },
    operations:[{id:'floor-opening',type:'intake-opening',enabled:false,targetIds:['frame-plate','body-envelope'],requirementIds:['acquire'],unresolvedChecks:['Measure the remaining support strip and the object path across the front protection.']}],
    rehearsal:{
      route:[{id:'start',x:2,y:0,headingDeg:0,action:'none'},{id:'collect',x:1,y:.5,headingDeg:90,action:'pickup'},{id:'finish',x:4,y:0,headingDeg:0,action:'deliver'}],
      driveSpeedMps:1,turnSpeedDegps:60,actionDurations:{pickup:2,deliver:1},
      opponent:{enabled:false,footprintM:.8,periodS:4,x:2,yMin:-.5,yMax:.5},basis:'assumed',
    },
    disciplinePlans:{
      programming:{status:'pseudocode',states:[{id:'release',entry:'Operator requests delivery',sensor:'Target pose and object present',action:'Grant exclusive ownership of the release actuator',failure:'Inhibit release and retry after sensor recovery',requirementIds:['deliver']}],pseudocode:'Serialize conflicting actuators. Confirm ownership, sensor validity and recovery before release.'},
      fabrication:{materials:[],processes:[],toolCapabilities:[],openQuestions:['Measure new and worn objects, assembly clearance and tool access.','Record replacement history and retest each repaired interface.']},
    },
    constraints:[],checks:[],provenance:{basis:'Original illustrative blockout with editable project inputs',limitations:[...LIMITATIONS]},
    ...structuredClone(project),
  };
  return assertDesign(artifact);
}

function validateWorkspace(workspace, errors) {
  if (!keys(workspace,['lengthM','widthM','targetSizeM','pieceSizeM','pieceCenterM','basis'],'workspace',errors)) return;
  for (const key of ['lengthM','widthM']) num(workspace[key],.01,100,key,errors);
  string(workspace.basis,'workspace.basis',errors);
  for (const key of ['targetSizeM','pieceSizeM','pieceCenterM']) {
    const components = list(workspace[key],key,errors,3);
    if (components.length !== 3) errors.push(key+' requires three components');
    for (const value of components) num(value,key === 'pieceCenterM' ? -100 : .001,100,key,errors);
  }
}

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keys=(v,w,p,e)=>{if(!record(v)){e.push(p+' must be an object');return false}for(const k of Object.keys(v))if(!w.includes(k))e.push(p+'.'+k+' is unsupported');for(const k of w)if(!Object.hasOwn(v,k))e.push(p+'.'+k+' is required');return true};
const string=(v,p,e)=>{if(typeof v!=='string'||!v.trim()||v.length>8000)e.push(p+' must be nonempty text (max 8000)')};
const num=(v,min,max,p,e)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)e.push(p+' is outside numeric bounds '+min+'..'+max)};
const list=(v,p,e,max=100)=>{if(!Array.isArray(v)||v.length>max){e.push(p+' must be an array (max '+max+')');return []}return v};
const enumv=(v,a,p,e)=>{if(!a.includes(v))e.push(p+' must be '+a.join('|'))};
const bool=(v,p,e)=>{if(typeof v!=='boolean')e.push(p+' must be boolean')};
const ids=(a,p,e)=>{const s=new Set();for(const v of a){if(!record(v))continue;string(v.id,p+'.id',e);if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(v.id))e.push(p+' invalid id');if(s.has(v.id))e.push(p+' duplicate id '+v.id);s.add(v.id)}return s};
const links=(v,s,p,e)=>{for(const x of list(v,p,e)){if(typeof x!=='string'||!s.has(x))e.push(p+' unknown reference '+String(x))}};
export function validateDesign(a){const e=[];
 if(!keys(a,['schema','id','revision','parentRevision','units','workspace','rules','frames','strategy','design','operations','rehearsal','sources','disciplinePlans','constraints','checks','provenance'],'artifact',e))return {valid:false,errors:e};
 enumv(a.schema,[SCHEMA],'schema',e);string(a.id,'id',e);if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(a.id))e.push('invalid artifact id');
 if(!Number.isSafeInteger(a.revision)||a.revision<1)e.push('revision must be positive integer');if(a.parentRevision!==null&&(!Number.isSafeInteger(a.parentRevision)||a.parentRevision<1||a.parentRevision>=a.revision))e.push('parentRevision must precede revision');
 enumv(a.units,['m'],'units',e);validateWorkspace(a.workspace,e);
 if(keys(a.frames,['world','robot','target'],'frames',e)){if(keys(a.frames.world,['axes','basis'],'world',e)){enumv(a.frames.world.axes,['x downfield, y across field, z up'],'world.axes',e);string(a.frames.world.basis,'world.basis',e)}for(const f of ['robot','target'])if(keys(a.frames[f],['x','y','z','headingDeg','basis'],f,e)){for(const k of ['x','y','z'])num(a.frames[f][k],-30,30,f+'.'+k,e);num(a.frames[f].headingDeg,-180,180,f+'.headingDeg',e);string(a.frames[f].basis,f+'.basis',e)}}
 let ns=new Set(),rs=new Set();if(keys(a.strategy,['activeNarrativeId','narratives','requirements','decisions'],'strategy',e)){const n=list(a.strategy.narratives,'narratives',e),r=list(a.strategy.requirements,'requirements',e);ns=ids(n,'narrative',e);rs=ids(r,'requirement',e);for(const x of n)if(keys(x,['id','title','status','narrative'],'narrative',e)){string(x.title,'title',e);string(x.narrative,'narrative',e);enumv(x.status,['alternative','exploring','selected-for-cad','rejected'],'status',e)}if(!ns.has(a.strategy.activeNarrativeId))e.push('unknown activeNarrativeId');for(const x of r)if(keys(x,['id','narrativeIds','outcome','screen','status'],'requirement',e)){links(x.narrativeIds,ns,'narrativeIds',e);string(x.outcome,'outcome',e);string(x.screen,'screen',e);enumv(x.status,['unknown','candidate','verified','rejected'],'requirement.status',e)}const ds=list(a.strategy.decisions,'decisions',e);ids(ds,'decision',e);for(const x of ds)if(keys(x,['id','narrativeIds','text','basis'],'decision',e)){links(x.narrativeIds,ns,'decision.narrativeIds',e);string(x.text,'decision.text',e);string(x.basis,'decision.basis',e)}}
 const vs=new Set(['frame-plate','body-envelope','front-bumper','rear-bumper','left-bumper','right-bumper','tool','reach']);
 if(keys(a.design,['parameters','requirementLinks'],'design',e)){const p=a.design.parameters;if(keys(p,['frameLengthM','frameWidthM','trackM','bumperBottomM','bumperHeightM','bumperDepthM','height','reach','toolHeight','opening','phase'],'parameters',e)){for(const k of ['frameLengthM','frameWidthM','trackM'])num(p[k],.3,2,k,e);num(p.bumperBottomM,0,.5,'bumperBottomM',e);num(p.bumperHeightM,.01,.5,'bumperHeightM',e);num(p.bumperDepthM,.01,.3,'bumperDepthM',e);if(p.trackM>p.frameWidthM)e.push('track exceeds frame width');if(p.opening>=p.frameWidthM)e.push('opening must be narrower than frame');num(p.height,.22,2,'height',e);num(p.reach,0,1,'reach',e);num(p.toolHeight,0,2,'toolHeight',e);num(p.opening,.01,2,'opening',e);enumv(p.phase,['start','deployed'],'phase',e)}if(!record(a.design.requirementLinks))e.push('requirementLinks must be object');else for(const [k,v]of Object.entries(a.design.requirementLinks)){if(!vs.has(k))e.push('unknown volume link '+k);links(v,rs,'volume requirementIds',e)}}
 const os=list(a.operations,'operations',e,1);ids(os,'operation',e);if(os.length!==1)e.push('artifact requires one reversible opening operation');for(const x of os)if(keys(x,['id','type','enabled','targetIds','requirementIds','unresolvedChecks'],'operation',e)){enumv(x.type,['intake-opening'],'operation.type',e);bool(x.enabled,'operation.enabled',e);if(JSON.stringify(x.targetIds)!==JSON.stringify(['frame-plate','body-envelope']))e.push('opening target set unsupported');links(x.requirementIds,rs,'operation.requirementIds',e);for(const t of list(x.unresolvedChecks,'unresolvedChecks',e))string(t,'unresolvedCheck',e);if(!x.unresolvedChecks?.length)e.push('opening unresolved checks required')}
 if(keys(a.rehearsal,['route','driveSpeedMps','turnSpeedDegps','actionDurations','opponent','basis'],'rehearsal',e)){const r=a.rehearsal;enumv(r.basis,['assumed','estimated','measured'],'rehearsal.basis',e);num(r.driveSpeedMps,.01,10,'driveSpeedMps',e);num(r.turnSpeedDegps,1,720,'turnSpeedDegps',e);if(keys(r.actionDurations,['pickup','deliver'],'actionDurations',e)){num(r.actionDurations.pickup,0,120,'pickup',e);num(r.actionDurations.deliver,0,120,'deliver',e)}const poses=list(r.route,'route',e,200);if(!poses.length)e.push('route needs at least one pose');ids(poses,'pose',e);for(const q of poses)if(keys(q,['id','x','y','headingDeg','action'],'pose',e)){num(q.x,-30,30,'pose.x',e);num(q.y,-30,30,'pose.y',e);num(q.headingDeg,-180,180,'pose.headingDeg',e);enumv(q.action,['none','pickup','deliver'],'pose.action',e)}const o=r.opponent;if(keys(o,['enabled','footprintM','periodS','x','yMin','yMax'],'opponent',e)){bool(o.enabled,'opponent.enabled',e);num(o.footprintM,.1,3,'footprintM',e);num(o.periodS,.1,300,'periodS',e);num(o.x,-30,30,'opponent.x',e);num(o.yMin,-30,30,'yMin',e);num(o.yMax,-30,30,'yMax',e);if(o.yMax<=o.yMin)e.push('opponent yMax must exceed yMin')}}
 const ss=list(a.sources,'sources',e);const si=ids(ss,'source',e);for(const s of ss)if(keys(s,['id','url','locator','sha256','scope'],'source',e)){string(s.locator,'source.locator',e);string(s.scope,'source.scope',e);if(typeof s.url!=='string'||!/^https:\/\/[^\s]+$/.test(s.url))e.push('source url must be HTTPS');if(s.sha256!==null&&!/^[a-f0-9]{64}$/.test(s.sha256))e.push('invalid source sha256')}
 const rules = list(a.rules,'rules',e,ruleIds.length);
 ids(rules,'rule',e);
 for (const rule of rules) {
   if (!keys(rule,['id','maximumM','sourceId'],'rule',e)) continue;
   enumv(rule.id,ruleIds,'rule.id',e);
   num(rule.maximumM,0,100,'rule.maximumM',e);
   if (!si.has(rule.sourceId)) e.push('unknown rule sourceId');
 }
 if(keys(a.disciplinePlans,['programming','fabrication'],'disciplinePlans',e)){const pr=a.disciplinePlans.programming,fa=a.disciplinePlans.fabrication;if(keys(pr,['status','states','pseudocode'],'programming',e)){enumv(pr.status,['pseudocode'],'programming.status',e);string(pr.pseudocode,'pseudocode',e);const st=list(pr.states,'states',e);ids(st,'state',e);for(const x of st)if(keys(x,['id','entry','sensor','action','failure','requirementIds'],'state',e)){for(const k of ['entry','sensor','action','failure'])string(x[k],'state.'+k,e);links(x.requirementIds,rs,'state.requirementIds',e)}}if(keys(fa,['materials','processes','toolCapabilities','openQuestions'],'fabrication',e)){for(const k of ['materials','processes','toolCapabilities','openQuestions'])for(const x of list(fa[k],'fabrication.'+k,e))string(x,'fabrication entry',e)}}
 const cs=list(a.constraints,'constraints',e);ids(cs,'constraint',e);for(const c of cs)if(keys(c,['id','text','sourceIds'],'constraint',e)){string(c.text,'constraint.text',e);links(c.sourceIds,si,'sourceIds',e)}
 const checks=list(a.checks,'checks',e);ids(checks,'check',e);for(const c of checks)if(keys(c,['id','inputRevision','status','scope','requirementIds'],'check',e)){if(c.inputRevision!==a.revision)e.push('stale check revision');enumv(c.status,['pass','fail','unknown','not-applicable'],'check.status',e);string(c.scope,'check.scope',e);links(c.requirementIds,rs,'check.requirementIds',e)}
 if(keys(a.provenance,['basis','limitations'],'provenance',e)){string(a.provenance.basis,'provenance.basis',e);for(const x of list(a.provenance.limitations,'limitations',e))string(x,'limitation',e);if(!a.provenance.limitations?.length)e.push('limitations required')}
 return {valid:e.length===0,errors:e};
}
export function assertDesign(a){const v=validateDesign(a);if(!v.valid)throw new Error(v.errors.join('; '));return a}
function sort(v){return Array.isArray(v)?v.map(sort):record(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v}
export function canonicalStringify(a){assertDesign(a);return JSON.stringify(sort(a),null,2)+'\n'}
export function reviseDesign(a,mutator){assertDesign(a);const b=JSON.parse(canonicalStringify(a));mutator(b);b.parentRevision=a.revision;b.revision=a.revision+1;b.checks=[];return assertDesign(b)}
export function deriveGeometry(a) {
  assertDesign(a);
  const p = a.design.parameters;
  const {frameLengthM:L,frameWidthM:W,bumperDepthM:D,bumperHeightM:H} = p;
  const midZ = p.bumperBottomM+H/2;
  const toolX = L/2+p.reach-.1;
  const box = (id,size,center) => ({id,kind:'box',role:id,frame:'robot',size,center,requirementIds:a.design.requirementLinks[id]??[]});
  const volumes = [
    box('frame-plate',[L,W,.05],[0,0,.13]),
    box('body-envelope',[L,W,p.height],[0,0,p.height/2]),
    box('front-bumper',[D,W,H],[L/2+D/2,0,midZ]),
    box('rear-bumper',[D,W,H],[-L/2-D/2,0,midZ]),
    box('left-bumper',[L+2*D,D,H],[0,W/2+D/2,midZ]),
    box('right-bumper',[L+2*D,D,H],[0,-W/2-D/2,midZ]),
    box('tool',[.2,.35,.15],[toolX,0,p.toolHeight]),
  ];
  if (p.reach>0) volumes.push(box('reach',[p.reach,.35,.15],[L/2+p.reach/2,0,p.toolHeight]));
  const cutLength = L/2-.05;
  const operation = a.operations[0];
  const cut = {enabled:operation.enabled,id:operation.id,targetIds:operation.targetIds,center:[cutLength/2,0,.11],size:[cutLength,p.opening,.22],frame:'robot',kind:'box'};
  return {
    volumes, openings:[cut],field:{length:a.workspace.lengthM,width:a.workspace.widthM,frame:'world'},
    target:{kind:'box',size:[...a.workspace.targetSizeM],center:[0,0,0],frame:'target'},
    piece:{kind:'box',size:[...a.workspace.pieceSizeM],center:[...a.workspace.pieceCenterM],frame:'world'},
  };
}
export function worldPoint(point,pose){const t=pose.headingDeg*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return [pose.x+c*point[0]-s*point[1],pose.y+s*point[0]+c*point[1],pose.z+point[2]]}
export function exportCad(a) {
  const geometry = deriveGeometry(a);
  const vector = JSON.stringify;
  const box = b => 'translate('+vector(b.center)+') cube('+vector(b.size)+',center=true);';
  const transform = p => 'translate('+vector([p.x,p.y,p.z])+') rotate([0,0,'+p.headingDeg+'])';
  const lines = [
    '// Editable spatial blockout. Output units: millimetres. Input units: metres.',
    '// Artifact '+a.id+' revision '+a.revision,
    'scale([1000,1000,1000]) {',
  ];
  const cut = geometry.openings[0];
  for (const volume of geometry.volumes) {
    const shape = cut.enabled && cut.targetIds.includes(volume.id)
      ? 'difference(){ '+box(volume)+' '+box(cut)+' }'
      : box(volume);
    lines.push('// '+volume.id,transform(a.frames.robot)+' '+shape);
  }
  lines.push('// target reference',transform(a.frames.target)+' '+box(geometry.target),
    '// object reference',box(geometry.piece),'}');
  return lines.join('\n')+'\n';
}

export const validateArtifact=validateDesign;
export const editArtifact=reviseDesign;

export function spatialChecks(a) {
  const {volumes} = deriveGeometry(a);
  const p = a.design.parameters;
  const limits = new Map(a.rules.map(rule => [rule.id,rule]));
  function screen(id, value, scope, applicable=true) {
    const rule = limits.get(id);
    const status = !applicable ? 'not-applicable' : !rule ? 'unknown' : value <= rule.maximumM ? 'pass' : 'fail';
    const evidence = rule ? ' Project maximum '+rule.maximumM+' m from '+rule.sourceId+'.' : ' Supply a project limit and source.';
    return {id,inputRevision:a.revision,status,scope:scope+' Modeled value '+Number(value.toFixed(6))+' m.'+evidence,requirementIds:[]};
  }
  return [
    screen('frame-perimeter',2*(p.frameLengthM+p.frameWidthM),'Rectangular frame perimeter.'),
    screen('bumper-zone',p.bumperBottomM+p.bumperHeightM,'Modeled bumper upper edge.'),
    screen('height',Math.max(...volumes.map(b=>b.center[2]+b.size[2]/2)),'Highest reserved robot volume above its local datum.'),
    screen('stow',p.reach,'Starting extension beyond the front of the frame.',p.phase==='start'),
    ...['bumper-support','bumper-coverage'].map(id=>({id,inputRevision:a.revision,status:'unknown',scope:'Confirm support, attachments and coverage on the project assembly.',requirementIds:[]})),
  ];
}
export function rehearsalBudget(a){assertDesign(a);const r=a.rehearsal,wrap=d=>Math.atan2(Math.sin(d*Math.PI/180),Math.cos(d*Math.PI/180))*180/Math.PI;let drive=0,turn=0,actions=0;for(let i=1;i<r.route.length;i++){const p=r.route[i-1],q=r.route[i],d=Math.hypot(q.x-p.x,q.y-p.y),bearing=d?Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI:p.headingDeg;drive+=d/r.driveSpeedMps;turn+=(Math.abs(wrap(bearing-p.headingDeg))+Math.abs(wrap(q.headingDeg-bearing)))/r.turnSpeedDegps;actions+=q.action==='none'?0:r.actionDurations[q.action]}return {driveS:drive,turnS:turn,actionS:actions,totalS:drive+turn+actions,basis:r.basis,scope:'kinematic planning budget, not physical cycle-time prediction'}}
