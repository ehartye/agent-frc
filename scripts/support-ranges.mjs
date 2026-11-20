// Independent enclosures give necessary conditions only. Zero in all intervals does not establish a common feasible wrench.
const finite=Number.isFinite;
const valid=r=>Array.isArray(r)&&r.length===2&&r.every(finite)&&r[0]<=r[1];
const fixed=v=>finite(v)?[v,v]:null;
const add=(a,b)=>a&&b?[a[0]+b[0],a[1]+b[1]]:null;
const diff=(a,b)=>a&&b?[a[0]-b[1],a[1]-b[0]]:null;
function product(a,b){
  if(a?.[0]===0&&a[1]===0||b?.[0]===0&&b[1]===0)return [0,0];
  if(!a||!b)return null;
  const ends=[a[0]*b[0],a[1]*b[1],a[0]*b[1],a[1]*b[0]];
  return [Math.min(...ends),Math.max(...ends)];
}
export function staticWrenchRanges(applied,origin,forceTolerance,momentTolerance){
  const f=origin.map(()=>[0,0]),m=origin.map(()=>[0,0]);
  for(const load of applied){
    const box=load.bounds;
    function axis(values,key){
      return values.map((v,i)=>{
        if(finite(v))return fixed(v);
        return box?.basis?.trim()&&valid(box[key]?.[i])?box[key][i]:null;
      });
    }
    const pos=axis(load.point,'pointM').map((a,i)=>diff(a,fixed(origin[i])));
    const force=axis(load.force,'forceN');
    for(let i=0;i<3;i++){
      const j=(i+1)%3,k=(i+2)%3;
      f[i]=add(f[i],force[i]);
      m[i]=add(m[i],add(diff(product(pos[j],force[k]),product(pos[k],force[j])),fixed(load.couple[i])));
    }
  }
  const excluded=(r,tol)=>r&&(r[1]<-tol||r[0]>tol);
  return {forceN:f,momentNm:m,disposition:f.some(r=>excluded(r,forceTolerance))||m.some(r=>excluded(r,momentTolerance))?
    'excludes-static-balance':'inconclusive'};
}
