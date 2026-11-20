import {label} from './study-evidence.mjs';

function requireInput(condition,message){if(!condition)throw Error(message);}

export function auditPieceWindow(r) {
  requireInput(Array.isArray(r.initialPieces)&&Array.isArray(r.events)&&r.initialPieces.every(label)&&
    new Set(r.initialPieces).size===r.initialPieces.length,'Initial stock needs unique piece IDs.');
  const preload=r.preloadedPieces??[];
  requireInput(Array.isArray(preload)&&preload.every(label)&&new Set([...r.initialPieces,...preload]).size===r.initialPieces.length+preload.length,'Preload must be disjoint from station stock.');
  const seen=new Set([...r.initialPieces,...preload]),available=new Set(r.initialPieces),credited=new Set(),held=new Set(preload);
  const acceptedAt=[];let attempts=0,failed=0,previous=r.windowS[0];
  for(const ev of r.events){
    requireInput(Number.isFinite(ev.timeS)&&ev.timeS>=previous&&ev.timeS<r.windowS[1]&&label(ev.piece),
      'Events must be ordered inside the half-open window.');previous=ev.timeS;
    switch(ev.kind){
      case 'arrive':requireInput(!seen.has(ev.piece),'Duplicate supplied piece.');seen.add(ev.piece);available.add(ev.piece);break;
      case 'acquire':requireInput(available.delete(ev.piece),'Acquisition exceeded available stock.');held.add(ev.piece);break;
      case 'miss':requireInput(held.has(ev.piece),'Miss lacks possession.');attempts++;failed++;if(ev.release===true)held.delete(ev.piece);break;
      case 'return':requireInput(credited.delete(ev.piece)&&label(ev.witness),'Return requires a credited piece and a legal return witness.');available.add(ev.piece);break;
      case 'accept':requireInput(held.delete(ev.piece)&&!credited.has(ev.piece)&&label(ev.witness),'Accepted piece needs possession, unique identity and a scoring witness.');
        credited.add(ev.piece);attempts++;acceptedAt.push(ev.timeS);break;
      default:throw Error('Unknown stock or transfer event.');
    }
  }
  return {supplied:seen.size,attempts,failed,acceptedAt};
}
